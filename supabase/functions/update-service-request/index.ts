// ============================================================================
// Supabase Edge Function: update-service-request
//
// تحديث طلب خدمة من لوحة الموظف بعد التحقق من:
//   1) جلسة موقّعة صادرة من auth-login
//   2) صلاحية "requests" (أو مدير)
//   3) قواعد انتقال الحالة والحقول الإجبارية
//
// ثم — وبعد نجاح الحفظ في قاعدة البيانات — يُنشئ سجل إشعار WhatsApp ويحاول
// إرساله. فشل WhatsApp لا يلغي حفظ الطلب أبدًا.
//
// ملاحظة: الإرسال نفسه يتم عبر نفس منطق send-whatsapp المشترك، ولا يصل أي
// Access Token إلى المتصفح.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  tokenFromRequest,
  verifySession,
} from "../_shared/session.ts";
import {
  canManageRequests,
  processNotification,
} from "../_shared/whatsapp.ts";
import {
  normalizeStatus,
  RECEIVED_STATUS,
  COMPLETED_STATUS,
} from "../_shared/whatsappMessages.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EDITABLE_FIELDS = [
  "name",
  "job_title",
  "phone",
  "service_type",
  "certificate_type",
  "request_month",
  "request_year",
  "directed_to",
  "requested_details",
  "applicant_notes",
];

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function canTransitionToStatus(previousStatus: string, newStatus: string) {
  if (newStatus !== RECEIVED_STATUS) return true;
  const prev = previousStatus === "جديد" ? "جديدة" : previousStatus;
  return prev === COMPLETED_STATUS || prev === RECEIVED_STATUS;
}

function requiredFieldError(serviceType: string, next: Record<string, unknown>) {
  const st = String(serviceType || "").trim();
  const salary = ["مفردات مرتب", "مفردات المرتب", "مفرد مرتب", "مفرد المرتب"];
  const certificates = ["الإفادات"];
  const care = ["الرعاية الصحية", "خدمة الرعاية", "الرعاية الاجتماعية"];
  const fellowship = ["صندوق الزمالة", "الزمالة"];

  if (
    (salary.includes(st) || certificates.includes(st)) &&
    !cleanText(next.directed_to)
  ) {
    return "حقل «موجّه إلى» إجباري لهذا النوع من الطلبات.";
  }
  if (
    (care.includes(st) || fellowship.includes(st)) &&
    !cleanText(next.requested_details)
  ) {
    return "حقل «المطلوب» إجباري لهذا النوع من الطلبات.";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  // 1) التحقق من الجلسة
  const claims = await verifySession(tokenFromRequest(req));
  if (!claims) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // 2) التحقق من الصلاحية — لا نعتمد على إخفاء الأزرار في الواجهة.
  if (!canManageRequests(claims)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const id = String(body.id ?? "").trim();
  if (!id) return json({ ok: false, error: "id_required" }, 400);

  const { data: current, error: loadError } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("load service_request error:", loadError);
    return json({ ok: false, error: "load_failed", detail: loadError.message }, 500);
  }
  if (!current) {
    return json({ ok: false, error: "request_not_found" }, 404);
  }

  const patch: Record<string, unknown> = {};
  const nextRow: Record<string, unknown> = { ...current };

  // 3) الحقول القابلة للتعديل (whitelist صريح — لا نمرر أي مفتاح من المتصفح)
  const fields =
    body.fields && typeof body.fields === "object"
      ? (body.fields as Record<string, unknown>)
      : null;

  if (fields) {
    for (const key of EDITABLE_FIELDS) {
      if (!(key in fields)) continue;
      const value = fields[key];
      if (key === "request_month" || key === "request_year") {
        const n = optionalNumber(value);
        patch[key] = n;
        nextRow[key] = n;
      } else if (key === "name" || key === "job_title" || key === "service_type") {
        const text = cleanText(value);
        if (!text) {
          return json(
            { ok: false, error: "required_field_empty", field: key },
            400
          );
        }
        patch[key] = text;
        nextRow[key] = text;
      } else {
        const text = cleanText(value);
        patch[key] = text;
        nextRow[key] = text;
      }
    }
  }

  // notes يُمرَّر منفصلاً لأنه موجود في مسار الحالة السريع أيضًا.
  if ("notes" in body) {
    const notes = cleanText(body.notes);
    patch.notes = notes;
    nextRow.notes = notes;
  }

  const requestedStatus = "status" in body ? String(body.status ?? "") : "";
  const currentStatus = normalizeStatus(current.status);
  const newStatus = requestedStatus ? normalizeStatus(requestedStatus) : currentStatus;
  const allowedStatuses = new Set([
    "جديدة",
    "قيد التنفيذ",
    "تم التنفيذ",
    "مرفوضة",
    RECEIVED_STATUS,
  ]);

  if (requestedStatus) {
    if (!allowedStatuses.has(newStatus)) {
      return json(
        { ok: false, error: "invalid_status", detail: "قيمة حالة غير معروفة." },
        400
      );
    }
    if (!canTransitionToStatus(currentStatus, newStatus)) {
      return json(
        {
          ok: false,
          error: "invalid_status_transition",
          detail:
            "لا يجوز انتقال الحالة إلى «تم الاستلام من قبل مقدم الطلب» إلا من «تم التنفيذ».",
        },
        400
      );
    }
    patch.status = newStatus;
    nextRow.status = newStatus;
  } else {
    nextRow.status = current.status;
  }

  // نفس سلوك محفّز قاعدة البيانات: لا نتحقق من الحقول الإجبارية إلا عند
  // تغيير نوع الخدمة أو الحقول المرتبطة به، حتى لا نمنع تحديث حالة طلبات قديمة.
  const fieldsChanged =
    Boolean(fields) &&
    ("service_type" in (fields || {}) ||
      "directed_to" in (fields || {}) ||
      "requested_details" in (fields || {}));

  if (fieldsChanged) {
    const fieldError = requiredFieldError(
      String(nextRow.service_type || ""),
      nextRow
    );
    if (fieldError) {
      return json({ ok: false, error: "required_field", detail: fieldError }, 400);
    }
  }

  if (Object.keys(patch).length === 0) {
    return json({ ok: false, error: "no_changes" }, 400);
  }

  patch.updated_at = new Date().toISOString();

  // 4) تحديث شرطي لمنع سباق الموظفين: لا نكتب فوق تغيير حدث بين القراءة والكتابة.
  let updateQuery = supabase
    .from("service_requests")
    .update(patch)
    .eq("id", id);

  if (body.expectedUpdatedAt) {
    updateQuery = updateQuery.eq("updated_at", String(body.expectedUpdatedAt));
  } else if (body.expectedStatus) {
    updateQuery = updateQuery.eq("status", String(body.expectedStatus));
  }

  const { data: savedRow, error: updateError } = await updateQuery
    .select()
    .single();

  if (updateError || !savedRow) {
    console.error("update service_request error:", updateError);
    return json(
      {
        ok: false,
        error: "update_conflict",
        detail: updateError?.message || "لم يتم تحديث أي صف.",
      },
      409
    );
  }

  // 5) إشعار WhatsApp بعد نجاح الحفظ فقط. أي خطأ هنا لا يؤثر على الحفظ.
  const savedStatus = normalizeStatus(savedRow.status);
  const statusChanged = savedStatus !== currentStatus;

  let notificationResult: any = null;
  if (statusChanged) {
    try {
      notificationResult = await processNotification({
        supabase,
        request: savedRow,
        status: savedStatus,
        event: "status_change",
        actor: claims.username,
        previousStatus: currentStatus,
      });
    } catch (notificationError: any) {
      console.error("whatsapp notification after update error:", notificationError);
      notificationResult = {
        ok: false,
        error: "notification_failed",
        detail: String(notificationError?.message || notificationError),
      };
    }
  }

  return json({
    ok: true,
    data: savedRow,
    notification: notificationResult,
  });
});

// ============================================================================
// Supabase Edge Function: send-whatsapp
//
// إرسال إشعارات WhatsApp للعملاء عبر Meta WhatsApp Cloud API + سجل الإشعارات.
//
// لا يصل Access Token إلى المتصفح إطلاقًا. كل الإعدادات السرية في Supabase
// Edge Function Secrets:
//   WHATSAPP_TOKEN
//   WHATSAPP_PHONE_NUMBER_ID
//   WHATSAPP_BUSINESS_ACCOUNT_ID        (اختياري، للتشخيص)
//   WHATSAPP_AUTO_SEND                  ("true" فقط بعد اكتمال الاختبار)
//   WHATSAPP_DRY_RUN                    ("true" لاختبار بدون إرسال حقيقي)
//   WHATSAPP_TEMPLATE_NAME              (اسم قالب Meta المعتمد - يُفضّل في الإنتاج)
//   WHATSAPP_TEMPLATE_REJECTED_NAME     (قالب الرفض الاختياري)
//   WHATSAPP_TEMPLATE_LANG              (مثل ar أو ar_EG)
//   WHATSAPP_TRACKING_BASE_URL          (رابط متابعة الطلب)
//   WHATSAPP_SHARE_REJECTION_REASON     ("true" للسماح بعرض سبب الرفض)
//   WHATSAPP_SERVICE_KEY                (لطلبات server-to-server القديمة فقط)
//
// الأوامر المدعومة:
//   { action: "notify", requestId, status, event: "status_change"|"created" }
//   { action: "notify-created", requestId }
//   { action: "list", status?, requestId?, limit? }
//   { action: "retry", notificationId }
//   { action: "config" }
//   { action: "raw", to, text }            (يتطلب x-whatsapp-key)
//
// لا يستقبل هذا النظام أي أوامر من WhatsApp، ولا يغيّر حالة أي طلب.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  verifySession,
  tokenFromRequest,
} from "../_shared/session.ts";
import {
  canManageRequests,
  canManageWhatsAppLogs,
  getWhatsAppConfig,
  listNotifications,
  processNotification,
  sendViaMeta,
} from "../_shared/whatsapp.ts";
import { normalizePhoneToIntl, normalizeStatus } from "../_shared/whatsappMessages.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-whatsapp-key",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireSession(req: Request) {
  const claims = await verifySession(tokenFromRequest(req));
  if (!claims) {
    return { claims: null, response: json({ ok: false, error: "unauthorized" }, 401) };
  }
  return { claims, response: null };
}

function publicConfig() {
  const config = getWhatsAppConfig();
  return {
    configured: config.configured,
    autoSend: config.autoSend,
    dryRun: config.dryRun,
    officialNumber: config.officialNumber,
    templateConfigured: Boolean(config.templateName),
    trackingConfigured: Boolean(config.trackingBaseUrl),
    graphVersion: config.graphVersion,
  };
}

async function getRequestRow(requestId: string) {
  const { data, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function publicNotifyResult(result: any): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    return { ok: false, error: "internal" };
  }
  const safe: Record<string, unknown> = {};
  for (const key of [
    "ok",
    "sent",
    "skipped",
    "duplicate",
    "reason",
    "error",
    "dryRun",
  ]) {
    if (key in result) safe[key] = result[key];
  }
  return safe;
}

async function handleNotify(req: Request, body: Record<string, unknown>) {
  const requestId = String(body.requestId ?? body.request_id ?? "").trim();
  if (!requestId) return json({ ok: false, error: "request_id_required" }, 400);

  const event =
    String(body.action || "") === "notify-created" ||
    String(body.event || "") === "created"
      ? "created"
      : "status_change";

  const claims: any = await verifySession(tokenFromRequest(req));
  const authorized = Boolean(claims && canManageRequests(claims));

  if (event === "status_change") {
    if (!claims) return json({ ok: false, error: "unauthorized" }, 401);
    if (!authorized) return json({ ok: false, error: "forbidden" }, 403);
  }

  const request = await getRequestRow(requestId);
  if (!request) return json({ ok: false, error: "request_not_found" }, 404);

  // إشعار الاستلام عام (يُستدعى بعد إدخال الطلب من النموذج العام) لكنه
  // محصور في الطلبات الجديدة جدًا، ولا يسمح باختيار رقم الهاتف من المتصفح.
  if (event === "created" && !authorized) {
    const createdAt = request.created_at
      ? new Date(request.created_at).getTime()
      : 0;
    const recent = createdAt > 0 && Date.now() - createdAt <= 15 * 60 * 1000;
    const isNewStatus = normalizeStatus(request.status) === "جديدة";
    if (!recent || !isNewStatus) {
      return json({ ok: false, error: "receipt_window_expired" }, 403);
    }
  }

  if (event === "status_change") {
    const requestedStatus = normalizeStatus(
      String(body.status ?? request.status ?? "")
    );
    const currentStatus = normalizeStatus(request.status);
    if (requestedStatus && requestedStatus !== currentStatus) {
      return json(
        {
          ok: false,
          error: "status_mismatch",
          detail: "Request status in the database differs from the requested event.",
        },
        409
      );
    }
  }

  const result = await processNotification({
    supabase,
    request,
    status: normalizeStatus(request.status),
    event,
    actor: authorized ? claims?.username || null : null,
    previousStatus: body.previousStatus ? String(body.previousStatus) : null,
  });

  // لا نُعيد بيانات العميل (الهاتف/نص الرسالة) لطلب غير موثّق.
  return json(authorized ? result : publicNotifyResult(result));
}

async function handleRetry(req: Request, body: Record<string, unknown>) {
  const auth = await requireSession(req);
  if (auth.response) return auth.response;
  if (!canManageWhatsAppLogs(auth.claims)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const notificationId = String(body.notificationId ?? "").trim();
  if (!notificationId) {
    return json({ ok: false, error: "notification_id_required" }, 400);
  }

  const { data: notification, error } = await supabase
    .from("whatsapp_notifications")
    .select("*")
    .eq("id", notificationId)
    .maybeSingle();
  if (error) throw error;
  if (!notification) {
    return json({ ok: false, error: "notification_not_found" }, 404);
  }

  const request = await getRequestRow(String(notification.request_id));
  if (!request) {
    return json({ ok: false, error: "request_not_found" }, 404);
  }

  const result = await processNotification({
    supabase,
    request,
    status: normalizeStatus(notification.trigger_status || request.status),
    event: notification.event_type === "created" ? "created" : "status_change",
    actor: auth.claims?.username || null,
    previousStatus: notification.metadata?.previous_status || null,
    notificationId,
    forceRetry: true,
  });

  return json(result);
}

async function handleList(req: Request, body: Record<string, unknown>) {
  const auth = await requireSession(req);
  if (auth.response) return auth.response;
  if (!canManageWhatsAppLogs(auth.claims)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const notifications = await listNotifications(supabase, {
    status: body.status ? String(body.status) : undefined,
    requestId: body.requestId ? String(body.requestId) : undefined,
    limit: Number(body.limit) || 100,
  });

  return json({ ok: true, notifications });
}

async function handleRaw(req: Request, body: Record<string, unknown>) {
  const serviceKey = (Deno.env.get("WHATSAPP_SERVICE_KEY") || "").trim();
  if (!serviceKey) {
    return json({ ok: false, error: "raw_endpoint_disabled" }, 503);
  }
  if (req.headers.get("x-whatsapp-key") !== serviceKey) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const to = normalizePhoneToIntl(body.to);
  const text = String(body.text ?? "").trim();
  if (!to || !text || text.length > 4096) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  const config = { ...getWhatsAppConfig(), templateName: "" };
  const result = await sendViaMeta({
    to,
    text,
    request: null,
    status: "جديدة",
    config,
  });

  if (!result.ok) {
    return json(
      {
        ok: false,
        error: result.error,
        detail: result.detail || null,
      },
      result.error === "not_configured" ? 503 : 502
    );
  }

  return json({ ok: true, messageId: result.messageId || null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const action = String(body.action ?? "").trim();

  try {
    if (action === "notify" || action === "notify-created" || action === "notify-status") {
      return await handleNotify(req, body);
    }
    if (action === "retry") {
      return await handleRetry(req, body);
    }
    if (action === "list") {
      return await handleList(req, body);
    }
    if (action === "config") {
      const auth = await requireSession(req);
      if (auth.response) return auth.response;
      if (!canManageRequests(auth.claims)) {
        return json({ ok: false, error: "forbidden" }, 403);
      }
      return json({ ok: true, config: publicConfig() });
    }
    if (action === "raw") {
      return await handleRaw(req, body);
    }

    // توافق خلفي: الطلبات القديمة كانت ترسل { to, text } بدون action.
    if (body.to || body.text) {
      return await handleRaw(req, body);
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e: any) {
    console.error("send-whatsapp error:", e);
    return json(
      { ok: false, error: "internal", detail: String(e?.message || e) },
      500
    );
  }
});

// ============================================================================
// WhatsApp notification API wrapper (browser side).
//
// لا توجد أي مفاتيح Meta هنا. كل الإرسال يتم عبر Supabase Edge Functions:
//   - update-service-request : حفظ الحالة بعد التحقق من الصلاحية
//   - send-whatsapp          : إشعار / سجل / إعادة محاولة / إعدادات
// ============================================================================

import { supabase } from "../supabaseClient";
import { sessionHeaders } from "./authSession";
import { getAppBase } from "./pushNotifications";
import {
  buildTrackingUrl,
  buildWhatsAppMessage,
  formatEgyptDateTime,
  isNotifiableStatus,
  normalizePhoneToIntl,
  normalizeStatus,
  statusArabicLabel,
  WHATSAPP_NOTIFIABLE_STATUSES,
  WHATSAPP_OFFICIAL_NUMBER,
  WHATSAPP_OFFICIAL_NUMBER_DISPLAY,
} from "../../supabase/functions/_shared/whatsappMessages.js";

const DEFAULT_TRACKING_BASE = "https://insurance-system-9et.pages.dev/";

export {
  buildWhatsAppMessage,
  formatEgyptDateTime,
  isNotifiableStatus,
  normalizePhoneToIntl,
  normalizeStatus,
  statusArabicLabel,
  WHATSAPP_NOTIFIABLE_STATUSES,
  WHATSAPP_OFFICIAL_NUMBER,
  WHATSAPP_OFFICIAL_NUMBER_DISPLAY,
};

/** رابط متابعة الطلب العام (https فقط في الإنتاج). */
export function requestTrackingUrl(requestId) {
  let base = "";
  try {
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol;
      if (protocol === "http:" || protocol === "https:") {
        base = getAppBase();
      }
    }
  } catch {
    // ignore
  }
  if (!base) base = DEFAULT_TRACKING_BASE;
  return buildTrackingUrl(base, requestId);
}

/** رسالة المعاينة بنفس منطق الإرسال الفعلي. */
export function buildWhatsAppPreviewMessage(request, status, options = {}) {
  return buildWhatsAppMessage({
    request,
    status: status || request?.status,
    trackingBaseUrl: options.trackingBaseUrl || requestTrackingUrl(request?.id),
    includeRejectionReason: options.includeRejectionReason !== false,
    includeNotes: Boolean(options.includeNotes),
    updatedAt: request?.updated_at || request?.created_at,
  });
}

function isUnavailableError(error) {
  if (!error) return false;
  const status = Number(error?.context?.status || error?.status || 0);
  if (status === 404) return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("failed to send a request to the edge function") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("function not found")
  );
}

async function invokeSendWhatsApp(body) {
  try {
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      headers: sessionHeaders(),
      body,
    });

    if (error) {
      let detail = error.message || "edge_function_error";
      try {
        const context = error.context;
        if (context && typeof context.json === "function") {
          const payload = await context.json();
          detail = payload?.detail || payload?.error || detail;
        }
      } catch {
        // ignore body parse errors
      }
      return {
        ok: false,
        error: detail,
        status: Number(error.context?.status || 0) || null,
        unavailable: isUnavailableError(error),
      };
    }

    if (!data) {
      return { ok: false, error: "empty_response" };
    }

    return data;
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e),
      unavailable: true,
    };
  }
}

/**
 * إشعار تغيير حالة (يُستدعى كاحتياط فقط إذا لم يتولَّ update-service-request
 * الإرسال بنفسه). لا يرمي استثناء أبدًا.
 */
export async function notifyWhatsAppStatusChange({
  requestId,
  previousStatus,
  status,
  updatedAt,
}) {
  if (!requestId || !isNotifiableStatus(status)) {
    return { ok: true, skipped: true, reason: "status_not_notifiable" };
  }

  return invokeSendWhatsApp({
    action: "notify",
    event: "status_change",
    requestId,
    previousStatus: previousStatus ?? null,
    status,
    updatedAt: updatedAt ?? null,
  });
}

/**
 * إشعار استلام طلب جديد بعد نجاح الإدخال من النموذج العام.
 * الخادم يقرأ الهاتف من صف الطلب نفسه ولا يثق بأي رقم من المتصفح.
 */
export async function notifyWhatsAppRequestCreated(requestId) {
  if (!requestId) {
    return { ok: true, skipped: true, reason: "request_id_required" };
  }
  return invokeSendWhatsApp({
    action: "notify-created",
    requestId,
  });
}

/** حفظ تحديث طلب بعد التحقق من الجلسة والصلاحية على الخادم. */
export async function updateServiceRequestViaServer({
  id,
  status,
  notes,
  fields,
  expectedStatus,
  expectedUpdatedAt,
}) {
  try {
    const body = { id };
    if (status !== undefined) body.status = status;
    if (notes !== undefined) body.notes = notes;
    if (fields) body.fields = fields;
    if (expectedStatus !== undefined) body.expectedStatus = expectedStatus;
    if (expectedUpdatedAt !== undefined) {
      body.expectedUpdatedAt = expectedUpdatedAt;
    }

    const { data, error } = await supabase.functions.invoke(
      "update-service-request",
      {
        headers: sessionHeaders(),
        body,
      }
    );

    if (error) {
      let detail = error.message || "edge_function_error";
      try {
        const context = error.context;
        if (context && typeof context.json === "function") {
          const payload = await context.json();
          detail = payload?.detail || payload?.error || detail;
        }
      } catch {
        // ignore
      }
      return {
        ok: false,
        error: detail,
        status: Number(error.context?.status || 0) || null,
        unavailable: isUnavailableError(error),
      };
    }

    if (!data) return { ok: false, error: "empty_response" };
    return data;
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e),
      unavailable: true,
    };
  }
}

export async function fetchWhatsAppConfig() {
  const result = await invokeSendWhatsApp({ action: "config" });
  return result?.ok ? result.config : null;
}

export async function listWhatsAppNotifications({
  status,
  requestId,
  limit = 100,
} = {}) {
  const result = await invokeSendWhatsApp({
    action: "list",
    status: status || undefined,
    requestId: requestId || undefined,
    limit,
  });
  if (!result?.ok) {
    return { ok: false, error: result?.error || "list_failed", notifications: [] };
  }
  return { ok: true, notifications: result.notifications || [] };
}

export async function retryWhatsAppNotification(notificationId) {
  return invokeSendWhatsApp({ action: "retry", notificationId });
}

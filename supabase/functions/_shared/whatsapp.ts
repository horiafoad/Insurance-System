// ============================================================================
// Shared WhatsApp Cloud API + notification-log logic for Edge Functions.
//
// Used by:
//   - send-whatsapp          (notify / retry / list / config / raw)
//   - update-service-request (status update + notification)
//
// All Meta secrets are read from Supabase Edge Function secrets. Nothing here
// is ever imported by the browser bundle.
// ============================================================================

import {
  buildDedupeKey,
  buildTemplateParams,
  buildWhatsAppMessage,
  getStatusKind,
  isNotifiableStatus,
  normalizePhoneToIntl,
  normalizeStatus,
  WHATSAPP_OFFICIAL_NUMBER,
} from "./whatsappMessages.js";

const DEFAULT_GRAPH_VERSION = "v20.0";

export type WhatsAppConfig = {
  token: string;
  phoneNumberId: string;
  wabaId: string;
  graphVersion: string;
  autoSend: boolean;
  dryRun: boolean;
  templateName: string;
  templateRejectedName: string;
  templateLanguage: string;
  trackingBaseUrl: string;
  shareRejectionReason: boolean;
  shareNotes: boolean;
  officialNumber: string;
  configured: boolean;
};

export function getWhatsAppConfig(): WhatsAppConfig {
  const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
  const phoneNumberId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
  return {
    token,
    phoneNumberId,
    wabaId: (Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") || "").trim(),
    graphVersion:
      (Deno.env.get("WHATSAPP_GRAPH_VERSION") || DEFAULT_GRAPH_VERSION).trim() ||
      DEFAULT_GRAPH_VERSION,
    autoSend: (Deno.env.get("WHATSAPP_AUTO_SEND") || "false").toLowerCase() === "true",
    dryRun: (Deno.env.get("WHATSAPP_DRY_RUN") || "false").toLowerCase() === "true",
    templateName: (Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "").trim(),
    templateRejectedName:
      (Deno.env.get("WHATSAPP_TEMPLATE_REJECTED_NAME") || "").trim(),
    templateLanguage:
      (Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "ar").trim() || "ar",
    trackingBaseUrl: (Deno.env.get("WHATSAPP_TRACKING_BASE_URL") || "").trim(),
    shareRejectionReason:
      (Deno.env.get("WHATSAPP_SHARE_REJECTION_REASON") || "false").toLowerCase() ===
      "true",
    shareNotes:
      (Deno.env.get("WHATSAPP_SHARE_NOTES") || "false").toLowerCase() === "true",
    officialNumber:
      (Deno.env.get("WHATSAPP_OFFICIAL_NUMBER") || WHATSAPP_OFFICIAL_NUMBER).trim() ||
      WHATSAPP_OFFICIAL_NUMBER,
    configured: Boolean(token && phoneNumberId),
  };
}

/** نفس منطق صلاحية «الطلبات» المستخدم في الواجهة. */
export function canManageRequests(claims: any): boolean {
  if (!claims) return false;
  if (claims.role === "super_admin" || claims.role === "admin") return true;
  if (claims.permissions == null) return true; // حساب قديم بوصول كامل
  return (
    Array.isArray(claims.permissions) && claims.permissions.includes("requests")
  );
}

export function canManageWhatsAppLogs(claims: any): boolean {
  return canManageRequests(claims);
}

type SendResult = {
  ok: boolean;
  messageId?: string | null;
  error?: string;
  detail?: string;
  mode?: "template" | "text" | "dry_run";
  dryRun?: boolean;
};

function metaErrorMessage(data: any): string {
  const err = data?.error || {};
  const parts = [
    err.message,
    err.code ? `code=${err.code}` : "",
    err.error_subcode ? `subcode=${err.error_subcode}` : "",
    err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : "",
  ].filter(Boolean);
  return parts.join(" | ") || "unknown_whatsapp_error";
}

/**
 * إرسال رسالة واحدة عبر Meta Cloud API.
 * إذا كان WHATSAPP_TEMPLATE_NAME مضبوطًا نستخدم قالبًا معتمدًا، وإلا نرسل نصًا
 * (النص يعمل فقط داخل نافذة خدمة العميل 24 ساعة أو لأرقام الاختبار).
 */
export async function sendViaMeta(params: {
  to: string;
  text: string;
  request: any;
  status: string;
  config: WhatsAppConfig;
}): Promise<SendResult> {
  const { to, text, request, status, config } = params;

  if (config.dryRun) {
    return {
      ok: true,
      dryRun: true,
      mode: "dry_run",
      messageId: `dry-run-${crypto.randomUUID()}`,
    } as SendResult;
  }

  if (!config.token || !config.phoneNumberId) {
    return { ok: false, error: "not_configured" };
  }

  const useTemplate = Boolean(config.templateName);
  let payload: Record<string, unknown>;
  let mode: "template" | "text" = useTemplate ? "template" : "text";

  if (useTemplate) {
    const template = buildTemplateParams({
      request,
      status,
      trackingBaseUrl: config.trackingBaseUrl,
      includeRejectionReason: config.shareRejectionReason,
    });
    const name =
      template.rejected && config.templateRejectedName
        ? config.templateRejectedName
        : config.templateName;

    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name,
        language: { code: config.templateLanguage },
        components: [
          {
            type: "body",
            parameters: template.params.map((value) => ({
              type: "text",
              text: String(value),
            })),
          },
        ],
      },
    };
  } else {
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      console.error("WhatsApp Cloud API error:", data);
      return {
        ok: false,
        error: "whatsapp_api_error",
        detail: metaErrorMessage(data),
        mode,
      };
    }

    return {
      ok: true,
      messageId: data?.messages?.[0]?.id || null,
      mode,
    };
  } catch (e: any) {
    console.error("send-whatsapp exception:", e);
    return {
      ok: false,
      error: "network_error",
      detail: String(e?.message || e),
      mode,
    };
  }
}

function notificationRowForClient(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: row.request_id,
    request_number: row.request_number,
    recipient_phone: row.recipient_phone,
    trigger_status: row.trigger_status,
    event_type: row.event_type,
    status: row.status,
    provider_message_id: row.provider_message_id,
    error_message: row.error_message,
    attempts: row.attempts,
    dry_run: row.dry_run,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_attempt_at: row.last_attempt_at,
    sent_at: row.sent_at,
    message_text: row.message_text,
  };
}

async function findNotification(supabase: any, column: string, value: string) {
  const { data, error } = await supabase
    .from("whatsapp_notifications")
    .select("*")
    .eq(column, value)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findSentNotification(
  supabase: any,
  requestId: string,
  event: string,
  status: string,
  phone: string | null
) {
  let query = supabase
    .from("whatsapp_notifications")
    .select("*")
    .eq("request_id", requestId)
    .eq("event_type", event)
    .eq("trigger_status", status)
    .eq("status", "sent");

  if (phone) query = query.eq("recipient_phone", phone);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateNotification(supabase: any, id: string, patch: any) {
  const { data, error } = await supabase
    .from("whatsapp_notifications")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type ProcessNotificationParams = {
  supabase: any;
  request: any;
  status: string;
  event: "created" | "status_change";
  actor?: string | null;
  previousStatus?: string | null;
  notificationId?: string | null;
  forceRetry?: boolean;
};

/**
 * إنشاء/تحديث سجل الإشعار ثم إرساله (أو تسجيل سبب التخطي).
 *
 * قاعدة الأمان: لا نثق بالرسالة أو الهاتف القادمين من المتصفح. نقرأ صف الطلب
 * من قاعدة البيانات ونستخدم هاتفه، ونستخدم dedupe_key لمنع التكرار.
 */
export async function processNotification(
  params: ProcessNotificationParams
): Promise<any> {
  const {
    supabase,
    request,
    event,
    actor = null,
    previousStatus = null,
    notificationId = null,
    forceRetry = false,
  } = params;

  const config = getWhatsAppConfig();
  const status = normalizeStatus(params.status || request?.status);
  const requestId = String(request?.id ?? "").trim();
  const kind = getStatusKind(status);
  const phone = normalizePhoneToIntl(request?.phone);

  if (!requestId) {
    return { ok: false, error: "request_id_required" };
  }

  if (!forceRetry && event === "status_change" && !isNotifiableStatus(status)) {
    return { ok: true, skipped: true, reason: "status_not_notifiable" };
  }

  let existing: any = null;
  if (notificationId) {
    existing = await findNotification(supabase, "id", notificationId);
  }

  const dedupeKey =
    existing?.dedupe_key ||
    buildDedupeKey({
      requestId,
      event,
      status,
      updatedAt: request?.updated_at || request?.created_at || "",
    });

  if (!existing) {
    existing = await findNotification(supabase, "dedupe_key", dedupeKey);
  }

  // حماية إضافية من التكرار: إذا سبق إرسال إشعار ناجح لنفس الطلب ونفس
  // الحالة، لا نرسل مرة أخرى حتى لو تغيّر وقت التحديث (مثلاً انقطاع الرد
  // بعد نجاح الحفظ). الإرسال الفاشل يبقى قابلاً لإعادة المحاولة اليدوية.
  if (!existing && !forceRetry) {
    const alreadySent = await findSentNotification(
      supabase,
      requestId,
      event,
      status,
      phone
    );
    if (alreadySent) {
      return {
        ok: true,
        duplicate: true,
        notification: notificationRowForClient(alreadySent),
      };
    }
  }

  // إشعار سابق: لا نرسل تلقائيًا مرة أخرى. الإعادة تتم فقط عبر retry صريح.
  if (existing && !forceRetry) {
    return {
      ok: true,
      duplicate: true,
      notification: notificationRowForClient(existing),
    };
  }

  if (existing && forceRetry) {
    if (existing.status === "sent") {
      return {
        ok: false,
        error: "already_sent",
        notification: notificationRowForClient(existing),
      };
    }
    if (existing.status === "sending") {
      const last = existing.last_attempt_at
        ? new Date(existing.last_attempt_at).getTime()
        : 0;
      if (Date.now() - last < 5 * 60 * 1000) {
        return {
          ok: false,
          error: "already_sending",
          notification: notificationRowForClient(existing),
        };
      }
    }
  }

  const messageText = buildWhatsAppMessage({
    request,
    status,
    trackingBaseUrl: config.trackingBaseUrl,
    includeRejectionReason: config.shareRejectionReason,
    includeNotes: config.shareNotes,
    updatedAt: request?.updated_at || request?.created_at,
  });

  if (!existing) {
    const insertPayload = {
      request_id: requestId,
      request_number: requestId,
      recipient_phone: phone,
      trigger_status: status,
      event_type: event,
      message_text: messageText,
      status: "pending",
      dedupe_key: dedupeKey,
      dry_run: false,
      created_by: actor,
      metadata: {
        previous_status: previousStatus,
        status_kind: kind,
        official_number: config.officialNumber,
        provider: "meta_cloud_api",
        graph_version: config.graphVersion,
      },
    };

    const { data: created, error: insertError } = await supabase
      .from("whatsapp_notifications")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      // سباق: طلب آخر أنشأ نفس السجل.
      if (String(insertError.code || "") === "23505") {
        const raced = await findNotification(supabase, "dedupe_key", dedupeKey);
        return {
          ok: true,
          duplicate: true,
          notification: notificationRowForClient(raced),
        };
      }
      return { ok: false, error: "log_insert_failed", detail: insertError.message };
    }

    existing = created;
  }

  // لا يوجد رقم صالح: نسجّل السبب بدل إفشال حفظ الطلب.
  if (!phone) {
    const updated = await updateNotification(supabase, existing.id, {
      status: "skipped",
      error_message: "missing_or_invalid_phone",
      recipient_phone: request?.phone || null,
    });
    return {
      ok: true,
      skipped: true,
      reason: "missing_or_invalid_phone",
      notification: notificationRowForClient(updated),
    };
  }

  // بوابة الأمان: لا إرسال حقيقي قبل التفعيل الصريح.
  if (!config.autoSend) {
    if (forceRetry) {
      return {
        ok: false,
        error: "sending_disabled",
        detail: "WHATSAPP_AUTO_SEND is not true",
        notification: notificationRowForClient(existing),
      };
    }
    const updated = await updateNotification(supabase, existing.id, {
      status: "skipped",
      error_message: "auto_send_disabled",
      recipient_phone: phone,
    });
    return {
      ok: true,
      skipped: true,
      reason: "auto_send_disabled",
      notification: notificationRowForClient(updated),
    };
  }

  if (!config.configured && !config.dryRun) {
    const updated = await updateNotification(supabase, existing.id, {
      status: "failed",
      error_message: "not_configured",
      recipient_phone: phone,
      attempts: Number(existing.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    });
    return {
      ok: false,
      error: "not_configured",
      notification: notificationRowForClient(updated),
    };
  }

  // حالة "قيد المحاولة" قبل الاتصال الخارجي.
  existing = await updateNotification(supabase, existing.id, {
    status: "sending",
    recipient_phone: phone,
    attempts: Number(existing.attempts || 0) + 1,
    last_attempt_at: new Date().toISOString(),
    error_message: null,
  });

  const result = await sendViaMeta({
    to: phone,
    text: messageText,
    request,
    status,
    config,
  });

  if (result.ok) {
    const updated = await updateNotification(supabase, existing.id, {
      status: "sent",
      provider_message_id: result.messageId || null,
      error_message: null,
      sent_at: new Date().toISOString(),
      dry_run: Boolean(config.dryRun),
      metadata: {
        ...(existing.metadata || {}),
        send_mode: result.mode,
        dry_run: Boolean(config.dryRun),
      },
    });
    return {
      ok: true,
      sent: true,
      dryRun: Boolean(config.dryRun),
      notification: notificationRowForClient(updated),
    };
  }

  const updated = await updateNotification(supabase, existing.id, {
    status: "failed",
    error_message: [result.error, result.detail].filter(Boolean).join(" | "),
    metadata: {
      ...(existing.metadata || {}),
      send_mode: result.mode,
    },
  });

  return {
    ok: false,
    error: result.error || "send_failed",
    detail: result.detail || null,
    notification: notificationRowForClient(updated),
  };
}

export async function listNotifications(
  supabase: any,
  options: { status?: string; requestId?: string; limit?: number } = {}
) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  let query = supabase
    .from("whatsapp_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.status) query = query.eq("status", options.status);
  if (options.requestId) query = query.eq("request_id", String(options.requestId));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(notificationRowForClient);
}

export { notificationRowForClient };

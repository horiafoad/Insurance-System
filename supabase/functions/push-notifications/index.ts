// Supabase Edge Function: push-notifications
// المسؤول عن إدارة اشتراكات الأجهزة وإرسال Web Push.
//
// المتغيرات المطلوبة (Supabase Dashboard -> Edge Functions / Deno KV secrets):
//   VAPID_SUBJECT        مثل: mailto:admin@example.com
//   VAPID_PUBLIC_KEY     المفتاح العام VAPID (نفس VITE_VAPID_PUBLIC_KEY في .env)
//   VAPID_PRIVATE_KEY     المفتاح الخاص VAPID (سري - لا يوضع في الواجهة أبداً)
//
// الوصول: service_role فقط (لا يمكن للعميل قراءة/كتابة push_subscriptions مباشرة).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@asu.edu.eg";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets.");
}

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveAppBase(appUrl, selfUrl): string {
  try {
    if (appUrl) return new URL(appUrl).origin;
  } catch (_e) {
    // ignore
  }
  try {
    return new URL(selfUrl).origin;
  } catch (_e) {
    return "";
  }
}

// تنسيق payload واحد يُرسل للمتصفح + معالجة الضغط على الإشعار.
function buildPayload(eventType, data, appBase) {
  const titleMap = {
    new_request: "🔔 طلب جديد",
    status_change: "🔔 تحديث حالة طلب",
    note_added: "📝 ملاحظة جديدة",
    test: "✅ إشعار تجريبي",
  };
  const bodyMap = {
    new_request: `تم استلام طلب جديد رقم ${data.requestNumber}`,
    status_change: `تم تحديث حالة الطلب رقم ${data.requestNumber} إلى "${data.status}"`,
    note_added: `تمت إضافة ملاحظة على الطلب رقم ${data.requestNumber}`,
    test: "إشعارات الموبايل تعمل بشكل صحيح 🎉",
  };
  const url = data.requestId
    ? `${appBase}/?openRequest=${data.requestId}`
    : `${appBase}/`;

  return {
    title: titleMap[eventType] || "تنبيه",
    body: bodyMap[eventType] || "",
    url,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
  };
}

async function sendToSubscriptions(subscriptions, payload): Promise<number> {
  let sent = 0;
  for (const sub of subscriptions) {
    if (!sub.is_active) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60 }
      );
      sent++;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        console.warn("Removing dead subscription:", statusCode);
        await supabase
          .from("push_subscriptions")
          .update({ is_active: false })
          .eq("endpoint", sub.endpoint);
      } else {
        console.error("Push send error:", statusCode || err?.message || err);
      }
    }
  }
  return sent;
}

async function getActiveSubscriptions(userId): Promise<any[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return data || [];
}

// متلقو إشعارات الطلبات: كل من يملك صلاحية "requests" أو permissions خالية (وصول كامل)
async function resolveRequestRecipients(): Promise<string[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .or(
      'role.in.(super_admin,admin),permissions.is.null,permissions.cs.["requests"]'
    );
  if (error) throw error;
  return (data || []).map((u) => u.id);
}

async function handleRegister(body): Promise<Record<string, unknown>> {
  const { userId, endpoint, p256dh, auth, deviceName, platform } = body || {};
  if (!userId || !endpoint || !p256dh || !auth) {
    return { ok: false, error: "Missing subscription data" };
  }

  if (!endpoint.startsWith("https://")) {
    return { ok: false, error: "Invalid endpoint" };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        device_name: deviceName || null,
        platform: platform || null,
        is_active: true,
      },
      { onConflict: "endpoint" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return { ok: true, id: data?.id };
}

async function handleList(body): Promise<Record<string, unknown>> {
  const userId = body?.userId;
  if (!userId) return { ok: false, error: "Missing userId" };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return { ok: true, devices: data || [] };
}

async function handleDeactivate(body): Promise<Record<string, unknown>> {
  const { userId, endpoint } = body || {};
  if (!userId || !endpoint) return { ok: false, error: "Missing data" };

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) throw error;
  return { ok: true };
}

async function handleTest(body, selfUrl): Promise<Record<string, unknown>> {
  const userId = body?.userId;
  if (!userId) return { ok: false, error: "Missing userId" };

  const subs = await getActiveSubscriptions(userId);
  const appBase = resolveAppBase(body?.appUrl, selfUrl);
  const payload = buildPayload("test", {}, appBase);
  const sent = await sendToSubscriptions(subs, payload);
  return { ok: true, sent };
}

async function handleNotify(body, selfUrl): Promise<Record<string, unknown>> {
  const { eventType, requestNumber, status, requestId } = body || {};
  if (!eventType) return { ok: false, error: "Missing eventType" };

  const recipientIds = await resolveRequestRecipients();
  if (recipientIds.length === 0) return { ok: true, sent: 0 };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientIds)
    .eq("is_active", true);

  if (error) throw error;

  const appBase = resolveAppBase(body?.appUrl, selfUrl);
  const payload = buildPayload(
    eventType,
    {
      requestNumber: requestNumber ?? "؟",
      status: status || "",
      requestId: requestId || null,
    },
    appBase
  );

  const sent = await sendToSubscriptions(data || [], payload);
  return { ok: true, recipients: recipientIds.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const selfUrl = req.url;

  try {
    const body = await req.json();
    const action = body?.action;

    let result: Record<string, unknown>;
    switch (action) {
      case "register":
        result = await handleRegister(body);
        break;
      case "list":
        result = await handleList(body);
        break;
      case "deactivate":
        result = await handleDeactivate(body);
        break;
      case "test":
        result = await handleTest(body, selfUrl);
        break;
      case "notify":
        result = await handleNotify(body, selfUrl);
        break;
      default:
        return json({ ok: false, error: "Unknown action" }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("push-notifications error:", err);
    return json({ ok: false, error: err?.message || "server error" }, 500);
  }
});
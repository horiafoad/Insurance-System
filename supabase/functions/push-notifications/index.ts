// Supabase Edge Function: push-notifications
// المسؤول عن إدارة اشتراكات الأجهزة وإرسال Web Push + FCM (تطبيق الأندرويد الأصلي).
//
// المتغيرات المطلوبة (Supabase Dashboard -> Edge Functions):
//   VAPID_SUBJECT        مثل: mailto:admin@example.com
//   VAPID_PUBLIC_KEY     المفتاح العام VAPID (نفس VITE_VAPID_PUBLIC_KEY في .env)
//   VAPID_PRIVATE_KEY     المفتاح الخاص VAPID (سري - لا يوضع في الواجهة أبداً)
//   FCM_SERVICE_ACCOUNT   (اختياري) JSON لحساب Service Account من Firebase
//                        لإرسال إشعارات تطبيق الأندرويد الأصلي عبر FCM. إن لم
//                        يُضبط يتم تخطي الإرسال عبر FCM بهدوء (يبقى Web Push يعمل).
//
// الوصول: service_role فقط (لا يمكن للعميل قراءة/كتابة push_subscriptions مباشرة).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@asu.edu.eg";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

const FCM_SERVICE_ACCOUNT = Deno.env.get("FCM_SERVICE_ACCOUNT") || "";

if (!vapidConfigured) {
  console.error("Missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets.");
} else {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!
  );
}

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
    new_letter: "📩 خطاب جديد",
    status_change: "🔔 تحديث حالة طلب",
    note_added: "📝 ملاحظة جديدة",
    test: "✅ إشعار تجريبي",
  };
  const bodyMap = {
    new_request: `وصل طلب جديد يحتاج إلى المتابعة${data.requesterName ? ` من ${data.requesterName}` : ""}${data.serviceType ? ` (${data.serviceType})` : ""}`,
    new_letter: `وصل خطاب جديد إلى قسم ${data.departmentName || ""}`.trim() + (data.subject ? `\n${data.subject}` : ""),
    status_change: `تم تحديث حالة الطلب رقم ${data.requestNumber} إلى "${data.status}"`,
    note_added: `تمت إضافة ملاحظة على الطلب رقم ${data.requestNumber}`,
    test: "إشعارات الموبايل تعمل بشكل صحيح 🎉",
  };
  const url = data.letterId
    ? `${appBase}/?openLetter=${data.letterId}`
    : data.requestId
      ? `${appBase}/?openRequest=${data.requestId}`
      : `${appBase}/`;

  return {
    title: titleMap[eventType] || "تنبيه",
    body: bodyMap[eventType] || "",
    url,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
  };
}

async function sendToSubscriptions(subscriptions, payload): Promise<number> {
  if (!vapidConfigured) {
    console.error("VAPID keys are not configured — skipping push send.");
    return 0;
  }
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
      } else if (
        (statusCode === 400 || statusCode === 403) &&
        /VapidPkHashMismatch|VAPID credentials/i.test(
          String(err?.body || err?.message || "")
        )
      ) {
        // Apple/Chrome: الاشتراك أُنشئ بمفتاح VAPID قديم مختلف عن مفتاح الخادم —
        // نُعطّله ليعيد التطبيق تسجيله تلقائياً بمفتاح سليم عند التفعيل.
        console.warn("Vapid key mismatch — deactivating subscription:", sub.endpoint);
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

/* =========================================================================
   FCM — إرسال الإشعارات لتطبيق الأندرويد الأصلي (عبر @capacitor/push-notifications)
   يستخدم OAuth2 عبر مفتاح service account من نفس مشروع Firebase.
   ========================================================================= */

function parseFcmServiceAccount(raw: string) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o.project_id && o.client_email && o.private_key) return o;
  } catch {
    // ignore
  }
  return null;
}

const fcmCredentials = parseFcmServiceAccount(FCM_SERVICE_ACCOUNT);

function base64UrlEncode(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

async function getFcmAccessToken(): Promise<string | null> {
  if (!fcmCredentials) return null;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = fcmCredentials.token_uri || "https://oauth2.googleapis.com/token";
  const enc = (o: unknown) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));

  const signingInput = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: fcmCredentials.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;

  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToPkcs8(fcmCredentials.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput)
    );
    const jwt = `${signingInput}.${base64UrlEncode(sig)}`;

    const res = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      console.error("FCM token exchange failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error("FCM token generation error:", err?.message || err);
    return null;
  }
}

async function sendFcmMessage(token: string, payload): Promise<boolean> {
  if (!fcmCredentials) {
    console.error("FCM_SERVICE_ACCOUNT not configured — skipping FCM send.");
    return false;
  }
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${fcmCredentials.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: { url: payload.url || "" },
            android: {
              priority: "high",
              notification: { clickAction: "OPEN_MAIN_ACTIVITY" },
            },
          },
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("FCM send error:", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("FCM send exception:", err?.message || err);
    return false;
  }
}

async function sendMixedSubscriptions(subscriptions, payload): Promise<{ web: number; fcm: number }> {
  const webSubs = (subscriptions || []).filter(
    (s: any) => s.is_active && s.endpoint && s.p256dh && s.auth
  );
  const fcmSubs = (subscriptions || []).filter(
    (s: any) => s.is_active && s.fcm_token
  );

  let web = 0;
  let fcm = 0;
  if (webSubs.length > 0) {
    web = await sendToSubscriptions(webSubs, payload);
  }
  for (const s of fcmSubs) {
    if (await sendFcmMessage(s.fcm_token, payload)) fcm++;
  }
  return { web, fcm };
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

// متلقو إشعارات الخطابات: مستخدمو القسم الذي وصل إليه الخطاب فقط + المدراء.
// يُحدَّد القسم من محطة الخطاب الحالية (status=in_progress ولم يتم استلامها بعد).
async function resolveLetterRecipients(letterId): Promise<{ userIds: string[]; departmentName: string }> {
  const { data: movements, error: movError } = await supabase
    .from("letter_movements")
    .select("department_id")
    .eq("letter_id", letterId)
    .eq("status", "in_progress")
    .is("received_at", null);

  if (movError) throw movError;

  const deptIds = [
    ...new Set(
      (movements || [])
        .map((m) => m.department_id)
        .filter((d) => d != null)
    ),
  ];

  let departmentName = "";
  if (deptIds.length > 0) {
    const { data: depts, error: deptError } = await supabase
      .from("letter_departments")
      .select("name")
      .in("id", deptIds);
    if (deptError) throw deptError;
    departmentName = (depts || [])[0]?.name || "";
  }

  if (deptIds.length === 0) {
    return { userIds: [], departmentName };
  }

  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id")
    .or(`department_id.in.(${deptIds.join(",")}),role.in.(super_admin,admin)`);

  if (userError) throw userError;
  return {
    userIds: (users || []).map((u) => u.id),
    departmentName,
  };
}

async function handleRegister(body): Promise<Record<string, unknown>> {
  const { userId, endpoint, p256dh, auth, deviceName, platform, fcmToken } =
    body || {};

  if (!userId) return { ok: false, error: "Missing userId" };

  // تسجيل جهاز تطبيق الأندرويد الأصلي عبر رمز FCM
  if (fcmToken) {
    const row = {
      user_id: userId,
      fcm_token: fcmToken,
      endpoint: endpoint || fcmToken,
      p256dh: p256dh || "",
      auth: auth || "",
      device_name: deviceName || "native",
      platform: platform || "android",
      is_active: true,
    };

    // أولاً نفعّل أي صف قديم يحمل نفس التوكن.
    await supabase
      .from("push_subscriptions")
      .update({ is_active: true, device_name: row.device_name })
      .eq("fcm_token", fcmToken);

    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" })
      .select("id")
      .single();

    if (error && /unique|duplicate/i.test(String(error.message || error))) {
      // لا يوجد فهرس فريد على endpoint — نُدرج يدوياً مكتفين بالعودة.
      const { data: inserted, error: insertError } = await supabase
        .from("push_subscriptions")
        .insert(row)
        .select("id")
        .single();
      if (insertError) throw insertError;
      return { ok: true, id: inserted?.id };
    }

    if (error) throw error;
    return { ok: true, id: data?.id };
  }

  if (!endpoint || !p256dh || !auth) {
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
  const { userId, endpoint, fcmToken } = body || {};
  if (!userId || (!endpoint && !fcmToken)) {
    return { ok: false, error: "Missing data" };
  }

  let query = supabase
    .from("push_subscriptions")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (fcmToken) {
    query = query.eq("fcm_token", fcmToken);
  } else {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;
  if (error) throw error;
  return { ok: true };
}

async function handleTest(body, selfUrl): Promise<Record<string, unknown>> {
  const userId = body?.userId;
  if (!userId) return { ok: false, error: "Missing userId" };

  const subs = await getActiveSubscriptions(userId);
  const appBase = resolveAppBase(body?.appUrl, selfUrl);
  const payload = buildPayload("test", {}, appBase);
  const { web, fcm } = await sendMixedSubscriptions(subs, payload);
  return { ok: true, sent: web + fcm, web, fcm };
}

// هل المتصل مسؤول (منشئ البرنامج/مدير) يمكنه إدارة أجهزة جميع المستخدمين؟
async function isAdminCaller(callerUserId): Promise<boolean> {
  const { data: caller } = await supabase
    .from("users")
    .select("role, permissions")
    .eq("id", callerUserId)
    .maybeSingle();
  if (!caller) return false;
  return (
    caller.role === "super_admin" ||
    caller.role === "admin" ||
    caller.permissions == null
  );
}

// قائمة بجميع الأجهزة المشتركة في الإشعارات لكل المستخدمين (للمسؤول فقط).
async function handleListAllDevices(body): Promise<Record<string, unknown>> {
  const callerId = body?.userId;
  if (!callerId) return { ok: false, error: "Missing userId" };
  if (!(await isAdminCaller(callerId))) {
    return { ok: false, error: "Forbidden" };
  }

  const { data: devices, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, username, full_name, role");
  if (usersError) throw usersError;

  const usersById = {};
  (users || []).forEach((u) => {
    usersById[u.id] = u;
  });

  return {
    ok: true,
    devices: (devices || []).map((d) => ({
      ...d,
      user: usersById[d.user_id] || null,
    })),
  };
}

// تفعيل/تعطيل أي جهاز من أي مستخدم (للمسؤول فقط).
async function handleSetDeviceActive(body): Promise<Record<string, unknown>> {
  const callerId = body?.userId;
  const endpoint = body?.endpoint;
  const isActive = Boolean(body?.is_active);
  if (!callerId || !endpoint) return { ok: false, error: "Missing data" };
  if (!(await isAdminCaller(callerId))) {
    return { ok: false, error: "Forbidden" };
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .update({ is_active: isActive })
    .eq("endpoint", endpoint);
  if (error) throw error;
  return { ok: true };
}

async function handleNotify(body, selfUrl): Promise<Record<string, unknown>> {
  const { eventType, requestNumber, status, requestId, letterId } = body || {};
  if (!eventType) return { ok: false, error: "Missing eventType" };

  const appBase = resolveAppBase(body?.appUrl, selfUrl);

  // إشعار خطاب جديد: الإشعار يصل لمستخدمي القسم الهدف فقط (ما يُنشئه الجرس في DB).
  if (eventType === "letter" || eventType === "new_letter") {
    if (letterId == null) {
      return { ok: false, error: "Missing letterId" };
    }

    const { userIds, departmentName } =
      await resolveLetterRecipients(letterId);
    if (userIds.length === 0) return { ok: true, sent: 0 };

    const { data: letter } = await supabase
      .from("letters")
      .select("letter_number, subject")
      .eq("id", letterId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds)
      .eq("is_active", true);

    if (error) throw error;

    const payload = buildPayload(
      "new_letter",
      {
        letterId: String(letterId),
        letterNumber: letter?.letter_number || "",
        subject: letter?.subject || "",
        departmentName: departmentName || body?.departmentName || "",
      },
      appBase
    );

    const { web, fcm } = await sendMixedSubscriptions(data || [], payload);
    return { ok: true, recipients: userIds.length, sent: web + fcm, fcm };
  }

  const recipientIds = await resolveRequestRecipients();
  if (recipientIds.length === 0) return { ok: true, sent: 0 };

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientIds)
    .eq("is_active", true);

  if (error) throw error;

  const payload = buildPayload(
    eventType,
    {
      requestNumber: requestNumber ?? "؟",
      status: status || "",
      requestId: requestId || null,
      requesterName: body?.requesterName || "",
      serviceType: body?.serviceType || "",
    },
    appBase
  );

  const { web, fcm } = await sendMixedSubscriptions(data || [], payload);
  return { ok: true, recipients: recipientIds.length, sent: web + fcm, fcm };
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
      case "list_all":
        result = await handleListAllDevices(body);
        break;
      case "set_active":
        result = await handleSetDeviceActive(body);
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
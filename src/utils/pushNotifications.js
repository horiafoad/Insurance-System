import { supabase } from "../supabaseClient";

// VAPID public key من إعدادات البناء.
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function getDeviceInfo() {
  const ua = navigator.userAgent || "";
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);

  let platform = "desktop";
  let deviceName = "حاسوب";

  if (isAndroid) {
    platform = "android";
    const match = ua.match(/Android\s([\d.]+)/);
    deviceName = "Android" + (match ? " " + match[1] : "");
  } else if (isIOS) {
    platform = "ios";
    const match = ua.match(/OS\s([\d_]+)/);
    deviceName = "iOS" + (match ? " " + match[1].replace(/_/g, ".") : "");
  } else if (/ipad/i.test(ua)) {
    platform = "ios";
    deviceName = "iPad";
  }

  const match = ua.match(
    /(Edg|Chrome|Firefox|Safari)\/([\w.]+)/
  );
  if (match && match[1]) {
    const friendly = {
      Edg: "Edge",
      Chrome: "Chrome",
      Firefox: "Firefox",
      Safari: "Safari",
    }[match[1]];
    deviceName = `${platform === "desktop" ? "حاسوب" : deviceName} · ${friendly} ${match[2]}`;
  }

  return { platform, deviceName };
}

// تسجيل جهاز المستخدم الحالي.
export async function enablePushNotifications(user) {
  if (!isPushSupported()) {
    throw new Error(
      "المتصفح لا يدعم إشعارات الدفع، أو مفتاح VAPID غير مضبوط."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("تم رفض إذن الإشعارات من المتصفح.");
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const { platform, deviceName } = getDeviceInfo();

  const { data, error } = await supabase.functions.invoke(
    "push-notifications",
    {
      body: {
        action: "register",
        userId: user?.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.getKey("p256dh")
          ? arrayBufferToBase64(subscription.getKey("p256dh"))
          : null,
        auth: subscription.getKey("auth")
          ? arrayBufferToBase64(subscription.getKey("auth"))
          : null,
        deviceName,
        platform,
      },
    }
  );

  if (error) {
    console.error("push register error:", error);
    throw new Error("تعذر تسجيل الجهاز لدى الخادم.");
  }

  if (data && data.ok === false) {
    throw new Error(data.error || "تعذر تسجيل الجهاز.");
  }

  return subscription;
}

export async function disablePushNotifications(user) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && user?.id) {
      await supabase.functions.invoke("push-notifications", {
        body: {
          action: "deactivate",
          userId: user.id,
          endpoint: subscription.endpoint,
        },
      });
      await subscription.unsubscribe();
    }
  } catch (e) {
    console.error("disable push error:", e);
  }
}

export async function listPushDevices(userId) {
  const { data, error } = await supabase.functions.invoke(
    "push-notifications",
    { body: { action: "list", userId } }
  );
  if (error) {
    console.error("push list error:", error);
    return [];
  }
  return (data && data.devices) || [];
}

export async function deactivatePushDevice(userId, endpoint) {
  const { data, error } = await supabase.functions.invoke(
    "push-notifications",
    { body: { action: "deactivate", userId, endpoint } }
  );
  if (error) {
    console.error("push deactivate error:", error);
  }
  return data && data.ok !== false;
}

export async function sendTestNotification(userId) {
  const { data, error } = await supabase.functions.invoke(
    "push-notifications",
    {
      body: {
        action: "test",
        userId,
        appUrl: window.location.origin,
      },
    }
  );
  if (error) {
    console.error("push test error:", error);
    throw new Error("تعذر إرسال الإشعار التجريبي.");
  }
  return data;
}

// إرسال غير متزامن (fire-and-forget) بعد حدث جديد — لا يكسر تدفق العمل حتى لو فشل.
export function notifyPushEvent(eventType, payload = {}) {
  if (!isPushSupported()) return;
  Promise.resolve(
    supabase.functions.invoke("push-notifications", {
      body: {
        action: "notify",
        eventType,
        appUrl: window.location.origin,
        ...payload,
      },
    })
  ).catch((err) => console.error("push notify error:", err));
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\//g, "_")
    .replace(/\+/g, "-")
    .replace(/=+$/, "");
}
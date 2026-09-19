import { supabase } from "../supabaseClient";

// كشف بيئة التطبيق الأصلي (Capacitor) — وليس المتصفح.
export function isNativePlatform() {
  return Boolean(
    typeof window !== "undefined" &&
      window.Capacitor &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform()
  );
}

// تسجيل جهاز الأندرويد الأصلي لدى الخادم عبر رمز FCM.
export async function enableNativePush(user) {
  if (!isNativePlatform() || !user?.id) {
    return { ok: false, reason: "not-native" };
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    try {
      const perms = await PushNotifications.requestPermissions();
      if (perms.receive === false) {
        return { ok: false, reason: "denied" };
      }
    } catch (permErr) {
      console.warn("native push permission error:", permErr);
    }

    const token = await new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      };

      PushNotifications.addListener("registration", (e) => finish(e?.value || null));

      try {
        PushNotifications.register();
      } catch (regErr) {
        console.warn("native push register error:", regErr);
        finish(null);
      }

      setTimeout(() => finish(null), 8000);
    });

    if (!token) {
      return { ok: false, reason: "no-token" };
    }

    const { getDeviceInfo } = await import("./pushNotifications");
    const { platform, deviceName } = getDeviceInfo();

    const { data, error } = await supabase.functions.invoke(
      "push-notifications",
      {
        body: {
          action: "register",
          userId: user.id,
          fcmToken: token,
          deviceName: deviceName || "native",
          platform:
            platform === "ios" ? "ios-native" : "android-native",
        },
      }
    );

    if (error || (data && data.ok === false)) {
      console.error("fcm server register error:", error || data);
      return { ok: false, reason: "server" };
    }

    PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const url =
          action?.notification?.data?.url ||
          action?.actionId === "tap" &&
            action?.notification?.data?.url;
        if (url && window.location.href !== url) {
          window.location.href = url;
        }
      }
    );

    return { ok: true, token };
  } catch (err) {
    console.error("native push error:", err);
    return { ok: false, reason: "error" };
  }
}

export async function disableNativePush(user) {
  if (!isNativePlatform() || !user?.id) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const listener = await PushNotifications.addListener(
      "registration",
      async (e) => {
        if (e?.value) {
          await supabase.functions.invoke("push-notifications", {
            body: {
              action: "deactivate",
              userId: user.id,
              fcmToken: e.value,
            },
          });
        }
        listener.remove();
      }
    );
    try {
      PushNotifications.unregister();
    } catch {
      // ignore
    }
  } catch (err) {
    console.error("native push disable error:", err);
  }
}
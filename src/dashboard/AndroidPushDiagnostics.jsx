import React, { useEffect, useRef, useState } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";
import {
  isPushSupported,
  getDeviceInfo,
  getAppBase,
  listPushDevices,
  urlBase64ToUint8Array,
} from "../utils/pushNotifications";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// مكوّن تشخيص مؤقت — يُعرض على أندرويد فقط لتحديد نقطة فشل Web Push.
export default function AndroidPushDiagnostics({ currentUser }) {
  const isAndroid = /android/i.test(navigator.userAgent || "");
  const [logLines, setLogLines] = useState([]);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [swLast, setSwLast] = useState(null);
  const [swStored, setSwStored] = useState(null);
  const [serverDetails, setServerDetails] = useState(null);
  const swMessageRef = useRef({});

  if (!isAndroid) return null;

  const addLog = (line, kind = "info") => {
    setLogLines((prev) => [
      ...prev,
      { line, kind, t: new Date().toLocaleTimeString("ar") },
    ]);
  };

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => {
      if (!e.data) return;
      if (e.data.type === "PUSH_DEBUG") {
        swMessageRef.current[e.data.stage] = e.data.t;
        setSwLast(e.data);
        addLog(
          `الـ Service Worker وصل: ${e.data.stage} ${
            e.data.error ? " — " + e.data.error : ""
          }`,
          e.data.stage === "show-error" ? "error" : "ok"
        );
      }
      if (e.data.type === "PUSH_DEBUG_RESULT") {
        setSwStored(e.data.record);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logFooter = (text) => addLog(text, "muted");

  const runDiagnosis = async () => {
    setRunning(true);
    setLogLines([]);
    setServerDetails(null);
    setSwLast(null);
    setSwStored(null);

    try {
      // 1) HTTPS
      const isHttps = window.location.protocol === "https:";
      addLog(
        `1) HTTPS: ${
          isHttps ? "نعم ✔" : "لا ✘ — الإشعارات لا تعمل إلا عبر HTTPS"
        }`,
        isHttps ? "ok" : "error"
      );

      // 2) الدعم والمفتاح
      addLog(
        `2) نوع المتصفح: ${navigator.userAgent.replace(/\s+/g, " ").slice(0, 110)}`,
        "muted"
      );
      addLog(`2) VAPID public key موجود: ${VAPID_PUBLIC_KEY ? "نعم ✔" : "لا ✘"}`,
        VAPID_PUBLIC_KEY ? "ok" : "error");
      addLog(`2) isPushSupported: ${isPushSupported() ? "نعم ✔" : "لا ✘"}`,
        isPushSupported() ? "ok" : "error");

      // 3) الإذن
      const perm = "Notification" in window ? Notification.permission : "unavailable";
      addLog(
        `3) إذن الإشعارات (Notification.permission) = ${perm} ${
          perm === "granted" ? "✔" : perm === "denied" ? "✘ — مرفوض" : ""
        }`,
        perm === "granted" ? "ok" : "error"
      );

      // 4) Service Worker
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        addLog(
          `4) Service Worker مسجّل ✔ | state=${reg.active?.state} | scope=${reg.scope}`,
          "ok"
        );
        addLog(
          `4) مُتحكّم بالصفحة (controller): ${
            navigator.serviceWorker.controller ? "نعم ✔" : "لا (+تحديث ليتحكم)"
          }`,
          navigator.serviceWorker.controller ? "ok" : "warn"
        );
      } else {
        addLog("4) Service Worker غير مدعوم ✘", "error");
      }

      // 5) الاشتراك الحالي (البحث عن قديم/منتهي بمفتاح مختلف)
      const reg2 = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      const storedVapid = localStorage.getItem("pushVapidKey") || "";
      let existing = null;
      if (reg2) existing = await reg2.pushManager.getSubscription();
      if (existing) {
        const host = (() => {
          try {
            return new URL(existing.endpoint).hostname;
          } catch {
            return existing.endpoint.slice(0, 40);
          }
        })();
        addLog(
          `5) يوجد اشتراك قديم فعلي ✘ (endpoint=${host}) — سيُعاد إنشاؤه بالمفتاح الحالي`,
          "warn"
        );
        addLog(
          `5) مفتاح VAPID المخزّن بالجهاز يتطابق مع الحالي: ${
            storedVapid === VAPID_PUBLIC_KEY ? "نعم ✔" : "لا ✘"
          }`,
          storedVapid === VAPID_PUBLIC_KEY ? "ok" : "error"
        );
      } else {
        addLog(
          `5) لا يوجد اشتراك قديم — سيُنشأ اشتراك جديد صالح ✔${
            storedVapid ? "" : " (بدون مفتاح مخزّن سابق)"
          }`,
          "ok"
        );
      }

      // 6) تم إنشاء الاشتراك على المتصفح؟
      let subscription = existing;
      if (!subscription && reg2) {
        try {
          subscription = await reg2.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          localStorage.setItem("pushVapidKey", VAPID_PUBLIC_KEY);
          addLog(
            "6) تم إنشاء PushSubscription جديد على المتصفح ✔ (key مطابق للموقع)",
            "ok"
          );
        } catch (e) {
          addLog(
            `6) فشل إنشاء الاشتراك: ${String(e?.message || e).slice(0, 120)} ✘`,
            "error"
          );
        }
      }

      // 7) الاشتراك محفوظ في قاعدة البيانات؟
      const dbDevices = await listPushDevices(currentUser?.id);
      const activeAndroid = (dbDevices || []).filter(
        (d) => d.is_active && /android/i.test(d.platform || "")
      );
      addLog(
        `7) جهازك الأندرويد النشط محفوظ في الخادم: ${
          activeAndroid.length ? `نعم (${activeAndroid.length}) ✔` : "لا ✘"
        }`,
        activeAndroid.length ? "ok" : "error"
      );
      activeAndroid.slice(0, 5).forEach((d) => {
        let host = "";
        try {
          host = new URL(d.endpoint).hostname;
        } catch {
          host = (d.endpoint || "").slice(0, 32);
        }
        addLog(
          `7)   • ${
            d.device_name || ""
          } — ${host} — نشط=${d.is_active ? "نعم" : "لا"}`,
          "muted"
        );
      });
      if (dbDevices && dbDevices.length === 0) {
        addLog(
          "7) لا توجد أي أجهزة مسجّلة لهذا الحساب — اضغط «تفعيل إشعارات الموبايل» أولًا",
          "warn"
        );
      }

      addLog("— اكتمل التشخيص. اضغط «إرسال إشعار + فحص الاستلام» —", "ok");
    } catch (err) {
      addLog(`خطأ في التشخيص: ${String(err?.message || err).slice(0, 140)}`, "error");
    } finally {
      setRunning(false);
    }
  };

  const sendAndCheck = async () => {
    if (!currentUser?.id) return;
    setChecking(true);
    addLog("— إرسال إشعار تشخيصي للحساب الحالي… —", "muted");
    try {
      // الاستعلام عن آخر سجل في الـ SW أولًا (قبل الإرسال).
      navigator.serviceWorker?.controller?.postMessage({
        type: "PUSH_DEBUG_QUERY",
      });

      const { data, error } = await supabase.functions.invoke(
        "push-notifications",
        {
          body: {
            action: "test",
            userId: currentUser.id,
            appUrl: getAppBase(),
            diagnostics: true,
          },
        }
      );
      if (error) {
        addLog(`استدعاء الخادم فشل: ${String(error).slice(0, 120)}`, "error");
        return;
      }
      addLog(
        `نتيجة الخادم: sent=${data?.sent} | web=${data?.web} | fcm=${data?.fcm}`,
        data?.sent > 0 ? "ok" : "warn"
      );
      setServerDetails(data?.details || []);
      (data?.details || []).forEach((d) => {
        const host = d.endpointHost === "fcm-native" ? "FCM (تطبيق أصلي)" : d.endpointHost;
        addLog(
          `  • ${d.platform || "?"} | ${host} | ${
            d.ok ? "وصل لـFCM/Apple ✔ (201)" : "فشل ✘"
          } ${d.status ? `[${d.status}]` : ""} ${d.error ? "— " + d.error : ""}`,
          d.ok ? "ok" : "error"
        );
      });

      // فحص ما إذا وصل push إلى الـ SW (عند فتح الصفحة).
      addLog("— انتظر ثوانٍ لالتقاط وصول push إلى الـ Service Worker —", "muted");
    } catch (e) {
      addLog(`خطأ: ${String(e?.message || e).slice(0, 120)}`, "error");
    } finally {
      setChecking(false);
    }
  };

  const querySwNow = async () => {
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "PUSH_DEBUG_QUERY",
        });
        await new Promise((r) => setTimeout(r, 800));
        addLog(
          `آخر سجل داخل الـ SW: ${
            swStored ? `${swStored.stage} @ ${new Date(swStored.t).toLocaleTimeString("ar")}` : "لا يوجد سجل بعد"
          }`,
          swStored ? "ok" : "muted"
        );
      } else {
        addLog("لا يوجد controller — أعد فتح الصفحة لتتحكم بها الـ SW.", "warn");
      }
    } catch (e) {
      addLog(`error: ${String(e?.message || e)}`, "error");
    }
  };

  const liveStatus = swLast
    ? `آخر حدث من SW: ${swLast.stage} @ ${new Date(swLast.t).toLocaleTimeString("ar")}${
        swLast.error ? " — " + swLast.error : ""
      }`
    : "لا يستقبل الحدث (لم يُلتقط أي push في هذا الجلسة المفتوحة)";

  return (
    <div style={{ border: "1px solid #f0b429", borderRadius: 10, padding: 12, marginBottom: 14, background: "#fff9e6" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#123B5D" }}>
        🔍 تشخيص أندرويد (تجريبي مؤقت)
      </div>
      <div style={{ fontSize: 13, color: "#5a6780", marginBottom: 10 }}>
        يفحص كل مرحلة من رحلة Web Push على هذا الجهاز فقط لتحديد نقطة الفشل.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button
          onClick={runDiagnosis}
          disabled={running}
          style={{ ...styles.button, opacity: running ? 0.6 : 1 }}
        >
          {running ? "…جارٍ" : "1) تشخيص المسار الكامل"}
        </button>
        <button
          onClick={sendAndCheck}
          disabled={checking}
          style={{ ...styles.button, opacity: checking ? 0.6 : 1 }}
        >
          {checking ? "…جارٍ" : "2) إرسال إشعار + فحص الاستلام"}
        </button>
        <button onClick={querySwNow} style={styles.button}>
          3) آخر سجل داخل SW
        </button>
      </div>

      {serverDetails && serverDetails.length === 0 && (
        <div style={{ ...styles.errorBox, marginBottom: 6 }}>
          ⚠️ لا توجد أي أجهزة فعّالة لهذا الحساب — فعِّل «إشعارات الموبايل» أولًا ثم أعد.
        </div>
      )}

      <div style={{ fontSize: 13, marginBottom: 8, color: "#123B5D" }}>
        الحالة المباشرة: {liveStatus}
      </div>

      <div
        style={{
          background: "#0d1421",
          color: "#d7e3f4",
          borderRadius: 8,
          padding: 10,
          fontSize: 12,
          fontFamily: "monospace",
          maxHeight: 260,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          direction: "ltr",
          textAlign: "left",
        }}
      >
        {logLines.length === 0
          ? "اضغط «تشخيص المسار الكامل» للبدء…"
          : logLines.map((l, i) => (
              <div key={i} style={{ color: l.kind === "error" ? "#ff8a80" : l.kind === "ok" ? "#a5d6a7" : l.kind === "warn" ? "#ffe082" : "#9fb4cc" }}>
                [{l.t}] {l.line}
              </div>
            ))}
      </div>

      <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.7, color: "#4a5568" }}>
        <b>قراءة النتيجة:</b>
        <br />• لو الخادم يقول <b>ok ✔ 201</b> لجهازك الأندرويد، <i>و</i> السجل فوق يظهر «shown»، والمبايل لسه ما بيجيبش — فالفشل إذًا في <b>نظام أندرويد نفسه</b> (كروم = الخلفية/البطارية)، مش في الكود.
        <br />• لو السجل يظهر «push-received» بدون «shown» — الـ SW بيستلم بس <b>showNotification()</b> بتفشل.
        <br />• لو مفيش أي «push-received» والمتصفح مفتوح — المشكلة في تسليم كروم للـ push.
        <br />• <b>لتحضير الخلفية:</b> بعد «shown»، أَغلق التطبيق كليًا (اسحبه من قائمة المهام) وأعد «إرسال إشعار + فحص». لو لم يصلك والمتصفح ع الهوا — أندرويد بيوقف كروم في الخلفية (اضبط: الإعدادات ← التطبيقات ← Chrome ← البطارية ← عدم تقييد).
      </div>
    </div>
  );
}
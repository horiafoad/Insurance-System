import React, { useEffect, useRef, useState } from "react";
import { styles } from "./styles";

// عند اكتشاف عامل (Service Worker) جديد مفعّل، نعيد تحميل الصفحة
// تلقائيًا لتطبيق النسخة الجديدة — فقط إذا طلب المستخدم التحديث.
let reloadPending = false;

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadPending) {
      reloadPending = false;
      window.location.reload();
    }
  });
}

export default function CheckForUpdatesButton({ compact = false }) {
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = (message, ms = 3500) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);

    // رد فوري أول ما يُضغط الزرار حتى لا يبدو بطيئًا.
    showToast("🔄 جاري سحب آخر إصدار من الخادم...", 1800);

    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showToast(
          "لا يوجد اتصال بالإنترنت. تعذر فحص التحديثات.",
          4000
        );
        return;
      }

      if (!("serviceWorker" in navigator)) {
        showToast(
          "المتصفح لا يدعم التحديث التلقائي. أعد فتح التطبيق لتحديثه.",
          5000
        );
        return;
      }

      let reg = await navigator.serviceWorker.getRegistration();

      if (!reg || !reg.active) {
        await navigator.serviceWorker.register("./sw.js", { scope: "./" });
        showToast(
          "تم تفعيل التحديثات لأول مرة. أعد فتح التطبيق الآن.",
          4500
        );
        return;
      }

      // نسجّل ملف السيرفس وركر بعنوان مختلف (cache-busting) حتى يضطر الخادم
      // لإرسال أحدث نسخة حتّى لو التعديل حدث قبل ثانية واحدة.
      const bustUrl = `./sw.js?__v=${Date.now()}`;
      reloadPending = true;
      const next = await navigator.serviceWorker.register(bustUrl, {
        scope: "./",
      });

      // العامل الجديد في sw.js يستدعي skipWaiting() وclientsClaim() تلقائيًا،
      // فيسيطر على الصفحة فور اكتمال تثبيته.
      const worker = next.waiting || next.installing;
      if (worker) {
        try {
          worker.postMessage({ type: "SKIP_WAITING" });
        } catch (e) {
          // تجاهل — التحديث يتم تلقائيًا بدونه.
        }
      }

      showToast(
        "✅ آخر إصدار جاهز — جاري إعادة تشغيل التطبيق...",
        1800
      );

      // أعد تحميل الصفحة فور استلام العامل الجديد السيطرة،
      // مع مهلة أمان لو لم يصل حدث التحكم.
      await Promise.race([
        new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true }
          )
        ),
        new Promise((resolve) => window.setTimeout(resolve, 2500)),
      ]);

      reloadPending = true;
      window.location.reload();
    } catch (error) {
      console.error("فشل فحص التحديثات:", error);
      showToast(
        "تعذر فحص التحديثات الآن. تأكد من الاتصال بالإنترنت.",
        4500
      );
    } finally {
      window.setTimeout(() => setChecking(false), 400);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleCheck}
        title="فحص وجود تحديث جديد وتحديث التطبيق تلقائيًا"
        aria-label="تحديث التطبيق"
        style={{
          ...styles.secondaryButton,
          padding: compact ? "10px 10px" : "10px 12px",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>
          {checking ? "⏳" : "🔄"}
        </span>
        {!compact && <span>تحديث التطبيق</span>}
      </button>

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#123B5D",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 8px 24px rgba(15,23,42,.25)",
            zIndex: 99999,
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
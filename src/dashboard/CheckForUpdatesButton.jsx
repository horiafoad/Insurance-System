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

      const reg = await navigator.serviceWorker.getRegistration();

      if (!reg) {
        await navigator.serviceWorker.register("./sw.js");
        showToast(
          "تم تفعيل التحديثات لأول مرة. أعد فتح التطبيق الآن.",
          4500
        );
        return;
      }

      // ننتظر ظهور عامل جديد أثناء فحص التحديث اليدوي.
      let found = false;
      const updateFound = new Promise((resolve) => {
        let timer = null;
        const onFound = () => {
          if (timer) window.clearTimeout(timer);
          reg.removeEventListener("updatefound", onFound);
          resolve(true);
        };
        timer = window.setTimeout(() => {
          reg.removeEventListener("updatefound", onFound);
          resolve(false);
        }, 15000);
        reg.addEventListener("updatefound", onFound);
      });

      await reg.update();
      found = await updateFound;

      if (found) {
        reloadPending = true;

        const nextWorker = reg.waiting || reg.installing;
        if (nextWorker && nextWorker.state !== "activated") {
          try {
            nextWorker.postMessage({ type: "SKIP_WAITING" });
          } catch (e) {
            // تجاهل — إعادة التحميل الاحتياطية أدناه تقوم بالتحديث.
          }
        }

        showToast(
          "تم العثور على نسخة جديدة... جاري تحديث التطبيق الآن.",
          2500
        );

        window.setTimeout(() => {
          reloadPending = true;
          window.location.reload();
        }, 1400);
        return;
      }

      showToast("✅ التطبيق على أحدث إصدار.");
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
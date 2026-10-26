import React, { useEffect, useState } from "react";
import { styles } from "./styles";

// التقاط حدث التثبيت على مستوى الوحدة: يُسجَّل فور تحميل الحزمة قبل تركيب أي
// مكوّن، لأن المتصفح قد يطلق beforeinstallprompt أثناء شاشة التحميل — وهو ما
// كان يُضيَع الحدث ويمنع ظهور زر «تثبيت التطبيق».
let sharedPrompt = null;
let sharedInstalled = false;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    sharedPrompt = e;
  });
  window.addEventListener("appinstalled", () => {
    sharedInstalled = true;
    sharedPrompt = null;
  });
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(sharedPrompt);
  const [installed, setInstalled] = useState(sharedInstalled);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      sharedPrompt = e;
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      sharedInstalled = true;
      setInstalled(true);
      setDeferredPrompt(null);
      sharedPrompt = null;
    };

    // لو الحدث وقع قبل تركيب المكوّن، القيمة مخزّنة بالفعل في المتغير العام.
    if (sharedPrompt) setDeferredPrompt(sharedPrompt);
    if (sharedInstalled) setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      sharedInstalled = true;
    }
    setDeferredPrompt(null);
    sharedPrompt = null;
  };

  if (installed || !deferredPrompt) return null;

  return (
    <button
      style={{
        ...styles.secondaryButton,
        padding: "10px 12px",
        whiteSpace: "nowrap",
      }}
      onClick={handleInstall}
      title="تثبيت التطبيق على هذا الجهاز"
    >
      📲 تثبيت التطبيق
    </button>
  );
}

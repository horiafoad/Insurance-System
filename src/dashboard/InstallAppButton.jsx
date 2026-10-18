import React, { useEffect, useState } from "react";
import { styles } from "./styles";

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (!("beforeinstallprompt" in window)) return;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

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
    }
    setDeferredPrompt(null);
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
import { useEffect, useState } from "react";
import {
  getDeviceStorageUsage,
  getStorageTarget,
  isElectronNative,
  setStorageTarget,
} from "../services/fileStorage";

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} بايت`;
  const units = ["كيلو", "ميجا", "جيجا"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

/**
 * زر مكان حفظ الملفات:
 *   💾 على هذا الجهاز  ←→  ☁️ السحابة
 * يُحفظ الاختيار لكل متصفح/جهاز على حدة.
 */
export default function StorageTargetToggle({ compact = false, showUsage = true }) {
  const [target, setTarget] = useState(() => getStorageTarget());
  const [usage, setUsage] = useState(null);
  const desktop = isElectronNative();

  useEffect(() => {
    let alive = true;
    if (target !== "device" || desktop) return undefined;
    getDeviceStorageUsage()
      .then((value) => {
        if (alive) setUsage(value);
      })
      .catch(() => {
        if (alive) setUsage(null);
      });
    return () => {
      alive = false;
    };
  }, [target, desktop]);

  if (desktop) {
    return (
      <span
        title="النسخة المكتبية تحفظ الملفات على القرص تلقائيًا"
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#166534",
          background: "#ECFDF5",
          border: "1px solid #A7F3D0",
          borderRadius: 999,
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        💾 على هذا الجهاز
      </span>
    );
  }

  const isDevice = target === "device";

  const toggle = () => {
    const next = isDevice ? "cloud" : "device";
    if (
      next === "cloud" &&
      !window.confirm(
        "سيتم رفع الملفات الجديدة إلى السحابة (Supabase / R2) بدل حفظها على جهازك.\n\nهل تريدين المتابعة؟"
      )
    ) {
      return;
    }
    setStorageTarget(next);
    setTarget(next);
  };

  const usageLabel =
    isDevice && showUsage && usage && usage.count != null && usage.count > 0
      ? ` (${usage.count} ملف · ${formatBytes(usage.bytes)})`
      : "";

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        isDevice
          ? "الملفات تُحفظ على هذا الجهاز فقط. اضغطي للتحويل إلى السحابة."
          : "الملفات تُرفع إلى السحابة. اضغطي للتحويل إلى هذا الجهاز."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: compact ? 11.5 : 12.5,
        fontWeight: 800,
        fontFamily: "inherit",
        color: isDevice ? "#166534" : "#1D4ED8",
        background: isDevice ? "#ECFDF5" : "#EFF6FF",
        border: `1px solid ${isDevice ? "#A7F3D0" : "#BFDBFE"}`,
        borderRadius: 999,
        padding: compact ? "7px 11px" : "8px 13px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {isDevice ? "💾" : "☁️"}
      {isDevice ? "الحفظ: هذا الجهاز" : "الحفظ: السحابة"}
      {usageLabel}
    </button>
  );
}

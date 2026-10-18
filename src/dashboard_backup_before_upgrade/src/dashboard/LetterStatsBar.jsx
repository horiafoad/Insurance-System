import React from "react";
import { computeLetterStats } from "../utils/letterHelpers";

// بطاقات إحصائية لملخص الحركة (بند 1). مبنية بنفس ستايل StatCard
// الموجود بالفعل في LettersTrackingPage.jsx (نفس الألوان والـ radius)
// عشان التصميم العام ميتغيرش.

const CARD_DEFS = [
  { key: "totalLetters", title: "إجمالي الخطابات", icon: "📨" },
  { key: "inProgress", title: "قيد التنفيذ", icon: "🔵" },
  { key: "needsRevision", title: "تحتاج تعديل", icon: "🟠" },
  { key: "completed", title: "منفذة", icon: "🟢" },
  { key: "late", title: "متأخرة", icon: "⏰" },
  { key: "totalQr", title: "إجمالي QR", icon: "🏷️" },
  { key: "availableQr", title: "QR المتاح", icon: "🟢" },
  { key: "usedQr", title: "QR المستخدم", icon: "🔵" },
  { key: "replacedQr", title: "QR المستبدل", icon: "🟡" },
];

export default function LetterStatsBar({ letters = [], qrCodes = [] }) {
  const stats = computeLetterStats(letters, qrCodes);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "12px",
        marginBottom: "20px",
      }}
    >
      {CARD_DEFS.map((def) => (
        <StatMiniCard
          key={def.key}
          title={def.title}
          icon={def.icon}
          value={stats[def.key]}
          highlight={def.key === "late" && stats.late > 0}
        />
      ))}
    </div>
  );
}

function StatMiniCard({ title, value, icon, highlight }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: "#FFFFFF",
        borderRadius: "17px",
        padding: "16px",
        border: highlight ? "1px solid #FCA5A5" : "1px solid #E2E8F0",
        boxShadow: "0 7px 20px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#64748B",
              marginBottom: "6px",
              fontWeight: "700",
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: "22px",
              fontWeight: "800",
              color: highlight ? "#DC2626" : "#0F172A",
            }}
          >
            {value ?? 0}
          </div>
        </div>

        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

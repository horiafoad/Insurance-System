import React from "react";

const STATUS_COLORS = {
  waiting: { bg: "#F8FAFC", border: "#E2E8F0", text: "#64748B", dot: "#94A3B8" },
  in_progress: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8", dot: "#2563EB" },
  needs_revision: { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C", dot: "#EA580C" },
  completed: { bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A", dot: "#16A34A" },
};

// timeline واضح لرحلة الخطاب، بيعرض كل محطة بترتيبها ومعاها:
// المستلم / الإدارة / التاريخ / الوقت / الإجراء / الملاحظات.
// لو الخطاب رجع لمحطة سابقة للتعديل، بتترسم كخطوة إضافية جديدة تحت
// (مش استبدال للخطوة القديمة) عشان مفيش حركة بتضيع أبدًا.
export default function LetterTimelineView({ movements = [] }) {
  if (!movements.length) {
    return (
      <div style={{ color: "#94A3B8", fontSize: 13, padding: 12 }}>
        لا توجد حركة مسجّلة لهذا الخطاب بعد.
      </div>
    );
  }

  const sorted = [...movements].sort(
    (a, b) => (a.step_order || 0) - (b.step_order || 0)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((movement, index) => {
        const colors =
          STATUS_COLORS[movement.status] || STATUS_COLORS.waiting;
        const isLast = index === sorted.length - 1;

        return (
          <div
            key={movement.id}
            style={{ display: "flex", gap: 12 }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 20,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: colors.dot,
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    background: "#E2E8F0",
                    minHeight: 40,
                  }}
                />
              )}
            </div>

            <div
              style={{
                flex: 1,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 14,
                padding: "12px 14px",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0F172A" }}>
                  {movement.department?.name || "إدارة غير محددة"}
                </div>

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: colors.text,
                    background: "#fff",
                    border: `1px solid ${colors.border}`,
                    borderRadius: 999,
                    padding: "3px 9px",
                  }}
                >
                  {statusLabel(movement.status)}
                </span>
              </div>

              <div
                style={{
                  marginTop: 8,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: 6,
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                <InfoRow label="المستلم" value={movement.received_by || "—"} />
                <InfoRow label="التاريخ" value={formatDatePart(movement.received_at)} />
                <InfoRow label="الوقت" value={formatTimePart(movement.received_at)} />
                <InfoRow label="الإجراء" value={movement.action || "—"} />
              </div>

              {movement.notes && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#334155",
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 10,
                    padding: "8px 10px",
                  }}
                >
                  📝 {movement.notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span style={{ color: "#94A3B8", fontWeight: 700 }}>{label}: </span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function statusLabel(status) {
  const labels = {
    waiting: "في الانتظار",
    in_progress: "جاري التنفيذ",
    needs_revision: "تم إرجاعه للتعديل",
    completed: "تم التنفيذ",
  };
  return labels[status] || status;
}

function formatDatePart(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatTimePart(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

import { useEffect, useMemo, useState } from "react";
import { styles } from "./styles";
import {
  formatEgyptDateTime,
  listWhatsAppNotifications,
  retryWhatsAppNotification,
  WHATSAPP_OFFICIAL_NUMBER_DISPLAY,
} from "../utils/whatsappNotifications";

const STATUS_LABELS = {
  pending: { text: "بالانتظار", color: "#92400E", bg: "#FEF3C7" },
  sending: { text: "قيد المحاولة", color: "#1D4ED8", bg: "#DBEAFE" },
  sent: { text: "ناجح", color: "#047857", bg: "#D1FAE5" },
  failed: { text: "فاشل", color: "#B91C1C", bg: "#FEE2E2" },
  skipped: { text: "متخطى", color: "#475569", bg: "#F1F5F9" },
};

function StatusBadge({ status }) {
  const meta = STATUS_LABELS[status] || STATUS_LABELS.pending;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 800,
        color: meta.color,
        background: meta.bg,
        whiteSpace: "nowrap",
      }}
    >
      {meta.text}
    </span>
  );
}

function errorLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text === "auto_send_disabled") return "الإرسال التلقائي غير مفعّل بعد";
  if (text === "missing_or_invalid_phone") return "لا يوجد رقم هاتف صالح";
  if (text === "not_configured") return "إعدادات Meta غير مكتملة";
  if (text === "sending_disabled") return "الإرسال غير مفعّل";
  if (text === "already_sent") return "تم إرسال هذا الإشعار مسبقًا";
  if (text === "already_sending") return "الإشعار قيد الإرسال بالفعل";
  if (text === "rate_limited") return "تم تجاوز الحد المسموح مؤقتًا";
  return text;
}

export default function WhatsAppNotificationsModal({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [retryingId, setRetryingId] = useState(null);
  const [notice, setNotice] = useState("");

  const load = async (status = filter) => {
    setLoading(true);
    setError("");
    const result = await listWhatsAppNotifications({
      status: status === "all" ? undefined : status,
      limit: 100,
    });
    if (!result.ok) {
      setError(result.error || "تعذر تحميل سجل الإشعارات.");
      setRows([]);
    } else {
      setRows(result.notifications || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setError("");
      const result = await listWhatsAppNotifications({
        status: filter === "all" ? undefined : filter,
        limit: 100,
      });
      if (!active) return;
      if (!result.ok) {
        setError(result.error || "تعذر تحميل سجل الإشعارات.");
        setRows([]);
      } else {
        setRows(result.notifications || []);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [filter]);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "sent") acc.sent += 1;
        if (row.status === "failed") acc.failed += 1;
        if (row.status === "skipped") acc.skipped += 1;
        return acc;
      },
      { total: 0, sent: 0, failed: 0, skipped: 0 }
    );
  }, [rows]);

  const handleRetry = async (row) => {
    setRetryingId(row.id);
    setNotice("");
    setError("");
    try {
      const result = await retryWhatsAppNotification(row.id);
      if (result?.ok && result.skipped) {
        setNotice("لم يتم الإرسال: " + errorLabel(result.reason));
      } else if (result?.ok && result.duplicate) {
        setNotice("هذا الإشعار مسجّل مسبقًا — لم يُرسل مرة أخرى.");
      } else if (result?.ok) {
        setNotice(
          result.dryRun
            ? "تمت محاكاة الإرسال (Dry Run) وسُجّلت النتيجة."
            : "تمت إعادة المحاولة بنجاح."
        );
      } else {
        setError(errorLabel(result?.error) || "تعذرت إعادة المحاولة.");
      }
      await load(filter);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.loginBox,
          width: "min(1150px, 97%)",
          maxHeight: "92vh",
          overflow: "auto",
          textAlign: "right",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 style={{ ...styles.loginTitle, marginBottom: 4 }}>
              📨 سجل إشعارات WhatsApp
            </h3>
            <p style={{ ...styles.loginDescription, margin: 0 }}>
              الرقم الرسمي المرسل:{" "}
              <strong dir="ltr">{WHATSAPP_OFFICIAL_NUMBER_DISPLAY}</strong> —
              إعادة المحاولة تُحدّث نفس السجل ولا تُنشئ إشعارًا مكررًا.
            </p>
          </div>
          <button style={styles.closeButton} onClick={onClose} title="إغلاق">
            ×
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            style={{ ...styles.claimSelect, minWidth: 170 }}
          >
            <option value="all">كل الحالات</option>
            <option value="sent">ناجح</option>
            <option value="failed">فاشل</option>
            <option value="skipped">متخطى</option>
            <option value="sending">قيد المحاولة</option>
            <option value="pending">بالانتظار</option>
          </select>

          <button style={styles.secondaryButton} onClick={() => load(filter)}>
            🔄 تحديث
          </button>

          <span style={{ color: "#475569", fontSize: 13 }}>
            المعروض: <strong>{counts.total}</strong> — ناجح:{" "}
            <strong style={{ color: "#047857" }}>{counts.sent}</strong> — فاشل:{" "}
            <strong style={{ color: "#B91C1C" }}>{counts.failed}</strong> —
            متخطى: <strong>{counts.skipped}</strong>
          </span>
        </div>

        {notice && (
          <div style={{ ...styles.successBox, marginBottom: 10 }}>{notice}</div>
        )}
        {error && (
          <div style={{ ...styles.errorBox, marginBottom: 10 }}>{error}</div>
        )}

        {loading ? (
          <div style={styles.infoBox}>جاري تحميل السجل...</div>
        ) : rows.length === 0 ? (
          <div style={styles.infoBox}>لا توجد إشعارات مسجلة بهذا الفلتر.</div>
        ) : (
          <div
            className="service-table-wrap mobile-hscroll"
            style={{ ...styles.claimTableWrapper, maxHeight: "58vh" }}
          >
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>رقم الطلب</th>
                  <th style={styles.th}>رقم المستلم</th>
                  <th style={styles.th}>الحالة المسببة</th>
                  <th style={styles.th}>تاريخ الإنشاء</th>
                  <th style={styles.th}>آخر محاولة</th>
                  <th style={styles.th}>تاريخ الإرسال</th>
                  <th style={styles.th}>حالة الإرسال</th>
                  <th style={styles.th}>WhatsApp Message ID</th>
                  <th style={styles.th}>رسالة الخطأ</th>
                  <th style={styles.th}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const canRetry = ["failed", "skipped", "pending", "sending"].includes(
                    row.status
                  );
                  return (
                    <tr key={row.id} style={styles.tr}>
                      <td style={styles.td}>
                        <strong>{row.request_number || row.request_id || "—"}</strong>
                        {row.event_type === "created" && (
                          <div style={{ fontSize: 11, color: "#64748B" }}>
                            إشعار استلام
                          </div>
                        )}
                      </td>
                      <td style={styles.td} dir="ltr">
                        {row.recipient_phone || "—"}
                      </td>
                      <td style={styles.td}>{row.trigger_status || "—"}</td>
                      <td style={styles.td}>
                        {formatEgyptDateTime(row.created_at) || "—"}
                      </td>
                      <td style={styles.td}>
                        {formatEgyptDateTime(row.last_attempt_at) || "—"}
                      </td>
                      <td style={styles.td}>
                        {formatEgyptDateTime(row.sent_at) || "—"}
                      </td>
                      <td style={styles.td}>
                        <StatusBadge status={row.status} />
                        {row.dry_run && (
                          <div style={{ fontSize: 11, color: "#92400E" }}>
                            Dry Run
                          </div>
                        )}
                      </td>
                      <td style={styles.td} dir="ltr">
                        <span style={{ fontSize: 11, wordBreak: "break-all" }}>
                          {row.provider_message_id || "—"}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ fontSize: 12, color: "#B91C1C" }}>
                          {errorLabel(row.error_message)}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {canRetry ? (
                          <button
                            style={{
                              ...styles.primaryButton,
                              padding: "5px 9px",
                              fontSize: 12,
                            }}
                            disabled={retryingId === row.id}
                            onClick={() => handleRetry(row)}
                          >
                            {retryingId === row.id
                              ? "جاري المحاولة..."
                              : "🔁 إعادة المحاولة"}
                          </button>
                        ) : (
                          <span style={{ color: "#94A3B8", fontSize: 12 }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

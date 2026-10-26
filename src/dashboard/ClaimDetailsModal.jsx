import { useEffect, useMemo, useState } from "react";
import { styles } from "./styles";
import { Modal } from "./ui";
import { getClaimSummary } from "../services/claimInstallmentsService";

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ar-EG");
  } catch {
    return "—";
  }
};

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
      "ar-EG"
    );
  } catch {
    return "—";
  }
};

const rowStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "5px 0",
  fontSize: 13,
};

export default function ClaimDetailsModal({
  claim,
  onClose,
  onOpenPdf,
  onAttachPdf,
  onDownloadPdf,
  onDeletePdf,
  onUndoInstallment,
  canManage = false,
}) {
  const [summary, setSummary] = useState(null);
  const [pdfClaim, setPdfClaim] = useState(claim);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await getClaimSummary(claim.id);
        if (!cancelled) {
          setSummary(result);
          if (result?.claim) setPdfClaim(result.claim);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setError(loadError.message || "تعذر تحميل تفاصيل المطالبة.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [claim.id, reloadKey]);

  const installments = summary?.installments || [];
  const byNumber = useMemo(() => {
    const map = new Map();
    installments.forEach((inst) => map.set(inst.installment_number, inst));
    return map;
  }, [installments]);

  const freshClaim = summary?.claim || claim;

  const runPdf = async (action) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result) setPdfClaim(result);
    } catch (pdfError) {
      console.error(pdfError);
      setError(pdfError.message || "تعذر تنفيذ العملية على الملف.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      pdfClaim.pdf_url &&
      !window.confirm("يوجد ملف PDF مرفق بالفعل. استبداله بالملف الجديد؟")
    ) {
      return;
    }
    runPdf(async () => {
      const updated = await onAttachPdf(pdfClaim, file);
      setNotice("تم إرفاق ملف PDF بالمطالبة.");
      return updated;
    });
  };

  return (
    <Modal title="تفاصيل المطالبة والأقساط" onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        {loading && <div style={styles.infoBox}>جاري تحميل التفاصيل...</div>}
        {error && <div style={styles.errorBox}>{error}</div>}
        {notice && <div style={styles.successBox}>{notice}</div>}

        <div
          style={{
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: "#0F2942", marginBottom: 6 }}>
            {freshClaim.claimant_name || freshClaim.sheet_name || "مطالبة"}
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>رقم المطالبة</span>
            <strong>{freshClaim.claim_number || "—"}</strong>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>التصنيف</span>
            <strong>{freshClaim.sheet_name || "—"}</strong>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>حالة المطالبة</span>
            <strong>{freshClaim.payment_status || freshClaim.status || "—"}</strong>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>الإجمالي</span>
            <strong>{money(freshClaim.total_amount ?? freshClaim.amount)}</strong>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>المسدد</span>
            <strong style={{ color: "#047857" }}>{money(freshClaim.paid_amount)}</strong>
          </div>
          <div style={rowStyle}>
            <span style={{ color: "#475569" }}>المتبقي</span>
            <strong style={{ color: "#B91C1C" }}>
              {money(freshClaim.remaining_amount)}
            </strong>
          </div>
          {freshClaim.started_at && (
            <div style={rowStyle}>
              <span style={{ color: "#475569" }}>تاريخ التحويل لجاري السداد</span>
              <strong>{dateTime(freshClaim.started_at)}</strong>
            </div>
          )}
          {freshClaim.settled_at && (
            <div style={rowStyle}>
              <span style={{ color: "#475569" }}>تاريخ خالي الطرف</span>
              <strong>{dateTime(freshClaim.settled_at)}</strong>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 900, color: "#0F2942", marginBottom: 8 }}>
            الأقساط الأربعة
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>القسط</th>
                  <th style={styles.th}>القيمة</th>
                  <th style={styles.th}>تاريخ الاستحقاق</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>تاريخ السداد</th>
                  <th style={styles.th}>الإيصال</th>
                  {canManage && onUndoInstallment && (
                    <th style={styles.th}>تصحيح</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4].map((number) => {
                  const inst = byNumber.get(number);
                  const paid = Boolean(inst?.paid);
                  return (
                    <tr key={number} style={styles.tr}>
                      <td style={styles.td}>{number}</td>
                      <td style={styles.td}>{inst ? money(inst.amount) : "—"}</td>
                      <td style={styles.td}>
                        {inst?.due_date
                          ? formatDate(inst.due_date)
                          : "—"}
                      </td>
                      <td style={styles.td}>
                        {paid ? "✅ مسدد" : inst ? "⏳ غير مسدد" : "— غير مسجل"}
                      </td>
                      <td style={styles.td}>
                        {paid ? dateTime(inst.paid_at) : "—"}
                      </td>
                      <td style={styles.td}>{inst?.receipt_number || "—"}</td>
                      {canManage && onUndoInstallment && (
                        <td style={styles.td}>
                          {paid ? (
                            <button
                              style={styles.deleteButton}
                              disabled={busy}
                              title="إلغاء تسجيل السداد ثم إعادة تسجيله بشكل صحيح"
                              onClick={async () => {
                                setError("");
                                setBusy(true);
                                try {
                                  const ok = await onUndoInstallment(claim, number);
                                  if (ok) {
                                    setNotice(
                                      `تم إلغاء سداد القسط ${number}. يمكنك تسجيله من جديد.`
                                    );
                                    setReloadKey((key) => key + 1);
                                  }
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              ↩️ تصحيح السداد
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
            تاريخ الاستحقاق يُحسب شهريًا من تاريخ تحويل المطالبة إلى «جاري
            السداد». لا يمكن سداد القسط نفسه مرتين — التصحيح يُلغي السداد ثم
            يعيد تسجيله ويُحفظ في الملاحظات.
          </div>
        </div>

        <div
          style={{
            background: pdfClaim.pdf_url ? "#F0FDF4" : "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: "#0F2942", marginBottom: 6 }}>
            مرفق PDF
          </div>
          {pdfClaim.pdf_url ? (
            <div style={{ fontSize: 12.5, color: "#475569", marginBottom: 8 }}>
              {pdfClaim.pdf_file_name || "ملف PDF"} ·{" "}
              {dateTime(pdfClaim.pdf_uploaded_at)}
              {pdfClaim.pdf_uploaded_by
                ? ` · بواسطة ${pdfClaim.pdf_uploaded_by}`
                : ""}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>
              لا يوجد ملف مرفق. الحد الأقصى 20 ميجابايت — يُحفظ في مساحة
              التخزين المتاحة.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pdfClaim.pdf_url && (
              <>
                <button
                  style={styles.primaryButton}
                  disabled={busy}
                  onClick={() => runPdf(() => onOpenPdf(pdfClaim).then(() => null))}
                >
                  👁️ فتح / معاينة
                </button>
                <button
                  style={styles.secondaryButton}
                  disabled={busy}
                  onClick={() => runPdf(() => onDownloadPdf(pdfClaim).then(() => null))}
                >
                  ⬇️ تنزيل
                </button>
              </>
            )}

            {canManage && (
              <label style={{ ...styles.excelButton, opacity: busy ? 0.6 : 1 }}>
                {pdfClaim.pdf_url ? "🔄 استبدال الملف" : "📎 اختيار ملف PDF"}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy}
                  onChange={handleFile}
                  style={{ display: "none" }}
                />
              </label>
            )}

            {canManage && pdfClaim.pdf_url && (
              <button
                style={styles.deleteButton}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("حذف ملف PDF المرفق بهذه المطالبة؟")) return;
                  runPdf(async () => {
                    const updated = await onDeletePdf(pdfClaim);
                    setNotice("تم حذف ملف PDF.");
                    return updated;
                  });
                }}
              >
                🗑️ حذف الملف
              </button>
            )}
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.secondaryButton} onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </Modal>
  );
}

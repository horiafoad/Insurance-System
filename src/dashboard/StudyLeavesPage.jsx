import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { styles } from "./styles";
import { ClaimStat, EmptyState, Field, Modal } from "./ui";
import {
  DATE_FIELDS,
  LEAVE_FIELDS,
  LEAVE_PAY_TYPES,
  SALARY_STATUSES,
  analyzeStudyLeavesWorkbook,
  createEmptyLeave,
  enrichLeave,
  exportStudyLeavesWorkbook,
  formatDisplayDate,
  getAlertLeaves,
  getLeaveStats,
  normalizeSalaryStatus,
} from "./studyLeaves";

const ALERT_STYLES = {
  stop_now: {
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
  },
  soon: {
    background: "#FFF7ED",
    border: "1px solid #FED7AA",
    color: "#9A3412",
  },
  watch: {
    background: "#FEFCE8",
    border: "1px solid #FEF08A",
    color: "#854D0E",
  },
  stopped: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#334155",
  },
};

const BADGE_STYLES = {
  stop_now: { background: "#FEE2E2", color: "#B91C1C" },
  soon: { background: "#FFEDD5", color: "#C2410C" },
  watch: { background: "#FEF3C7", color: "#A16207" },
  stopped: { background: "#E2E8F0", color: "#334155" },
  unset: { background: "#E0E7FF", color: "#3730A3" },
  ok: { background: "#D1FAE5", color: "#047857" },
};

const smallNote = { fontSize: 12, color: "#64748B", marginTop: 4 };

function reportLine(label, value) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
      <span style={{ color: "#475569" }}>{label}</span>
      <strong style={{ color: "#0F172A" }}>{value}</strong>
    </div>
  );
}

export default function StudyLeavesPage({
  leaves,
  loading,
  error,
  onImport,
  onSave,
  onDelete,
  onStopSalary,
  onOpenPdf,
  onAttachPdf,
  onDownloadPdf,
  onDeletePdf,
  onRestoreBackup,
  backupInfo,
  pdfBusyId,
}) {
  const [search, setSearch] = useState("");
  const [salaryFilter, setSalaryFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(createEmptyLeave());
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [ackIssues, setAckIssues] = useState(false);
  const [pdfLeave, setPdfLeave] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const replaceInputRef = useRef(null);

  const enriched = useMemo(
    () => leaves.map((leave) => enrichLeave(leave)),
    [leaves]
  );
  const stats = useMemo(() => getLeaveStats(leaves), [leaves]);
  const alerts = useMemo(() => getAlertLeaves(leaves), [leaves]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enriched.filter((leave) => {
      const salaryOk =
        salaryFilter === "all" ||
        normalizeSalaryStatus(leave.salaryStatus) === salaryFilter;
      const alertOk =
        alertFilter === "all" || leave.alertLevel === alertFilter;
      if (!salaryOk || !alertOk) return false;
      if (!query) return true;
      return [
        leave.name,
        leave.employeeCode,
        leave.jobTitle,
        leave.grade,
        leave.orderNumber,
        leave.leaveKind,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [enriched, search, salaryFilter, alertFilter]);

  const openCreate = () => {
    setFormError("");
    setForm({
      ...createEmptyLeave(),
      serial: String(leaves.length + 1),
      leavePayType: "يصرف بمرتب",
      leaveKind: "اجازة دراسية",
    });
    setFormOpen(true);
  };

  const openEdit = (leave) => {
    setFormError("");
    setForm({ ...createEmptyLeave(), ...leave });
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.name.trim()) {
      setFormError("من فضلك أدخلي اسم الموظف.");
      return;
    }
    setFormError("");
    try {
      await onSave(form);
      setFormOpen(false);
      setNotice("تم حفظ الإجازة الدراسية.");
    } catch (saveError) {
      console.error(saveError);
      setFormError(saveError.message || "تعذر حفظ الإجازة الدراسية.");
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPageError("");
    setNotice("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const analysis = analyzeStudyLeavesWorkbook(workbook);
      if (!analysis.leaves.length) {
        setPageError("تم فتح الملف لكن لم يتم العثور على بيانات إجازات (اسم/كود).");
        return;
      }
      setAckIssues(false);
      setPreview({ ...analysis, fileName: file.name });
    } catch (importError) {
      console.error(importError);
      setPageError("تعذر قراءة ملف Excel. تأكدي أنه نفس شيت الإجازات الدراسية.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    setPageError("");
    try {
      await onImport(preview.leaves, preview.report);
      setNotice(
        `تم استبدال بيانات الإجازات الدراسية بنجاح — ${preview.leaves.length} سجل.`
      );
      setPreview(null);
    } catch (importError) {
      console.error(importError);
      setPageError(importError.message || "تعذر استيراد البيانات.");
    } finally {
      setImporting(false);
    }
  };

  const runPdfAction = async (action, payload) => {
    setPdfError("");
    setPdfBusy(true);
    try {
      const result = await action(payload);
      if (result) setPdfLeave(result);
      else setPdfLeave(null);
    } catch (pdfActionError) {
      console.error(pdfActionError);
      setPdfError(pdfActionError.message || "تعذر تنفيذ العملية على ملف PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleAttachPdf = async (file) => {
    if (!file || !pdfLeave) return;
    if (
      pdfLeave.hasPdf &&
      !window.confirm("يوجد ملف PDF مرفق بالفعل. استبداله بالملف الجديد؟")
    ) {
      return;
    }
    await runPdfAction(async () => {
      const updated = await onAttachPdf(pdfLeave, file);
      setNotice("تم إرفاق ملف PDF بالإجازة.");
      return updated;
    });
  };

  const handleDeletePdf = async () => {
    if (!pdfLeave) return;
    if (!window.confirm("هل تريدين حذف ملف PDF المرفق بهذه الإجازة؟")) return;
    await runPdfAction(async () => {
      const updated = await onDeletePdf(pdfLeave);
      setNotice("تم حذف ملف PDF.");
      return updated;
    });
  };

  const duplicateWarning =
    preview &&
    (preview.report.hasDuplicates ||
      preview.report.invalidDates.length > 0 ||
      preview.report.skippedRows.length > 0);
  const canConfirm = preview && (!duplicateWarning || ackIssues) && !importing;

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.claimsHeader} className="claims-header">
          <div>
            <h2 style={styles.cardTitle}>🎓 الإجازات الدراسية</h2>
            <p style={styles.cardSub}>
              البيانات محفوظة في قاعدة البيانات (جدول study_leaves) — ولكل إجازة
              زر PDF مستقل لرفع مستند الإجازة الخاص بالدكتور.
            </p>
          </div>
          <div style={styles.claimHeaderButtons}>
            <button style={styles.manualClaimButton} onClick={openCreate}>
              ＋ إضافة إجازة
            </button>
            <label style={styles.excelButton}>
              📥 استيراد Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFile}
                style={{ display: "none" }}
              />
            </label>
            <button
              style={styles.secondaryButton}
              onClick={() => exportStudyLeavesWorkbook(leaves)}
            >
              📤 تصدير Excel
            </button>
            {backupInfo?.count > 0 && (
              <>
                <button
                  style={styles.secondaryButton}
                  onClick={onRestoreBackup}
                  title={`نسخة محفوظة ${new Date(
                    backupInfo.savedAt
                  ).toLocaleString("ar-EG")} — ${backupInfo.count} سجل`}
                >
                  ♻️ استعادة النسخة الاحتياطية ({backupInfo.count})
                </button>
                <button
                  style={styles.secondaryButton}
                  onClick={onDownloadBackup}
                  title="تنزيل النسخة الاحتياطية كملف JSON"
                >
                  ⬇️ تنزيل النسخة الاحتياطية
                </button>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div style={styles.infoBox}>جاري تحميل بيانات الإجازات الدراسية...</div>
        )}
        {error && <div style={styles.errorBox}>{error}</div>}
        {pageError && <div style={styles.errorBox}>{pageError}</div>}
        {notice && <div style={styles.successBox}>{notice}</div>}

        <div style={styles.claimStats}>
          <ClaimStat title="إجمالي الموظفين" value={stats.total} icon="👥" />
          <ClaimStat title="يصرف المرتب" value={stats.paying} icon="💰" />
          <ClaimStat title="يوقف/بدون مرتب" value={stats.stopped} icon="⛔" />
          <ClaimStat title="حالة غير محددة" value={stats.unset} icon="❔" />
          <ClaimStat title="يجب الإيقاف الآن" value={stats.stopNow} icon="🚨" />
          <ClaimStat title="باقي أقل من 30 يوم" value={stats.soon} icon="⏰" />
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>تنبيهات المرتب</h2>
              <p style={styles.cardSub}>
                إنذار عندما ينتهي المرتب أو يقترب موعد الإيقاف حتى تتمكني من وقف
                المرتب في وقته
              </p>
            </div>
          </div>
          <div style={styles.alertList}>
            {alerts.map((leave) => (
              <div
                key={leave.id}
                style={{
                  ...styles.alertItem,
                  ...ALERT_STYLES[leave.alertLevel],
                }}
              >
                <div>
                  <strong>{leave.alertTitle}</strong>
                  <div style={{ marginTop: 4 }}>
                    {leave.name} — كود {leave.employeeCode || "غير مسجل"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    {leave.alertMessage} | نهاية الإجازة:{" "}
                    {formatDisplayDate(leave.endDate)} | انتهاء 5 سنوات:{" "}
                    {formatDisplayDate(leave.fiveYearEnd)}
                  </div>
                </div>
                <div style={styles.alertActions} className="alert-actions">
                  <button
                    style={styles.viewButton}
                    onClick={() => openEdit(leave)}
                  >
                    تعديل
                  </button>
                  {leave.alertLevel !== "stopped" && (
                    <button
                      style={styles.deleteButton}
                      onClick={() => onStopSalary(leave.id)}
                    >
                      إيقاف المرتب
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.filterRow} className="service-filter-bar">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔎 بحث بالاسم أو الكود أو رقم الأمر"
            style={styles.claimSearch}
          />
          <select
            value={salaryFilter}
            onChange={(e) => setSalaryFilter(e.target.value)}
            style={styles.claimSelect}
          >
            <option value="all">كل حالات المرتب</option>
            {SALARY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
            <option value="">غير محددة</option>
          </select>
          <select
            value={alertFilter}
            onChange={(e) => setAlertFilter(e.target.value)}
            style={styles.claimSelect}
          >
            <option value="all">كل التنبيهات</option>
            <option value="stop_now">يجب الإيقاف الآن</option>
            <option value="soon">قرب يقف (30 يوم)</option>
            <option value="watch">تنبيه (90 يوم)</option>
            <option value="stopped">المرتب موقوف</option>
            <option value="unset">حالة غير محددة</option>
          </select>
        </div>

        <div style={styles.resultText}>
          عدد النتائج: <strong>{filtered.length}</strong> من{" "}
          <strong>{leaves.length}</strong>
        </div>

        {filtered.length === 0 ? (
          <EmptyState text="لا توجد إجازات دراسية مطابقة للبحث." />
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>التنبيه</th>
                  <th style={styles.th}>كود الموظف</th>
                  <th style={styles.th}>الاسم</th>
                  <th style={styles.th}>الوظيفة</th>
                  <th style={styles.th}>البيان</th>
                  <th style={styles.th}>بداية الإجازة</th>
                  <th style={styles.th}>نهاية الإجازة</th>
                  <th style={styles.th}>انتهاء 5 سنوات</th>
                  <th style={styles.th}>الأيام المتبقية</th>
                  <th style={styles.th}>حالة المرتب</th>
                  <th style={styles.th}>PDF</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((leave) => (
                  <tr key={leave.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          ...(BADGE_STYLES[leave.alertLevel] || BADGE_STYLES.ok),
                        }}
                      >
                        {leave.alertTitle}
                      </span>
                    </td>
                    <td style={styles.td}>{leave.employeeCode || "—"}</td>
                    <td style={styles.td}>{leave.name}</td>
                    <td style={styles.td}>{leave.jobTitle || leave.grade || "—"}</td>
                    <td style={styles.td}>{leave.leaveKind || "—"}</td>
                    <td style={styles.td}>{formatDisplayDate(leave.startDate)}</td>
                    <td style={styles.td}>{formatDisplayDate(leave.endDate)}</td>
                    <td style={styles.td}>
                      {formatDisplayDate(leave.fiveYearEnd)}
                    </td>
                    <td style={styles.td}>{leave.remainingDays || "—"}</td>
                    <td style={styles.td}>{leave.salaryStatus || "—"}</td>
                    <td style={styles.td}>
                      <button
                        style={{
                          ...styles.viewButton,
                          background: leave.hasPdf ? "#DCFCE7" : undefined,
                          color: leave.hasPdf ? "#166534" : undefined,
                        }}
                        onClick={() => {
                          setPdfError("");
                          setPdfLeave(leave);
                        }}
                        disabled={pdfBusyId === leave.id}
                      >
                        {pdfBusyId === leave.id
                          ? "…"
                          : leave.hasPdf
                            ? "📄 PDF"
                            : "📎 إرفاق"}
                      </button>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.viewButton}
                        onClick={() => openEdit(leave)}
                      >
                        تعديل
                      </button>
                      {leave.alertLevel !== "stopped" &&
                        leave.alertLevel !== "ok" &&
                        leave.alertLevel !== "unset" && (
                          <button
                            style={styles.deleteButton}
                            onClick={() => onStopSalary(leave.id)}
                          >
                            إيقاف المرتب
                          </button>
                        )}
                      <button
                        style={styles.deleteButton}
                        onClick={() => onDelete(leave.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------- معاينة الاستيراد ------------------------- */}
      {preview && (
        <Modal
          title={`معاينة استيراد: ${preview.fileName}`}
          onClose={() => (importing ? null : setPreview(null))}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={styles.infoBox}>
              الشيت: <strong>{preview.sheetName}</strong> — السجلات الصالحة:{" "}
              <strong>{preview.report.importedRows}</strong> من أصل{" "}
              <strong>{preview.report.totalRows}</strong> صفًا.
              <div style={smallNote}>
                سيتم <strong>استبدال</strong> بيانات الإجازات الحالية بعد أخذ نسخة
                احتياطية كاملة. لا تُحذف أي بيانات مطالبات أو مرتبات.
              </div>
            </div>

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
              {reportLine("سجلات سيتم استيرادها", preview.report.importedRows)}
              {reportLine("صفوف متجاهلة (بلا اسم/كود)", preview.report.skippedRows.length)}
              {reportLine("أعمدة غير مدعومة", preview.report.unknownColumns.length)}
              {reportLine("أعمدة أساسية ناقصة", preview.report.missingColumns.length)}
              {reportLine("تكرار أكواد", preview.report.duplicates.codes.length)}
              {reportLine("تكرار أسماء", preview.report.duplicates.names.length)}
              {reportLine("تواريخ غير صالحة", preview.report.invalidDates.length)}
            </div>

            {preview.report.missingColumns.length > 0 && (
              <div style={styles.errorBox}>
                أعمدة أساسية غير موجودة في الملف:{" "}
                <strong>{preview.report.missingColumns.join(" · ")}</strong>
              </div>
            )}

            {preview.report.unknownColumns.length > 0 && (
              <div style={styles.infoBox}>
                أعمدة غير مدعومة (ستُحفظ كما هي داخل data لكن لن تظهر كأعمدة):{" "}
                {preview.report.unknownColumns.join(" · ")}
              </div>
            )}

            {preview.report.skippedRows.length > 0 && (
              <div style={styles.infoBox}>
                صفوف متجاهلة:{" "}
                {preview.report.skippedRows
                  .slice(0, 12)
                  .map((row) => `م ${row.serial}`)
                  .join(" · ")}
                {preview.report.skippedRows.length > 12 ? " …" : ""}
              </div>
            )}

            {Object.values(preview.report.missingValues).some((n) => n > 0) && (
              <div style={styles.infoBox}>
                قيم ناقصة:{" "}
                {Object.entries(preview.report.missingValues)
                  .filter(([, count]) => count > 0)
                  .map(([key, count]) => {
                    const label =
                      LEAVE_FIELDS.find((field) => field.key === key)?.label || key;
                    return `${label}: ${count}`;
                  })
                  .join(" · ")}
              </div>
            )}

            {preview.report.invalidDates.length > 0 && (
              <div style={styles.errorBox}>
                تواريخ غير صالحة تم تجاهلها:{" "}
                {preview.report.invalidDates
                  .slice(0, 8)
                  .map((item) => `${item.name || "بدون اسم"} (${item.value})`)
                  .join(" · ")}
                {preview.report.invalidDates.length > 8 ? " …" : ""}
              </div>
            )}

            {preview.report.hasDuplicates && (
              <div style={styles.errorBox}>
                يوجد تكرار داخل الملف — راجعيه قبل الاستبدال.
                {preview.report.duplicates.codes.length > 0 && (
                  <div style={smallNote}>
                    أكواد مكررة:{" "}
                    {preview.report.duplicates.codes
                      .slice(0, 8)
                      .map((item) => `${item.code} (${item.count})`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            )}

            <div style={{ ...styles.infoBox, fontSize: 12 }}>
              حالة المرتب في الملف:{" "}
              {Object.entries(preview.report.salaryStatusCounts)
                .map(([key, count]) => `${key}: ${count}`)
                .join(" · ")}
            </div>

            {duplicateWarning && (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#7C2D12" }}>
                <input
                  type="checkbox"
                  checked={ackIssues}
                  onChange={(e) => setAckIssues(e.target.checked)}
                />
                راجعت الملاحظات وأوافق على الاستبدال رغمها.
              </label>
            )}

            <div style={styles.modalActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setPreview(null)}
                disabled={importing}
              >
                إلغاء
              </button>
              <button
                style={{
                  ...styles.primaryButton,
                  opacity: canConfirm ? 1 : 0.55,
                  cursor: canConfirm ? "pointer" : "not-allowed",
                }}
                onClick={confirmImport}
                disabled={!canConfirm}
              >
                {importing ? "⏳ جاري الاستبدال..." : "✅ استبدال البيانات الآن"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --------------------------- ملف PDF --------------------------- */}
      {pdfLeave && (
        <Modal
          title={`مرفق PDF — ${pdfLeave.name || "إجازة"}`}
          onClose={() => (pdfBusy ? null : setPdfLeave(null))}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={styles.infoBox}>
              كود الموظف: <strong>{pdfLeave.employeeCode || "—"}</strong>
              <div style={smallNote}>
                الملف يُحفظ في مساحة التخزين المتاحة (محليًا داخل تطبيق
                الديسكتوب أو عبر مزوّد التخزين عند العمل في المتصفح).
              </div>
            </div>

            {pdfError && <div style={styles.errorBox}>{pdfError}</div>}

            {pdfLeave.hasPdf ? (
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12 }}>
                {reportLine("اسم الملف", pdfLeave.pdfFileName || "—")}
                {reportLine(
                  "تاريخ الإرفاق",
                  pdfLeave.pdfUploadedAt
                    ? new Date(pdfLeave.pdfUploadedAt).toLocaleString("ar-EG")
                    : "—"
                )}
                {reportLine("أُرفق بواسطة", pdfLeave.pdfUploadedBy || "—")}
              </div>
            ) : (
              <div style={styles.infoBox}>
                لا يوجد ملف PDF مرفق بهذه الإجازة بعد. اختر ملفًا بصيغة PDF
                (بحد أقصى 20 ميجابايت).
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pdfLeave.hasPdf && (
                <>
                  <button
                    style={styles.primaryButton}
                    disabled={pdfBusy}
                    onClick={() =>
                      runPdfAction(async () => {
                        await onOpenPdf(pdfLeave);
                        return pdfLeave;
                      })
                    }
                  >
                    👁️ فتح / معاينة
                  </button>
                  <button
                    style={styles.secondaryButton}
                    disabled={pdfBusy}
                    onClick={() =>
                      runPdfAction(async () => {
                        await onDownloadPdf(pdfLeave);
                        return pdfLeave;
                      })
                    }
                  >
                    ⬇️ تنزيل
                  </button>
                </>
              )}

              <label
                style={{
                  ...styles.excelButton,
                  opacity: pdfBusy ? 0.6 : 1,
                  cursor: pdfBusy ? "not-allowed" : "pointer",
                }}
              >
                {pdfLeave.hasPdf ? "🔄 استبدال الملف" : "📎 اختيار ملف PDF"}
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={pdfBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    handleAttachPdf(file);
                  }}
                  style={{ display: "none" }}
                />
              </label>

              {pdfLeave.hasPdf && (
                <button
                  style={styles.deleteButton}
                  disabled={pdfBusy}
                  onClick={handleDeletePdf}
                >
                  🗑️ حذف الملف
                </button>
              )}
            </div>

            <div style={styles.modalActions}>
              <button
                style={styles.secondaryButton}
                onClick={() => setPdfLeave(null)}
                disabled={pdfBusy}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ------------------------- إضافة/تعديل ------------------------- */}
      {formOpen && (
        <Modal
          title={form.id ? "تعديل إجازة دراسية" : "إضافة إجازة دراسية"}
          onClose={() => setFormOpen(false)}
        >
          <div style={styles.formGrid} className="form-grid-mobile">
            {LEAVE_FIELDS.filter((field) => field.key !== "remainingDays").map(
              (field) => {
                const dateField = DATE_FIELDS.includes(field.key);
                const selectOptions =
                  field.key === "salaryStatus"
                    ? SALARY_STATUSES
                    : field.key === "leavePayType"
                      ? LEAVE_PAY_TYPES
                      : null;

                return (
                  <Field
                    key={field.key}
                    label={field.label}
                    full={
                      field.key === "notes" ||
                      field.key === "name" ||
                      field.key === "jobTitle" ||
                      field.key === "orderNote"
                    }
                  >
                    {selectOptions ? (
                      <select
                        value={form[field.key] || ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        style={styles.input}
                      >
                        <option value="">— غير محددة —</option>
                        {selectOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={dateField ? "date" : "text"}
                        value={form[field.key] || ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        style={styles.input}
                        dir={field.key === "employeeCode" || field.key === "orderNumber" ? "ltr" : undefined}
                      />
                    )}
                  </Field>
                );
              }
            )}
          </div>
          {formError && (
            <div style={{ ...styles.errorBox, marginTop: 10 }}>{formError}</div>
          )}
          <div style={styles.modalActions}>
            <button
              style={styles.secondaryButton}
              onClick={() => setFormOpen(false)}
            >
              إلغاء
            </button>
            <button style={styles.primaryButton} onClick={saveForm}>
              💾 حفظ في قاعدة البيانات
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

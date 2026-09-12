import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { styles } from "./styles";
import { ClaimStat, EmptyState, Field, Modal } from "./ui";
import {
  LEAVE_FIELDS,
  LEAVE_PAY_TYPES,
  SALARY_STATUSES,
  createEmptyLeave,
  enrichLeave,
  exportStudyLeavesWorkbook,
  formatDisplayDate,
  getAlertLeaves,
  getLeaveStats,
  parseStudyLeavesWorkbook,
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
  ok: { background: "#D1FAE5", color: "#047857" },
};

export default function StudyLeavesPage({
  leaves,
  loading,
  error,
  onImport,
  onSave,
  onDelete,
  onStopSalary,
}) {
  const [search, setSearch] = useState("");
  const [salaryFilter, setSalaryFilter] = useState("all");
  const [alertFilter, setAlertFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(createEmptyLeave());

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
        salaryFilter === "all" || leave.salaryStatus === salaryFilter;
      const alertOk =
        alertFilter === "all" || leave.alertLevel === alertFilter;
      if (!salaryOk || !alertOk) return false;
      if (!query) return true;
      return [
        leave.name,
        leave.employeeCode,
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
    setForm({
      ...createEmptyLeave(),
      serial: String(leaves.length + 1),
    });
    setFormOpen(true);
  };

  const openEdit = (leave) => {
    setForm({ ...createEmptyLeave(), ...leave });
    setFormOpen(true);
  };

  const saveForm = () => {
    if (!form.name.trim()) {
      alert("من فضلك أدخلي اسم الموظف.");
      return;
    }
    onSave(form);
    setFormOpen(false);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const imported = parseStudyLeavesWorkbook(workbook);
      if (!imported.length) {
        alert("تم فتح الملف لكن لم يتم العثور على بيانات الإجازات الدراسية.");
        return;
      }
      onImport(imported);
    } catch (importError) {
      console.error(importError);
      alert("تعذر قراءة ملف Excel. تأكدي أنه نفس شيت الإجازات الدراسية.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.claimsHeader}>
          <div>
            <h2 style={styles.cardTitle}>🎓 الإجازات الدراسية</h2>
            <p style={styles.cardSub}>
              شيت الإجازات الدراسية بمرتب مربوط بالبرنامج — التعديل من هنا ينعكس
              على التنبيهات وتصدير Excel
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
                onChange={handleImport}
                style={{ display: "none" }}
              />
            </label>
            <button
              style={styles.secondaryButton}
              onClick={() => exportStudyLeavesWorkbook(leaves)}
            >
              📤 تصدير Excel
            </button>
          </div>
        </div>

        {loading && (
          <div style={styles.infoBox}>جاري حفظ بيانات الإجازات الدراسية...</div>
        )}
        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.claimStats}>
          <ClaimStat title="إجمالي الموظفين" value={stats.total} icon="👥" />
          <ClaimStat title="يصرف المرتب" value={stats.paying} icon="💰" />
          <ClaimStat title="يوقف المرتب" value={stats.stopped} icon="⛔" />
          <ClaimStat title="يجب الإيقاف الآن" value={stats.stopNow} icon="🚨" />
          <ClaimStat title="باقي أقل من 30 يوم" value={stats.soon} icon="⏰" />
          <ClaimStat title="باقي 31 إلى 90 يوم" value={stats.watch} icon="📅" />
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
                <div style={styles.alertActions}>
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
        <div style={styles.filterRow}>
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
                  <th style={styles.th}>الدرجة</th>
                  <th style={styles.th}>البيان</th>
                  <th style={styles.th}>بداية الإجازة</th>
                  <th style={styles.th}>نهاية الإجازة</th>
                  <th style={styles.th}>انتهاء 5 سنوات</th>
                  <th style={styles.th}>الأيام المتبقية</th>
                  <th style={styles.th}>حالة المرتب</th>
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
                    <td style={styles.td}>{leave.grade || "—"}</td>
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
                        style={styles.viewButton}
                        onClick={() => openEdit(leave)}
                      >
                        تعديل
                      </button>
                      {leave.alertLevel !== "stopped" &&
                        leave.alertLevel !== "ok" && (
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

      {formOpen && (
        <Modal
          title={form.id ? "تعديل إجازة دراسية" : "إضافة إجازة دراسية"}
          onClose={() => setFormOpen(false)}
        >
          <div style={styles.formGrid}>
            {LEAVE_FIELDS.filter((field) => field.key !== "remainingDays").map(
              (field) => {
                const dateField = [
                  "orderDate",
                  "startDate",
                  "endDate",
                  "fiveYearEnd",
                ].includes(field.key);
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
                    full={field.key === "notes" || field.key === "name"}
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
                      />
                    )}
                  </Field>
                );
              }
            )}
          </div>
          <div style={styles.modalActions}>
            <button
              style={styles.secondaryButton}
              onClick={() => setFormOpen(false)}
            >
              إلغاء
            </button>
            <button style={styles.primaryButton} onClick={saveForm}>
              💾 حفظ في البرنامج
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

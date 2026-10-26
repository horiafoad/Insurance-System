import React, { useState, useEffect, useMemo } from "react";
import { styles } from "./styles";
import {
  fetchNotifications,
  fetchNotificationStats,
  createNotification,
  fetchFacultyFromArchive,
  matchExcelFacultyWithArchive,
  WORKFLOW_STATUS,
  NOTIFICATION_TYPES,
  SALARY_STOP_REASONS,
  DEDUCTION_TYPES,
  ACADEMIC_GRADES,
  getNextAcademicGrade,
} from "../../services/facultyNotificationsService";
import { supabase } from "../../supabaseClient";
import * as XLSX from "xlsx";
import { hasPermission } from "../../utils/permissions";

export default function FacultyNotificationsPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState("create"); // "create" | "payroll"
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({ total: 0, new: 0, pending_input: 0, completed_input: 0, pending_review: 0, completed_review: 0, returned: 0 });
  
  // Selection state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Excel & Matching state
  const [excelLoading, setExcelLoading] = useState(false);
  const [matchedFacultyList, setMatchedFacultyList] = useState([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  // Form state
  const [form, setForm] = useState({
    faculty_id: "",
    type: NOTIFICATION_TYPES.SALARY_PAYMENT,
    details: "",
    notes: "",
    effective_date: new Date().toISOString().split("T")[0],
    // Dynamic fields
    stop_reason: "",
    payment_method_old: "",
    payment_method_new: "",
    deduction_type: "",
    deduction_amount: "",
    promotion_grade: "",
  });

  // Fetch data when month/year changes (for payroll tab)
  useEffect(() => {
    if (activeTab === "payroll") {
      loadPayrollData();
    }
  }, [activeTab, selectedMonth, selectedYear]);

  const loadPayrollData = async () => {
    setLoading(true);
    try {
      const [notifs, statsData] = await Promise.all([
        fetchNotifications(selectedMonth, selectedYear),
        fetchNotificationStats(selectedMonth, selectedYear)
      ]);
      setNotifications(notifs);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load payroll data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // 1. Fetch current archive to match against
        const archiveData = await fetchFacultyFromArchive();

        // 2. Perform matching
        const { matchedList, unmatchedList } = matchExcelFacultyWithArchive(data, archiveData);

        setMatchedFacultyList(matchedList);
        setUnmatchedCount(unmatchedList.length);
      } catch (err) {
        console.error("Excel processing error", err);
        alert("خطأ في معالجة ملف Excel. يرجى التأكد من تنسيق الملف.");
      } finally {
        setExcelLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCreateNotification = async (e) => {
    e.preventDefault();
    if (!form.faculty_id) return alert("يرجى اختيار عضو هيئة التدريس");

    setLoading(true);
    try {
      const payload = {
        ...form,
        payroll_month_date: new Date(selectedYear, selectedMonth - 1, 1).toISOString(),
        created_by: currentUser.id,
        status: WORKFLOW_STATUS.NEW,
      };

      const { error } = await supabase.from("faculty_notifications").insert([payload]);
      if (error) throw error;

      alert("تم حفظ التبليغ بنجاح");
      setForm({
        faculty_id: "",
        type: NOTIFICATION_TYPES.SALARY_PAYMENT,
        details: "",
        notes: "",
        effective_date: new Date().toISOString().split("T")[0],
        stop_reason: "",
        payment_method_old: "",
        payment_method_new: "",
        deduction_type: "",
        deduction_amount: "",
        promotion_grade: "",
      });
      
      if (activeTab === "payroll") loadPayrollData();
    } catch (err) {
      alert("خطأ أثناء الحفظ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderCreateTab = () => (
    <div style={styles.container}>
      {/* Month/Year Selector Section */}
      <div style={styles.headerCard}>
        <h2 style={styles.title}>إنشاء تبليغات جديدة</h2>
        <div style={styles.selectorRow}>
          <div style={styles.inputGroup}>
            <label>شهر البيرول</label>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(2026, i, 1).toLocaleString("ar-EG", { month: "long" })}</option>
              ))}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label>السنة</label>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>
          <div style={styles.statusBadge}>
            الشهر المختار: {new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("ar-EG", { month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      <div style={styles.mainGrid}>
        {/* Left: Excel Upload & Faculty List */}
        <div style={styles.card}>
          <h3 style={styles.subtitle}>1. استيراد الأسماء من Excel</h3>
          <div style={styles.uploadArea}>
            <input type="file" accept=".xlsx, .xls" onChange={handleExcelUpload} id="excel-upload" hidden />
            <label htmlFor="excel-upload" style={styles.uploadButton}>
              {excelLoading ? "جاري المعالجة..." : "📁 ارفع ملف Excel"}
            </label>
          </div>

          {matchedFacultyList.length > 0 && (
            <div style={styles.listContainer}>
              <p style={styles.infoText}>تم العثور على {matchedFacultyList.length} عضو مطابق. اختر العضو لبدء التبليغ:</p>
              {unmatchedCount > 0 && (
                <div style={styles.errorBadge}>⚠️ لم يتم العثور على مطابقة لـ {unmatchedCount} اسم من الملف.</div>
              )}
              <div style={styles.facultyList}>
                {matchedFacultyList.map((member) => (
                  <div 
                    key={member.memberId} 
                    onClick={() => setForm({ ...form, faculty_id: member.memberId })}
style={{
                      ...styles.listItem,
                      ...(form.faculty_id === member.memberId ? styles.listItemActive : {})
                    }}
                  >
                    <div style={styles.itemIcon}>👨‍🏫</div>
                    <div>
                      <div style={styles.itemName}>{member.fullName}</div>
                      <div style={styles.itemSub}>{member.academicGrade} - {member.department}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Form */}
        <div style={styles.card}>
          <h3 style={styles.subtitle}>2. تفاصيل التبليغ</h3>
          <form onSubmit={handleCreateNotification} style={styles.form}>
            <div style={styles.inputGroup}>
              <label>العضو المختار</label>
              <input 
                type="text" 
                readOnly 
                placeholder="يرجى اختيار عضو من القائمة" 
                value={notifications.find(n => n.id === form.faculty_id)?.faculty_members?.full_name || 
                      matchedFacultyList.find(m => m.memberId === form.faculty_id)?.fullName || ""}
                style={{ ...styles.input, backgroundColor: "#f1f5f9" }}
              />
            </div>

            <div style={styles.inputGroup}>
              <label>نوع التبليغ</label>
              <select 
                value={form.type} 
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={styles.input}
              >
                {Object.entries(NOTIFICATION_TYPES).map(([key, label]) => (
                  <option key={key} value={label}>{label}</option>
                ))}
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label>تاريخ السريان</label>
              <input 
                type="date" 
                value={form.effective_date} 
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                style={styles.input}
              />
            </div>

            {/* Dynamic Fields Based on Type */}
            {form.type === NOTIFICATION_TYPES.SALARY_STOP && (
              <div style={styles.inputGroup}>
                <label>سبب الوقف</label>
                <select 
                  value={form.stop_reason} 
                  onChange={(e) => setForm({ ...form, stop_reason: e.target.value })}
                  style={styles.input}
                >
                  <option value="">-- اختر السبب --</option>
                  {SALARY_STOP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            {form.type === NOTIFICATION_TYPES.PAYMENT_METHOD_CHANGE && (
              <>
                <div style={styles.inputGroup}>
                  <label>طريقة الدفع الحالية</label>
                  <input type="text" value={form.payment_method_old} onChange={(e) => setForm({ ...form, payment_method_old: e.target.value })} style={styles.input} />
                </div>
                <div style={styles.inputGroup}>
                  <label>طريقة الدفع الجديدة</label>
                  <input type="text" value={form.payment_method_new} onChange={(e) => setForm({ ...form, payment_method_new: e.target.value })} style={styles.input} />
                </div>
              </>
            )}

            {form.type === NOTIFICATION_TYPES.DEDUCTION && (
              <>
                <div style={styles.inputGroup}>
                  <label>نوع الخصم</label>
                  <select value={form.deduction_type} onChange={(e) =>setForm({ ...form, deduction_type: e.target.value })} style={styles.input}>
                    <option value="">-- اختر النوع --</option>
                    {DEDUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={styles.inputGroup}>
                  <label>المبلغ</label>
                  <input type="number" value={form.deduction_amount} onChange={(e) => setForm({ ...form, deduction_amount: e.target.value })} style={styles.input} />
                </div>
              </>
            )}

            {form.type === NOTIFICATION_TYPES.PROMOTION && (
              <div style={styles.inputGroup}>
                <label>الدرجة العلمية الجديدة</label>
                <select 
                  value={form.promotion_grade} 
                  onChange={(e) => setForm({ ...form, promotion_grade: e.target.value })}
                  style={styles.input}
                >
                  <option value="">-- اختر الدرجة --</option>
                  {ACADEMIC_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label>ملاحظات إضافية</label>
              <textarea 
                value={form.notes} 
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ ...styles.input, height: "80px", resize: "none" }}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading || !form.faculty_id} 
              style={{ ...styles.submitButton, opacity: loading || !form.faculty_id ? 0.6 : 1 }}
            >
              {loading ? "جاري الحفظ..." : "💾 حفظ التبليغ"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const renderPayrollTab = () => (
    <div style={styles.container}>
      <div style={styles.headerCard}>
        <div style={styles.headerRow}>
          <h2 style={styles.title}>تبليغات البيرول</h2>
          <div style={styles.selectorRow}>
             <div style={styles.inputGroup}>
              <label>شهر المراجعة</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2026, i, 1).toLocaleString("ar-EG", { month: "long" })}</option>
                ))}
              </select>
            </div>
            <div style={styles.inputGroup}>
              <label>السنة</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
                <option value={2027}>2027</option>
              </select>
            </div>
          </div>
        </div>

        <div style={styles.statsGrid}>
          <div style={{...styles.statCard, ...styles.statNew}}><span>{stats.total}</span><label>إجمالي التبليغات</label></div>
          <div style={{...styles.statCard, ...styles.statPending}}><span>{stats.pending_input}</span><label>بانتظار المدخل</label></div>
          <div style={{...styles.statCard, ...styles.statReview}}><span>{stats.pending_review}</span><label>بانتظار المراجع</label></div>
          <div style={{...styles.statCard, ...styles.statDone}}><span>{stats.completed_review}</span><label>تمت المراجعة</label></div>
          <div style={{...styles.statCard, ...styles.statReturn}}><span>{stats.returned}</span><label>معاد للتصحيح</label></div>
        </div>
</div>

      {loading ? (
        <div style={styles.loader}>جاري التحميل...</div>
      ) : (
        <div style={styles.listContainer}>
          {notifications.length === 0 ? (
            <div style={styles.emptyState}>لا توجد تبليغات مسجلة لهذا الشهر</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>العضو</th>
                    <th style={styles.th}>النوع</th>
                    <th style={styles.th}>التاريخ</th>
                    <th style={styles.th}>الحالة</th>
                    <th style={styles.th}>المنشئ</th>
                    <th style={styles.th}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.tdName}>{n.faculty_members?.full_name}</div>
                        <div style={styles.tdSub}>{n.faculty_members?.academic_grade}</div>
                      </td>
                      <td style={styles.td}>{n.type}</td>
                      <td style={styles.td}>{new Date(n.created_at).toLocaleDateString("ar-EG")}</td>
                      <td style={styles.td}>
                        <span style={{...styles.statusChip, ...styles.statusChipColor(n.status)}}>{n.status}</span>
                      </td>
                      <td style={styles.td}>{n.profiles?.full_name || "النظام"}</td>
                      <td style={styles.td}>
                        <button 
                          onClick={() => alert(`تفاصيل التبليغ:\n${n.notes || "لا يوجد ملاحظات"}`)}
                          style={styles.actionBtn}
                        >
                          👁️ عرض
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.wrapper}>
      <div style={styles.tabs}>
        <button 
          onClick={() => setActiveTab("create")} 
          style={{ ...styles.tabBtn, ...(activeTab === "create" ? styles.tabBtnActive : {}) }}
        >
          ✨ إنشاء التبليغات
        </button>
        <button 
          onClick={() => setActiveTab("payroll")} 
          style={{ ...styles.tabBtn, ...(activeTab === "payroll" ? styles.tabBtnActive : {}) }}
        >
          📑 تبليغات البيرول
        </button>
      </div>

      {activeTab === "create" ? renderCreateTab() : renderPayrollTab()}
    </div>
  );
}

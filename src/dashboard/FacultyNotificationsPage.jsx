// ============================================================================
// FacultyNotificationsPage.jsx
// ---------------------------------------------------------------------------
// صفحة تبليغات هيئة التدريس
//
// الميزات:
//   • تبويبان: إنشاء التبليغات | تبليغات البيرول
//   • اختيار شهر البيرول مرة واحدة لجميع التبليغات
//   • أنواع التبليغات: صرف مرتب، وقف مرتب، تغيير طريقة الدفع، إجازة دراسية، خصومات، ترقية
//   • نظام صلاحيات ثنائي المدقق (منشئ ← مدخل ← مراجع)
//   • ربط بالفهرس الأساسي لأعضاء هيئة التدريس
//   • مرفقات PDF
//   • تصميم احترافي RTL
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import {
  fetchNotifications,
  fetchNotificationStats,
  createNotification,
  updateNotification,
  deleteNotification,
  submitForInput,
  completeInput,
  completeReview,
  returnForCorrection,
  attachNotificationPdf,
  openNotificationPdf,
  downloadNotificationPdf,
  deleteNotificationPdf,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPES_LABELS,
  SALARY_STOP_REASONS,
  DEDUCTION_TYPES,
  ACADEMIC_GRADES,
  WORKFLOW_STATUS,
  WORKFLOW_STATUS_LABELS,
  getNextAcademicGrade,
} from "../services/facultyNotificationsService";
import { fetchMembers } from "../services/facultyArchiveService";
import { hasPermission } from "../utils/permissions";

const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function formatDate(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length !== 3) return text;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat("ar-EG", {
    numberingSystem: "latn",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("ar-EG", {
    numberingSystem: "latn",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} - ${timePart}`;
}

// ============================================================================
// المكون الرئيسي
// ============================================================================
export default function FacultyNotificationsPage({ currentUser, onBack }) {
  const [activeTab, setActiveTab] = useState("create"); // create | review
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
  const [showChangePayroll, setShowChangePayroll] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // تحميل الإحصائيات
  const loadStats = useCallback(async () => {
    try {
      const data = await fetchNotificationStats(payrollYear, payrollMonth);
      setStats(data);
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  }, [payrollYear, payrollMonth]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleChangePayroll = () => {
    setShowChangePayroll(true);
  };

  const confirmChangePayroll = () => {
    setShowChangePayroll(false);
    loadStats();
    setNotice(`تم تغيير شهر البيرول إلى ${MONTH_NAMES[payrollMonth - 1]} ${payrollYear}`);
  };

  return (
    <div>
      {/* رأس الصفحة */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={onBack}
          style={{
            padding: "10px 20px",
            backgroundColor: "#F1F5F9",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            color: "#475569",
            marginBottom: "20px",
            fontWeight: "500",
          }}
        >
          ← العودة للتبليغات الشهرية
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <div style={{ fontSize: "48px" }}>👨‍🏫</div>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "800", color: "#1E293B", marginBottom: "4px" }}>
              تبليغات هيئة التدريس
            </h1>
            <p style={{ fontSize: "15px", color: "#64748B" }}>
              إدارة تبليغات أعضاء هيئة التدريس مع نظام صلاحيات ثنائي المدقق
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "16px",
          backgroundColor: "#FEE2E2",
          border: "1px solid #FECACA",
          borderRadius: "8px",
          color: "#991B1B",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{
          padding: "16px",
          backgroundColor: "#D1FAE5",
          border: "1px solid #A7F3D0",
          borderRadius: "8px",
          color: "#047857",
          marginBottom: "16px",
        }}>
          {notice}
        </div>
      )}

      {/* شريط شهر البيرول */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          padding: "20px",
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          marginBottom: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
          📅 شهر البيرول:
        </div>
        <div style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          padding: "8px 16px",
          backgroundColor: "#EFF6FF",
          borderRadius: "8px",
          border: "1px solid #BFDBFE",
        }}>
          <span style={{ fontSize: "16px", fontWeight: "700", color: "#1D4ED8" }}>
            {MONTH_NAMES[payrollMonth - 1]} {payrollYear}
          </span>
        </div>
        <button
          onClick={handleChangePayroll}
          style={{
            padding: "8px 16px",
            backgroundColor: "#3B82F6",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          تغيير شهر البيرول
        </button>

        {/* إحصائيات */}
        {stats && (
          <div style={{ display: "flex", gap: "16px", marginLeft: "auto" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "#1E293B" }}>
                {stats.total}
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>إجمالي</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "#B45309" }}>
                {stats.awaitingInput}
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>بانتظار المدخل</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "#2563EB" }}>
                {stats.inputCompleted}
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>تم الإدخال</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: "800", color: "#047857" }}>
                {stats.reviewCompleted}
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>تمت المراجعة</div>
            </div>
          </div>
        )}
      </div>

      {/* التبويبات */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
        }}
      >
        <button
          onClick={() => setActiveTab("create")}
          style={{
            padding: "12px 24px",
            backgroundColor: activeTab === "create" ? "#10B981" : "#FFFFFF",
            color: activeTab === "create" ? "#FFFFFF" : "#475569",
            border: activeTab === "create" ? "none" : "1px solid #E2E8F0",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            boxShadow: activeTab === "create" ? "0 2px 4px rgba(16, 185, 129, 0.3)" : "none",
          }}
        >
          ➕ إنشاء التبليغات
        </button>
        <button
          onClick={() => setActiveTab("review")}
          style={{
            padding: "12px 24px",
            backgroundColor: activeTab === "review" ? "#8B5CF6" : "#FFFFFF",
            color: activeTab === "review" ? "#FFFFFF" : "#475569",
            border: activeTab === "review" ? "none" : "1px solid #E2E8F0",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            boxShadow: activeTab === "review" ? "0 2px 4px rgba(139, 92, 246, 0.3)" : "none",
          }}
        >
          📊 تبليغات البيرول
        </button>
      </div>

      {/* المحتوى */}
      {activeTab === "create" && (
        <CreateNotificationTab
          currentUser={currentUser}
          payrollMonth={payrollMonth}
          payrollYear={payrollYear}
          onSuccess={() => {
            loadStats();
            setNotice("تم حفظ التبليغ بنجاح");
          }}
        />
      )}

      {activeTab === "review" && (
        <ReviewNotificationTab
          currentUser={currentUser}
          payrollMonth={payrollMonth}
          payrollYear={payrollYear}
          onChangePayroll={handleChangePayroll}
          onSuccess={() => {
            loadStats();
            setNotice("تم تحديث الحالة بنجاح");
          }}
        />
      )}

      {/* نافذة تغيير شهر البيرول */}
      {showChangePayroll && (
        <ChangePayrollModal
          currentMonth={payrollMonth}
          currentYear={payrollYear}
          onClose={() => setShowChangePayroll(false)}
          onConfirm={(month, year) => {
            setPayrollMonth(month);
            setPayrollYear(year);
            confirmChangePayroll();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// تبويب إنشاء التبليغات
// ============================================================================
function CreateNotificationTab({ currentUser, payrollMonth, payrollYear, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [notificationType, setNotificationType] = useState("");
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // البحث عن الأعضاء
  useEffect(() => {
    let cancelled = false;
    const searchMembers = async () => {
      if (!searchQuery.trim()) {
        setMembers([]);
        return;
      }
      try {
        const allMembers = await fetchMembers();
        const query = searchQuery.toLowerCase();
        const filtered = allMembers.filter((m) => {
          return (
            m.full_name?.toLowerCase().includes(query) ||
            m.member_code?.toLowerCase().includes(query)
          );
        });
        if (!cancelled) setMembers(filtered.slice(0, 20));
      } catch (err) {
        console.error("Error searching members:", err);
      }
    };
    const timer = setTimeout(searchMembers, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSelectMember = (member) => {
    if (unsavedChanges) {
      if (!window.confirm("لديك تغييرات غير محفوظة. هل تريد تجاهلها؟")) {
        return;
      }
    }
    setSelectedMember(member);
    setFormData({});
    setNotificationType("");
    setUnsavedChanges(false);
    setError("");
    setNotice("");
  };

  const handleTypeChange = (type) => {
    setNotificationType(type);
    setFormData({});
    setUnsavedChanges(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!selectedMember) {
      setError("من فضلك اختر عضو هيئة التدريس.");
      return;
    }
    if (!notificationType) {
      setError("من فضلك اختر نوع التبليغ.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const notification = {
        facultyMemberId: selectedMember.id,
        notificationType,
        payrollMonth,
        payrollYear,
        notificationData: formData,
        createdById: currentUser?.id,
        createdByName: currentUser?.full_name || currentUser?.username,
      };

      await createNotification(notification, { user: currentUser });
      setUnsavedChanges(false);
      setNotice("تم حفظ التبليغ بنجاح.");
      onSuccess();
    } catch (err) {
      console.error("Error saving notification:", err);
      setError(err.message || "تعذر حفظ التبليغ.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: "16px",
        border: "1px solid #E2E8F0",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {notice && (
        <div style={{
          padding: "12px",
          backgroundColor: "#D1FAE5",
          border: "1px solid #A7F3D0",
          borderRadius: "8px",
          color: "#047857",
          marginBottom: "16px",
        }}>
          {notice}
        </div>
      )}

      {error && (
        <div style={{
          padding: "12px",
          backgroundColor: "#FEE2E2",
          border: "1px solid #FECACA",
          borderRadius: "8px",
          color: "#991B1B",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {/* البحث عن العضو */}
      <div style={{ marginBottom: "24px" }}>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          🔍 بحث عن عضو هيئة التدريس
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الصرف..."
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
        {members.length > 0 && (
          <div
            style={{
              marginTop: "8px",
              maxHeight: "200px",
              overflowY: "auto",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
            }}
          >
            {members.map((member) => (
              <div
                key={member.id}
                onClick={() => handleSelectMember(member)}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #E2E8F0",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#FFFFFF";
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#1E293B" }}>
                  {member.full_name}
                </div>
                <div style={{ fontSize: "12px", color: "#64748B" }}>
                  #{member.member_code} • {member.job_title || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* العضو المختار */}
      {selectedMember && (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: "8px",
            marginBottom: "24px",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#1D4ED8", marginBottom: "4px" }}>
            العضو المختار:
          </div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#1E293B" }}>
            {selectedMember.full_name}
          </div>
          <div style={{ fontSize: "13px", color: "#64748B" }}>
            #{selectedMember.member_code} • {selectedMember.job_title || "—"} • {selectedMember.grade || "—"}
          </div>
        </div>
      )}

      {/* نوع التبليغ */}
      {selectedMember && (
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
            نوع التبليغ
          </label>
          <select
            value={notificationType}
            onChange={(e) => handleTypeChange(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
            }}
          >
            <option value="">اختر نوع التبليغ...</option>
            {Object.entries(NOTIFICATION_TYPES_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* الحقول الديناميكية حسب النوع */}
      {notificationType && (
        <NotificationTypeForm
          type={notificationType}
          member={selectedMember}
          formData={formData}
          onChange={handleFormChange}
        />
      )}

      {/* أزرار الإجراءات */}
      {selectedMember && notificationType && (
        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: "12px 24px",
              backgroundColor: "#10B981",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "600",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "جاري الحفظ..." : "💾 حفظ التبليغ"}
          </button>
          <button
            onClick={() => {
              setSelectedMember(null);
              setNotificationType("");
              setFormData({});
              setUnsavedChanges(false);
            }}
            style={{
              padding: "12px 24px",
              backgroundColor: "#F1F5F9",
              color: "#475569",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// نموذج نوع التبليغ (حقول ديناميكية)
// ============================================================================
function NotificationTypeForm({ type, member, formData, onChange }) {
  switch (type) {
    case NOTIFICATION_TYPES.SALARY_STOP:
      return (
        <SalaryStopForm formData={formData} onChange={onChange} />
      );
    case NOTIFICATION_TYPES.PAYMENT_METHOD_CHANGE:
      return (
        <PaymentMethodChangeForm formData={formData} onChange={onChange} />
      );
    case NOTIFICATION_TYPES.DEDUCTION:
      return (
        <DeductionForm formData={formData} onChange={onChange} />
      );
    case NOTIFICATION_TYPES.PROMOTION:
      return (
        <PromotionForm member={member} formData={formData} onChange={onChange} />
      );
    default:
      return (
        <div style={{ padding: "16px", backgroundColor: "#F8FAFC", borderRadius: "8px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
            ملاحظات
          </label>
          <textarea
            value={formData.notes || ""}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="أضف ملاحظات هنا..."
            rows={4}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
              resize: "vertical",
            }}
          />
        </div>
      );
  }
}

// نموذج وقف المرتب
function SalaryStopForm({ formData, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          سبب الوقف
        </label>
        <select
          value={formData.stopReason || ""}
          onChange={(e) => onChange("stopReason", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        >
          <option value="">اختر السبب...</option>
          {SALARY_STOP_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          تاريخ السريان
        </label>
        <input
          type="date"
          value={formData.effectiveDate || ""}
          onChange={(e) => onChange("effectiveDate", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          ملاحظات
        </label>
        <textarea
          value={formData.notes || ""}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="أضف ملاحظات هنا..."
          rows={3}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

// نموذج تغيير طريقة الدفع
function PaymentMethodChangeForm({ formData, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          الطريقة الحالية
        </label>
        <input
          type="text"
          value={formData.currentMethod || ""}
          onChange={(e) => onChange("currentMethod", e.target.value)}
          placeholder="مثال: تحويل بنكي"
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          الطريقة الجديدة
        </label>
        <input
          type="text"
          value={formData.newMethod || ""}
          onChange={(e) => onChange("newMethod", e.target.value)}
          placeholder="مثال: شيك"
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          تاريخ السريان
        </label>
        <input
          type="date"
          value={formData.effectiveDate || ""}
          onChange={(e) => onChange("effectiveDate", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          ملاحظات
        </label>
        <textarea
          value={formData.notes || ""}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="أضف ملاحظات هنا..."
          rows={3}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

// نموذج الخصومات
function DeductionForm({ formData, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          نوع الخصم
        </label>
        <select
          value={formData.deductionType || ""}
          onChange={(e) => onChange("deductionType", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        >
          <option value="">اختر نوع الخصم...</option>
          {DEDUCTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          المبلغ
        </label>
        <input
          type="number"
          value={formData.amount || ""}
          onChange={(e) => onChange("amount", e.target.value)}
          placeholder="0.00"
          step="0.01"
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          ملاحظات
        </label>
        <textarea
          value={formData.notes || ""}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="أضف ملاحظات هنا..."
          rows={3}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

// نموذج الترقية
function PromotionForm({ member, formData, onChange }) {
  const currentGrade = member?.grade || "";
  const nextGrade = getNextAcademicGrade(currentGrade);

  useEffect(() => {
    if (nextGrade && !formData.newGrade) {
      onChange("newGrade", nextGrade);
    }
  }, [nextGrade, formData.newGrade, onChange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div
        style={{
          padding: "12px",
          backgroundColor: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: "8px",
        }}
      >
        <div style={{ fontSize: "13px", color: "#64748B", marginBottom: "4px" }}>
          الدرجة الحالية:
        </div>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#1D4ED8" }}>
          {currentGrade || "غير محدد"}
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          الدرجة الجديدة
        </label>
        <select
          value={formData.newGrade || ""}
          onChange={(e) => onChange("newGrade", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        >
          <option value="">اختر الدرجة...</option>
          {ACADEMIC_GRADES.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </select>
        {nextGrade && (
          <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
            💡 الدرجة المقترحة تلقائيًا: {nextGrade}
          </div>
        )}
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          تاريخ السريان
        </label>
        <input
          type="date"
          value={formData.effectiveDate || ""}
          onChange={(e) => onChange("effectiveDate", e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
          ملاحظات
        </label>
        <textarea
          value={formData.notes || ""}
          onChange={(e) => onChange("notes", e.target.value)}
          placeholder="أضف ملاحظات هنا..."
          rows={3}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// تبويب مراجعة تبليغات البيرول
// ============================================================================
function ReviewNotificationTab({ currentUser, payrollMonth, payrollYear, onChangePayroll, onSuccess }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedNotification, setSelectedNotification] = useState(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchNotifications({
        year: payrollYear,
        month: payrollMonth,
      });
      setNotifications(data);
    } catch (err) {
      console.error("Error loading notifications:", err);
      setError(err.message || "تعذر تحميل التبليغات.");
    } finally {
      setLoading(false);
    }
  }, [payrollYear, payrollMonth]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: "16px",
        border: "1px solid #E2E8F0",
        padding: "24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {error && (
        <div style={{
          padding: "12px",
          backgroundColor: "#FEE2E2",
          border: "1px solid #FECACA",
          borderRadius: "8px",
          color: "#991B1B",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
          <div>جاري التحميل...</div>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px", opacity: 0.5 }}>📭</div>
          <div style={{ fontSize: "16px", marginBottom: "8px" }}>لا توجد تبليغات لهذا الشهر</div>
          <div style={{ fontSize: "14px" }}>
            اذهب إلى تبويب "إنشاء التبليغات" لإضافة تبليغات
          </div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)", borderBottom: "2px solid #E2E8F0" }}>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                #
              </th>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                العضو
              </th>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                النوع
              </th>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                من قِبل
              </th>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                الحالة
              </th>
              <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((notification, index) => (
              <tr
                key={notification.id}
                style={{ borderBottom: "1px solid #E2E8F0" }}
              >
                <td style={{ padding: "16px", fontSize: "14px", color: "#64748B", fontWeight: "500" }}>
                  {index + 1}
                </td>
                <td style={{ padding: "16px", fontSize: "15px", color: "#1E293B", fontWeight: "700" }}>
                  {notification.facultyMemberId || "غير محدد"}
                </td>
                <td style={{ padding: "16px", fontSize: "14px", color: "#64748B" }}>
                  {NOTIFICATION_TYPES_LABELS[notification.notificationType] || notification.notificationType}
                </td>
                <td style={{ padding: "16px", fontSize: "14px", color: "#64748B" }}>
                  {notification.createdByName}
                </td>
                <td style={{ padding: "16px" }}>
                  <span
                    style={{
                      padding: "6px 12px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor:
                        notification.workflowStatus === WORKFLOW_STATUS.NEW
                          ? "#FEF3C7"
                          : notification.workflowStatus === WORKFLOW_STATUS.AWAITING_INPUT
                            ? "#DBEAFE"
                            : notification.workflowStatus === WORKFLOW_STATUS.INPUT_COMPLETED
                              ? "#DCFCE7"
                              : notification.workflowStatus === WORKFLOW_STATUS.AWAITING_REVIEW
                                ? "#F3E8FF"
                                : notification.workflowStatus === WORKFLOW_STATUS.REVIEW_COMPLETED
                                  ? "#D1FAE5"
                                  : notification.workflowStatus === WORKFLOW_STATUS.RETURNED_FOR_CORRECTION
                                    ? "#FEE2E2"
                                    : "#F1F5F9",
                      color:
                        notification.workflowStatus === WORKFLOW_STATUS.NEW
                          ? "#B45309"
                          : notification.workflowStatus === WORKFLOW_STATUS.AWAITING_INPUT
                            ? "#2563EB"
                            : notification.workflowStatus === WORKFLOW_STATUS.INPUT_COMPLETED
                              ? "#047857"
                              : notification.workflowStatus === WORKFLOW_STATUS.AWAITING_REVIEW
                                ? "#7C3AED"
                                : notification.workflowStatus === WORKFLOW_STATUS.REVIEW_COMPLETED
                                  ? "#047857"
                                  : notification.workflowStatus === WORKFLOW_STATUS.RETURNED_FOR_CORRECTION
                                    ? "#991B1B"
                                    : "#64748B",
                    }}
                  >
                    {WORKFLOW_STATUS_LABELS[notification.workflowStatus] || notification.workflowStatus}
                  </span>
                </td>
                <td style={{ padding: "16px" }}>
                  <button
                    onClick={() => setSelectedNotification(notification)}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#3B82F6",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    🔍 عرض التفاصيل
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* نافذة تفاصيل التبليغ */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          currentUser={currentUser}
          onClose={() => setSelectedNotification(null)}
          onSuccess={() => {
            loadNotifications();
            onSuccess();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// نافذة تفاصيل التبليغ
// ============================================================================
function NotificationDetailModal({ notification, currentUser, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnDetail, setReturnDetail] = useState("");

  const handleCompleteInput = async () => {
    if (!window.confirm("هل أنت متأكد من إكمال مرحلة الإدخال والمراجعة؟")) return;
    setLoading(true);
    setError("");
    try {
      await completeInput(notification.id, { user: currentUser });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error completing input:", err);
      setError(err.message || "تعذر إكمال مرحلة الإدخال.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!window.confirm("هل أنت متأكد من اعتماد المراجعة النهائية؟")) return;
    setLoading(true);
    setError("");
    try {
      await completeReview(notification.id, { user: currentUser });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error completing review:", err);
      setError(err.message || "تعذر اعتماد المراجعة النهائية.");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnForCorrection = async () => {
    if (!returnReason.trim()) {
      setError("من فضلك أدخل سبب الإعادة.");
      return;
    }
    if (!window.confirm("هل أنت متأكد من إعادة التبليغ للتصحيح؟")) return;
    setLoading(true);
    setError("");
    try {
      await returnForCorrection(notification.id, returnReason, returnDetail, { user: currentUser });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error returning for correction:", err);
      setError(err.message || "تعذر إعادة التبليغ للتصحيح.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          maxWidth: "800px",
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "800", color: "#1E293B" }}>
            تفاصيل التبليغ
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              backgroundColor: "#F1F5F9",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              color: "#475569",
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            padding: "12px",
            backgroundColor: "#FEE2E2",
            border: "1px solid #FECACA",
            borderRadius: "8px",
            color: "#991B1B",
            marginBottom: "16px",
          }}>
            {error}
          </div>
        )}

        {/* معلومات التبليغ */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>النوع</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
                {NOTIFICATION_TYPES_LABELS[notification.notificationType] || notification.notificationType}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>الحالة</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
                {WORKFLOW_STATUS_LABELS[notification.workflowStatus] || notification.workflowStatus}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>من قِبل</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
                {notification.createdByName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>تاريخ الإنشاء</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
                {formatDateTime(notification.createdAt)}
              </div>
            </div>
          </div>
        </div>

        {/* إجراءات سير العمل */}
        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "24px", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#1E293B", marginBottom: "16px" }}>
            إجراءات المراجعة
          </h3>
          
          {notification.workflowStatus === WORKFLOW_STATUS.NEW && (
            <button
              onClick={async () => {
                await submitForInput(notification.id, { user: currentUser });
                onSuccess();
                onClose();
              }}
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: "#3B82F6",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "جاري الإرسال..." : "📤 إرسال لمدخل البيرول"}
            </button>
          )}

          {notification.workflowStatus === WORKFLOW_STATUS.AWAITING_INPUT && (
            <button
              onClick={handleCompleteInput}
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: "#10B981",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "جاري الإدخال..." : "✅ تم الإدخال والمراجعة"}
            </button>
          )}

          {notification.workflowStatus === WORKFLOW_STATUS.INPUT_COMPLETED && (
            <button
              onClick={handleCompleteReview}
              disabled={loading}
              style={{
                padding: "12px 24px",
                backgroundColor: "#8B5CF6",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "جاري المراجعة..." : "🏆 اعتماد المراجعة النهائية"}
            </button>
          )}

          {(notification.workflowStatus === WORKFLOW_STATUS.AWAITING_INPUT ||
            notification.workflowStatus === WORKFLOW_STATUS.INPUT_COMPLETED ||
            notification.workflowStatus === WORKFLOW_STATUS.AWAITING_REVIEW) && (
            <div style={{ marginTop: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
                سبب الإعادة للتصحيح
              </label>
              <input
                type="text"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="مثال: بيانات ناقصة"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  marginBottom: "8px",
                }}
              />
              <textarea
                value={returnDetail}
                onChange={(e) => setReturnDetail(e.target.value)}
                placeholder="تفاصيل إضافية..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  resize: "vertical",
                  marginBottom: "8px",
                }}
              />
              <button
                onClick={handleReturnForCorrection}
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#F59E0B",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "جاري الإعادة..." : "↩️ إعادة للتصحيح"}
              </button>
            </div>
          )}

          {notification.workflowStatus === WORKFLOW_STATUS.RETURNED_FOR_CORRECTION && (
            <div style={{ padding: "16px", backgroundColor: "#FEE2E2", border: "1px solid #FECACA", borderRadius: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "#991B1B", marginBottom: "4px" }}>
                سبب الإعادة:
              </div>
              <div style={{ fontSize: "16px", color: "#1E293B" }}>
                {notification.returnReason}
              </div>
              {notification.returnReasonDetail && (
                <div style={{ fontSize: "14px", color: "#64748B", marginTop: "8px" }}>
                  {notification.returnReasonDetail}
                </div>
              )}
            </div>
          )}
        </div>

        {/* معلومات سير العمل */}
        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#1E293B", marginBottom: "16px" }}>
            سجل المراجعة
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
            {notification.inputBy && (
              <div>
                <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>الإدخال والمراجعة</div>
                <div style={{ fontSize: "14px", color: "#1E293B" }}>
                  {notification.inputBy} • {formatDateTime(notification.inputAt)}
                </div>
              </div>
            )}
            {notification.reviewedBy && (
              <div>
                <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>المراجعة النهائية</div>
                <div style={{ fontSize: "14px", color: "#1E293B" }}>
                  {notification.reviewedBy} • {formatDateTime(notification.reviewedAt)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// نافذة تغيير شهر البيرول
// ============================================================================
function ChangePayrollModal({ currentMonth, currentYear, onClose, onConfirm }) {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const handleConfirm = () => {
    onConfirm(month, year);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#1E293B", marginBottom: "16px" }}>
          تغيير شهر البيرول
        </h2>
        <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "16px" }}>
          سيتم حفظ التبليغات الحالية على الشهر الحالي. التبليغات الجديدة ستُحفظ على الشهر الجديد.
        </p>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
            الشهر
          </label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
            }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
            السنة
          </label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
            }}
          >
            {[2024, 2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1,
              padding: "12px 24px",
              backgroundColor: "#10B981",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            تأكيد التغيير
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px 24px",
              backgroundColor: "#F1F5F9",
              color: "#475569",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

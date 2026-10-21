// ============================================================================
// MonthlyReportsPage.jsx
// ---------------------------------------------------------------------------
// الصفحة الرئيسية لوحدة "التبليغات الشهرية".
// تحتوي على ثلاثة أقسام مستقلة:
//   1. تبليغات هيئة التدريس
//   2. تبليغات الموظفين
//   3. تبليغات العقود
//
// لكل قسم:
//   • إدارة أنواع التبليغات
//   • تسجيل تبليغات جديدة
//   • الكشف الشهري
//   • البحث والتصفية
//   • الطباعة
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import {
  fetchSections,
  fetchSectionByCode,
  SECTION_CODES,
  fetchTypes,
  fetchActiveTypes,
  fetchReports,
  createReport,
  deleteReport,
  seedFacultyTypes,
} from "../services/monthlyReportsService";
import { fetchMembers } from "../services/facultyArchiveService";
import { hasPermission } from "../utils/permissions";
import MonthlyReportsTypesManager from "./MonthlyReportsTypesManager";
import MonthlyReportsCreateForm from "./MonthlyReportsCreateForm";
import MonthlyReportsMonthlyView from "./MonthlyReportsMonthlyView";

const PAGE_TITLE = "التبليغات الشهرية";
const PAGE_SUBTITLE = "إدارة التبليغات الشهرية لهيئة التدريس والموظفين والعقود";

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
// مكون القسم الواحد
// ============================================================================

function SectionCard({ section, onOpen }) {
  const sectionColors = {
    [SECTION_CODES.FACULTY]: { bg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", icon: "👨‍🏫" },
    [SECTION_CODES.EMPLOYEE]: { bg: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", icon: "👨‍💼" },
    [SECTION_CODES.CONTRACT]: { bg: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", icon: "📋" },
  };
  
  const colors = sectionColors[section.code] || { bg: "#6366f1", icon: "📋" };

  return (
    <div
      onClick={() => onOpen(section)}
      style={{
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        border: "none",
        borderRadius: "16px",
        padding: "0",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
        e.currentTarget.style.boxShadow = "0 20px 40px -12px rgba(0, 0, 0, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
      }}
    >
      <div
        style={{
          background: colors.bg,
          padding: "32px 24px",
          color: "#FFFFFF",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "12px", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}>
          {colors.icon}
        </div>
        <div style={{ fontSize: "22px", fontWeight: "700", marginBottom: "4px" }}>
          {section.name_ar}
        </div>
        <div style={{ fontSize: "14px", opacity: 0.9 }}>
          {section.description}
        </div>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontSize: "13px", color: "#64748B", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>انقر للدخول</span>
          <span style={{ fontSize: "16px" }}>→</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// صفحة القسم المفصّلة
// ============================================================================

function SectionDetailView({
  section,
  currentUser,
  onBack,
  onManageTypes,
  onCreateReport,
  onViewMonthlyReport,
}) {
  const [types, setTypes] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCreator, setFilterCreator] = useState("");

  const loadTypes = useCallback(async () => {
    try {
      const data = await fetchActiveTypes(section.id);
      setTypes(data);
    } catch (error) {
      console.error("Error loading types:", error);
    }
  }, [section.id]);

  const loadReports = useCallback(async () => {
    if (!selectedSection) return;
    setLoading(true);
    try {
      const filters = {
        sectionId: selectedSection.id,
        year: selectedYear,
        month: selectedMonth,
      };
      if (filterType) filters.typeId = filterType;
      if (filterCreator) filters.createdById = filterCreator;
      
      const data = await fetchReports(filters);
      
      // فلترة البحث النصي محليًا
      let filtered = data;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = data.filter((report) => {
          return (
            report.created_by_name?.toLowerCase().includes(query) ||
            report.type?.name_ar?.toLowerCase().includes(query) ||
            report.notes?.toLowerCase().includes(query)
          );
        });
      }
      
      setReports(filtered);
    } catch (error) {
      console.error("Error loading reports:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedSection, selectedYear, selectedMonth, filterType, filterCreator, searchQuery]);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    if (selectedSection) {
      loadReports();
    }
  }, [loadReports, selectedSection]);

  const canManageTypes = hasPermission(currentUser, "monthly_reports");

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
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#E2E8F0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#F1F5F9";
          }}
        >
          ← العودة للأقسام
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <div style={{ fontSize: "48px" }}>
            {section.code === SECTION_CODES.FACULTY && "👨‍🏫"}
            {section.code === SECTION_CODES.EMPLOYEE && "👨‍💼"}
            {section.code === SECTION_CODES.CONTRACT && "📋"}
          </div>
          <div>
            <h1 style={{ fontSize: "32px", fontWeight: "800", color: "#1E293B", marginBottom: "4px" }}>
              {section.name_ar}
            </h1>
            <p style={{ fontSize: "15px", color: "#64748B" }}>{section.description}</p>
          </div>
        </div>
      </div>

      {/* شريط الأدوات */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "24px",
          padding: "20px",
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* اختيار الشهر والسنة */}
        <div style={{ display: "flex", gap: "8px" }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
              backgroundColor: "#F8FAFC",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
              backgroundColor: "#F8FAFC",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            {[2024, 2025, 2026, 2027, 2028].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* البحث */}
        <div style={{ flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            placeholder="🔍 بحث بالاسم أو النوع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #CBD5E1",
              fontSize: "14px",
              backgroundColor: "#F8FAFC",
            }}
          />
        </div>

        {/* فلترة بالنوع */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #CBD5E1",
            fontSize: "14px",
            backgroundColor: "#F8FAFC",
            cursor: "pointer",
            fontWeight: "500",
          }}
        >
          <option value="">كل الأنواع</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name_ar}
            </option>
          ))}
        </select>

        {/* أزرار الإجراءات */}
        <div style={{ display: "flex", gap: "8px" }}>
          {canManageTypes && (
            <button
              onClick={() => onManageTypes(section)}
              style={{
                padding: "10px 20px",
                backgroundColor: "#3B82F6",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                boxShadow: "0 2px 4px rgba(59, 130, 246, 0.3)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 4px 8px rgba(59, 130, 246, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 4px rgba(59, 130, 246, 0.3)";
              }}
            >
              ⚙️ إدارة الأنواع
            </button>
          )}
          <button
            onClick={() => onCreateReport(section)}
            style={{
              padding: "10px 20px",
              backgroundColor: "#10B981",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(16, 185, 129, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(16, 185, 129, 0.3)";
            }}
          >
            ➕ تبليغ جديد
          </button>
          <button
            onClick={() => onViewMonthlyReport(section, { year: selectedYear, month: selectedMonth })}
            style={{
              padding: "10px 20px",
              backgroundColor: "#8B5CF6",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(139, 92, 246, 0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(139, 92, 246, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(139, 92, 246, 0.3)";
            }}
          >
            📊 الكشف الشهري
          </button>
        </div>
      </div>

      {/* جدول التبليغات */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
            <div>جاري التحميل...</div>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
            <div style={{ fontSize: "64px", marginBottom: "16px", opacity: 0.5 }}>📭</div>
            <div style={{ fontSize: "16px", marginBottom: "8px" }}>لا توجد تبليغات لهذا الشهر</div>
            <div style={{ fontSize: "14px" }}>اضغط على "تبليغ جديد" لإضافة تبليغ</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderBottom: "2px solid #E2E8F0" }}>
                <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                  #
                </th>
                <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                  النوع
                </th>
                <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                  من قِبل
                </th>
                <th style={{ padding: "16px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#FFFFFF" }}>
                  تاريخ الإدخال
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
              {reports.map((report, index) => (
                <tr
                  key={report.id}
                  style={{ 
                    borderBottom: "1px solid #E2E8F0",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#F8FAFC";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFFFFF";
                  }}
                >
                  <td style={{ padding: "16px", fontSize: "14px", color: "#64748B", fontWeight: "500" }}>
                    {index + 1}
                  </td>
                  <td style={{ padding: "16px", fontSize: "15px", color: "#1E293B", fontWeight: "700" }}>
                    {report.type?.name_ar}
                  </td>
                  <td style={{ padding: "16px", fontSize: "14px", color: "#64748B" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "18px" }}>👤</span>
                      {report.created_by_name}
                    </div>
                  </td>
                  <td style={{ padding: "16px", fontSize: "14px", color: "#64748B" }}>
                    {formatDate(report.created_at)}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "600",
                        backgroundColor:
                          report.status === "draft"
                            ? "#FEF3C7"
                            : report.status === "submitted"
                              ? "#DBEAFE"
                              : report.status === "approved"
                                ? "#D1FAE5"
                                : "#F1F5F9",
                        color:
                          report.status === "draft"
                            ? "#B45309"
                            : report.status === "submitted"
                              ? "#2563EB"
                              : report.status === "approved"
                                ? "#047857"
                                : "#64748B",
                      }}
                    >
                      {report.status === "draft" && "⚠️ مسودة"}
                      {report.status === "submitted" && "📤 مُرسل"}
                      {report.status === "approved" && "✅ معتمد"}
                      {report.status === "archived" && "📦 مؤرشف"}
                    </span>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <button
                      onClick={() => {/* TODO: فتح التفاصيل */}}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#3B82F6",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "600",
                        boxShadow: "0 2px 4px rgba(59, 130, 246, 0.3)",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 8px rgba(59, 130, 246, 0.4)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 2px 4px rgba(59, 130, 246, 0.3)";
                      }}
                    >
                      👁️ عرض
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ملخص */}
      <div
        style={{
          marginTop: "16px",
          padding: "16px",
          backgroundColor: "#F8FAFC",
          borderRadius: "8px",
          fontSize: "14px",
          color: "#64748B",
        }}
      >
        <strong>إجمالي التبليغات:</strong> {reports.length}
      </div>
    </div>
  );
}

// ============================================================================
// الصفحة الرئيسية
// ============================================================================

export default function MonthlyReportsPage({ currentUser }) {
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [view, setView] = useState("list"); // list | section | types | create | monthly_report
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [monthlyReportParams, setMonthlyReportParams] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSections();
  }, []);

  const loadSections = async () => {
    setLoading(true);
    try {
      const data = await fetchSections();
      setSections(data.filter((s) => s.is_active));
    } catch (error) {
      console.error("Error loading sections:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSection = (section) => {
    setSelectedSection(section);
    setView("section");
  };

  const handleBackToList = () => {
    setSelectedSection(null);
    setView("list");
  };

  const handleManageTypes = (section) => {
    setSelectedSection(section);
    setView("types");
  };

  const handleCreateReport = (section) => {
    setSelectedSection(section);
    setShowCreateForm(true);
  };

  const handleCreateFormSuccess = () => {
    setShowCreateForm(false);
    // إذا كنا في عرض القسم، نعيد تحميل البيانات
    if (view === "section" && selectedSection) {
      loadReports();
    }
  };

  const handleViewMonthlyReport = (section, { year, month }) => {
    setSelectedSection(section);
    setMonthlyReportParams({ year, month });
    setView("monthly_report");
  };

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
        جاري التحميل...
      </div>
    );
  }

  if (view === "section") {
    return (
      <SectionDetailView
        section={selectedSection}
        currentUser={currentUser}
        onBack={handleBackToList}
        onManageTypes={handleManageTypes}
        onCreateReport={handleCreateReport}
        onViewMonthlyReport={handleViewMonthlyReport}
      />
    );
  }

  if (view === "types") {
    return (
      <MonthlyReportsTypesManager
        section={selectedSection}
        currentUser={currentUser}
        onBack={handleBackToList}
      />
    );
  }

  if (view === "create") {
    return (
      <div>
        <button onClick={handleBackToList} style={{ marginBottom: "16px" }}>
          ← العودة
        </button>
        <h1>تبليغ جديد - {selectedSection?.name_ar}</h1>
        <div style={{ padding: "24px", textAlign: "center", color: "#64748B" }}>
          هذه الصفحة غير مستخدمة - نموذج الإنشاء يظهر كنافذة منبثقة
        </div>
      </div>
    );
  }

  if (view === "monthly_report" && monthlyReportParams) {
    return (
      <MonthlyReportsMonthlyView
        section={selectedSection}
        month={monthlyReportParams.month}
        year={monthlyReportParams.year}
        currentUser={currentUser}
        onBack={handleBackToList}
      />
    );
  }

  // عرض القائمة الرئيسية للأقسام
  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "36px", fontWeight: "800", color: "#1E293B", marginBottom: "12px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {PAGE_TITLE}
        </h1>
        <p style={{ fontSize: "16px", color: "#64748B", marginBottom: "16px" }}>
          {PAGE_SUBTITLE}
        </p>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", backgroundColor: "#F8FAFC", borderRadius: "8px", fontSize: "14px", color: "#64748B" }}>
            <span style={{ fontSize: "18px" }}>📊</span>
            <span>{sections.length} أقسام</span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "28px",
        }}
      >
        {sections.map((section) => (
          <SectionCard key={section.id} section={section} onOpen={handleOpenSection} />
        ))}
      </div>

      {/* نموذج إنشاء التبليغ */}
      {showCreateForm && selectedSection && (
        <MonthlyReportsCreateForm
          section={selectedSection}
          currentUser={currentUser}
          onCancel={() => {
            setShowCreateForm(false);
            setSelectedSection(null);
          }}
          onSuccess={handleCreateFormSuccess}
        />
      )}
    </div>
  );
}

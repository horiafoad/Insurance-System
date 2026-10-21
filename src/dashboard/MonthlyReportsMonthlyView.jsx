// ============================================================================
// MonthlyReportsMonthlyView.jsx
// ---------------------------------------------------------------------------
// صفحة الكشف الشهري لقسم معين.
// تعرض جميع التبليغات لشهر وسنة محددين مع التفاصيل الكاملة.
// تدعم الطباعة بتنسيق A4 RTL.
// ============================================================================

import React, { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import {
  fetchReports,
  fetchFieldValues,
  fetchAttachments,
  fetchActiveTypes,
  SECTION_CODES,
} from "../services/monthlyReportsService";
import { fetchMembers } from "../services/facultyArchiveService";

export default function MonthlyReportsMonthlyView({ section, month, year, currentUser, onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [showDetails, setShowDetails] = useState({});
  const [reportDetails, setReportDetails] = useState({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReports({
        sectionId: section.id,
        year,
        month,
      });
      
      // تحميل التفاصيل لكل تبليغ
      const details = {};
      for (const report of data) {
        try {
          const [fieldValues, attachments] = await Promise.all([
            fetchFieldValues(report.id),
            fetchAttachments(report.id),
          ]);
          details[report.id] = {
            fieldValues,
            attachments,
          };
        } catch (error) {
          console.error("Error loading report details:", error);
          details[report.id] = { fieldValues: [], attachments: [] };
        }
      }
      
      setReportDetails(details);
      setReports(data);
    } catch (error) {
      console.error("Error loading reports:", error);
    } finally {
      setLoading(false);
    }
  }, [section.id, year, month]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const toggleDetails = (reportId) => {
    setShowDetails((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 100);
  };

  const formatDate = (value) => {
    if (!value) return "";
    const text = String(value).slice(0, 10);
    const parts = text.split("-");
    if (parts.length !== 3) return text;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatDateTime = (value) => {
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
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: "مسودة",
      submitted: "مُرسل",
      approved: "معتمد",
      archived: "مؤرشف",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: { bg: "#FEF3C7", color: "#B45309" },
      submitted: { bg: "#DBEAFE", color: "#2563EB" },
      approved: { bg: "#D1FAE5", color: "#047857" },
      archived: { bg: "#F1F5F9", color: "#64748B" },
    };
    return colors[status] || { bg: "#F1F5F9", color: "#64748B" };
  };

  // الإحصائيات
  const totalReports = reports.length;
  const uniqueTypes = new Set(reports.map((r) => r.type_id)).size;
  const uniquePersons = new Set(
    reports
      .filter((r) => r.faculty_member_id)
      .map((r) => r.faculty_member_id)
  ).size;

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
        جاري التحميل...
      </div>
    );
  }

  return (
    <div>
      {/* رأس الصفحة */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={onBack}
          style={{
            padding: "8px 16px",
            backgroundColor: "#F1F5F9",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            color: "#475569",
            marginBottom: "16px",
          }}
        >
          ← العودة
        </button>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#1E293B", marginBottom: "8px" }}>
          الكشف الشهري - {section.name_ar}
        </h1>
        <p style={{ fontSize: "14px", color: "#64748B" }}>
          شهر {month} / سنة {year}
        </p>
      </div>

      {/* شريط الإحصائيات والأدوات */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          padding: "16px",
          backgroundColor: "#FFFFFF",
          borderRadius: "12px",
          border: "1px solid #E2E8F0",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "24px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>
              إجمالي التبليغات
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#1E293B" }}>
              {totalReports}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>
              أنواع التبليغات
            </div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#1E293B" }}>
              {uniqueTypes}
            </div>
          </div>
          {section.code === SECTION_CODES.FACULTY && (
            <div>
              <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>
                عدد الأعضاء
              </div>
              <div style={{ fontSize: "24px", fontWeight: "700", color: "#1E293B" }}>
                {uniquePersons}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handlePrint}
          disabled={printing}
          style={{
            padding: "10px 20px",
            backgroundColor: "#8B5CF6",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "6px",
            cursor: printing ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "600",
            opacity: printing ? 0.6 : 1,
          }}
        >
          {printing ? "جاري الطباعة..." : "🖨️ طباعة الكشف"}
        </button>
      </div>

      {/* جدول التبليغات */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "12px",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
        }}
      >
        {reports.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
            لا توجد تبليغات لهذا الشهر
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  م
                </th>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  النوع
                </th>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  من قِبل
                </th>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  تاريخ الإدخال
                </th>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  الحالة
                </th>
                <th style={{ padding: "12px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, index) => {
                const details = reportDetails[report.id] || { fieldValues: [], attachments: [] };
                const statusColor = getStatusColor(report.status);
                
                return (
                  <React.Fragment key={report.id}>
                    <tr
                      style={{
                        borderBottom: "1px solid #E2E8F0",
                        ":hover": { backgroundColor: "#F8FAFC" },
                      }}
                    >
                      <td style={{ padding: "12px", fontSize: "14px", color: "#1E293B" }}>
                        {index + 1}
                      </td>
                      <td style={{ padding: "12px", fontSize: "14px", color: "#1E293B", fontWeight: "600" }}>
                        {report.type?.name_ar}
                      </td>
                      <td style={{ padding: "12px", fontSize: "14px", color: "#64748B" }}>
                        {report.created_by_name}
                      </td>
                      <td style={{ padding: "12px", fontSize: "14px", color: "#64748B" }}>
                        {formatDate(report.created_at)}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "600",
                            backgroundColor: statusColor.bg,
                            color: statusColor.color,
                          }}
                        >
                          {getStatusLabel(report.status)}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <button
                          onClick={() => toggleDetails(report.id)}
                          style={{
                            padding: "4px 8px",
                            backgroundColor: "#3B82F6",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px",
                          }}
                        >
                          {showDetails[report.id] ? "إخفاء" : "عرض"}
                        </button>
                      </td>
                    </tr>
                    
                    {showDetails[report.id] && (
                      <tr style={{ backgroundColor: "#F8FAFC" }}>
                        <td colSpan="6" style={{ padding: "16px" }}>
                          <div style={{ marginBottom: "16px" }}>
                            <h4 style={{ fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
                              بيانات إضافية
                            </h4>
                            {details.fieldValues.length === 0 ? (
                              <div style={{ fontSize: "13px", color: "#64748B" }}>
                                لا توجد بيانات إضافية
                              </div>
                            ) : (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                                {details.fieldValues.map((fv) => (
                                  <div key={fv.id}>
                                    <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>
                                      {fv.field_definition?.field_label_ar}
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#1E293B", fontWeight: "500" }}>
                                      {fv.field_value || fv.field_value_date || fv.field_value_number || (fv.field_value_boolean ? "نعم" : "لا") || "-"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          {report.decision_number && (
                            <div style={{ marginBottom: "12px" }}>
                              <strong>رقم القرار:</strong> {report.decision_number}
                            </div>
                          )}
                          
                          {report.decision_date && (
                            <div style={{ marginBottom: "12px" }}>
                              <strong>تاريخ القرار:</strong> {formatDate(report.decision_date)}
                            </div>
                          )}
                          
                          {report.effective_date && (
                            <div style={{ marginBottom: "12px" }}>
                              <strong>تاريخ السريان:</strong> {formatDate(report.effective_date)}
                            </div>
                          )}
                          
                          {report.notes && (
                            <div style={{ marginBottom: "12px" }}>
                              <strong>ملاحظات:</strong> {report.notes}
                            </div>
                          )}
                          
                          {details.attachments.length > 0 && (
                            <div>
                              <h4 style={{ fontSize: "14px", fontWeight: "600", color: "#1E293B", marginBottom: "8px" }}>
                                المرفقات
                              </h4>
                              {details.attachments.map((att) => (
                                <div key={att.id} style={{ fontSize: "13px", color: "#3B82F6", marginBottom: "4px" }}>
                                      📎 {att.original_filename}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* تنسيق الطباعة */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content, .print-content * {
            visibility: visible;
          }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            direction: rtl;
          }
          @page {
            size: A4;
            margin: 1cm;
          }
        }
      `}</style>
      
      {/* محتوى الطباعة */}
      <div className="print-content" style={{ display: "none" }}>
        <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
          <h1 style={{ textAlign: "center", fontSize: "20px", marginBottom: "10px" }}>
            كلية الهندسة - قسم الاستحقاقات
          </h1>
          <h2 style={{ textAlign: "center", fontSize: "18px", marginBottom: "20px" }}>
            كشف التبليغات الشهرية - {section.name_ar}
          </h2>
          <p style={{ textAlign: "center", fontSize: "14px", marginBottom: "20px" }}>
            شهر {month} / سنة {year}
          </p>
          
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr style={{ backgroundColor: "#F0F0F0" }}>
                <th style={{ border: "1px solid #000", padding: "8px", fontSize: "12px" }}>م</th>
                <th style={{ border: "1px solid #000", padding: "8px", fontSize: "12px" }}>النوع</th>
                <th style={{ border: "1px solid #000", padding: "8px", fontSize: "12px" }}>من قِبل</th>
                <th style={{ border: "1px solid #000", padding: "8px", fontSize: "12px" }}>تاريخ الإدخال</th>
                <th style={{ border: "1px solid #000", padding: "8px", fontSize: "12px" }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report, index) => {
                const details = reportDetails[report.id] || { fieldValues: [], attachments: [] };
                return (
                  <tr key={report.id}>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: "11px" }}>{index + 1}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: "11px" }}>{report.type?.name_ar}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: "11px" }}>{report.created_by_name}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: "11px" }}>{formatDate(report.created_at)}</td>
                    <td style={{ border: "1px solid #000", padding: "8px", fontSize: "11px" }}>{getStatusLabel(report.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "12px" }}>
            <div>إجمالي التبليغات: {totalReports}</div>
            <div>تاريخ الإعداد: {formatDate(new Date().toISOString())}</div>
          </div>
          
          <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: "8px", width: "200px", textAlign: "center" }}>
              التوقيع
            </div>
            <div style={{ borderTop: "1px solid #000", paddingTop: "8px", width: "200px", textAlign: "center" }}>
              الاعتماد
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

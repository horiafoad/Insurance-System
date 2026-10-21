// ============================================================================
// MonthlyReportsCreateForm.jsx
// ---------------------------------------------------------------------------
// نموذج إنشاء تبليغ جديد.
// يعرض الحقول الديناميكية بناءً على نوع التبليغ المختار.
// يسجل اسم الموظف تلقائيًا من currentUser.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import {
  fetchActiveTypes,
  fetchActiveFieldDefinitions,
  createReport,
  batchUpsertFieldValues,
  uploadReportAttachment,
  SECTION_CODES,
  FIELD_TYPES,
} from "../services/monthlyReportsService";
import { fetchMembers } from "../services/facultyArchiveService";

export default function MonthlyReportsCreateForm({ section, currentUser, onCancel, onSuccess }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // بيانات التبليغ الأساسية
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [decisionNumber, setDecisionNumber] = useState("");
  const [decisionDate, setDecisionDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [notes, setNotes] = useState("");
  
  // الربط بالشخص
  const [facultyMembers, setFacultyMembers] = useState([]);
  const [selectedFacultyMember, setSelectedFacultyMember] = useState("");
  const [searchFacultyQuery, setSearchFacultyQuery] = useState("");
  
  // المرفقات
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchActiveTypes(section.id);
      setTypes(data);
    } catch (error) {
      console.error("Error loading types:", error);
    } finally {
      setLoading(false);
    }
  }, [section.id]);

  const loadFieldDefinitions = useCallback(async (typeId) => {
    try {
      const data = await fetchActiveFieldDefinitions(typeId);
      setFieldDefinitions(data);
      // إعادة تعيين القيم
      setFieldValues({});
    } catch (error) {
      console.error("Error loading field definitions:", error);
    }
  }, []);

  const loadFacultyMembers = useCallback(async () => {
    try {
      const data = await fetchMembers();
      setFacultyMembers(data);
    } catch (error) {
      console.error("Error loading faculty members:", error);
    }
  }, []);

  useEffect(() => {
    loadTypes();
    if (section.code === SECTION_CODES.FACULTY) {
      loadFacultyMembers();
    }
  }, [loadTypes, loadFacultyMembers, section.code]);

  useEffect(() => {
    if (selectedType) {
      loadFieldDefinitions(selectedType.id);
    } else {
      setFieldDefinitions([]);
      setFieldValues({});
    }
  }, [selectedType, loadFieldDefinitions]);

  const handleFieldValueChange = (fieldId, value) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const handleAttachmentChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== "application/pdf") {
        alert("يجب أن يكون الملف بصيغة PDF");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("حجم الملف لا يجب أن يتجاوز 10 ميجابايت");
        return;
      }
      setAttachmentFile(file);
    }
  };

  const validateForm = () => {
    if (!selectedType) {
      alert("يرجى اختيار نوع التبليغ");
      return false;
    }

    // التحقق من الحقول الإلزامية
    for (const field of fieldDefinitions) {
      if (field.is_required && !fieldValues[field.id]) {
        alert(`حقل "${field.field_label_ar}" مطلوب`);
        return false;
      }
    }

    // التحقق من المتطلبات الخاصة بالنوع
    if (selectedType.requires_attachment && !attachmentFile) {
      alert("هذا النوع يتطلب مرفق");
      return false;
    }

    if (selectedType.requires_decision_no && !decisionNumber.trim()) {
      alert("هذا النوع يتطلب رقم قرار");
      return false;
    }

    if (selectedType.requires_decision_date && !decisionDate) {
      alert("هذا النوع يتطلب تاريخ قرار");
      return false;
    }

    if (selectedType.requires_effective_date && !effectiveDate) {
      alert("هذا النوع يتطلب تاريخ سريان");
      return false;
    }

    // التحقق من الربط بالشخص
    if (section.code === SECTION_CODES.FACULTY && !selectedFacultyMember) {
      alert("يرجى اختيار عضو هيئة التدريس");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      // إنشاء سجل التبليغ
      const reportData = {
        section_id: section.id,
        type_id: selectedType.id,
        report_month: reportMonth,
        report_year: reportYear,
        decision_number: decisionNumber || null,
        decision_date: decisionDate || null,
        effective_date: effectiveDate || null,
        status: "draft",
        // تسجيل الموظف تلقائيًا
        created_by_id: currentUser?.id || currentUser?.username || null,
        created_by_name: currentUser?.full_name || currentUser?.username || "مستخدم",
        notes: notes || null,
      };

      // الربط بالشخص
      if (section.code === SECTION_CODES.FACULTY && selectedFacultyMember) {
        reportData.faculty_member_id = selectedFacultyMember;
      }

      const report = await createReport(reportData);

      // حفظ قيم الحقول
      const valuesToUpsert = fieldDefinitions.map((field) => {
        const value = fieldValues[field.id];
        const fieldData = {
          report_id: report.id,
          field_id: field.id,
          field_snapshot: field,
        };

        if (field.field_type === FIELD_TYPES.DATE) {
          fieldData.field_value_date = value;
        } else if (field.field_type === FIELD_TYPES.NUMBER) {
          fieldData.field_value_number = parseFloat(value) || null;
        } else if (field.field_type === FIELD_TYPES.BOOLEAN) {
          fieldData.field_value_boolean = Boolean(value);
        } else if (field.field_type === FIELD_TYPES.SELECT) {
          fieldData.field_value = value;
        } else {
          fieldData.field_value = value;
        }

        return fieldData;
      });

      if (valuesToUpsert.length > 0) {
        await batchUpsertFieldValues(valuesToUpsert);
      }

      // رفع المرفق إن وجد
      if (attachmentFile) {
        setUploadingAttachment(true);
        await uploadReportAttachment(report.id, attachmentFile, {
          createdBy: currentUser?.full_name || currentUser?.username,
        });
      }

      alert("تم حفظ التبليغ بنجاح");
      onSuccess();
    } catch (error) {
      console.error("Error creating report:", error);
      alert("حدث خطأ أثناء حفظ التبليغ");
    } finally {
      setSubmitting(false);
      setUploadingAttachment(false);
    }
  };

  const filteredFacultyMembers = facultyMembers.filter((member) => {
    if (!searchFacultyQuery) return true;
    const query = searchFacultyQuery.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(query) ||
      member.member_code?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#64748B" }}>
        جاري التحميل...
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: "12px",
          padding: "24px",
          width: "90%",
          maxWidth: "700px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1E293B" }}>
            تبليغ جديد - {section.name_ar}
          </h2>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              backgroundColor: "#F1F5F9",
              color: "#475569",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ✕ إلغاء
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* اختيار النوع */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              نوع التبليغ *
            </label>
            <select
              value={selectedType?.id || ""}
              onChange={(e) => {
                const type = types.find((t) => t.id === e.target.value);
                setSelectedType(type || null);
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
              required
            >
              <option value="">اختر نوع التبليغ</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name_ar}
                </option>
              ))}
            </select>
          </div>

          {/* الشهر والسنة */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                الشهر *
              </label>
              <select
                value={reportMonth}
                onChange={(e) => setReportMonth(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                }}
                required
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                السنة *
              </label>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                }}
                required
              >
                {[2024, 2025, 2026, 2027, 2028].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* الربط بعضو هيئة التدريس */}
          {section.code === SECTION_CODES.FACULTY && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                عضو هيئة التدريس *
              </label>
              <input
                type="text"
                placeholder="ابحث بالاسم أو الرقم..."
                value={searchFacultyQuery}
                onChange={(e) => setSearchFacultyQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  marginBottom: "8px",
                }}
              />
              <select
                value={selectedFacultyMember}
                onChange={(e) => setSelectedFacultyMember(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                  maxHeight: "200px",
                }}
                required
              >
                <option value="">اختر العضو</option>
                {filteredFacultyMembers.slice(0, 50).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} - {member.member_code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* الحقول الديناميكية */}
          {selectedType && fieldDefinitions.length > 0 && (
            <div style={{ marginBottom: "20px", padding: "16px", backgroundColor: "#F8FAFC", borderRadius: "8px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B", marginBottom: "16px" }}>
                بيانات إضافية
              </h3>
              {fieldDefinitions.map((field) => (
                <div key={field.id} style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                    {field.field_label_ar}
                    {field.is_required && <span style={{ color: "#DC2626", marginRight: "4px" }}>*</span>}
                  </label>
                  {field.hint && (
                    <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "4px" }}>
                      {field.hint}
                    </div>
                  )}
                  
                  {field.field_type === FIELD_TYPES.TEXT && (
                    <input
                      type="text"
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    />
                  )}
                  
                  {field.field_type === FIELD_TYPES.TEXTAREA && (
                    <textarea
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                        minHeight: "80px",
                      }}
                      required={field.is_required}
                    />
                  )}
                  
                  {field.field_type === FIELD_TYPES.DATE && (
                    <input
                      type="date"
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    />
                  )}
                  
                  {field.field_type === FIELD_TYPES.NUMBER && (
                    <input
                      type="number"
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    />
                  )}
                  
                  {field.field_type === FIELD_TYPES.SELECT && (
                    <select
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    >
                      <option value="">اختر</option>
                      {field.options?.map((opt, idx) => (
                        <option key={idx} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {field.field_type === FIELD_TYPES.BOOLEAN && (
                    <select
                      value={fieldValues[field.id] || ""}
                      onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    >
                      <option value="">اختر</option>
                      <option value="true">نعم</option>
                      <option value="false">لا</option>
                    </select>
                  )}
                  
                  {field.field_type === FIELD_TYPES.FILE && (
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          handleFieldValueChange(field.id, file);
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #CBD5E1",
                        fontSize: "14px",
                      }}
                      required={field.is_required}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* بيانات القرار والسريان */}
          {selectedType && (
            <div style={{ marginBottom: "20px", padding: "16px", backgroundColor: "#F8FAFC", borderRadius: "8px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B", marginBottom: "16px" }}>
                بيانات القرار
              </h3>
              
              {selectedType.requires_decision_no && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                    رقم القرار *
                  </label>
                  <input
                    type="text"
                    value={decisionNumber}
                    onChange={(e) => setDecisionNumber(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #CBD5E1",
                      fontSize: "14px",
                    }}
                    required
                  />
                </div>
              )}
              
              {selectedType.requires_decision_date && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                    تاريخ القرار *
                  </label>
                  <input
                    type="date"
                    value={decisionDate}
                    onChange={(e) => setDecisionDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #CBD5E1",
                      fontSize: "14px",
                    }}
                    required
                  />
                </div>
              )}
              
              {selectedType.requires_effective_date && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                    تاريخ السريان *
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #CBD5E1",
                      fontSize: "14px",
                    }}
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* المرفق */}
          {selectedType?.requires_attachment && (
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                المرفق (PDF) *
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={handleAttachmentChange}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #CBD5E1",
                  fontSize: "14px",
                }}
                required
              />
              {attachmentFile && (
                <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                  {attachmentFile.name}
                </div>
              )}
            </div>
          )}

          {/* ملاحظات */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              ملاحظات
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                minHeight: "80px",
              }}
            />
          </div>

          {/* أزرار الإجراءات */}
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 20px",
                backgroundColor: "#F1F5F9",
                color: "#475569",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingAttachment}
              style={{
                padding: "10px 20px",
                backgroundColor: "#10B981",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                cursor: submitting || uploadingAttachment ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                opacity: submitting || uploadingAttachment ? 0.6 : 1,
              }}
            >
              {submitting ? "جاري الحفظ..." : uploadingAttachment ? "جاري رفع المرفق..." : "حفظ التبليغ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

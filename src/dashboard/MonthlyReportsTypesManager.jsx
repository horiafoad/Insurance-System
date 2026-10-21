// ============================================================================
// MonthlyReportsTypesManager.jsx
// ---------------------------------------------------------------------------
// شاشة إدارة أنواع التبليغات لقسم معين.
// تسمح بإضافة وتعديل وإيقاف أنواع التبليغات، وتعديل حقولها الديناميكية.
// ============================================================================

import { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import {
  fetchTypes,
  fetchTypeById,
  createType,
  updateType,
  deleteType,
  countReportsByType,
  fetchFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  FIELD_TYPES,
} from "../services/monthlyReportsService";

export default function MonthlyReportsTypesManager({ section, currentUser, onBack }) {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [fieldDefinitions, setFieldDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [typeCounts, setTypeCounts] = useState({});

  const loadTypes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTypes(section.id);
      setTypes(data);
      
      // تحميل عدد السجلات لكل نوع
      const counts = {};
      for (const type of data) {
        try {
          counts[type.id] = await countReportsByType(type.id);
        } catch {
          counts[type.id] = 0;
        }
      }
      setTypeCounts(counts);
    } catch (error) {
      console.error("Error loading types:", error);
    } finally {
      setLoading(false);
    }
  }, [section.id]);

  const loadFieldDefinitions = useCallback(async (typeId) => {
    try {
      const data = await fetchFieldDefinitions(typeId);
      setFieldDefinitions(data);
    } catch (error) {
      console.error("Error loading field definitions:", error);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  useEffect(() => {
    if (selectedType) {
      loadFieldDefinitions(selectedType.id);
    } else {
      setFieldDefinitions([]);
    }
  }, [selectedType, loadFieldDefinitions]);

  const handleCreateType = async (typeData) => {
    try {
      const newType = await createType({
        ...typeData,
        section_id: section.id,
      });
      await loadTypes();
      setShowTypeForm(false);
      setEditingType(null);
    } catch (error) {
      console.error("Error creating type:", error);
      alert("حدث خطأ أثناء إنشاء النوع");
    }
  };

  const handleUpdateType = async (typeId, updates) => {
    try {
      await updateType(typeId, updates);
      await loadTypes();
      if (selectedType?.id === typeId) {
        setSelectedType({ ...selectedType, ...updates });
      }
    } catch (error) {
      console.error("Error updating type:", error);
      alert("حدث خطأ أثناء تعديل النوع");
    }
  };

  const handleDeleteType = async (typeId) => {
    const count = typeCounts[typeId] || 0;
    if (count > 0) {
      alert(`لا يمكن حذف هذا النوع لأنه مرتبط بـ ${count} تبليغ. يمكنك إيقافه بدلاً من الحذف.`);
      return;
    }

    if (!confirm("هل أنت متأكد من حذف هذا النوع؟")) return;

    try {
      await deleteType(typeId);
      await loadTypes();
      if (selectedType?.id === typeId) {
        setSelectedType(null);
      }
    } catch (error) {
      console.error("Error deleting type:", error);
      alert("حدث خطأ أثناء حذف النوع");
    }
  };

  const handleCreateField = async (fieldData) => {
    if (!selectedType) return;
    try {
      await createFieldDefinition({
        ...fieldData,
        type_id: selectedType.id,
      });
      await loadFieldDefinitions(selectedType.id);
      setShowFieldForm(false);
      setEditingField(null);
    } catch (error) {
      console.error("Error creating field:", error);
      alert("حدث خطأ أثناء إنشاء الحقل");
    }
  };

  const handleUpdateField = async (fieldId, updates) => {
    try {
      await updateFieldDefinition(fieldId, updates);
      await loadFieldDefinitions(selectedType.id);
    } catch (error) {
      console.error("Error updating field:", error);
      alert("حدث خطأ أثناء تعديل الحقل");
    }
  };

  const handleDeleteField = async (fieldId) => {
    if (!confirm("هل أنت متأكد من حذف هذا الحقل؟")) return;
    try {
      await deleteFieldDefinition(fieldId);
      await loadFieldDefinitions(selectedType.id);
    } catch (error) {
      console.error("Error deleting field:", error);
      alert("حدث خطأ أثناء حذف الحقل");
    }
  };

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
          ← العودة
        </button>
        <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#1E293B", marginBottom: "8px" }}>
          ⚙️ إدارة أنواع التبليغات - {section.name_ar}
        </h1>
        <p style={{ fontSize: "15px", color: "#64748B" }}>
          إضافة وتعديل أنواع التبليغات وتخصيص حقولها
        </p>
      </div>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        {/* قائمة الأنواع */}
        <div style={{ flex: 1, minWidth: "300px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "#1E293B" }}>
              الأنواع ({types.length})
            </h2>
            <button
              onClick={() => {
                setEditingType(null);
                setShowTypeForm(true);
              }}
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
              ➕ نوع جديد
            </button>
          </div>

          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              overflow: "hidden",
            }}
          >
            {types.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#64748B" }}>
                لا توجد أنواع بعد
              </div>
            ) : (
              types.map((type) => (
                <div
                  key={type.id}
                  onClick={() => setSelectedType(type)}
                  style={{
                    padding: "16px",
                    borderBottom: "1px solid #E2E8F0",
                    cursor: "pointer",
                    backgroundColor: selectedType?.id === type.id ? "#F8FAFC" : "#FFFFFF",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedType?.id !== type.id) {
                      e.currentTarget.style.backgroundColor = "#F8FAFC";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedType?.id !== type.id) {
                      e.currentTarget.style.backgroundColor = "#FFFFFF";
                    }
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B", marginBottom: "4px" }}>
                        {type.name_ar}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748B" }}>
                        {type.description}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {!type.is_active && (
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            backgroundColor: "#FEE2E2",
                            color: "#DC2626",
                          }}
                        >
                          متوقف
                        </span>
                      )}
                      <span style={{ fontSize: "12px", color: "#64748B" }}>
                        {typeCounts[type.id] || 0} تبليغ
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* تفاصيل النوع والحقول */}
        {selectedType && (
          <div style={{ flex: 2, minWidth: "400px" }}>
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E2E8F0",
                padding: "24px",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1E293B", marginBottom: "8px" }}>
                    {selectedType.name_ar}
                  </h2>
                  <p style={{ fontSize: "14px", color: "#64748B", marginBottom: "16px" }}>
                    {selectedType.description}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setEditingType(selectedType);
                      setShowTypeForm(true);
                    }}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#3B82F6",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleUpdateType(selectedType.id, { is_active: !selectedType.is_active })}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: selectedType.is_active ? "#F59E0B" : "#10B981",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    {selectedType.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                  <button
                    onClick={() => handleDeleteType(selectedType.id)}
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "#DC2626",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    حذف
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px", color: "#64748B" }}>
                <div>
                  <strong>مرفق مطلوب:</strong> {selectedType.requires_attachment ? "نعم" : "لا"}
                </div>
                <div>
                  <strong>رقم قرار:</strong> {selectedType.requires_decision_no ? "نعم" : "لا"}
                </div>
                <div>
                  <strong>تاريخ قرار:</strong> {selectedType.requires_decision_date ? "نعم" : "لا"}
                </div>
                <div>
                  <strong>تاريخ سريان:</strong> {selectedType.requires_effective_date ? "نعم" : "لا"}
                </div>
              </div>
            </div>

            {/* الحقول */}
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E2E8F0",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#1E293B" }}>
                  الحقول ({fieldDefinitions.length})
                </h3>
                <button
                  onClick={() => {
                    setEditingField(null);
                    setShowFieldForm(true);
                  }}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#10B981",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  + حقل جديد
                </button>
              </div>

              {fieldDefinitions.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "#64748B" }}>
                  لا توجد حقول مخصصة لهذا النوع
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {fieldDefinitions.map((field) => (
                    <div
                      key={field.id}
                      style={{
                        padding: "12px",
                        backgroundColor: "#F8FAFC",
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: "600", color: "#1E293B", marginBottom: "4px" }}>
                            {field.field_label_ar}
                            {field.is_required && <span style={{ color: "#DC2626", marginRight: "4px" }}>*</span>}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748B" }}>
                            {field.field_type} • الترتيب: {field.sort_order}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {!field.is_active && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                backgroundColor: "#FEE2E2",
                                color: "#DC2626",
                              }}
                            >
                              متوقف
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setEditingField(field);
                              setShowFieldForm(true);
                            }}
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
                            تعديل
                          </button>
                          <button
                            onClick={() => handleUpdateField(field.id, { is_active: !field.is_active })}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: field.is_active ? "#F59E0B" : "#10B981",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            {field.is_active ? "إيقاف" : "تفعيل"}
                          </button>
                          <button
                            onClick={() => handleDeleteField(field.id)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#DC2626",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                      {field.description && (
                        <div style={{ fontSize: "12px", color: "#64748B", marginTop: "8px" }}>
                          {field.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* نموذج النوع */}
      {showTypeForm && (
        <TypeForm
          type={editingType}
          onSave={editingType ? (data) => handleUpdateType(editingType.id, data) : handleCreateType}
          onCancel={() => {
            setShowTypeForm(false);
            setEditingType(null);
          }}
        />
      )}

      {/* نموذج الحقل */}
      {showFieldForm && (
        <FieldForm
          field={editingField}
          onSave={editingField ? (data) => handleUpdateField(editingField.id, data) : handleCreateField}
          onCancel={() => {
            setShowFieldForm(false);
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// نموذج النوع
// ============================================================================

function TypeForm({ type, onSave, onCancel }) {
  const [formData, setFormData] = useState(
    type || {
      name: "",
      name_ar: "",
      description: "",
      sort_order: 0,
      requires_attachment: false,
      requires_decision_no: false,
      requires_decision_date: false,
      requires_effective_date: false,
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name_ar.trim()) {
      alert("الاسم بالعربية مطلوب");
      return;
    }
    onSave(formData);
  };

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
          maxWidth: "500px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1E293B", marginBottom: "16px" }}>
          {type ? "تعديل النوع" : "نوع جديد"}
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الاسم بالعربية *
            </label>
            <input
              type="text"
              value={formData.name_ar}
              onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
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

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الاسم بالإنجليزية
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الوصف
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الترتيب
            </label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#374151" }}>
              <input
                type="checkbox"
                checked={formData.requires_attachment}
                onChange={(e) => setFormData({ ...formData, requires_attachment: e.target.checked })}
              />
              يتطلب مرفق
            </label>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#374151" }}>
              <input
                type="checkbox"
                checked={formData.requires_decision_no}
                onChange={(e) => setFormData({ ...formData, requires_decision_no: e.target.checked })}
              />
              يتطلب رقم قرار
            </label>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#374151" }}>
              <input
                type="checkbox"
                checked={formData.requires_decision_date}
                onChange={(e) => setFormData({ ...formData, requires_decision_date: e.target.checked })}
              />
              يتطلب تاريخ قرار
            </label>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#374151" }}>
              <input
                type="checkbox"
                checked={formData.requires_effective_date}
                onChange={(e) => setFormData({ ...formData, requires_effective_date: e.target.checked })}
              />
              يتطلب تاريخ سريان
            </label>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
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
              إلغاء
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                backgroundColor: "#10B981",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// نموذج الحقل
// ============================================================================

function FieldForm({ field, onSave, onCancel }) {
  const [formData, setFormData] = useState(
    field || {
      field_label: "",
      field_label_ar: "",
      field_type: FIELD_TYPES.TEXT,
      is_required: false,
      sort_order: 0,
      description: "",
      hint: "",
      options: [],
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.field_label_ar.trim()) {
      alert("عنوان الحقل بالعربية مطلوب");
      return;
    }
    onSave(formData);
  };

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
          maxWidth: "500px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1E293B", marginBottom: "16px" }}>
          {field ? "تعديل الحقل" : "حقل جديد"}
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              عنوان الحقل بالعربية *
            </label>
            <input
              type="text"
              value={formData.field_label_ar}
              onChange={(e) => setFormData({ ...formData, field_label_ar: e.target.value })}
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

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              عنوان الحقل بالإنجليزية
            </label>
            <input
              type="text"
              value={formData.field_label}
              onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              نوع الحقل
            </label>
            <select
              value={formData.field_type}
              onChange={(e) => setFormData({ ...formData, field_type: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            >
              <option value={FIELD_TYPES.TEXT}>نص قصير</option>
              <option value={FIELD_TYPES.TEXTAREA}>نص طويل</option>
              <option value={FIELD_TYPES.DATE}>تاريخ</option>
              <option value={FIELD_TYPES.NUMBER}>رقم</option>
              <option value={FIELD_TYPES.SELECT}>قائمة اختيار</option>
              <option value={FIELD_TYPES.BOOLEAN}>نعم أو لا</option>
              <option value={FIELD_TYPES.FILE}>مرفق PDF</option>
            </select>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#374151" }}>
              <input
                type="checkbox"
                checked={formData.is_required}
                onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
              />
              إلزامي
            </label>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الترتيب
            </label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              الوصف
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
                minHeight: "60px",
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
              تلميح
            </label>
            <input
              type="text"
              value={formData.hint}
              onChange={(e) => setFormData({ ...formData, hint: e.target.value })}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #CBD5E1",
                fontSize: "14px",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
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
              إلغاء
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                backgroundColor: "#10B981",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              حفظ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

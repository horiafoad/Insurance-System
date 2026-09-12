import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { extractTemplateKeys } from "../utils/letterTemplateHelpers";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "10px 12px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
};

const emptyField = () => ({
  key: "",
  label: "",
  type: "text",
  placeholder: "",
});

const normalizeFields = (raw) => {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function LetterTemplatesManager({
  templates = [],
  onClose = () => {},
  onRefresh = () => {},
}) {
  const [view, setView] = useState("list"); // list | new | edit
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [routeDepartments, setRouteDepartments] = useState([]);
  const [routeSelectedId, setRouteSelectedId] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDepartments = async () => {
      const { data, error } = await supabase
        .from("letter_departments")
        .select("id,name,is_active")
        .eq("is_active", true)
        .order("name");

      if (mounted && !error) {
        setRouteDepartments(data || []);
      }
    };

    loadDepartments();

    return () => {
      mounted = false;
    };
  }, []);

  const buildFormFromTemplate = (template = null) => ({
    name: template?.name || "",
    letter_type: template?.letter_type || "",
    department_name: template?.department_name || "",
    title: template?.title || "",
    fixed_text: template?.fixed_text || "",
    fields: normalizeFields(template?.variable_fields),
    route: normalizeFields(template?.default_route).map((item) => ({
      id: item?.id ?? item?.department_id ?? "",
      name: item?.name || "",
    })),
    is_active: template ? Boolean(template.is_active) : true,
  });

  const openNew = () => {
    setErrorMsg("");
    setForm(buildFormFromTemplate(null));
    setView("new");
  };

  const openEdit = (template) => {
    setErrorMsg("");
    setForm(buildFormFromTemplate(template));
    setEditingId(template.id);
    setView("edit");
  };

  const backToList = () => {
    setView("list");
    setEditingId(null);
    setForm(null);
    setErrorMsg("");
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateFieldRow = (index, key, value) => {
    setForm((prev) => {
      const next = [...prev.fields];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, fields: next };
    });
  };

  const addFieldRow = () => {
    setForm((prev) => ({
      ...prev,
      fields: [...prev.fields, emptyField()],
    }));
  };

  const removeFieldRow = (index) => {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const addRouteStation = () => {
    if (!routeSelectedId) return;

    const department = routeDepartments.find(
      (item) => String(item.id) === String(routeSelectedId)
    );

    if (!department) return;

    setForm((prev) => ({
      ...prev,
      route: [...prev.route, { id: department.id, name: department.name }],
    }));
    setRouteSelectedId("");
  };

  const removeRouteStation = (index) => {
    setForm((prev) => ({
      ...prev,
      route: prev.route.filter((_, i) => i !== index),
    }));
  };

  const moveRouteStation = (index, direction) => {
    setForm((prev) => {
      const next = [...prev.route];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= next.length) return prev;

      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;

      return { ...prev, route: next };
    });
  };

  const validateForm = () => {
    if (!form.name.trim()) return "من فضلك اكتب اسم القالب";
    if (!form.letter_type.trim()) return "من فضلك اكتب نوع الخطاب";

    const seenKeys = new Set();
    for (const field of form.fields) {
      const key = (field.key || "").trim();

      if (!key) return "كل الحقول المتغيرة يجب أن تحتوي على مفتاح (Key)";
      if (seenKeys.has(key)) return "توجد مفاتيح مكررة في الحقول المتغيرة: " + key;
      if (!(field.label || "").trim())
        return "كل الحقول المتغيرة يجب أن تحتوي على اسم (Label)";

      seenKeys.add(key);
    }

    if (form.fields.length > 0 && !form.fixed_text.trim()) {
      return "اكتب النص الثابت للقالب مع وضع {{key}} للحقول المتغيرة";
    }

    return "";
  };

  const handleSave = async () => {
    setErrorMsg("");
    const validationError = validateForm();

    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        letter_type: form.letter_type.trim(),
        department_name: (form.department_name || "").trim(),
        title: (form.title || "").trim(),
        fixed_text: form.fixed_text || "",
        variable_fields: (Array.isArray(form.fields) ? form.fields : [])
          .filter((field) => (field.key || "").trim())
          .map((field) => ({
            key: field.key.trim(),
            label: (field.label || "").trim(),
            type: field.type === "textarea" ? "textarea" : "text",
            placeholder: (field.placeholder || "").trim(),
          })),
        is_active: Boolean(form.is_active),
        updated_at: new Date().toISOString(),
        default_route: (Array.isArray(form.route) ? form.route : [])
          .filter((item) => item && (item.name || "").trim())
          .map((item) => ({ id: item.id, name: (item.name || "").trim() })),
      };

      let result;

      if (view === "edit") {
        result = await supabase
          .from("letter_templates")
          .update(payload)
          .eq("id", editingId);
      } else {
        result = await supabase
          .from("letter_templates")
          .insert(payload);
      }

      if (result.error) {
        console.error("Template save error:", result.error);
        setErrorMsg(
          "تعذر حفظ القالب: " +
            (result.error.message || "خطأ غير معروف") +
            (result.error.code ? ` (رمز الخطأ: ${result.error.code})` : "")
        );
        return;
      }

      await onRefresh();
      backToList();
    } catch (e) {
      console.error("Template save exception:", e);
      setErrorMsg(
        "فشل الحفظ بسبب خطأ غير متوقع: " +
          (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (template) => {
    setBusyId(template.id);
    setErrorMsg("");

    const { error } = await supabase
      .from("letter_templates")
      .update({
        is_active: !template.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      console.error("Template toggle error:", error);
      alert("تعذر تحديث حالة القالب: " + error.message);
    } else {
      onRefresh();
    }

    setBusyId(null);
  };

  const handleDelete = async (template) => {
    const confirmed = window.confirm(
      "هل تريد تعطيل هذا القالب؟\n\n" +
        "سيختفي من قائمة القوالب عند إنشاء خطابات جديدة،\n" +
        "بينما تبقى الخطابات السابقة التي استخدمته كما هي تمامًا."
    );

    if (!confirmed) return;

    setBusyId(template.id);

    const { error } = await supabase
      .from("letter_templates")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      console.error("Template delete error:", error);
      alert("تعذر تعطيل القالب: " + error.message);
    } else {
      onRefresh();
    }

    setBusyId(null);
  };

  const renderFormFields = () => {
    const detectedKeys = view === "new" || view === "edit"
      ? extractTemplateKeys(form.fixed_text)
      : [];

    return (
      <>
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>اسم القالب *</label>
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="مثل: خطاب استحقاق مالي"
              style={inputStyle}
            />
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label style={labelStyle}>نوع الخطاب *</label>
            <input
              value={form.letter_type}
              onChange={(e) => setField("letter_type", e.target.value)}
              placeholder="مثل: استحقاق / معاملة / إفادة"
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>الجهة / القسم</label>
            <input
              value={form.department_name}
              onChange={(e) => setField("department_name", e.target.value)}
              placeholder="اسم الجهة أو القسم المعني بالقالب"
              style={inputStyle}
            />
          </div>

          <div style={{ flex: "1 1 200px" }}>
            <label style={labelStyle}>عنوان الخطاب (الموضوع)</label>
            <input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="يُستخدم كموضوع تلقائي للخطاب"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={labelStyle}>
            النص الثابت للقالب
          </label>
          <textarea
            rows={6}
            value={form.fixed_text}
            onChange={(e) => setField("fixed_text", e.target.value)}
            placeholder={"اكتب النص الثابت هنا...\nضع الحقول المتغيرة بين قوسين مزدوجين، مثل:\n{{employee_name}}"}
            style={{
              ...inputStyle,
              resize: "vertical",
              whiteSpace: "pre-wrap",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "8px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "900",
              color: "#0F172A",
            }}
          >
            🧩 الحقول المتغيرة
          </div>

          <button
            type="button"
            onClick={addFieldRow}
            style={{
              border: 0,
              borderRadius: 9,
              padding: "7px 13px",
              background: "#2563EB",
              color: "#fff",
              fontSize: "12px",
              fontWeight: "800",
              cursor: "pointer",
            }}
          >
            + إضافة حقل
          </button>
        </div>

        {form.fields.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "14px",
              borderRadius: "10px",
              border: "1px dashed #cbd5e1",
              background: "#fff",
              color: "#64748b",
              fontSize: "12px",
              marginBottom: "12px",
            }}
          >
            لا توجد حقول متغيرة. استخدم {"{{key}}"} داخل النص الثابت.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            {form.fields.map((field, index) => (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(130px,1fr))",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                  alignItems: "end",
                }}
              >
                <div>
                  <label style={labelStyle}>المفتاح {"{{key}}"}</label>
                  <input
                    value={field.key}
                    onChange={(e) =>
                      updateFieldRow(index, "key", e.target.value)
                    }
                    placeholder="employee_name"
                    style={{ ...inputStyle, fontFamily: "monospace", direction: "ltr" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>الاسم الظاهر</label>
                  <input
                    value={field.label}
                    onChange={(e) =>
                      updateFieldRow(index, "label", e.target.value)
                    }
                    placeholder="اسم الموظف"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>النوع</label>
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateFieldRow(index, "type", e.target.value)
                    }
                    style={inputStyle}
                  >
                    <option value="text">نص قصير</option>
                    <option value="textarea">نص طويل</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>نص إرشادي</label>
                  <input
                    value={field.placeholder}
                    onChange={(e) =>
                      updateFieldRow(index, "placeholder", e.target.value)
                    }
                    placeholder="مثال توضيحي"
                    style={inputStyle}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeFieldRow(index)}
                  style={{
                    border: "1px solid #FECACA",
                    borderRadius: 9,
                    padding: "8px 12px",
                    background: "#FFF",
                    color: "#DC2626",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer",
                  }}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        {detectedKeys.length > 0 && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px",
              borderRadius: "10px",
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              fontSize: "12px",
              color: "#1D4ED8",
            }}
          >
            <strong>مفاتيح مستخدمة في النص الثابت:</strong>{" "}
            {detectedKeys.map((key) => "{{" + key + "}}").join("، ")}
          </div>
        )}

        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: "900",
              color: "#0F172A",
            }}
          >
            🧭 مسار الخطاب الافتراضي
          </div>
          <div style={{ fontSize: "12px", color: "#64748B", marginTop: 3 }}>
            يُحمّل تلقائيًا عند إنشاء خطاب بهذا القالب، ويمكن تغييره وقت الإنشاء
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "stretch",
            marginBottom: "8px",
          }}
        >
          <select
            value={routeSelectedId}
            onChange={(e) => setRouteSelectedId(e.target.value)}
            disabled={routeDepartments.length === 0}
            style={inputStyle}
          >
            <option value="">
              {routeDepartments.length === 0
                ? "لا توجد إدارات متاحة"
                : "اختر الإدارة لإضافتها إلى المسار..."}
            </option>
            {routeDepartments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addRouteStation}
            disabled={!routeSelectedId}
            style={{
              border: 0,
              borderRadius: 9,
              padding: "0 16px",
              background: routeSelectedId ? "#2563EB" : "#CBD5E1",
              color: "#fff",
              fontSize: "12px",
              fontWeight: "800",
              cursor: routeSelectedId ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            + إضافة
          </button>
        </div>

        {form.route.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "14px",
              borderRadius: "10px",
              border: "1px dashed #cbd5e1",
              background: "#fff",
              color: "#64748b",
              fontSize: "12px",
              marginBottom: "12px",
            }}
          >
            لم تُضف محطات بعد — يُترك المسار فارغًا ويُحدد يدويًا عند إرسال الخطاب.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginBottom: "12px",
            }}
          >
            {form.route.map((station, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  background: "#fff",
                }}
              >
                <span
                  style={{
                    minWidth: "22px",
                    height: "22px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "999px",
                    background: "#EFF6FF",
                    color: "#1D4ED8",
                    fontSize: "11px",
                    fontWeight: "900",
                  }}
                >
                  {index + 1}
                </span>

                <span
                  style={{
                    flex: 1,
                    fontSize: "13px",
                    fontWeight: "800",
                    color: "#0F172A",
                  }}
                >
                  {station.name}
                </span>

                <button
                  type="button"
                  onClick={() => moveRouteStation(index, -1)}
                  disabled={index === 0}
                  style={routeActionStyle("#334155", "#CBD5E1")}
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={() => moveRouteStation(index, 1)}
                  disabled={index === form.route.length - 1}
                  style={routeActionStyle("#334155", "#CBD5E1")}
                >
                  ↓
                </button>

                <button
                  type="button"
                  onClick={() => removeRouteStation(index)}
                  style={routeActionStyle("#DC2626", "#FECACA")}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          style={{
            ...labelStyle,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            marginBottom: "14px",
          }}
        >
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setField("is_active", e.target.checked)}
          />
          القالب مفعّل (يظهر للموظفين عند إنشاء الخطابات)
        </label>

        {errorMsg && (
          <div
            style={{
              marginBottom: "12px",
              padding: "10px 12px",
              borderRadius: "10px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#B91C1C",
              fontSize: "12px",
              fontWeight: "700",
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={backToList}
            disabled={saving}
            style={{
              border: "1px solid #CBD5E1",
              borderRadius: 11,
              padding: "10px 18px",
              background: "#fff",
              color: "#475569",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              border: 0,
              borderRadius: 11,
              padding: "10px 22px",
              background: saving ? "#94A3B8" : "#0F172A",
              color: "#fff",
              fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving
              ? "جاري الحفظ..."
              : view === "edit"
              ? "💾 حفظ التعديلات"
              : "💾 إنشاء القالب"}
          </button>
        </div>
      </>
    );
  };

  const renderList = () => (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: "900",
            color: "#0F172A",
          }}
        >
          📄 القوالب ({templates.length})
        </div>

        <button
          type="button"
          onClick={openNew}
          style={{
            border: 0,
            borderRadius: 10,
            padding: "9px 15px",
            background: "#0F172A",
            color: "#fff",
            fontSize: "12px",
            fontWeight: "800",
            cursor: "pointer",
          }}
        >
          + قالب جديد
        </button>
      </div>

      {templates.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "26px 14px",
            borderRadius: "14px",
            border: "1px dashed #CBD5E1",
            background: "#fff",
            color: "#64748B",
            fontSize: "13px",
          }}
        >
          لا توجد قوالب بعد.
          <br />
          أنشئ أول قالب ليتسنى للموظفين استخدامه.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                padding: "13px 14px",
                borderRadius: "13px",
                background: "#fff",
                border: "1px solid #E2E8F0",
                boxShadow: "0 3px 10px rgba(15,23,42,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "900",
                    color: "#0F172A",
                  }}
                >
                  {template.name}
                </div>

                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "900",
                    background: template.is_active
                      ? "#DCFCE7"
                      : "#F1F5F9",
                    color: template.is_active
                      ? "#15803D"
                      : "#64748B",
                  }}
                >
                  {template.is_active ? "مفعّل" : "معطّل"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px 12px",
                  fontSize: "12px",
                  color: "#64748B",
                  marginBottom: "10px",
                }}
              >
                <span>
                  <strong style={{ color: "#334155" }}>
                    النوع:
                  </strong>{" "}
                  {template.letter_type || "—"}
                </span>

                <span>
                  <strong style={{ color: "#334155" }}>
                    الجهة:
                  </strong>{" "}
                  {template.department_name || "—"}
                </span>

                <span>
                  <strong style={{ color: "#334155" }}>
                    الحقول:
                  </strong>{" "}
                  {normalizeFields(template.variable_fields).length}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => openEdit(template)}
                  style={actionButtonStyle("#1D4ED8", "#BFDBFE", "#EFF6FF")}
                >
                  ✏️ تعديل
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleActive(template)}
                  disabled={busyId === template.id}
                  style={actionButtonStyle(
                    template.is_active ? "#6D28D9" : "#15803D",
                    "#DDD6FE",
                    "#F5F3FF"
                  )}
                >
                  {template.is_active ? "⏸ تعطيل" : "▶ تفعيل"}
                </button>

                {template.is_active && (
                  <button
                    type="button"
                    onClick={() => handleDelete(template)}
                    disabled={busyId === template.id}
                    style={actionButtonStyle("#B91C1C", "#FECACA", "#FFF")}
                  >
                    🗑️ حذف
                  </button>
                )}

                {busyId === template.id && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#64748B",
                      alignSelf: "center",
                    }}
                  >
                    جاري التنفيذ...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.55)",
          zIndex: 99990,
        }}
      />

      <div
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          right: 0,
          width: "min(560px,100vw)",
          boxSizing: "border-box",
          background: "#F8FAFC",
          zIndex: 99991,
          overflowY: "auto",
          padding: "18px",
          direction: "rtl",
          borderLeft: "1px solid #E2E8F0",
          boxShadow: "-14px 0 45px rgba(15,23,42,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            marginBottom: "18px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "19px",
                fontWeight: "900",
                color: "#0F172A",
              }}
            >
              📄 إدارة قوالب الخطابات
            </div>

            <div
              style={{
                fontSize: "12px",
                color: "#64748B",
                marginTop: "3px",
              }}
            >
              إنشاء وتعديل قوالب الخطابات (للأدمن فقط) — التعديل لا يؤثر على الخطابات السابقة
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              width: "38px",
              height: "38px",
              minWidth: "38px",
              borderRadius: "50%",
              background: "#F1F5F9",
              color: "#334155",
              fontSize: "18px",
              fontWeight: "900",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {view === "list" ? renderList() : renderFormFields()}
      </div>
    </>
  );
}

function actionButtonStyle(color, borderColor, background) {
  return {
    border: `1px solid ${borderColor}`,
    borderRadius: 9,
    padding: "6px 12px",
    background,
    color,
    fontSize: "11px",
    fontWeight: "800",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function routeActionStyle(color, borderColor) {
  return {
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    padding: "4px 10px",
    background: "#fff",
    color,
    fontSize: "13px",
    fontWeight: "900",
    cursor: "pointer",
    lineHeight: 1,
  };
}
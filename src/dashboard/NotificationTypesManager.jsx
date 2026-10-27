import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { getSectionConfig, typeFields } from "./notificationsConfig";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13.5,
  fontFamily: "inherit",
  background: "#fff",
  color: "#0F2942",
};

const labelStyle = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 6,
};

const smallButtonStyle = {
  border: "1px solid #CBD5E1",
  background: "#fff",
  color: "#334155",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

function emptyField() {
  return {
    key: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    label: "",
    type: "text",
    required: false,
    options: [],
  };
}

/* خيارات القائمة قد تكون مخزّنة كمصفوفة أو كنص مفصول بفواصل
   (توافق مع الأنواع القديمة)، فنوحّدها دائمًا إلى مصفوفة. */
function fieldOptions(field) {
  const raw = field?.options;
  if (Array.isArray(raw)) return raw.map((option) => String(option ?? ""));
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
  }
  return [];
}

export default function NotificationTypesManager({
  section,
  types,
  onRefresh,
  canManage,
}) {
  const cfg = getSectionConfig(section);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    is_active: true,
    sort_order: 0,
    extra_fields: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...(types || [])].sort((a, b) => {
      const order = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      if (order !== 0) return order;
      return String(a.name || "").localeCompare(String(b.name || ""), "ar");
    });
    if (!q) return list;
    return list.filter((type) =>
      [type.name, type.description, type.code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [types, search]);

  const openAdd = () => {
    const maxOrder = Math.max(0, ...(types || []).map((type) => Number(type.sort_order) || 0));
    setEditingType(null);
    setForm({
      name: "",
      description: "",
      is_active: true,
      sort_order: maxOrder + 10,
      extra_fields: [],
    });
    setError("");
    setShowForm(true);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setForm({
      name: type.name || "",
      description: type.description || "",
      is_active: type.is_active !== false,
      sort_order: Number(type.sort_order) || 0,
      extra_fields: typeFields(type).map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: fieldOptions(field),
        calc: field.calc || "",
      })),
    });
    setError("");
    setShowForm(true);
  };

  const updateField = (index, patch) => {
    setForm((current) => ({
      ...current,
      extra_fields: current.extra_fields.map((field, i) =>
        i === index ? { ...field, ...patch } : field
      ),
    }));
  };

  /* إدارة خيارات القائمة المنسدلة: إضافة / تعديل / حذف خيار. */
  const updateOption = (fieldIndex, optionIndex, value) => {
    setForm((current) => ({
      ...current,
      extra_fields: current.extra_fields.map((field, i) => {
        if (i !== fieldIndex) return field;
        const options = fieldOptions(field).map((option, oi) =>
          oi === optionIndex ? value : option
        );
        return { ...field, options };
      }),
    }));
  };

  const addOption = (fieldIndex) => {
    setForm((current) => ({
      ...current,
      extra_fields: current.extra_fields.map((field, i) =>
        i === fieldIndex
          ? { ...field, options: [...fieldOptions(field), ""] }
          : field
      ),
    }));
  };

  const removeOption = (fieldIndex, optionIndex) => {
    setForm((current) => ({
      ...current,
      extra_fields: current.extra_fields.map((field, i) =>
        i === fieldIndex
          ? {
              ...field,
              options: fieldOptions(field).filter((_, oi) => oi !== optionIndex),
            }
          : field
      ),
    }));
  };

  const addField = () => {
    setForm((current) => ({
      ...current,
      extra_fields: [...current.extra_fields, emptyField()],
    }));
  };

  const removeField = (index) => {
    setForm((current) => ({
      ...current,
      extra_fields: current.extra_fields.filter((_, i) => i !== index),
    }));
  };

  const moveField = (index, direction) => {
    setForm((current) => {
      const next = [...current.extra_fields];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, extra_fields: next };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("اسم النوع مطلوب.");
      return;
    }
    const labels = form.extra_fields.map((field) => field.label.trim());
    if (labels.some((label) => !label)) {
      setError("كل حقل يجب أن يحمل اسمًا.");
      return;
    }
    const keys = form.extra_fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      setError("توجد حقول بمفاتيح مكررة. أعد إضافة الحقل.");
      return;
    }
    const emptySelect = form.extra_fields.find(
      (field) =>
        field.type === "select" &&
        fieldOptions(field).map((option) => option.trim()).filter(Boolean).length === 0
    );
    if (emptySelect) {
      setError(`أضف خيارًا واحدًا على الأقل للحقل «${emptySelect.label.trim() || "القائمة"}».`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        section,
        name: form.name.trim(),
        description: form.description.trim() || null,
        is_active: Boolean(form.is_active),
        sort_order: Number(form.sort_order) || 0,
        extra_fields: form.extra_fields.map((field) => {
          /* ننظّف الخيارات ونحذف المكرر مع الحفاظ على الترتيب. */
          const options =
            field.type === "select"
              ? [
                  ...new Set(
                    fieldOptions(field)
                      .map((option) => option.trim())
                      .filter(Boolean)
                  ),
                ]
              : [];
          return {
            key: field.key,
            label: field.label.trim(),
            type: field.type || "text",
            required: Boolean(field.required),
            options,
            ...(field.calc ? { calc: field.calc } : {}),
          };
        }),
        updated_at: new Date().toISOString(),
      };

      if (editingType) {
        const { error: updateError } = await supabase
          .from("notification_types")
          .update(payload)
          .eq("id", editingType.id);
        if (updateError) throw updateError;
      } else {
        const code = `custom_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const { error: insertError } = await supabase
          .from("notification_types")
          .insert({ ...payload, code });
        if (insertError) throw insertError;
      }

      setShowForm(false);
      await onRefresh();
    } catch (saveError) {
      console.error("خطأ في حفظ نوع التبليغ:", saveError);
      setError(saveError.message || "تعذر حفظ النوع.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (type) => {
    if (type.is_active) {
      const confirmed = window.confirm(
        `إيقاف نوع «${type.name}»؟\n\nلن يظهر في التبليغات الجديدة، ولن تتأثر التبليغات القديمة أو بياناتها التاريخية.`
      );
      if (!confirmed) return;
    }

    try {
      const { error: updateError } = await supabase
        .from("notification_types")
        .update({ is_active: !type.is_active, updated_at: new Date().toISOString() })
        .eq("id", type.id);
      if (updateError) throw updateError;
      await onRefresh();
    } catch (updateError) {
      console.error("خطأ في تغيير حالة النوع:", updateError);
      setError(updateError.message || "تعذر تغيير حالة النوع.");
    }
  };

  const moveType = async (type, direction) => {
    const ordered = [...filtered];
    const index = ordered.findIndex((item) => item.id === type.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const target = ordered[targetIndex];
    const typeOrder = Number(type.sort_order) || 0;
    const targetOrder = Number(target.sort_order) || 0;

    let nextTypeOrder = targetOrder;
    let nextTargetOrder = typeOrder;
    if (nextTypeOrder === nextTargetOrder) {
      const base = Math.min(index, targetIndex) * 10;
      nextTypeOrder = base + (index < targetIndex ? 10 : 0);
      nextTargetOrder = base + (index < targetIndex ? 0 : 10);
    }

    try {
      const { error: firstError } = await supabase
        .from("notification_types")
        .update({ sort_order: nextTypeOrder, updated_at: new Date().toISOString() })
        .eq("id", type.id);
      if (firstError) throw firstError;

      const { error: secondError } = await supabase
        .from("notification_types")
        .update({ sort_order: nextTargetOrder, updated_at: new Date().toISOString() })
        .eq("id", target.id);
      if (secondError) throw secondError;

      await onRefresh();
    } catch (moveError) {
      console.error("خطأ في ترتيب الأنواع:", moveError);
      setError(moveError.message || "تعذر ترتيب الأنواع.");
    }
  };

  return (
    <div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #E7EBF0",
          borderRadius: 14,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#0F2942" }}>
              🧩 إدارة أنواع {cfg.title}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.8 }}>
              أضف نوعًا، عدّل الاسم والوصف والحقول، فعّله أو أوقفه، ورتّب الأنواع. إيقاف النوع يمنعه من التبليغات الجديدة فقط.
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={openAdd}
              style={{
                border: 0,
                background: cfg.accent,
                color: "#fff",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ＋ إضافة نوع جديد
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="🔎 ابحث باسم النوع أو الوصف..."
            style={{ ...inputStyle, flex: "1 1 260px" }}
          />
          <div style={{ fontSize: 12.5, color: "#64748B", alignSelf: "center" }}>
            عدد الأنواع: {filtered.length} — النشط: {filtered.filter((type) => type.is_active).length}
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              borderRadius: 9,
              padding: "9px 12px",
              fontSize: 12.5,
            }}
          >
            ⚠️ {error}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #CBD5E1",
              borderRadius: 14,
              padding: 40,
              textAlign: "center",
              color: "#94A3B8",
              fontSize: 13.5,
            }}
          >
            لا توجد أنواع مطابقة. {canManage ? "اضغط «إضافة نوع جديد» للبدء." : ""}
          </div>
        ) : (
          filtered.map((type, index) => (
            <div
              key={type.id}
              style={{
                background: "#fff",
                border: "1px solid #E7EBF0",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
                opacity: type.is_active ? 1 : 0.72,
              }}
            >
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#0F2942" }}>{type.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: 999,
                      padding: "3px 9px",
                      background: type.is_active ? "#D1FAE5" : "#F1F5F9",
                      color: type.is_active ? "#047857" : "#64748B",
                    }}
                  >
                    {type.is_active ? "نشط" : "موقوف"}
                  </span>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>الترتيب: {type.sort_order}</span>
                </div>
                {type.description && (
                  <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 5, lineHeight: 1.8 }}>
                    {type.description}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6 }}>
                  الحقول: {typeFields(type).length > 0 ? typeFields(type).map((field) => field.label).join(" • ") : "بدون حقول إضافية"}
                </div>
              </div>

              {canManage && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => moveType(type, -1)} disabled={index === 0} style={{ ...smallButtonStyle, opacity: index === 0 ? 0.4 : 1 }}>
                    ▲
                  </button>
                  <button type="button" onClick={() => moveType(type, 1)} disabled={index === filtered.length - 1} style={{ ...smallButtonStyle, opacity: index === filtered.length - 1 ? 0.4 : 1 }}>
                    ▼
                  </button>
                  <button type="button" onClick={() => toggleActive(type)} style={smallButtonStyle}>
                    {type.is_active ? "⏸️ إيقاف" : "▶️ تفعيل"}
                  </button>
                  <button type="button" onClick={() => openEdit(type)} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>
                    ✏️ تعديل
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div
          dir="rtl"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            zIndex: 3200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              width: "min(860px, 100%)",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                background: cfg.accentSoft,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 900, color: "#0F2942" }}>
                {editingType ? `تعديل نوع: ${editingType.name}` : "إضافة نوع تبليغ جديد"}
              </div>
              <button type="button" onClick={() => setShowForm(false)} style={{ ...smallButtonStyle, color: "#B91C1C" }}>
                ✕ إغلاق
              </button>
            </div>

            <div style={{ padding: 18, overflowY: "auto" }}>
              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>اسم النوع *</label>
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>الترتيب</label>
                  <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>الوصف</label>
                  <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "#334155" }}>
                    <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} style={{ transform: "scale(1.2)" }} />
                    النوع نشط ومتاح للتبليغات الجديدة
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 18, borderTop: "1px solid #E2E8F0", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942" }}>حقول النوع</div>
                    <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3 }}>
                      الحقول تظهر في نموذج التبليغ حسب هذا النوع. إزالة حقل من التعريف لا تحذف قيمه من التبليغات القديمة.
                    </div>
                  </div>
                  <button type="button" onClick={addField} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>
                    ＋ إضافة حقل
                  </button>
                </div>

                {form.extra_fields.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "#94A3B8", padding: "12px 0" }}>لا توجد حقول. أضف حقلًا مناسبًا لهذا النوع عند الحاجة.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {form.extra_fields.map((field, index) => (
                      <div
                        key={field.key}
                        style={{
                          border: "1px solid #E2E8F0",
                          borderRadius: 10,
                          padding: 10,
                          background: "#F8FAFC",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: 8,
                          alignItems: "end",
                        }}
                      >
                        <div>
                          <label style={labelStyle}>اسم الحقل</label>
                          <input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>النوع</label>
                          <select value={field.type} onChange={(event) => updateField(index, { type: event.target.value })} style={inputStyle}>
                            <option value="text">نص</option>
                            <option value="textarea">نص طويل</option>
                            <option value="number">رقم</option>
                            <option value="date">تاريخ</option>
                            <option value="select">قائمة اختيار</option>
                            <option value="checkbox">نعم / لا</option>
                          </select>
                        </div>
                        {field.type === "select" && (
                          <div
                            style={{
                              gridColumn: "1 / -1",
                              background: "#fff",
                              border: "1px dashed #CBD5E1",
                              borderRadius: 10,
                              padding: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <div style={{ ...labelStyle, marginBottom: 2 }}>
                                  خيارات القائمة المنسدلة
                                </div>
                                <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.7 }}>
                                  كل خيار تكتبه هنا سيظهر للمستخدم في القائمة المنسدلة داخل نموذج التبليغ.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => addOption(index)}
                                style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}
                              >
                                ＋ إضافة خيار
                              </button>
                            </div>

                            {fieldOptions(field).length === 0 ? (
                              <div style={{ fontSize: 12, color: "#B45309", fontWeight: 800 }}>
                                لا توجد خيارات بعد — أضف خيارًا واحدًا على الأقل.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {fieldOptions(field).map((option, optionIndex) => (
                                  <div
                                    key={optionIndex}
                                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 11.5,
                                        color: "#94A3B8",
                                        minWidth: 18,
                                        textAlign: "center",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {optionIndex + 1}
                                    </span>
                                    <input
                                      value={option}
                                      onChange={(event) =>
                                        updateOption(index, optionIndex, event.target.value)
                                      }
                                      placeholder="اكتب الخيار..."
                                      style={{ ...inputStyle, padding: "8px 10px" }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeOption(index, optionIndex)}
                                      title="حذف الخيار"
                                      style={{ ...smallButtonStyle, color: "#B91C1C", padding: "6px 9px" }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#334155" }}>
                            <input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />
                            مطلوب
                          </label>
                          <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} style={{ ...smallButtonStyle, padding: "4px 7px", opacity: index === 0 ? 0.4 : 1 }}>▲</button>
                          <button type="button" onClick={() => moveField(index, 1)} disabled={index === form.extra_fields.length - 1} style={{ ...smallButtonStyle, padding: "4px 7px", opacity: index === form.extra_fields.length - 1 ? 0.4 : 1 }}>▼</button>
                          <button type="button" onClick={() => removeField(index)} style={{ ...smallButtonStyle, color: "#B91C1C", padding: "4px 7px" }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 18px", borderTop: "1px solid #E2E8F0", background: "#F8FAFC" }}>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} style={smallButtonStyle}>إلغاء</button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  border: 0,
                  background: saving ? "#94A3B8" : cfg.accent,
                  color: "#fff",
                  borderRadius: 9,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "⏳ جاري الحفظ..." : "💾 حفظ النوع"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

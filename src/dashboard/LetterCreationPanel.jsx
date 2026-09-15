import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  extractTemplateKeys,
  replaceTemplateVariables,
  resolveNextLetterNumber,
} from "../utils/letterTemplateHelpers";

const creationToday = new Date().toISOString().slice(0, 10);

const creationStatusConfig = {
  in_progress: {
    label: "جاري التنفيذ",
    icon: "🔵",
    color: "#2563eb",
    background: "#eff6ff",
    border: "#bfdbfe",
  },
  completed: {
    label: "تم التنفيذ",
    icon: "🟢",
    color: "#16a34a",
    background: "#f0fdf4",
    border: "#bbf7d0",
  },
  waiting: {
    label: "في الانتظار",
    icon: "⚪",
    color: "#64748b",
    background: "#f8fafc",
    border: "#e2e8f0",
  },
};

function CreationPanelField({ label, children }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 7,
          color: "#334155",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function creationPanelRouteActionStyle(enabled) {
  return {
    width: 32,
    height: 32,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: enabled ? "#f8fafc" : "#f1f5f9",
    color: enabled ? "#334155" : "#cbd5e1",
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

const creationPanelInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "11px 13px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

const creationPanelNewButtonStyle = {
  width: 44,
  minWidth: 44,
  border: 0,
  borderRadius: 11,
  background: "#0f172a",
  color: "#fff",
  fontSize: 24,
  fontWeight: 700,
  cursor: "pointer",
};

export default function LetterCreationPanel() {
  const [senders, setSenders] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [letterDate, setLetterDate] = useState(creationToday);
  const [senderId, setSenderId] = useState("");
  const [senderSearch, setSenderSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [qrCodeId, setQrCodeId] = useState("");

  const [templateId, setTemplateId] = useState("");
  const [variableValues, setVariableValues] = useState({});

  const [route, setRoute] = useState([]);

  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [routeSearch, setRouteSearch] = useState("");
  const [expandedSectorIds, setExpandedSectorIds] = useState([]);
  const [editingIndex, setEditingIndex] = useState(null);
  const routePickerRef = useRef(null);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [showNewSender, setShowNewSender] = useState(false);
  const [newSenderName, setNewSenderName] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingLetter, setSavingLetter] = useState(false);
  const [savingSender, setSavingSender] = useState(false);

  const templatesLoadedRef = useRef(false);

  const loadData = async () => {
    setLoading(true);

    const [sendersResult, qrResult, departmentsResult, templatesResult, sectorsResult] =
      await Promise.all([
        supabase
          .from("letter_senders")
          .select("id,name,is_active")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("archive_qr_codes")
          .select("id,code,status,letter_id")
          .eq("status", "available")
          .is("letter_id", null)
          .order("id"),

supabase
          .from("letter_departments")
          .select("id,name,is_active,sector_id")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("letter_templates")
          .select("id,name,title,letter_type,department_name,fixed_text,variable_fields,default_route")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("letter_sectors")
          .select("id,name,is_active")
          .eq("is_active", true)
          .order("name"),
      ]);

    if (!sendersResult.error) {
      setSenders(sendersResult.data || []);
    }

    if (!qrResult.error) {
      const available = qrResult.data || [];
      setQrCodes(available);

      if (available.length > 0) {
        setQrCodeId(String(available[0].id));
      }
    }

    if (!departmentsResult.error) {
      setDepartments(departmentsResult.data || []);
    } else {
      // عمود sector_id غير مفعّل بعد (لم يُشغّل سكربت القطاعات)؟
      // حمّل الإدارات بدون القطاعات حتى لا يتعطل إنشاء الخطابات.
      const fallback = await supabase
        .from("letter_departments")
        .select("id,name,is_active")
        .eq("is_active", true)
        .order("name");

      if (!fallback.error) {
        setDepartments(fallback.data || []);
        console.warn(
          "عمود sector_id غير موجود — تُحمَّل الإدارات بدون قطاعات:",
          departmentsResult.error
        );
      } else {
        console.error("تعذر تحميل الإدارات:", fallback.error);
      }
    }

    if (!sectorsResult.error) {
      setSectors(sectorsResult.data || []);
    } else if (sectorsResult.error?.code !== "42P01") {
      console.warn("تعذر تحميل القطاعات:", sectorsResult.error);
    }

    // القوالب لم تُهاجر بعد؟ نكمل عمل النظام القديم بالكامل
    if (!templatesResult.error) {
      setTemplates(templatesResult.data || []);
      templatesLoadedRef.current = true;
    } else if (!templatesLoadedRef.current) {
      console.warn("تعذر تحميل القوالب (قد لا يزال الجدول غير مفعّل):", templatesResult.error);
    }

    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  useEffect(() => {
    if (!routePickerOpen) return;
    const onClickOutside = (e) => {
      if (
        routePickerRef.current !== null &&
        !routePickerRef.current.contains(e.target)
      ) {
        setRoutePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [routePickerOpen]);

  const filteredSenders = useMemo(() => {
    const term = senderSearch.trim().toLowerCase();
    if (!term) return senders;
    return senders.filter((sender) =>
      sender.name.toLowerCase().includes(term)
    );
  }, [senders, senderSearch]);

  const selectedSender = senders.find(
    (sender) => String(sender.id) === String(senderId)
  );

  const selectedTemplate = templates.find(
    (template) => String(template.id) === String(templateId)
  );

  // الحقول المتغيرة تُستخرج تلقائيًا من النص الثابت {{...}}،
  // مع الحفاظ على الأسماء/الأنواع المُعرّفة في "الاسم الظاهر" عند الحاجة.
  const variableFields = useMemo(() => {
    if (!selectedTemplate) return [];

    let declared = [];
    const raw = selectedTemplate.variable_fields || [];
    if (Array.isArray(raw)) {
      declared = raw;
    } else {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) declared = parsed;
      } catch {
        declared = [];
      }
    }

    const byKey = new Map();
    declared.forEach((field) => {
      const key = String(field?.key || "").trim();
      if (key) byKey.set(key, field);
    });

    const keys = extractTemplateKeys(selectedTemplate.fixed_text || "");
    return keys.map((key) => {
      const declaredField = byKey.get(key) || {};
      const prettyLabel = String(key).replace(/[_-]+/g, " ").trim();
      return {
        key: String(key),
        label: declaredField.label || prettyLabel,
        type: declaredField.type === "textarea" ? "textarea" : "text",
        placeholder: declaredField.placeholder || "",
      };
    });
  }, [selectedTemplate]);

  const finalPreview = useMemo(() => {
    if (!selectedTemplate) return "";
    return replaceTemplateVariables(selectedTemplate.fixed_text, variableValues);
  }, [selectedTemplate, variableValues]);

  const normalizeRoute = (raw) => {
    if (Array.isArray(raw)) {
      return raw
        .filter((item) => item && (item.name || "").trim())
        .map((item) => ({
          id: item.id ?? item.department_id ?? "",
          name: (item.name || "").trim(),
        }));
    }
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? normalizeRoute(parsed) : [];
    } catch {
      return [];
    }
  };

  const handleTemplateChange = (value) => {
    setTemplateId(value);
    setVariableValues({});

    const template = templates.find(
      (item) => String(item.id) === String(value)
    );

    if (template) {
      setSubject(template.title || template.name || "");
      setRoute(normalizeRoute(template.default_route));
    } else {
      setSubject("");
      setRoute([]);
    }
  };

  // --- helpers for the new grouped route picker ---

  function sectorIconFor(name = "") {
    const n = name.trim();
    if (n.includes("عميد")) return "👨‍💼";
    if (n.includes("أمين")) return "🏢";
    if (n.includes("خدمة المجتمع")) return "🌱";
    if (n.includes("التعليم")) return "🎓";
    if (n.includes("الدراسات")) return "📚";
    return "🏛️";
  }

  const getDepartmentSector = (department) => {
    if (!department.sector_id) return null;
    return sectors.find((s) => String(s.id) === String(department.sector_id)) || null;
  };

  const getDepartmentSectorById = (departmentId) => {
    const dep = departments.find((d) => String(d.id) === String(departmentId));
    return dep ? getDepartmentSector(dep) : null;
  };

  const routePickerGroups = useMemo(() => {
    const term = routeSearch.trim().toLowerCase();
    const grouped = [];

    sectors.forEach((sector) => {
      const items = departments.filter(
        (department) =>
          department.sector_id != null &&
          String(department.sector_id) === String(sector.id)
      );

      const matched = term
        ? items.filter(
            (d) =>
              d.name.toLowerCase().includes(term) ||
              sector.name.toLowerCase().includes(term)
          )
        : items;

      if (!term || matched.length > 0) {
        grouped.push({
          type: "sector",
          id: sector.id,
          name: sector.name,
          icon: sectorIconFor(sector.name),
          items: matched,
        });
      }
    });

    const general = departments.filter(
      (d) => d.sector_id == null
    );

    const matchedGeneral = term
      ? general.filter((d) => d.name.toLowerCase().includes(term))
      : general;

    if (matchedGeneral.length > 0) {
      grouped.push({
        type: "general",
        id: "__general__",
        name: "إدارات عامة (بدون قطاع)",
        icon: "🏛️",
        items: matchedGeneral,
      });
    }

    return grouped;
  }, [departments, sectors, routeSearch]);

  const isRouteStationAdded = (departmentId) =>
    route.some((item) => String(item.id) === String(departmentId));

  const handleToggleSector = (sectorId) => {
    setExpandedSectorIds((prev) => {
      const set = new Set(prev);
      if (set.has(sectorId)) set.delete(sectorId);
      else set.add(sectorId);
      return Array.from(set);
    });
  };

  const handleAddDepartmentToRoute = (department) => {
    if (editingIndex != null) {
      setRoute((prev) => {
        const next = [...prev];
        next[editingIndex] = {
          id: department.id,
          name: department.name,
        };
        return next;
      });
      setEditingIndex(null);
      setRoutePickerOpen(false);
      setRouteSearch("");
      return;
    }

    setRoute((prev) => [
      ...prev,
      { id: department.id, name: department.name },
    ]);
    setRouteSearch("");
  };

  const handleAddSectorDepartments = (sectorId) => {
    const sectorDepartments = departments.filter(
      (d) =>
        d.sector_id != null &&
        String(d.sector_id) === String(sectorId)
    );
    if (sectorDepartments.length === 0) return;
    setEditingIndex(null);
    setRoute((prev) => [
      ...prev,
      ...sectorDepartments.map((d) => ({
        id: d.id,
        name: d.name,
      })),
    ]);
    setRouteSearch("");
  };

  const handleRemoveStation = (index) => {
    setRoute((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
    else if (editingIndex != null && index < editingIndex) {
      setEditingIndex((prev) => prev - 1);
    }
  };

  const handleMoveStation = (index, direction) => {
    setRoute((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    if (editingIndex === index) setEditingIndex(index + direction);
    else if (editingIndex === index + direction) setEditingIndex(index);
  };

  const handleDragStart = (index) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (index, e) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (targetIndex) => {
    const sourceIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (sourceIndex == null || sourceIndex === targetIndex) return;

    setRoute((prev) => {
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });

    if (editingIndex === sourceIndex) setEditingIndex(targetIndex);
    else if (editingIndex != null) {
      const minI = Math.min(sourceIndex, targetIndex);
      const maxI = Math.max(sourceIndex, targetIndex);
      if (editingIndex >= minI && editingIndex <= maxI) {
        setEditingIndex((prev) =>
          prev + (sourceIndex < targetIndex ? -1 : 1)
        );
      }
    }
  };

  const handleEditStation = (index) => {
    setEditingIndex(index);
    setRoutePickerOpen(true);
  };

  const handleCreateSender = async () => {
    const name = newSenderName.trim();

    if (!name) {
      alert("من فضلك اكتب اسم الجهة");
      return;
    }

    setSavingSender(true);

    const { data, error } = await supabase
      .from("letter_senders")
      .insert({
        name,
        is_active: true,
      })
      .select("id,name,is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("letter_senders")
          .select("id,name,is_active")
          .eq("name", name)
          .maybeSingle();

        if (existing) {
          setSenders((prev) => {
            const exists = prev.some(
              (item) => item.id === existing.id
            );
            return exists
              ? prev
              : [...prev, existing].sort((a, b) =>
                  a.name.localeCompare(b.name, "ar")
                );
          });

          setSenderId(String(existing.id));
          setSenderSearch(existing.name);
          setNewSenderName("");
          setShowNewSender(false);
        } else {
          alert("حدث خطأ أثناء إنشاء الجهة");
        }
      } else {
        alert("تعذر إنشاء الجهة: " + error.message);
      }

      setSavingSender(false);
      return;
    }

    setSenders((prev) =>
      [...prev, data].sort((a, b) =>
        a.name.localeCompare(b.name, "ar")
      )
    );

    setSenderId(String(data.id));
    setSenderSearch(data.name);
    setNewSenderName("");
    setShowNewSender(false);
    setSavingSender(false);
  };

  const handleSaveLetter = async () => {
    if (!qrCodeId) {
      alert("لا يوجد كود QR متاح حاليًا");
      return;
    }

    if (!letterDate) {
      alert("من فضلك اختر تاريخ الخطاب");
      return;
    }

    if (!senderId) {
      alert("من فضلك اختر الجهة المرسلة");
      return;
    }

    if (selectedTemplate) {
      const missingFields = variableFields.filter((field) => {
        const value = variableValues[field.key];
        return !value || !String(value).trim();
      });

      if (missingFields.length > 0) {
        alert(
          "من فضلك أكمل الحقول المتغيرة للقالب:\n" +
            missingFields
              .map(
                (field, index) => (index + 1) + ". " + field.label
              )
              .join("\n")
        );
        return;
      }
    } else if (!subject.trim()) {
      alert("من فضلك أدخل موضوع الخطاب");
      return;
    }

    if (route.length === 0) {
      alert("من فضلك أضف إدارة واحدة على الأقل إلى مسار الخطاب");
      return;
    }

    setSavingLetter(true);

    const selectedQr = qrCodes.find(
      (qr) => String(qr.id) === String(qrCodeId)
    );

    // الترقيم التلقائي: من العدّاد في قاعدة البيانات (فريد ولا يُعاد استخدامه)
    let letterNumber;

    try {
      letterNumber = await resolveNextLetterNumber(supabase);
    } catch (error) {
      console.error("Auto letter number error:", error);
      alert("تعذر توليد رقم الخطاب التلقائي: " + error.message);
      setSavingLetter(false);
      return;
    }

    const finalText = selectedTemplate
      ? replaceTemplateVariables(selectedTemplate.fixed_text, variableValues)
      : null;

    const payload = {
      qr_code_id: Number(qrCodeId),
      letter_number: letterNumber,
      letter_date: letterDate,
      sender_id: Number(senderId),
      subject: subject.trim() || (selectedTemplate?.title || "").trim(),
      status: "in_progress",
      notes: notes.trim() || null,
    };

    if (selectedTemplate) {
      payload.letter_type = selectedTemplate.letter_type || null;

      // أعمدة القوالب الجديدة تُرسل فقط إذا كان جدول letter_templates موجودًا
      // (أي تم تشغيل create_letter_templates_and_numbering.sql).
      if (templatesLoadedRef.current) {
        payload.template_id = selectedTemplate.id;
        payload.template_name = selectedTemplate.name || null;
        payload.letter_title = selectedTemplate.title || null;
        payload.variable_data = variableValues;
        payload.final_text = finalText;
      }
    }

    let { data: letter, error: letterError } = await supabase
      .from("letters")
      .insert(payload)
      .select("id")
      .single();

    // لو فشل الـ insert فقط بسبب عدم وجود أعمدة القوالب (migration غير مفعّل)،
    // نعيد المحاولة بالأعمدة الأساسية حتى يُحفظ الخطاب بنجاح.
    if (
      letterError &&
      (letterError.code === "42703" ||
        /column .*does not exist/i.test(letterError.message || ""))
    ) {
      delete payload.template_id;
      delete payload.template_name;
      delete payload.letter_title;
      delete payload.variable_data;
      delete payload.final_text;

      const retry = await supabase
        .from("letters")
        .insert(payload)
        .select("id")
        .single();

      letter = retry.data;
      letterError = retry.error;
    }

    if (letterError) {
      alert("تعذر حفظ الخطاب: " + letterError.message);
      setSavingLetter(false);
      return;
    }

    const movementRows = route.map((department, index) => ({
      letter_id: letter.id,
      department_id: Number(department.id),
      step_order: index + 1,
      received_at: null,
      sent_at: null,
      action: null,
      notes: null,
      status: index === 0 ? "in_progress" : "waiting",
    }));

    const { error: movementError } = await supabase
      .from("letter_movements")
      .insert(movementRows);

    if (movementError) {
      alert(
        "تم إنشاء الخطاب، ولكن حدث خطأ أثناء حفظ مسار الخطاب:\n" +
          movementError.message
      );
      setSavingLetter(false);
      return;
    }

    const usedAt = new Date().toISOString();

    const { error: qrError } = await supabase
      .from("archive_qr_codes")
      .update({
        status: "used",
        letter_id: letter.id,
        used_at: usedAt,
      })
      .eq("id", Number(qrCodeId));

    if (qrError) {
      alert(
        "تم حفظ الخطاب ومساره، ولكن حدث خطأ أثناء ربط كود QR:\n" +
          qrError.message
      );
      setSavingLetter(false);
      return;
    }

    alert(
      "تم حفظ الخطاب بنجاح ✅\n\n" +
        "رقم الخطاب: " +
        letterNumber +
        "\n" +
        "كود QR: " +
        (selectedQr?.code || "") +
        "\n" +
        "عدد محطات المسار: " +
        route.length
    );

    setLetterDate(creationToday);
    setSenderId("");
    setSenderSearch("");
    setSubject("");
    setNotes("");
    setQrCodeId("");
    setRoute([]);
    setTemplateId("");
    setVariableValues({});

    window.location.reload();
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 24,
        marginBottom: 24,
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 30px rgba(15,23,42,.06)",
        direction: "rtl",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            ✉️ إنشاء خطاب جديد
          </h2>

          <div
            style={{
              marginTop: 7,
              color: "#64748b",
              fontSize: 14,
            }}
          >
            إنشاء الخطاب وربطه بكود QR ثابت لمتابعة حركته بين الإدارات
          </div>
        </div>

        <div
          style={{
            padding: "9px 14px",
            borderRadius: 12,
            background: "#f1f5f9",
            color: "#334155",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {loading
            ? "جاري التحميل..."
            : `${qrCodes.length} كود QR متاح`}
        </div>
      </div>

      {/* اختيار القالب */}
      <div
        style={{
          marginBottom: 18,
          padding: 16,
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <CreationPanelField label="قالب الخطاب">
          <select
            value={templateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            style={creationPanelInputStyle}
          >
            <option value="">
              بدون قالب — إدخال يدوي
            </option>

            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.letter_type ? ` — ${template.letter_type}` : ""}
              </option>
            ))}
          </select>
        </CreationPanelField>

        {selectedTemplate && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #dbeafe",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 18px",
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              {selectedTemplate.letter_type && (
                <span style={{ fontWeight: 800, color: "#1d4ed8" }}>
                  🏷️ النوع: {selectedTemplate.letter_type}
                </span>
              )}

              {selectedTemplate.department_name && (
                <span style={{ fontWeight: 800, color: "#0f172a" }}>
                  🏢 الجهة/القسم: {selectedTemplate.department_name}
                </span>
              )}
            </div>

            <div
              style={{
                whiteSpace: "pre-wrap",
                color: "#334155",
                fontSize: 14,
                lineHeight: 1.8,
                maxHeight: 220,
                overflowY: "auto",
                background: "#f8fafc",
                border: "1px dashed #cbd5e1",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              {selectedTemplate.fixed_text ||
                "(لم يُكتب نص ثابت للقالب)"}
            </div>
          </div>
        )}

        {selectedTemplate && variableFields.length === 0 && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#b45309",
              fontWeight: 700,
            }}
          >
            ⚠️ هذا القالب لا يحتوي على حقول متغيرة. اكتب {"{{key}}"} داخل
            النص الثابت لإنشاء الحقول تلقائيًا.
          </div>
        )}
      </div>

      {/* الحقول المتغيرة للقالب */}
      {selectedTemplate && variableFields.length > 0 && (
        <div
          style={{
            marginBottom: 18,
            padding: 16,
            borderRadius: 14,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
          }}
        >
          <h3
            style={{
              margin: "0 0 12px",
              color: "#0f172a",
              fontSize: 15,
              fontWeight: 800,
            }}
          >
            🧩 الحقول المتغيرة للقالب
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(240px,1fr))",
              gap: 14,
            }}
          >
            {variableFields.map((field) => {
              const key = String(field.key);
              const isTextarea = field.type === "textarea";

              return (
                <div key={key} style={{ gridColumn: isTextarea ? "1 / -1" : undefined }}>
                  <CreationPanelField label={field.label || key}>
                    {isTextarea ? (
                      <textarea
                        rows={3}
                        value={variableValues[key] || ""}
                        onChange={(e) =>
                          setVariableValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder || ""}
                        style={{
                          ...creationPanelInputStyle,
                          resize: "vertical",
                        }}
                      />
                    ) : (
                      <input
                        value={variableValues[key] || ""}
                        onChange={(e) =>
                          setVariableValues((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder || ""}
                        style={creationPanelInputStyle}
                      />
                    )}
                  </CreationPanelField>
                </div>
              );
            })}
          </div>

          {finalPreview && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 12,
                background: "#fff",
                border: "1px solid #bbf7d0",
              }}
            >
              <div
                style={{
                  marginBottom: 6,
                  fontSize: 12,
                  color: "#15803d",
                  fontWeight: 800,
                }}
              >
                👁️ معاينة النص النهائي
              </div>

              <div
                style={{
                  whiteSpace: "pre-wrap",
                  color: "#0f172a",
                  fontSize: 14,
                  lineHeight: 1.8,
                }}
              >
                {finalPreview}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
        }}
      >
        <CreationPanelField label="رقم الخطاب">
          <input
            value="يُولَّد تلقائيًا عند الحفظ"
            readOnly
            disabled={loading}
            style={{
              ...creationPanelInputStyle,
              background: "#f1f5f9",
              color: "#64748b",
              cursor: "not-allowed",
            }}
          />
        </CreationPanelField>

        <CreationPanelField label="تاريخ الخطاب">
          <input
            type="date"
            value={letterDate}
            onChange={(e) => setLetterDate(e.target.value)}
            style={creationPanelInputStyle}
          />
        </CreationPanelField>

        <CreationPanelField label="كود QR">
          <select
            value={qrCodeId}
            onChange={(e) => setQrCodeId(e.target.value)}
            style={creationPanelInputStyle}
            disabled={loading || qrCodes.length === 0}
          >
            {qrCodes.length === 0 ? (
              <option value="">لا توجد أكواد متاحة</option>
            ) : (
              qrCodes.map((qr) => (
                <option key={qr.id} value={qr.id}>
                  {qr.code}
                </option>
              ))
            )}
          </select>
        </CreationPanelField>

        <CreationPanelField label="الجهة المرسلة">
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                value={selectedSender?.name || senderSearch}
                onChange={(e) => {
                  setSenderSearch(e.target.value);
                  setSenderId("");
                }}
                placeholder="ابحث عن الجهة..."
                style={creationPanelInputStyle}
              />

              {senderSearch &&
                !senderId &&
                filteredSenders.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 5px)",
                      right: 0,
                      left: 0,
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      boxShadow: "0 12px 30px rgba(15,23,42,.12)",
                      zIndex: 20,
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {filteredSenders.map((sender) => (
                      <button
                        key={sender.id}
                        type="button"
                        onClick={() => {
                          setSenderId(String(sender.id));
                          setSenderSearch(sender.name);
                        }}
                        style={{
                          width: "100%",
                          border: 0,
                          background: "#fff",
                          padding: "11px 13px",
                          textAlign: "right",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "#334155",
                        }}
                      >
                        {sender.name}
                      </button>
))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowNewSender(true)}
                style={creationPanelNewButtonStyle}
                title="إنشاء جهة جديدة"
              >
              +
            </button>
          </div>

          {selectedSender && (
            <div
              style={{
                marginTop: 7,
                fontSize: 12,
                color: "#15803d",
                fontWeight: 700,
              }}
            >
              ✓ تم اختيار: {selectedSender.name}
            </div>
          )}
        </CreationPanelField>

        <div style={{ gridColumn: "1 / -1" }}>
          <CreationPanelField label="موضوع الخطاب">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                selectedTemplate
                  ? "يُؤخذ عنوان القالب تلقائيًا (يمكن تعديله)"
                  : "اكتب موضوع الخطاب..."
              }
              style={creationPanelInputStyle}
            />
          </CreationPanelField>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <CreationPanelField label="ملاحظات">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={3}
              style={{
                ...creationPanelInputStyle,
                resize: "vertical",
                minHeight: 80,
              }}
            />
          </CreationPanelField>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 20,
          borderRadius: 16,
          background:
            "linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%)",
          border: "1px solid #dbeafe",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              🧭 مسار الخطاب
            </h3>

            <div
              style={{
                marginTop: 5,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              أضف الإدارات بالترتيب الذي سيتحرك من خلاله الخطاب
            </div>
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #dbeafe",
              color: "#1e40af",
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            🔢 {route.length}{" "}
            {route.length === 1 ? "محطة" : "محطات"}
          </div>
        </div>

        <div style={{ marginBottom: 16 }} ref={routePickerRef}>
          <button
            type="button"
            onClick={() => {
              if (editingIndex != null) setEditingIndex(null);
              setRoutePickerOpen((prev) => !prev);
            }}
            disabled={departments.length === 0}
            style={{
              width: "100%",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 14,
              background: routePickerOpen 
                ? "linear-gradient(135deg, #EFF6FF, #DBEAFE)" 
                : "#fff",
              border: routePickerOpen
                ? "2px solid #93c5fd"
                : "2px dashed #cbd5e1",
              color: departments.length === 0 ? "#94a3b8" : "#1e40af",
              fontSize: 15,
              fontWeight: 800,
              cursor:
                departments.length === 0
                  ? "not-allowed"
                  : "pointer",
              boxShadow: routePickerOpen 
                ? "0 4px 12px rgba(59,130,246,0.15)" 
                : "0 2px 8px rgba(15,23,42,0.08)",
              transition: "all 0.2s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editingIndex != null
                ? "✏️ اختر إدارة بديلة للمحطة الحالية"
                : "➕ اختيار محطة الخطاب"}
            </span>
            <span style={{ 
              fontSize: 13, 
              opacity: 0.9,
              background: "rgba(255,255,255,0.3)",
              padding: "4px 8px",
              borderRadius: 8,
            }}>
              {routePickerOpen ? "إغلاق ▲" : "اختيار ▼"}
            </span>
          </button>

          {routePickerOpen && (
            <div
              style={{
                marginTop: 12,
                borderRadius: 16,
                border: "2px solid #e2e8f0",
                background: "#fff",
                overflow: "hidden",
                boxShadow: "0 8px 25px rgba(15,23,42,0.12)",
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderBottom: "2px solid #f1f5f9",
                  background: "linear-gradient(135deg, #F8FAFC, #EFF6FF)",
                }}
              >
                <input
                  type="text"
                  value={routeSearch}
                  onChange={(e) => setRouteSearch(e.target.value)}
                  placeholder="🔎 ابحث عن إدارة في كل القطاعات..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "2px solid #cbd5e1",
                    borderRadius: 12,
                    padding: "12px 14px",
                    fontSize: 14,
                    outline: "none",
                    background: "#fff",
                    color: "#0f172a",
                    fontWeight: 500,
                  }}
                />
              </div>

              {routePickerGroups.length === 0 ? (
                <div
                  style={{
                    padding: "32px 20px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>
                    🔍
                  </div>
                  {routeSearch.trim()
                    ? "لا توجد نتائج مطابقة للبحث"
                    : "لا توجد إدارات مفعّلة حاليًا. أضف الإدارات من صفحة الهيكل التنظيمي."}
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: 380,
                    overflowY: "auto",
                  }}
                >
                  {routePickerGroups.map((group) => {
                    const isExpanded =
                      routeSearch.trim() ||
                      expandedSectorIds.length === 0 ||
                      expandedSectorIds.includes(group.id);

                    return (
                      <div
                        key={
                          group.type + "-" + group.id
                        }
                        style={{
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >
                        <div
                          onClick={() => {
                            if (!routeSearch.trim())
                              handleToggleSector(group.id);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent:
                              "space-between",
                            gap: 10,
                            padding: "14px 16px",
                            background: "linear-gradient(135deg, #F8FAFC, #F1F5F9)",
                            cursor: routeSearch.trim()
                              ? "default"
                              : "pointer",
                            transition: "background 0.2s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "10px",
                              background: "linear-gradient(135deg, #DBEAFE, #EFF6FF)",
                              border: "1px solid #BFDBFE",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                            }}>
                              {group.icon}
                            </div>
                            <span
                              style={{
                                color: "#0f172a",
                                fontSize: 15,
                                fontWeight: 900,
                              }}
                            >
                              {group.name}
                            </span>
                            <span
                              style={{
                                background: "#dbeafe",
                                color: "#1e40af",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {group.items.length}
                            </span>
                          </div>
                          <span
                            style={{
                              color: "#64748b",
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>

                        <div
                          style={{
                            maxHeight: isExpanded
                              ? "2000px"
                              : "0",
                            overflow: "hidden",
                            transition:
                              "max-height 0.35s ease-in-out",
                            padding: isExpanded
                              ? "8px 12px 12px"
                              : "0 12px",
                          }}
                        >
                            {group.items.length === 0 ? (
                              <div
                                style={{
                                  width: "100%",
                                  boxSizing: "border-box",
                                  marginTop: 8,
                                  padding: "14px 16px",
                                  borderRadius: 12,
                                  border: "2px dashed #cbd5e1",
                                  background: "#f8fafc",
                                  color: "#94a3b8",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  textAlign: "center",
                                }}
                              >
                                {routeSearch.trim()
                                  ? "لا توجد إدارات مطابقة للبحث"
                                  : "لا توجد إدارات في هذا القطاع بعد — أضفها من صفحة «الهيكل التنظيمي»"}
                              </div>
                            ) : (
                              <>
                                {group.type === "sector" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddSectorDepartments(
                                        group.id
                                      )
                                    }
                                    title="أضف كل إدارات هذا القطاع دفعة واحدة"
                                    style={{
                                      width: "100%",
                                      boxSizing: "border-box",
                                      textAlign: "right",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent:
                                        "space-between",
                                      gap: 10,
                                      marginTop: 8,
                                      padding: "12px 16px",
                                      borderRadius: 12,
                                      border:
                                        "2px solid #c7d2fe",
                                      background: "linear-gradient(135deg, #eef2ff, #dbeafe)",
                                      color: "#4338ca",
                                      fontSize: 14,
                                      fontWeight: 800,
                                      cursor: "pointer",
                                      boxShadow: "0 4px 12px rgba(67,56,202,0.1)",
                                      transition: "all 0.2s",
                                    }}
                                  >
                                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontSize: "16px" }}>🏛️</span>
                                      <span>إضافة كل إدارات القطاع</span>
                                    </span>
                                    <span style={{
                                      background: "rgba(255,255,255,0.5)",
                                      padding: "4px 10px",
                                      borderRadius: 8,
                                      fontSize: 12,
                                    }}>
                                      ({group.items.length})
                                    </span>
                                  </button>
                                )}

                                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                                {group.items.map(
                              (department) => {
                                const added =
                                  isRouteStationAdded(
                                    department.id
                                  );

                                return (
                                  <button
                                    key={department.id}
                                    type="button"
                                    onClick={() =>
                                      handleAddDepartmentToRoute(
                                        department
                                      )
                                    }
                                    title={
                                      added
                                        ? "أضف مرة أخرى (يُسمح بتكرار الإدارة في المسار)"
                                        : "أضف إلى المسار"
                                    }
                                    style={{
                                      width: "100%",
                                      textAlign: "right",
                                      boxSizing:
                                        "border-box",
                                      display: "flex",
                                      alignItems:
                                        "center",
                                      gap: 10,
                                      padding:
                                        "12px 14px",
                                      borderRadius: 10,
                                      border: added
                                        ? "2px solid #bbf7d0"
                                        : "1px solid #e2e8f0",
                                      background: added
                                        ? "linear-gradient(135deg, #f0fdf4, #dcfce7)"
                                        : "#fff",
                                      cursor: "pointer",
                                      transition: "all 0.2s",
                                      boxShadow: added 
                                        ? "0 2px 8px rgba(22,163,74,0.1)" 
                                        : "0 1px 4px rgba(15,23,42,0.05)",
                                    }}
                                  >
                                    <span style={{
                                      width: "32px",
                                      height: "32px",
                                      borderRadius: 8,
                                      background: added 
                                        ? "#dcfce7" 
                                        : "#f1f5f9",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "16px",
                                    }}>
                                      📁
                                    </span>
                                    <span
                                      style={{
                                        flex: 1,
                                        color: "#0f172a",
                                        fontSize: 14,
                                        fontWeight: 700,
                                      }}
                                    >
                                      {department.name}
                                    </span>
                                    {added && (
                                      <span
                                        style={{
                                          color: "#16a34a",
                                          fontSize: 12,
                                          fontWeight: 800,
                                          whiteSpace:
                                            "nowrap",
                                          background: "#dcfce7",
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                        }}
                                      >
                                        ✓ في المسار
                                      </span>
                                    )}
                                  </button>
                                );
                              }
                            )}
                                </div>
                              </>
                            )}
                          </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {route.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 16px",
              borderRadius: 14,
              border: "1px dashed #cbd5e1",
              background: "#fff",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            📭 لم يتم إضافة أي محطة بعد.
            <br />
            <br />
            اختر الإدارات التي سيمر بها الخطاب بالترتيب.
            <br />
            يمكنك اختيار إدارات من قطاعات مختلفة تمامًا، وحتى تكرار
            نفس الإدارة في أكثر من محطة.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {route.map((department, index) => {
              const isFirst = index === 0;
              const config = isFirst
                ? creationStatusConfig.in_progress
                : creationStatusConfig.waiting;

              return (
                <div
                  key={`${department.id}-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(index, e)}
                  onDragLeave={() =>
                    setDragOverIndex((prev) =>
                      prev === index ? null : prev
                    )
                  }
                  onDrop={() => handleDrop(index)}
                  title="اسحب لإعادة الترتيب"
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    minHeight: 92,
                    opacity: dragOverIndex === index ? 0.55 : 1,
                    outline:
                      dragOverIndex === index
                        ? "2px dashed #2563eb"
                        : "none",
                    outlineOffset: 2,
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      minWidth: 52,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: config.background,
                        border: `3px solid ${config.color}`,
                        color: config.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 15,
                        boxSizing: "border-box",
                        zIndex: 2,
                      }}
                    >
                      {isFirst ? "▶" : index + 1}
                    </div>

                    {index < route.length - 1 && (
                      <div
                        style={{
                          width: 3,
                          flex: 1,
                          minHeight: 42,
                          background:
                            "linear-gradient(#2563eb,#cbd5e1)",
                        }}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      marginBottom:
                        index < route.length - 1 ? 10 : 0,
                      marginRight: 10,
                      background:
                        editingIndex === index
                          ? "#eff6ff"
                          : "#fff",
                      border:
                        editingIndex === index
                          ? `1.5px solid #60a5fa`
                          : `1px solid ${config.border}`,
                      borderRadius: 14,
                      padding: "12px 14px",
                      boxShadow: "0 4px 14px rgba(15,23,42,.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 800,
                          marginBottom: 3,
                        }}
                      >
                        المحطة {index + 1}
                        {editingIndex === index && (
                          <span
                            style={{
                              color: "#2563eb",
                              fontWeight: 900,
                            }}
                          >
                            {" "}
                            — جاري التعديل
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          color: "#0f172a",
                          fontSize: 15,
                          fontWeight: 900,
                        }}
                      >
                        {department.name}
                      </div>

                      {(() => {
                        const stationSector =
                          getDepartmentSectorById(
                            department.id
                          );
                        return stationSector ? (
                          <div
                            style={{
                              marginTop: 4,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#f1f5f9",
                              border: "1px solid #e2e8f0",
                              color: "#475569",
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {sectorIconFor(stationSector.name)}{" "}
                            {stationSector.name}
                          </div>
                        ) : null;
                      })()}

                      <div
                        style={{
                          marginTop: 5,
                          color: config.color,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {config.icon} {config.label}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 5,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          color: "#94a3b8",
                          cursor: "grab",
                          padding: "0 2px",
                        }}
                      >
                        ⠿
                      </span>

                      <button
                        type="button"
                        onClick={() => handleEditStation(index)}
                        title="تعديل المحطة"
                        style={{
                          ...creationPanelRouteActionStyle(true),
                          color: "#1d4ed8",
                          borderColor: "#bfdbfe",
                          background: "#eff6ff",
                          fontSize: 13,
                        }}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveStation(index, -1)}
                        disabled={index === 0}
                        title="تحريك لأعلى"
                        style={creationPanelRouteActionStyle(index !== 0)}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveStation(index, 1)}
                        disabled={index === route.length - 1}
                        title="تحريك لأسفل"
                        style={creationPanelRouteActionStyle(
                          index !== route.length - 1
                        )}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveStation(index)}
                        title="حذف من المسار"
                        style={{
                          ...creationPanelRouteActionStyle(true),
                          color: "#dc2626",
                          borderColor: "#fecaca",
                          background: "#fff",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {route.length > 0 && (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e2e8f0",
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <span style={{ color: "#16a34a" }}>🟢 تم التنفيذ</span>
            <span style={{ color: "#2563eb" }}>🔵 جاري التنفيذ</span>
            <span style={{ color: "#64748b" }}>⚪ في الانتظار</span>
            <span style={{ color: "#94a3b8" }}>⠿ اسحب المحطة لإعادة الترتيب</span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          marginTop: 22,
        }}
      >
        <button
          type="button"
          onClick={handleSaveLetter}
          disabled={savingLetter || loading}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "12px 24px",
            background:
              savingLetter || loading ? "#94a3b8" : "#0f172a",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor: savingLetter || loading ? "not-allowed" : "pointer",
            boxShadow: "0 7px 18px rgba(15,23,42,.16)",
          }}
        >
          {savingLetter
            ? "جاري حفظ الخطاب..."
            : "💾 حفظ الخطاب"}
        </button>
      </div>

      {showNewSender && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "min(500px,100%)",
              background: "#fff",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 25px 70px rgba(0,0,0,.2)",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                color: "#0f172a",
                fontSize: 20,
              }}
            >
              + إنشاء جهة جديدة
            </h3>

            <p
              style={{
                margin: "0 0 18px",
                color: "#64748b",
                fontSize: 13,
              }}
            >
              اكتب اسم الجهة وسيتم حفظها لتظهر مع الخطابات القادمة.
            </p>

            <input
              autoFocus
              value={newSenderName}
              onChange={(e) => setNewSenderName(e.target.value)}
              placeholder="اسم الجهة"
              style={creationPanelInputStyle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSender();
                }
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-start",
                marginTop: 18,
              }}
            >
              <button
                type="button"
                onClick={handleCreateSender}
                disabled={savingSender}
                style={{
                  border: 0,
                  borderRadius: 11,
                  padding: "11px 20px",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: savingSender ? "not-allowed" : "pointer",
                }}
              >
                {savingSender ? "جاري الحفظ..." : "حفظ الجهة"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNewSender(false);
                  setNewSenderName("");
                }}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 11,
                  padding: "11px 20px",
                  background: "#fff",
                  color: "#475569",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
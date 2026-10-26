import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { uploadFile, deleteFile } from "../services/fileStorage";
import { FileAnchor, FileDownloadLink } from "../components/FileLink";
import NotificationSheetImportModal from "./NotificationSheetImportModal";
import {
  getSectionConfig,
  typeFields,
  currentYearMonth,
  MONTH_NAMES,
  PROMOTION_LADDER,
  nextPromotionRank,
  isPromotionForward,
  safeFileName,
  formatDate,
} from "./notificationsConfig";

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

const sectionBoxStyle = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 14,
  marginBottom: 14,
};

function initialValues(report) {
  const details =
    report && report.details && typeof report.details === "object"
      ? report.details
      : {};
  const values = { ...details };
  [
    "amount",
    "payment_date",
    "payment_method",
    "new_payment_method",
    "reason",
    "effective_date",
    "leave_start",
    "leave_end",
    "university",
    "deduction_reason",
    "installments",
    "promotion_from",
    "promotion_to",
    "contract_start",
    "contract_end",
    "contract_value",
  ].forEach((key) => {
    if ((values[key] === undefined || values[key] === "") && report?.[key] != null) {
      values[key] = report[key];
    }
  });
  return values;
}

export default function NotificationFormModal({
  section,
  currentUser,
  types,
  members,
  report,
  initialMember,
  onClose,
  onSaved,
  onOpenArchive,
}) {
  const cfg = getSectionConfig(section);
  const isEditing = Boolean(report?.id);

  const defaultYearMonth = currentYearMonth();
  /* عند الإنشاء لا نختار نوعًا تلقائيًا: يظهر للعضو قائمة الأنواع
     ليختار منها بنفسه، بدلًا من فتح النموذج على نوع افتراضي. */
  const initialTypeId = report?.type_id || "";

  const preselectedMember = !isEditing && initialMember ? initialMember : null;

  const [typeId, setTypeId] = useState(initialTypeId);
  const [memberMode, setMemberMode] = useState(
    (report?.member_id || preselectedMember)
      ? "existing"
      : (members || []).length > 0
        ? "existing"
        : "new"
  );
  const [memberId, setMemberId] = useState(report?.member_id || preselectedMember?.id || "");
  const [memberName, setMemberName] = useState(
    report?.member_name || preselectedMember?.full_name || ""
  );
  const [memberNumber, setMemberNumber] = useState(
    report?.member_number || preselectedMember?.external_id || ""
  );
  const [memberJobTitle, setMemberJobTitle] = useState(preselectedMember?.job_title || "");
  const [memberDepartment, setMemberDepartment] = useState(
    preselectedMember?.department || ""
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [year, setYear] = useState(report?.year || defaultYearMonth.year);
  const [month, setMonth] = useState(report?.month || defaultYearMonth.month);
  const [notes, setNotes] = useState(report?.notes || "");
  const [values, setValues] = useState(() => initialValues(report));
  const [attachments, setAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSheetPicker, setShowSheetPicker] = useState(false);
  const [sheetSelection, setSheetSelection] = useState(null);
  const [archiveStatus, setArchiveStatus] = useState(null);

  const availableTypes = useMemo(() => {
    const list = Array.isArray(types) ? types : [];
    return isEditing ? list : list.filter((type) => type.is_active);
  }, [types, isEditing]);

  const selectedType = useMemo(
    () => availableTypes.find((type) => type.id === typeId) || null,
    [availableTypes, typeId]
  );

  const fields = useMemo(() => typeFields(selectedType), [selectedType]);

  const yearOptions = useMemo(() => {
    const values = new Set();
    for (let offset = 3; offset >= -6; offset -= 1) {
      values.add(defaultYearMonth.year + offset);
    }
    if (Number(report?.year)) values.add(Number(report.year));
    if (Number(year)) values.add(Number(year));
    return [...values].sort((a, b) => b - a);
  }, [defaultYearMonth.year, report, year]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = Array.isArray(members) ? members : [];
    if (!q) return list;
    return list.filter((member) =>
      [member.full_name, member.external_id, member.job_title, member.department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [members, memberSearch]);

  const selectedMember = useMemo(
    () => (members || []).find((member) => member.id === memberId) || null,
    [members, memberId]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!report?.id) return undefined;
    let cancelled = false;
    setLoadingAttachments(true);
    supabase
      .from("notification_attachments")
      .select("*")
      .eq("notification_id", report.id)
      .order("created_at", { ascending: true })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          console.error("تعذر تحميل مرفقات التبليغ:", loadError);
        } else {
          setAttachments(data || []);
        }
        setLoadingAttachments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [report?.id]);

  useEffect(() => {
    if (!selectedType) return;
    setValues((current) => {
      const next = { ...current };
      typeFields(selectedType).forEach((field) => {
        if (next[field.key] === undefined) {
          next[field.key] = field.type === "checkbox" ? false : "";
        }
      });
      return next;
    });
  }, [selectedType]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectMember = (id) => {
    setMemberId(id);
    const member = (members || []).find((item) => item.id === id);
    if (member) {
      setMemberName(member.full_name || "");
      setMemberNumber(member.external_id || "");
      setMemberJobTitle(member.job_title || "");
      setMemberDepartment(member.department || "");
    }
  };

  /* اختيار العضو من شيت Excel: نملأ البيانات ونحافظ على معرّف الفهرس
     إن كان العضو موجودًا، ثم نعرض حالة الربط بالأرشيف الذكي. */
  const handleSheetSelect = ({ record, member, archive }) => {
    setMemberName(record.full_name || "");
    setMemberNumber(record.external_id || "");
    setMemberJobTitle(record.job_title || member?.job_title || "");
    setMemberDepartment(record.department || member?.department || "");
    setMemberId(member?.id || "");
    setMemberMode(member ? "existing" : "new");
    setMemberSearch("");
    setSheetSelection({ record, member, archive });
    setArchiveStatus(archive || null);
    setShowSheetPicker(false);
    setError("");
  };

  const handleTypeChange = (nextTypeId) => {
    setTypeId(nextTypeId);
    const nextType = availableTypes.find((type) => type.id === nextTypeId);
    if (nextType?.code === "promotion" && section === "faculty") {
      const currentRank =
        values.promotion_from ||
        memberJobTitle ||
        selectedMember?.job_title ||
        "";
      setValues((current) => ({
        ...current,
        promotion_from: current.promotion_from || currentRank,
        promotion_to: current.promotion_to || nextPromotionRank(currentRank),
      }));
    }
  };

  const setFieldValue = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    if (!selectedType) return "اختر نوع التبليغ أولًا.";
    if (!memberName.trim()) return `أدخل اسم ${cfg.memberLabel}.`;
    if (!memberNumber.trim()) return `أدخل ${cfg.numberLabel}.`;
    if (!year || !month) return "حدد الشهر والسنة.";
    for (const field of fields) {
      const value = values[field.key];
      if (field.required && (value === "" || value == null || value === false)) {
        return `الحقل «${field.label}» مطلوب.`;
      }
    }
    if (selectedType.code === "salary_stop" && !values.reason) {
      return "اختر سبب وقف المرتب.";
    }
    if (selectedType.code === "promotion") {
      if (!values.promotion_from || !values.promotion_to) {
        return "حدد الدرجة الحالية والدرجة الجديدة.";
      }
      if (section === "faculty" && !isPromotionForward(values.promotion_from, values.promotion_to)) {
        return "الترقية يجب أن تتبع التسلسل: معيد ← مدرس مساعد ← مدرس ← أستاذ مساعد ← أستاذ.";
      }
    }
    if (selectedType.code === "deductions" && !(Number(values.amount) > 0)) {
      return "أدخل قيمة خصم أكبر من صفر.";
    }
    if (selectedType.code === "payment_method_change" && !values.new_payment_method) {
      return "اختر طريقة الدفع الجديدة.";
    }
    return "";
  };

  const ensureMember = async () => {
    if (memberMode === "existing" && selectedMember) return selectedMember;

    const payload = {
      section,
      external_id: memberNumber.trim(),
      full_name: memberName.trim(),
      job_title: memberJobTitle.trim() || null,
      department: memberDepartment.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error: memberError } = await supabase
      .from("notification_members")
      .upsert(payload, { onConflict: "section,external_id" })
      .select("*")
      .single();

    if (memberError) throw new Error(`تعذر حفظ بيانات ${cfg.memberLabel}: ${memberError.message}`);
    return data;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const member = await ensureMember();
      const now = new Date().toISOString();
      const details = {};
      fields.forEach((field) => {
        details[field.key] = values[field.key] ?? "";
      });
      details.notes = notes;

      const payload = {
        section,
        member_id: member?.id || null,
        member_name: memberName.trim(),
        member_number: memberNumber.trim(),
        type_id: selectedType.id,
        type_code: selectedType.code,
        type_name: selectedType.name,
        year: Number(year),
        month: Number(month),
        effective_date: values.effective_date || null,
        reason: values.reason || null,
        payment_method: values.payment_method || null,
        new_payment_method: values.new_payment_method || null,
        promotion_from: values.promotion_from || null,
        promotion_to: values.promotion_to || null,
        amount:
          values.amount !== "" && values.amount != null && Number.isFinite(Number(values.amount))
            ? Number(values.amount)
            : null,
        notes: notes || null,
        details,
        updated_at: now,
      };

      /* إعادة إرسال المسودة/المرفوض إلى مراجعة المدخل بعد التعديل،
         مع الاحتفاظ الكامل بسجل المراجعات السابق. */
      if (isEditing && ["draft", "rejected"].includes(report.status)) {
        payload.status = "pending_entry";
      }

      let reportId = report?.id;
      let savedReport = null;

      if (isEditing) {
        const { data, error: updateError } = await supabase
          .from("notification_reports")
          .update(payload)
          .eq("id", report.id)
          .select("*")
          .single();
        if (updateError) throw new Error(`تعذر تحديث التبليغ: ${updateError.message}`);
        savedReport = data;
        reportId = data.id;
      } else {
        const { data, error: insertError } = await supabase
          .from("notification_reports")
          .insert({
            ...payload,
            status: "pending_entry",
            created_by: currentUser?.id || null,
            created_by_name:
              currentUser?.full_name || currentUser?.username || "غير معروف",
            created_at: now,
          })
          .select("*")
          .single();
        if (insertError) throw new Error(`تعذر حفظ التبليغ: ${insertError.message}`);
        savedReport = data;
        reportId = data.id;
      }

      /* حذف المرفقات المحددة */
      for (const attachmentId of removedAttachmentIds) {
        const attachment = attachments.find((item) => item.id === attachmentId);
        if (!attachment) continue;
        try {
          await deleteFile(attachment.file_url, {
            bucket: attachment.bucket || "notification-attachments",
            path: attachment.file_path,
            provider: attachment.storage_provider,
          });
        } catch (fileError) {
          console.error("تعذر حذف ملف المرفق من التخزين:", fileError);
        }
        await supabase.from("notification_attachments").delete().eq("id", attachmentId);
      }

      /* رفع المرفقات الجديدة */
      let attachmentWarning = "";
      for (const file of newFiles) {
        try {
          const path = `${cfg.storageRoot}/${reportId}/${Date.now()}-${safeFileName(file.name)}`;
          const stored = await uploadFile("notification-attachments", path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          const { error: attachmentError } = await supabase
            .from("notification_attachments")
            .insert({
              notification_id: reportId,
              file_name: file.name,
              file_url: stored.url,
              file_path: stored.path,
              bucket: stored.bucket,
              storage_provider: stored.provider,
              storage_key: stored.key,
              mime_type: stored.mimeType || file.type || null,
              size_bytes: file.size || null,
              uploaded_by:
                currentUser?.full_name || currentUser?.username || "غير معروف",
            });
          if (attachmentError) throw attachmentError;
        } catch (attachmentError) {
          attachmentWarning = `${file.name}: ${attachmentError.message || attachmentError}`;
          break;
        }
      }

      if (attachmentWarning) {
        window.alert(
          `تم حفظ التبليغ، لكن تعذر رفع بعض المرفقات:\n${attachmentWarning}\n\nافتح التبليغ من القائمة ثم عدّله لإضافة المرفقات المتبقية.`
        );
      }

      onSaved(savedReport);
    } catch (saveError) {
      console.error("خطأ في حفظ التبليغ:", saveError);
      setError(saveError.message || "تعذر حفظ التبليغ.");
    } finally {
      setSaving(false);
    }
  };

  const handleFiles = (event) => {
    const files = [...(event.target.files || [])];
    const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      setError(`الملف «${oversized.name}» يتجاوز 25 ميجابايت.`);
      event.target.value = "";
      return;
    }
    setNewFiles((current) => [...current, ...files]);
    event.target.value = "";
  };

  const visibleAttachments = attachments.filter(
    (attachment) => !removedAttachmentIds.includes(attachment.id)
  );

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.72)",
        zIndex: 3000,
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
          width: "min(980px, 100%)",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 70px rgba(15,23,42,.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid #E2E8F0",
            background: cfg.accentSoft,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0F2942" }}>
              {isEditing ? "تعديل التبليغ" : `إضافة تبليغ — ${cfg.title}`}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>
              {cfg.emoji} {cfg.title} • الحقول تتغير حسب نوع التبليغ
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background: "#fff",
              color: "#B91C1C",
              borderRadius: 9,
              padding: "8px 12px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ✕ إغلاق
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          {error && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 13,
                lineHeight: 1.8,
                marginBottom: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div style={sectionBoxStyle}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942", marginBottom: 12 }}>
              1) بيانات التبليغ
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>نوع التبليغ *</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {availableTypes.map((type) => {
                  const active = type.id === typeId;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleTypeChange(type.id)}
                      style={{
                        border: active ? `2px solid ${cfg.accent}` : "1px solid #CBD5E1",
                        background: active ? cfg.accentSoft : "#fff",
                        color: active ? cfg.accent : "#334155",
                        borderRadius: 999,
                        padding: "8px 14px",
                        fontSize: 12.5,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {type.name}
                      {type.is_active ? "" : " (موقوف)"}
                    </button>
                  );
                })}
                {availableTypes.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>
                    لا توجد أنواع متاحة — أضفها من تبويب «أنواع التبليغات».
                  </div>
                )}
              </div>
              {selectedType?.description && (
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 6, lineHeight: 1.7 }}>
                  {selectedType.description}
                </div>
              )}
              {!selectedType && availableTypes.length > 0 && (
                <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 6, fontWeight: 800 }}>
                  👆 اختر نوع التبليغ من القائمة أعلاه، ثم أكمل البيانات.
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div>
                <label style={labelStyle}>السنة *</label>
                <select value={year} onChange={(event) => setYear(event.target.value)} style={inputStyle}>
                  {yearOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>الشهر *</label>
                <select value={month} onChange={(event) => setMonth(event.target.value)} style={inputStyle}>
                  {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={index + 1}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={sectionBoxStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942" }}>
                2) {cfg.memberLabel}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setMemberMode("existing");
                    setSheetSelection(null);
                    setArchiveStatus(null);
                  }}
                  style={{
                    border: memberMode === "existing" ? "2px solid #2563EB" : "1px solid #CBD5E1",
                    background: memberMode === "existing" ? "#EFF6FF" : "#fff",
                    color: "#1E293B",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  من الفهرس
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMemberMode("new");
                    setMemberId("");
                    setMemberName("");
                    setMemberNumber("");
                    setMemberJobTitle("");
                    setMemberDepartment("");
                    setSheetSelection(null);
                    setArchiveStatus(null);
                  }}
                  style={{
                    border: memberMode === "new" ? "2px solid #2563EB" : "1px solid #CBD5E1",
                    background: memberMode === "new" ? "#EFF6FF" : "#fff",
                    color: "#1E293B",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ＋ عضو جديد
                </button>
                <button
                  type="button"
                  onClick={() => setShowSheetPicker(true)}
                  style={{
                    border: "1px solid #BFDBFE",
                    background: "#EFF6FF",
                    color: "#1D4ED8",
                    borderRadius: 8,
                    padding: "7px 10px",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  📥 من شيت Excel
                </button>
              </div>
            </div>

            {preselectedMember && (
              <div
                style={{
                  background: cfg.accentSoft,
                  border: `1px solid ${cfg.accent}44`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  marginBottom: 12,
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: "#0F2942",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span>👤 التبليغ لـ:</span>
                <b>{preselectedMember.full_name}</b>
                <span style={{ color: "#64748B", fontWeight: 700 }}>
                  {cfg.numberLabel}: {preselectedMember.external_id || "—"}
                </span>
              </div>
            )}

            {sheetSelection && (
              <div
                style={{
                  background: archiveStatus?.found ? "#ECFDF5" : "#FFFBEB",
                  border: `1px solid ${archiveStatus?.found ? "#A7F3D0" : "#FDE68A"}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12, lineHeight: 1.9, color: "#334155" }}>
                  <div style={{ fontWeight: 900, color: "#0F2942" }}>
                    ✅ تم اختيار {sheetSelection.record.full_name} من شيت Excel
                  </div>
                  <div>
                    {cfg.numberLabel}: {sheetSelection.record.external_id}
                    {sheetSelection.member ? " • مرتبط بفهرس التبليغات" : " • سيُضاف إلى الفهرس تلقائيًا"}
                    {archiveStatus?.supported
                      ? archiveStatus.found
                        ? ` • موجود في أرشيف المرتبات (${archiveStatus.count || 1} سجل)`
                        : " • غير موجود في أرشيف المرتبات"
                      : cfg.archiveTable
                        ? ""
                        : " • قسم العقود لا يعتمد على أرشيف المرتبات"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {archiveStatus?.found && onOpenArchive && cfg.archiveMenu && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "سيتم فتح أرشيف المرتبات ومغادرة نموذج التبليغ الحالي. هل تريد المتابعة؟"
                          )
                        ) {
                          return;
                        }
                        onOpenArchive({
                          computer_number: sheetSelection.record.external_id,
                          faculty_name: sheetSelection.record.full_name,
                        });
                      }}
                      style={{
                        border: "1px solid #99F6E4",
                        background: "#F0FDFA",
                        color: "#0F766E",
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 11.5,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      🗂️ فتح في الأرشيف
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSheetSelection(null);
                      setArchiveStatus(null);
                    }}
                    style={{
                      border: "1px solid #CBD5E1",
                      background: "#fff",
                      color: "#475569",
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    إخفاء
                  </button>
                </div>
              </div>
            )}

            {memberMode === "existing" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>بحث في الفهرس</label>
                  <input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder={`ابحث بالاسم أو ${cfg.numberLabel}`}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{cfg.memberLabel} *</label>
                  <select
                    value={memberId}
                    onChange={(event) => selectMember(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">اختر {cfg.memberLabel}...</option>
                    {filteredMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name} — {cfg.numberLabel}: {member.external_id || "—"}
                      </option>
                    ))}
                  </select>
                  {memberName && (
                    <div style={{ fontSize: 11.5, color: "#047857", marginTop: 5, fontWeight: 800, lineHeight: 1.7 }}>
                      ✅ {memberName} — {cfg.numberLabel}: {memberNumber || "—"}
                      {memberJobTitle ? ` • ${memberJobTitle}` : ""}
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>{cfg.numberLabel} *</label>
                  <input
                    value={memberNumber}
                    onChange={(event) => setMemberNumber(event.target.value)}
                    placeholder={cfg.numberPlaceholder}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>المسمى الوظيفي</label>
                  <input
                    value={memberJobTitle}
                    onChange={(event) => setMemberJobTitle(event.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>اسم {cfg.memberLabel} *</label>
                  <input
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    placeholder={`اسم ${cfg.memberLabel}`}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{cfg.numberLabel} *</label>
                  <input
                    value={memberNumber}
                    onChange={(event) => setMemberNumber(event.target.value)}
                    placeholder={cfg.numberPlaceholder}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>المسمى الوظيفي</label>
                  <input
                    value={memberJobTitle}
                    onChange={(event) => setMemberJobTitle(event.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>الإدارة / القسم</label>
                  <input
                    value={memberDepartment}
                    onChange={(event) => setMemberDepartment(event.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}
          </div>

          <div style={sectionBoxStyle}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942", marginBottom: 12 }}>
              3) تفاصيل {selectedType?.name || "التبليغ"}
            </div>

            {!selectedType ? (
              <div style={{ color: "#64748B", fontSize: 13 }}>اختر نوع التبليغ لعرض الحقول المناسبة.</div>
            ) : fields.length === 0 ? (
              <div style={{ color: "#64748B", fontSize: 13 }}>لا توجد حقول إضافية لهذا النوع.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
                {fields.map((field) => {
                  const value = values[field.key] ?? "";
                  const isWide = field.type === "textarea";

                  return (
                    <div key={field.key} style={isWide ? { gridColumn: "1 / -1" } : undefined}>
                      <label style={labelStyle}>
                        {field.label} {field.required ? "*" : ""}
                      </label>

                      {field.type === "select" ? (
                        <select
                          value={value}
                          onChange={(event) => setFieldValue(field.key, event.target.value)}
                          style={inputStyle}
                        >
                          <option value="">اختر...</option>
                          {(field.options && field.options.length > 0
                            ? field.options
                            : field.key === "promotion_from" || field.key === "promotion_to"
                              ? PROMOTION_LADDER
                              : []
                          ).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea
                          value={value}
                          onChange={(event) => setFieldValue(field.key, event.target.value)}
                          rows={3}
                          style={{ ...inputStyle, resize: "vertical" }}
                        />
                      ) : field.type === "checkbox" ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "10px 0" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(event) => setFieldValue(field.key, event.target.checked)}
                            style={{ transform: "scale(1.2)" }}
                          />
                          نعم
                        </label>
                      ) : (
                        <input
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          value={value}
                          onChange={(event) => setFieldValue(field.key, event.target.value)}
                          style={inputStyle}
                          step={field.type === "number" ? "any" : undefined}
                        />
                      )}

                      {field.key === "promotion_to" && section === "faculty" && values.promotion_from && (
                        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 5 }}>
                          التسلسل: {PROMOTION_LADDER.join(" ← ")}
                          {nextPromotionRank(values.promotion_from) ? ` • التالي: ${nextPromotionRank(values.promotion_from)}` : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>ملاحظات</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="ملاحظات إضافية على التبليغ..."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>

          <div style={sectionBoxStyle}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942", marginBottom: 12 }}>
              4) المرفقات
            </div>

            {loadingAttachments && (
              <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>جاري تحميل المرفقات...</div>
            )}

            {visibleAttachments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {visibleAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 9,
                      padding: "8px 10px",
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "#334155", fontWeight: 700 }}>
                      📎 {attachment.file_name}
                      {attachment.created_at ? ` — ${formatDate(attachment.created_at)}` : ""}
                    </span>
                    <span style={{ display: "flex", gap: 8 }}>
                      <FileAnchor
                        fileRef={attachment.file_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "#1D4ED8", fontWeight: 800, textDecoration: "none" }}
                      >
                        فتح
                      </FileAnchor>
                      <FileDownloadLink
                        fileRef={attachment.file_url}
                        fileName={attachment.file_name}
                        style={{ fontSize: 12, color: "#047857", fontWeight: 800, textDecoration: "none" }}
                      >
                        تحميل
                      </FileDownloadLink>
                      <button
                        type="button"
                        onClick={() =>
                          setRemovedAttachmentIds((current) => [...current, attachment.id])
                        }
                        style={{
                          border: 0,
                          background: "#FEE2E2",
                          color: "#B91C1C",
                          borderRadius: 7,
                          padding: "4px 8px",
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        حذف
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {newFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {newFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      background: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12.5,
                      color: "#065F46",
                    }}
                  >
                    <span>🆕 {file.name}</span>
                    <button
                      type="button"
                      onClick={() => setNewFiles((current) => current.filter((_, i) => i !== index))}
                      style={{
                        border: 0,
                        background: "transparent",
                        color: "#B91C1C",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input type="file" multiple onChange={handleFiles} style={{ fontSize: 12.5 }} />
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6 }}>
              الحد الأقصى للملف 25 ميجابايت. تُحفظ المرفقات في قاعدة البيانات والتخزين، وتبقى مرتبطة بالتبليغ.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "12px 18px",
            borderTop: "1px solid #E2E8F0",
            background: "#F8FAFC",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: "1px solid #CBD5E1",
              background: "#fff",
              color: "#334155",
              borderRadius: 10,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
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
              background: saving ? "#94A3B8" : cfg.accent,
              color: "#fff",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 900,
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: "0 6px 16px rgba(37,99,235,.2)",
            }}
          >
            {saving ? "⏳ جاري الحفظ..." : isEditing ? "💾 حفظ التعديل" : "💾 حفظ وإرسال للمراجعة"}
          </button>
        </div>
      </div>

      {showSheetPicker && (
        <NotificationSheetImportModal
          section={section}
          mode="select"
          members={members}
          onClose={() => setShowSheetPicker(false)}
          onSelect={handleSheetSelect}
        />
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { getSectionConfig } from "./notificationsConfig";
import {
  buildSheetRecords,
  cleanArabicText,
  normalizeArabicForSearch,
  normalizeMemberNumber,
  parseNotificationSheet,
} from "../utils/notificationSheet";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "#fff",
  color: "#0F2942",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 5,
};

const smallButtonStyle = {
  border: "1px solid #CBD5E1",
  background: "#fff",
  color: "#334155",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

function recordKey(record) {
  return `${record.external_id || "no-number"}-${record.rowNumber}`;
}

export default function NotificationSheetImportModal({
  section,
  mode = "select",
  members = [],
  onClose,
  onSelect,
  onImport,
}) {
  const cfg = getSectionConfig(section);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({
    name: -1,
    number: -1,
    job: -1,
    department: -1,
  });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selectingKey, setSelectingKey] = useState("");
  const [importing, setImporting] = useState(false);

  const records = useMemo(
    () =>
      parsed
        ? buildSheetRecords(parsed.rows, parsed.headerIndex, mapping)
        : [],
    [parsed, mapping]
  );

  const withNumber = useMemo(
    () => records.filter((record) => record.external_id).length,
    [records]
  );
  const withoutNumber = records.length - withNumber;

  const filtered = useMemo(() => {
    const q = normalizeArabicForSearch(search);
    const list = q
      ? records.filter((record) =>
          normalizeArabicForSearch(
            [
              record.full_name,
              record.external_id,
              record.job_title,
              record.department,
            ].join(" ")
          ).includes(q)
        )
      : records;
    return list.slice(0, mode === "select" ? 200 : 50);
  }, [records, search, mode]);

  const mappingInvalid =
    mapping.name < 0 || mapping.number < 0 || mapping.name === mapping.number;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setError("");
    setParsed(null);
    setSearch("");

    try {
      const result = await parseNotificationSheet(file);
      setParsed(result);
      setMapping(result.mapping);
      if (result.records.length === 0) {
        setError(
          "تم قراءة الملف لكن لم يتم العثور على صفوف تحتوي على أسماء. اختر عمود الاسم يدويًا من القائمة."
        );
      }
    } catch (parseError) {
      console.error("خطأ في قراءة شيت التبليغات:", parseError);
      setError(parseError.message || "تعذر قراءة ملف Excel.");
    } finally {
      setParsing(false);
    }
  };

  const findExistingMember = (record) => {
    const numberKey = normalizeMemberNumber(record.external_id);
    const nameKey = normalizeArabicForSearch(record.full_name);

    return (
      (members || []).find(
        (member) =>
          numberKey &&
          normalizeMemberNumber(member.external_id) === numberKey
      ) ||
      (members || []).find(
        (member) =>
          nameKey &&
          normalizeArabicForSearch(member.full_name) === nameKey
      ) ||
      null
    );
  };

  const resolveArchive = async (record) => {
    if (!cfg.archiveTable) {
      return {
        supported: false,
        found: false,
        count: 0,
        number: record.external_id,
      };
    }

    const number = normalizeMemberNumber(record.external_id);
    if (!number) {
      return { supported: true, found: false, count: 0, number: "" };
    }

    const exact = await supabase
      .from(cfg.archiveTable)
      .select("computer_number", { count: "exact" })
      .eq("computer_number", number)
      .limit(1);

    if (exact.error) throw exact.error;
    if (exact.data?.length > 0) {
      return {
        supported: true,
        found: true,
        count: exact.count || exact.data.length,
        number: exact.data[0].computer_number || number,
      };
    }

    /* بعض الأرشيفات القديمة تحفظ الجزء الأول فقط قبل الشرطة. */
    const prefix = number.split("-")[0];
    if (prefix && prefix !== number) {
      const prefixed = await supabase
        .from(cfg.archiveTable)
        .select("computer_number", { count: "exact" })
        .like("computer_number", `${prefix}%`)
        .limit(2);

      if (prefixed.error) throw prefixed.error;
      if (prefixed.data?.length === 1) {
        return {
          supported: true,
          found: true,
          count: prefixed.count || 1,
          number: prefixed.data[0].computer_number || number,
        };
      }
    }

    return { supported: true, found: false, count: 0, number };
  };

  const handleSelect = async (record) => {
    if (!record.external_id) {
      setError("هذا الصف لا يحتوي على رقم صرف/عامل. اختر عمود الرقم الصحيح أو أضف الرقم يدويًا.");
      return;
    }
    if (selectingKey) return;

    setSelectingKey(recordKey(record));
    setError("");

    try {
      let archive;
      try {
        archive = await resolveArchive(record);
      } catch (archiveError) {
        console.error("تعذر التحقق من الأرشيف:", archiveError);
        archive = {
          supported: Boolean(cfg.archiveTable),
          found: false,
          count: 0,
          number: record.external_id,
          error: archiveError.message || String(archiveError),
        };
      }

      const linkedNumber = archive.number || record.external_id;
      const linkedRecord = { ...record, external_id: linkedNumber };
      const member = findExistingMember(linkedRecord);

      if (onSelect) onSelect({ record: linkedRecord, member, archive });
    } catch (selectError) {
      console.error("خطأ في اختيار العضو من الشيت:", selectError);
      setError(selectError.message || "تعذر اختيار العضو.");
    } finally {
      setSelectingKey("");
    }
  };

  const handleImport = async () => {
    if (!onImport) return;
    if (mappingInvalid) {
      setError("حدد عمود الاسم وعمود الرقم بشكل صحيح قبل الاستيراد.");
      return;
    }

    const importable = records.filter(
      (record) => record.full_name && record.external_id
    );
    if (importable.length === 0) {
      setError("لا توجد صفوف تحتوي على اسم ورقم صرف/عامل صالحين للاستيراد.");
      return;
    }

    setImporting(true);
    setError("");
    try {
      await onImport(importable, {
        fileName: parsed?.fileName || "",
        sheetName: parsed?.sheetName || "",
      });
    } catch (importError) {
      console.error("خطأ في استيراد شيت الفهرس:", importError);
      setError(importError.message || "تعذر استيراد الشيت إلى الفهرس.");
    } finally {
      setImporting(false);
    }
  };

  const title =
    mode === "import"
      ? `استيراد شيت Excel إلى فهرس ${cfg.membersLabel}`
      : `اختيار ${cfg.memberLabel} من شيت Excel`;

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.74)",
        zIndex: 3400,
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
            padding: "14px 18px",
            borderBottom: "1px solid #E2E8F0",
            background: cfg.accentSoft,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#0F2942" }}>
              📥 {title}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3, lineHeight: 1.8 }}>
              ارفع شيت الوظائف أو أرقام الصرف، ثم اختر العضو المطلوب. الربط بالأرشيف
              يتم تلقائيًا عبر رقم الصرف/رقم الكمبيوتر دون نسخ أي ملفات.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...smallButtonStyle, color: "#B91C1C" }}>
            ✕ إغلاق
          </button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          <div
            style={{
              border: "1px dashed #93C5FD",
              background: "#EFF6FF",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: "#1E3A8A" }}>
                {parsed ? `📄 ${parsed.fileName}` : "اختر ملف Excel أو CSV"}
              </div>
              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3 }}>
                {parsed
                  ? `الورقة: ${parsed.sheetName} • عدد الصفوف المقروءة: ${records.length}`
                  : "الصيغ المدعومة: xlsx / xls / csv"}
              </div>
            </div>
            <label
              style={{
                border: 0,
                background: cfg.accent,
                color: "#fff",
                borderRadius: 9,
                padding: "9px 15px",
                fontSize: 13,
                fontWeight: 900,
                cursor: parsing ? "wait" : "pointer",
                opacity: parsing ? 0.65 : 1,
              }}
            >
              {parsing ? "⏳ جاري القراءة..." : "📥 اختيار ملف"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                disabled={parsing}
                style={{ display: "none" }}
              />
            </label>
          </div>

          {error && (
            <div
              style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                borderRadius: 10,
                padding: "9px 12px",
                fontSize: 12.5,
                lineHeight: 1.8,
                marginBottom: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {parsed && (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 900, color: "#0F2942", marginBottom: 8 }}>
                🔗 مطابقة الأعمدة
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                {[
                  ["name", "عمود الاسم *"],
                  ["number", `عمود ${cfg.numberLabel} *`],
                  ["job", "عمود الوظيفة (اختياري)"],
                  ["department", "عمود المجموعة/القسم (اختياري)"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <select
                      value={mapping[key]}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value={-1}>— بدون —</option>
                      {(parsed.headers || []).map((header, index) => (
                        <option key={`${key}-${index}`} value={index}>
                          {index + 1}. {cleanArabicText(header) || "—"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {mappingInvalid && (
                <div
                  style={{
                    background: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    color: "#92400E",
                    borderRadius: 9,
                    padding: "8px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  ⚠️ يجب اختيار عمود الاسم وعمود الرقم، ولا يمكن استخدام نفس العمود لكليهما.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ background: "#F1F5F9", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, color: "#334155" }}>
                  إجمالي الأعضاء: {records.length}
                </span>
                <span style={{ background: "#D1FAE5", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, color: "#047857" }}>
                  لديهم رقم: {withNumber}
                </span>
                {withoutNumber > 0 && (
                  <span style={{ background: "#FEF3C7", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, color: "#92400E" }}>
                    بدون رقم: {withoutNumber}
                  </span>
                )}
              </div>

              {mode === "select" ? (
                <>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`🔎 ابحث بالاسم أو ${cfg.numberLabel} أو الوظيفة...`}
                    style={{ ...inputStyle, marginBottom: 10 }}
                  />

                  {filtered.length === 0 ? (
                    <div style={{ padding: 28, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                      لا توجد نتائج مطابقة داخل الشيت.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 360, overflowY: "auto", paddingLeft: 3 }}>
                      {filtered.map((record) => {
                        const key = recordKey(record);
                        const isSelecting = selectingKey === key;
                        const disabled = !record.external_id || Boolean(selectingKey);
                        return (
                          <div
                            key={key}
                            style={{
                              border: "1px solid #E2E8F0",
                              borderRadius: 10,
                              padding: "9px 11px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              background: record.external_id ? "#fff" : "#FFFBEB",
                            }}
                          >
                            <div style={{ minWidth: 220, flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 900, color: "#0F2942" }}>
                                {record.full_name}
                              </div>
                              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2, lineHeight: 1.8 }}>
                                {cfg.numberLabel}: {record.external_id || "—"}
                                {record.job_title ? ` • ${record.job_title}` : ""}
                                {record.department ? ` • ${record.department}` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelect(record)}
                              disabled={disabled}
                              style={{
                                ...smallButtonStyle,
                                border: 0,
                                background: disabled ? "#E2E8F0" : cfg.accent,
                                color: disabled ? "#94A3B8" : "#fff",
                                cursor: disabled ? "not-allowed" : "pointer",
                              }}
                            >
                              {isSelecting ? "⏳ جاري التحقق..." : "اختيار وربط"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {records.length > filtered.length && (
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                      يتم عرض {filtered.length} من أصل {records.length}. استخدم البحث لتضييق النتائج.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    style={{
                      border: "1px solid #E2E8F0",
                      borderRadius: 10,
                      overflow: "hidden",
                      marginBottom: 12,
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC" }}>
                          <th style={{ padding: "8px 10px", fontSize: 11.5, color: "#475569", textAlign: "right" }}>#</th>
                          <th style={{ padding: "8px 10px", fontSize: 11.5, color: "#475569", textAlign: "right" }}>الاسم</th>
                          <th style={{ padding: "8px 10px", fontSize: 11.5, color: "#475569", textAlign: "right" }}>{cfg.numberLabel}</th>
                          <th style={{ padding: "8px 10px", fontSize: 11.5, color: "#475569", textAlign: "right" }}>الوظيفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 20).map((record) => (
                          <tr key={recordKey(record)} style={{ borderTop: "1px solid #EEF2F7" }}>
                            <td style={{ padding: "7px 10px", fontSize: 11.5, color: "#94A3B8" }}>{record.rowNumber}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: "#334155", fontWeight: 800 }}>{record.full_name}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: "#334155" }}>{record.external_id || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 11.5, color: "#64748B" }}>{record.job_title || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.8 }}>
                      سيتم إضافة/تحديث {withNumber} عضوًا في فهرس {cfg.membersLabel}.
                      {withoutNumber > 0 ? ` سيتم تجاهل ${withoutNumber} صفًا بدون رقم.` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={importing || mappingInvalid || withNumber === 0}
                      style={{
                        border: 0,
                        background: importing || mappingInvalid || withNumber === 0 ? "#94A3B8" : cfg.accent,
                        color: "#fff",
                        borderRadius: 9,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 900,
                        cursor: importing ? "wait" : "pointer",
                      }}
                    >
                      {importing ? "⏳ جاري الاستيراد..." : `📥 استيراد ${withNumber} عضوًا إلى الفهرس`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #E2E8F0",
            background: "#F8FAFC",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

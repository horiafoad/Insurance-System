// ============================================================================
// SmartFacultyArchivePage.jsx
// ---------------------------------------------------------------------------
// الأرشيف الذكي لأعضاء هيئة التدريس.
//
// الصفحة مبنية بنفس هوية صفحات الأرشيف الموجودة (FacultySalaryArchivePage):
//   • غلاف الصفحة بالتدرّج اللوني + العنوان الرئيسي + زر التحديث + الإشعارات
//   • شريط معلومات أبيض مضغوط
//   • تبويبات داكنة/فاتحة
//   • بطاقات بيضاء بحواف خفيفة
// حتى لا يظهر «صفحة جديدة» داخل النظام.
//
// ما يقدّمه:
//   • سجل مركزي واحد لكل عضو (مستورد من Excel) — لا تكرار.
//   • ربط العضو بالمطالبات والطلبات والقضايا والخطابات والأوامر التنفيذية
//     والمهام ومفردات المرتب، مع إظهار مصدر المطابقة (تلقائي / يدوي).
//   • رفع ملفات PDF للعضو إلى التخزين المشترك، فتُفتح لأي مستخدم من أي
//     جهاز (وليست مرتبطة بجهاز من رفعها).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LINK_SOURCES,
  LINK_TYPES,
  fetchMembers,
  fetchAllLinks,
  fetchAllDocuments,
  fetchAliases,
  fetchMemberDocuments,
  fetchMemberLinks,
  fetchSourceRecord,
  addAlias,
  removeAlias,
  createLink,
  deleteLink,
  uploadMemberDocument,
  deleteMemberDocument,
  downloadMemberDocument,
  openMemberDocument,
  searchSourceRecords,
  createOrFindMember,
} from "../services/facultyArchiveService";
import { normalizeArabicKey, formatArabicNumber, normalizeMemberCode, toDisplayName } from "../utils/arabicText";
import { analyzeArchiveFile } from "../utils/facultyArchiveMatcher";
import { autoLinkFacultySources } from "../services/facultyAutoLinkService";
import { fetchStudyLeaves } from "../services/studyLeavesService";

/* ------------------------------------------------------------------ */
/* أدوات العرض                                                         */
/* ------------------------------------------------------------------ */

const PAGE_TITLE = "الأرشيف الذكي لأعضاء هيئة التدريس";
const PAGE_SUBTITLE =
  "سجل مركزي واحد لكل عضو، يربطه بالمطالبات والطلبات والقضايا والخطابات والأوامر التنفيذية ومفردات المرتب، مع حفظ الملفات وفتحها لأي مستخدم.";

function formatDate(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length !== 3) return text;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function fileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

const MATCH_LABEL = {
  normalized_name: "تطابق اسم",
  text_contains: "تطابق نصي",
  alias: "اسم بديل",
  manual: "ربط يدوي",
  exact_code: "تطابق رقم",
  similar_name: "تشابه اسم",
  partial_name: "اسم مختصر",
};

/**
 * توحيد صيغ الدرجة في القائمة فقط.
 * الملف نفسه فيه أكثر من كتابة للدرجة الواحدة (ثالثة / الثالثه / عالية / عليا).
 * القيمة الأصلية تبقى كما وردت في الملف، والتوحيد للفلترة والعرض فقط.
 */
const GRADE_CANONICAL = {
  "ثالثه": "ثالثة",
  "ثانيه": "ثانية",
  "عاليه": "عليا",
  "عاليا": "عليا",
  "مدير عام": "مدير عام",
  "ممتازه": "ممتازة",
};

function canonicalGrade(value) {
  if (!value) return "";
  const key = normalizeArabicKey(value).replace(/^ال/, "").trim();
  return GRADE_CANONICAL[key] || String(value).trim();
}

/* ------------------------------------------------------------------ */
/* كارت عضو                                                            */
/* ------------------------------------------------------------------ */
function MemberCard({ member, linkCount, docCount, onOpen }) {
  const code = member.member_code || "—";
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        textAlign: "right",
        background: "#fff",
        border: "1px solid #E7EBF0",
        borderRadius: 14,
        padding: 16,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(15,41,66,.04)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "inherit",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: "#EFF6FF",
            color: "#2563EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          👨‍🏫
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 900,
              color: "#102A43",
              lineHeight: 1.5,
            }}
          >
            {member.full_name}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
            {member.job_title || "—"}
            {member.grade ? ` • ${member.grade}` : ""}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          fontSize: 11.5,
          color: "#475569",
        }}
      >
        <span
          style={{
            background: "#F1F5F9",
            borderRadius: 999,
            padding: "3px 9px",
            fontWeight: 800,
          }}
          title="رقم الصرف"
        >
          #{code}
        </span>
        {member.grade_date && (
          <span
            style={{
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 999,
              padding: "3px 9px",
              fontWeight: 700,
            }}
            title="تاريخ الدرجة"
          >
            🗓️ {formatDate(member.grade_date)}
          </span>
        )}
        {member.group_name && (
          <span
            style={{
              background: "#FEF3C7",
              color: "#92400E",
              borderRadius: 999,
              padding: "3px 9px",
              fontWeight: 800,
            }}
            title="اسم المجموعة"
          >
            🗂️ {member.group_name}
          </span>
        )}
        {member.salary_306 != null && (
          <span
            style={{
              background: "#ECFDF5",
              color: "#065F46",
              borderRadius: 999,
              padding: "3px 9px",
              fontWeight: 800,
            }}
            title="مرتب 30/6"
          >
            💰 {formatArabicNumber(member.salary_306)}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          fontSize: 12,
          color: "#64748B",
          borderTop: "1px solid #EEF2F6",
          paddingTop: 9,
          marginTop: "auto",
        }}
      >
        <span>🔗 {linkCount} ارتباط</span>
        <span>📎 {docCount} ملف</span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* نافذة الربط اليدوي                                                  */
/* ------------------------------------------------------------------ */
function LinkPicker({ member, onClose, onLinked }) {
  const [linkType, setLinkType] = useState("claim");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setBusy(true);
      setError("");
      try {
        const rows = await searchSourceRecords(linkType, query);
        if (alive) setResults(rows);
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setBusy(false);
      }
    };
    const timer = setTimeout(run, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [linkType, query]);

  const source = LINK_SOURCES[linkType];

  const attach = async (item) => {
    setBusy(true);
    setError("");
    try {
      await createLink({
        memberId: member.id,
        linkType,
        refTable: source.table,
        refId: item.id,
        refLabel: item.label,
        snapshot: item.row,
        matchedBy: "manual",
        confidence: 1,
      });
      setDone((n) => n + 1);
      onLinked?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: 20, color: "#102A43" }}>
            ربط سجل مع: {member.full_name}
          </h3>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            ✕
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {LINK_TYPES.filter(
            (t) => LINK_SOURCES[t].table && t !== "study_leave"
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLinkType(t)}
              style={{
                border: linkType === t ? "1px solid #1E3A5F" : "1px solid #DCE6F2",
                background: linkType === t ? "#1E3A5F" : "#fff",
                color: linkType === t ? "#fff" : "#334A63",
                borderRadius: 9,
                padding: "7px 13px",
                fontWeight: 800,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {LINK_SOURCES[t].icon} {LINK_SOURCES[t].label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`🔎 بحث في ${source.label}…`}
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 14,
            marginBottom: 12,
            fontFamily: "inherit",
          }}
        />

        {error && <div style={errorBoxStyle}>{error}</div>}
        {done > 0 && (
          <div style={successBoxStyle}>✅ تم الربط — عدد السجلات المضافة: {done}</div>
        )}

        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {busy && !results.length && (
            <div style={emptyStyle}>جارٍ البحث…</div>
          )}
          {!busy && !results.length && (
            <div style={emptyStyle}>لا توجد نتائج مطابقة.</div>
          )}
          {results.map((item) => (
            <div
              key={`${linkType}-${item.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                border: "1px solid #EEF2F6",
                borderRadius: 10,
                padding: 10,
                marginBottom: 7,
                background: "#fff",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1E293B" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                  {item.sub}
                </div>
              </div>
              <button
                type="button"
                onClick={() => attach(item)}
                disabled={busy}
                style={{
                  border: 0,
                  background: "#047857",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "7px 13px",
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: busy ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                ربط
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* نافذة تفاصيل العضو                                                  */
/* ------------------------------------------------------------------ */
function MemberDetail({ member, onClose, onChanged, currentUser }) {
  const [links, setLinks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [tab, setTab] = useState("documents");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [picker, setPicker] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [uploadMeta, setUploadMeta] = useState({ docType: "salary", title: "", year: "", month: "" });
  const fileRef = useRef(null);
  const sourceCache = useRef({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const [l, d, a] = await Promise.all([
          fetchMemberLinks(member.id),
          fetchMemberDocuments(member.id),
          fetchAliases(),
        ]);
        if (!alive) return;
        setLinks(l);
        setDocuments(d);
        setAliases(a.filter((x) => x.member_id === member.id));
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [member.id]);

  /* جلب السجل الأصلي لكل رابط (حيًّا) */
  useEffect(() => {
    let alive = true;
    links.forEach(async (link) => {
      if (!link.ref_table) return;
      const key = `${link.ref_table}:${link.ref_id}`;
      if (sourceCache.current[key]) return;
      const row = await fetchSourceRecord(link.ref_table, link.ref_id);
      if (!alive) return;
      sourceCache.current = { ...sourceCache.current, [key]: row };
    });
    return () => {
      alive = false;
    };
  }, [links]);

  const linksByType = useMemo(() => {
    const map = {};
    links.forEach((l) => {
      map[l.link_type] = map[l.link_type] || [];
      map[l.link_type].push(l);
    });
    return map;
  }, [links]);

  const doUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await uploadMemberDocument(member, file, {
        docType: uploadMeta.docType,
        title: uploadMeta.title || file.name,
        year: uploadMeta.year ? Number(uploadMeta.year) : null,
        month: uploadMeta.month ? Number(uploadMeta.month) : null,
        createdBy: currentUser?.full_name || currentUser?.username || null,
      });
      setNotice("✅ تم رفع الملف وتسجيله في الأرشيف — يُفتح لأي مستخدم.");
      setUploadMeta({ docType: "salary", title: "", year: "", month: "" });
      const docs = await fetchMemberDocuments(member.id);
      setDocuments(docs);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeDoc = async (doc) => {
    if (!window.confirm(`حذف الوثيقة «${doc.original_filename || doc.title}»؟`)) return;
    setBusy(true);
    try {
      await deleteMemberDocument(doc);
      setDocuments(await fetchMemberDocuments(member.id));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeLnk = async (link) => {
    if (!window.confirm("إزالة هذا الارتباط؟")) return;
    setBusy(true);
    try {
      await deleteLink(link.id);
      setLinks(links.filter((l) => l.id !== link.id));
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addAliasRow = async () => {
    if (!aliasInput.trim()) return;
    setBusy(true);
    setError("");
    try {
      await addAlias(
        member.id,
        aliasInput,
        currentUser?.full_name || currentUser?.username || null
      );
      setAliasInput("");
      const all = await fetchAliases();
      setAliases(all.filter((x) => x.member_id === member.id));
      setNotice("✅ تم إضافة الاسم البديل — أعد تشغيل سكربت الربط لتطبيقه.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeAliasRow = async (id) => {
    setBusy(true);
    try {
      await removeAlias(id);
      setAliases(aliases.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const linkTabs = useMemo(
    () => [
      { id: "documents", label: "📎 الوثائق", count: documents.length },
      ...LINK_TYPES.filter((t) => LINK_SOURCES[t].table).map((t) => ({
        id: t,
        label: `${LINK_SOURCES[t].icon} ${LINK_SOURCES[t].label}`,
        count: (linksByType[t] || []).length,
      })),
      { id: "aliases", label: "🏷️ أسماء بديلة", count: aliases.length },
    ],
    [documents.length, linksByType, aliases.length]
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: "min(1000px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, color: "#102A43" }}>
              {member.full_name}
            </h3>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4 }}>
              {member.job_title || "—"}
              {member.grade ? ` • ${member.grade}` : ""}
              {member.grade_date ? ` • ${formatDate(member.grade_date)}` : ""}
              {" • "}#{member.member_code}
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle}>
            ✕
          </button>
        </div>

        {/* ملخص */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          {[
            { label: "مرتب 30/6", value: formatArabicNumber(member.salary_306) || "—", icon: "💰" },
            { label: "ارتباطات", value: links.length, icon: "🔗" },
            { label: "وثائق", value: documents.length, icon: "📎" },
            { label: "مصدر", value: `م ${member.source_row_no ?? "—"}`, icon: "📄" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                padding: 11,
              }}
            >
              <div style={{ fontSize: 11.5, color: "#64748B" }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0F2942" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {error && <div style={errorBoxStyle}>{error}</div>}
        {notice && <div style={successBoxStyle}>{notice}</div>}

        {/* شريط الأدوات */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            style={primarySmallStyle}
            title="إضافة ملف PDF يُفتح لأي مستخدم"
          >
            📎 إضافة ملف PDF
          </button>
          <button type="button" onClick={() => setPicker(true)} style={secondarySmallStyle}>
            🔗 ربط سجل
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => doUpload(e.target.files?.[0])}
          />
          <select
            value={uploadMeta.docType}
            onChange={(e) => setUploadMeta({ ...uploadMeta, docType: e.target.value })}
            style={smallSelectStyle}
          >
            <option value="salary">مفردة مرتب</option>
            <option value="certificate">شهادة</option>
            <option value="contract">عقد / كتاب</option>
            <option value="decision">قرار</option>
            <option value="other">أخرى</option>
          </select>
          <input
            value={uploadMeta.year}
            onChange={(e) => setUploadMeta({ ...uploadMeta, year: e.target.value })}
            placeholder="السنة"
            style={{ ...smallInputStyle, width: 90 }}
          />
          <input
            value={uploadMeta.month}
            onChange={(e) => setUploadMeta({ ...uploadMeta, month: e.target.value })}
            placeholder="الشهر"
            style={{ ...smallInputStyle, width: 80 }}
          />
        </div>

        {/* التبويبات */}
        <div
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            marginBottom: 12,
            borderBottom: "1px solid #EEF2F6",
            paddingBottom: 10,
          }}
        >
          {linkTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                border: tab === t.id ? "1px solid #1E3A5F" : "1px solid #DCE6F2",
                background: tab === t.id ? "#1E3A5F" : "#fff",
                color: tab === t.id ? "#fff" : "#334A63",
                borderRadius: 9,
                padding: "7px 12px",
                fontWeight: 800,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  style={{
                    background: tab === t.id ? "#fff" : "#EDF0F4",
                    color: tab === t.id ? "#1E3A5F" : "#64748B",
                    borderRadius: 999,
                    padding: "1px 7px",
                    fontSize: 11,
                    fontWeight: 900,
                    marginRight: 5,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ maxHeight: "46vh", overflowY: "auto" }}>
          {/* الوثائق */}
          {tab === "documents" && (
            <div>
              <div style={infoBoxStyle}>
                📁 الملفات تُحفظ في التخزين المشترك وتُفتح لأي مستخدم من أي
                جهاز — وليست مرتبطة بجهاز من رفعها.
              </div>
              {!documents.length && (
                <div style={emptyStyle}>
                  لا توجد وثائق. افتح أي عضو ثم أضف ملف PDF.
                </div>
              )}
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    border: "1px solid #EEF2F6",
                    borderRadius: 10,
                    padding: 11,
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1E293B" }}>
                      📄 {doc.title || doc.original_filename}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                      {doc.original_filename}
                      {doc.year ? ` • ${doc.year}/${String(doc.month || 0).padStart(2, "0")}` : ""}
                      {doc.size_bytes ? ` • ${fileSize(doc.size_bytes)}` : ""}
                      {` • ${formatDate(doc.created_at)}`}
                    </div>
                    {doc.storage_provider === "local" && (
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                        محفوظ على الجهاز: {doc.file_path}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => openMemberDocument(doc)}
                      style={linkPillStyle}
                    >
                      فتح
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadMemberDocument(doc)}
                      style={linkPillStyle}
                    >
                      تنزيل
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDoc(doc)}
                      style={{ ...linkPillStyle, color: "#B91C1C", background: "#FEF2F2" }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* الأقسام المرتبطة */}
          {LINK_TYPES.includes(tab) && (
            <div>
              {!(linksByType[tab] || []).length && (
                <div style={emptyStyle}>
                  لا توجد سجلات في «{LINK_SOURCES[tab].label}» مرتبطة بهذا العضو.
                </div>
              )}
              {(linksByType[tab] || []).map((link) => {
                const live = sourceCache.current[`${link.ref_table}:${link.ref_id}`];
                const source = LINK_SOURCES[link.link_type];
                const title = source?.title
                  ? source.title(live || link.snapshot || link)
                  : link.ref_label;
                const sub = source?.subtitle
                  ? source.subtitle(live || link.snapshot || link)
                  : "";
                return (
                  <div
                    key={link.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      border: "1px solid #EEF2F6",
                      borderRadius: 10,
                      padding: 11,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1E293B" }}>
                        {title || link.ref_label}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                        {sub}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                        {source?.label} • {MATCH_LABEL[link.matched_by] || link.matched_by}
                        {link.ref_date ? ` • ${formatDate(link.ref_date)}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLnk(link)}
                      style={{ ...linkPillStyle, color: "#B91C1C", background: "#FEF2F2" }}
                    >
                      إزالة الربط
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* الأسماء البديلة */}
          {tab === "aliases" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="اسم يظهر في المطالبات/الطلبات (بلا تشكيل)"
                  style={{ ...smallInputStyle, flex: 1, minWidth: 220 }}
                />
                <button type="button" onClick={addAliasRow} style={primarySmallStyle}>
                  إضافة اسم بديل
                </button>
              </div>
              {!aliases.length && (
                <div style={emptyStyle}>
                  لا توجد أسماء بديلة. استخدمها إذا كان الاسم في المطالبات مكتوبًا
                  بشكل مختلف (مثال: «م. د. أحمد»).
                </div>
              )}
              {aliases.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    border: "1px solid #EEF2F6",
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 7,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1E293B" }}>
                    🏷️ {a.alias}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAliasRow(a.id)}
                    style={{ ...linkPillStyle, color: "#B91C1C", background: "#FEF2F2" }}
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <LinkPicker
          member={member}
          onClose={() => setPicker(false)}
          onLinked={() => {
            setNotice("✅ تم إنشاء الربط.");
            fetchMemberLinks(member.id).then((rows) => {
              setLinks(rows);
              onChanged?.();
            });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* الأنماط                                                              */
/* ------------------------------------------------------------------ */
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalStyle = {
  background: "#fff",
  borderRadius: 15,
  width: "min(850px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 22,
  boxSizing: "border-box",
  fontFamily: "'Cairo', 'Segoe UI', sans-serif",
  color: "#172033",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  borderBottom: "1px solid #E5E7EB",
  paddingBottom: 13,
  marginBottom: 18,
};

const closeButtonStyle = {
  border: 0,
  background: "#F1F5F9",
  width: 36,
  height: 36,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 16,
  flexShrink: 0,
};

const primarySmallStyle = {
  border: 0,
  background: "#2563EB",
  color: "#fff",
  borderRadius: 9,
  padding: "9px 14px",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
};

const secondarySmallStyle = {
  border: "1px solid #CBD5E1",
  background: "#fff",
  color: "#334155",
  borderRadius: 9,
  padding: "8px 14px",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
};

const smallInputStyle = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const smallSelectStyle = {
  border: "1px solid #CBD5E1",
  background: "#fff",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
};

const linkPillStyle = {
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  color: "#1D4ED8",
  borderRadius: 7,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const emptyStyle = {
  padding: 26,
  textAlign: "center",
  color: "#94A3B8",
  fontSize: 13.5,
  lineHeight: 1.9,
};

const errorBoxStyle = {
  background: "#FEE2E2",
  border: "1px solid #FECACA",
  color: "#991B1B",
  borderRadius: 9,
  padding: 11,
  marginBottom: 12,
  fontSize: 13,
};

const successBoxStyle = {
  background: "#D1FAE5",
  border: "1px solid #A7F3D0",
  color: "#065F46",
  borderRadius: 9,
  padding: 11,
  marginBottom: 12,
  fontSize: 13,
};

const infoBoxStyle = {
  background: "#EFF6FF",
  border: "1px solid #BFDBFE",
  color: "#1D4ED8",
  borderRadius: 9,
  padding: 11,
  marginBottom: 12,
  fontSize: 13,
  lineHeight: 1.8,
};

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */
export default function SmartFacultyArchivePage({ currentUser }) {
  const [viewMode, setViewMode] = useState("archive");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState("");

  const [members, setMembers] = useState([]);
  const [links, setLinks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [notifyOpen, setNotifyOpen] = useState(false);

  const smartUploadRef = useRef(null);
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartNotice, setSmartNotice] = useState("");
  const [smartError, setSmartError] = useState("");
  const [autoLinkBusy, setAutoLinkBusy] = useState(false);
  const [autoLinkReport, setAutoLinkReport] = useState(null);
  const [autoLinkError, setAutoLinkError] = useState("");
  const [newMemberForm, setNewMemberForm] = useState({
    open: false,
    file: null,
    name: "",
    code: "",
    jobTitle: "",
    status: "active",
    docType: "salary",
    year: "",
    month: "",
    suggested: null,
    ambiguous: false,
    candidates: [],
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, l, d] = await Promise.all([
        fetchMembers(),
        fetchAllLinks(),
        fetchAllDocuments(),
      ]);
      setMembers(m);
      setLinks(l);
      setDocuments(d);
    } catch (err) {
      const code = err?.code || "";
      let hint = "";
      if (code === "42P01") {
        hint =
          "\n\n🚧 الجداول غير موجودة بعد — نفّذي ملف الترحيل " +
          "\"20261021_faculty_smart_archive.sql\" في Supabase SQL Editor.";
      } else if (code === "42501") {
        hint =
          "\n\n🚧 الصلاحيات غير مفعّلة — نفّذي قسم GRANT في ملف الترحيل " +
          "\"20261021_faculty_smart_archive.sql\" في Supabase SQL Editor.";
      } else {
        hint =
          "\n\n🚧 تأكدي من تنفيذ ملف الترحيل " +
          "\"20261021_faculty_smart_archive.sql\" في Supabase SQL Editor.";
      }
      setError(
        "تعذر تحميل بيانات الأرشيف الذكي: " + (err?.message || "") + hint
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAutoLink = useCallback(async () => {
    setAutoLinkBusy(true);
    setAutoLinkError("");
    setAutoLinkReport(null);
    try {
      // نقرأ الإجازات من قاعدة البيانات مباشرة، لا من كاش المتصفح.
      const studyLeaves = await fetchStudyLeaves();
      const report = await autoLinkFacultySources({
        studyLeaves,
      });
      setAutoLinkReport(report);
      await loadAll();
    } catch (err) {
      setAutoLinkError(
        "تعذر الربط التلقائي: " + (err?.message || "خطأ غير معروف")
      );
    } finally {
      setAutoLinkBusy(false);
    }
  }, [loadAll]);

  const confirmAutoLinkCandidate = useCallback(
    async (item, candidate) => {
      setAutoLinkError("");
      try {
        await createLink({
          memberId: candidate.memberId,
          linkType: item.linkType,
          refTable: item.refTable,
          refId: item.refId,
          refLabel: item.label,
          refDate: item.refDate,
          snapshot: item.snapshot,
          matchedBy: "manual",
          confidence: 1,
        });
        setAutoLinkReport((previous) =>
          previous
            ? {
                ...previous,
                review: previous.review.filter(
                  (row) =>
                    !(
                      row.linkType === item.linkType &&
                      row.refId === item.refId
                    )
                ),
                confirmed: (previous.confirmed || 0) + 1,
              }
            : previous
        );
        await loadAll();
      } catch (err) {
        setAutoLinkError(
          "تعذر ربط السجل يدويًا: " + (err?.message || "خطأ غير معروف")
        );
      }
    },
    [loadAll]
  );

  const handleSmartUpload = useCallback(async (file) => {
    if (!file) return;
    setSmartBusy(true);
    setSmartError("");
    setSmartNotice("");
    try {
      const analysis = await analyzeArchiveFile(file, members);
      const suggestedName = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
      const suggestedCode = analysis.code || "";
      const match = analysis.match;

      if (match?.member && !match?.ambiguous) {
        await uploadMemberDocument(match.member, file, {
          docType: analysis.docType || "other",
          title: file.name,
          year: analysis.year || null,
          month: analysis.month || null,
          createdBy: currentUser?.full_name || currentUser?.username || null,
        });
        setSmartNotice(`✅ تم رفع الملف تلقائياً إلى ${match.member.full_name} (${match.reason})`);
        await loadAll();
      } else if (match?.ambiguous && Array.isArray(match.candidates) && match.candidates.length) {
        setNewMemberForm({
          open: true,
          file,
          name: toDisplayName(suggestedName),
          code: normalizeMemberCode(suggestedCode),
          jobTitle: "",
          status: "active",
          docType: analysis.docType || "other",
          year: analysis.year ? String(analysis.year) : "",
          month: analysis.month ? String(analysis.month) : "",
          suggested: analysis,
          ambiguous: true,
          candidates: match.candidates,
        });
        setSmartNotice("⚠️ تطابق متساوٍ بين أكثر من عضو. حدد العضو أو أضف بيانات جديدة.");
      } else {
        setNewMemberForm({
          open: true,
          file,
          name: toDisplayName(suggestedName),
          code: normalizeMemberCode(suggestedCode),
          jobTitle: "",
          status: "active",
          docType: analysis.docType || "other",
          year: analysis.year ? String(analysis.year) : "",
          month: analysis.month ? String(analysis.month) : "",
          suggested: analysis,
          ambiguous: false,
          candidates: [],
        });
        setSmartNotice("⚠️ لم يتم العثور على العضو. أدخل الاسم ورقم الصرف والحالة ثم أضف الملف.");
      }
    } catch (err) {
      setSmartError(err?.message || "فشل التحليل أو الرفع.");
    } finally {
      setSmartBusy(false);
      if (smartUploadRef.current) smartUploadRef.current.value = "";
    }
  }, [members, currentUser, loadAll]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* فهارس مساعدة */
  const linksByMember = useMemo(() => {
    const map = {};
    links.forEach((l) => {
      map[l.member_id] = map[l.member_id] || [];
      map[l.member_id].push(l);
    });
    return map;
  }, [links]);

  const docsByMember = useMemo(() => {
    const map = {};
    documents.forEach((d) => {
      map[d.member_id] = map[d.member_id] || [];
      map[d.member_id].push(d);
    });
    return map;
  }, [documents]);

  const jobOptions = useMemo(
    () => [...new Set(members.map((m) => m.job_title).filter(Boolean))].sort(),
    [members]
  );
  const gradeOptions = useMemo(
    () =>
      [
        ...new Set(members.map((m) => canonicalGrade(m.grade)).filter(Boolean)),
      ].sort(),
    [members]
  );

  const filtered = useMemo(() => {
    const tokens = normalizeArabicKey(search).split(" ").filter(Boolean);
    return members.filter((m) => {
      if (jobFilter && m.job_title !== jobFilter) return false;
      if (gradeFilter && canonicalGrade(m.grade) !== gradeFilter) return false;
      if (linkFilter === "linked" && !(linksByMember[m.id] || []).length) return false;
      if (linkFilter === "unlinked" && (linksByMember[m.id] || []).length) return false;
      if (linkFilter === "docs" && !(docsByMember[m.id] || []).length) return false;
      if (!tokens.length) return true;
      const hay = normalizeArabicKey(
        `${m.full_name} ${m.member_code} ${m.job_title || ""}`
      );
      return tokens.every((t) => hay.includes(t));
    });
  }, [members, search, jobFilter, gradeFilter, linkFilter, linksByMember, docsByMember]);

  const stats = useMemo(
    () => ({
      members: members.length,
      linked: members.filter((m) => (linksByMember[m.id] || []).length).length,
      links: links.length,
      documents: documents.length,
    }),
    [members, links, documents, linksByMember]
  );

  const linkedMembersList = useMemo(
    () => members.filter((m) => (linksByMember[m.id] || []).length),
    [members, linksByMember]
  );

  return (
    <div
      className="fsa-page"
      style={{
        background: "linear-gradient(180deg,#F7FAFD 0%,#F1F5F9 100%)",
        border: "1px solid #E2E8F0",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 1px 3px rgba(15,41,66,.04)",
        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
        color: "#172033",
      }}
    >
      {/* العنوان الرئيسي */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8, fontWeight: 600 }}>
            قسم الاستحقاقات
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>🧠</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0F2942", lineHeight: 1.4 }}>
                {PAGE_TITLE}
              </h2>
              <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 13, lineHeight: 1.8 }}>
                {PAGE_SUBTITLE}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            ref={smartUploadRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => handleSmartUpload(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => smartUploadRef.current?.click()}
            disabled={smartBusy}
            style={{
              border: 0,
              background: "#059669",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 800,
              fontSize: 13,
              cursor: smartBusy ? "not-allowed" : "pointer",
              boxShadow: "0 3px 10px rgba(5,150,105,.22)",
            }}
            title="رفع ذكي يحدد العضو تلقائياً ويضع الملف في مكانه"
          >
            {smartBusy ? "⏳ جارٍ التحليل..." : "🧠 رفع ذكي"}
          </button>
          <button
            type="button"
            onClick={handleAutoLink}
            disabled={autoLinkBusy || loading}
            style={{
              border: 0,
              background: "#B45309",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 800,
              fontSize: 13,
              cursor: autoLinkBusy || loading ? "not-allowed" : "pointer",
              boxShadow: "0 3px 10px rgba(180,83,9,.22)",
            }}
            title="مطابقة أسماء المطالبات والقضايا والإجازات الدراسية مع الأرشيف وربطها تلقائيًا"
          >
            {autoLinkBusy ? "⏳ جارٍ الربط..." : "🔗 ربط تلقائي"}
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            style={{
              border: "1px solid #DCE6F2",
              background: "#fff",
              color: "#334A63",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 800,
              fontSize: 13,
              cursor: loading ? "not-allowed" : "pointer",
            }}
            title="تحديث الأرشيف"
          >
            🔄 تحديث
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setNotifyOpen((v) => !v)}
              style={{
                border: "1px solid #DCE6F2",
                background: "#fff",
                color: "#334A63",
                borderRadius: 10,
                padding: "9px 14px",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
              title="الإشعارات"
            >
              🔔
            </button>
            {notifyOpen && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 8px)",
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  boxShadow: "0 16px 34px rgba(15,41,66,.14)",
                  zIndex: 50,
                  padding: "14px 16px",
                  minWidth: 240,
                  fontSize: 13,
                  color: "#334155",
                  lineHeight: 1.9,
                }}
              >
                أعضاء مسجّلون: <b>{stats.members}</b>
                <br />
                لهم ارتباطات: <b>{stats.linked}</b>
                <br />
                إجمالي الروابط: <b>{stats.links}</b>
                <br />
                وثائق محفوظة: <b>{stats.documents}</b>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* شريط معلومات */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E7EBF0",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 16,
          boxShadow: "0 1px 2px rgba(15,41,66,.04)",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>🧠</span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 14.5, fontWeight: 900, color: "#102A43" }}>
            {PAGE_TITLE}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "#66788F", marginTop: 3 }}>
            📁 ملفات الأرشيف تُحفظ في التخزين المشترك وتُفتح لأي مستخدم من أي
            جهاز.
          </div>
        </div>
      </div>

      {/* التبويبات */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {[
          { id: "archive", label: "🗂️ الأرشيف الذكي" },
          { id: "documents", label: "📎 الوثائق" },
          { id: "links", label: "🔗 سجل الربط" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setViewMode(tab.id)}
            style={{
              border: viewMode === tab.id ? "1px solid #1E3A5F" : "1px solid #DCE6F2",
              background: viewMode === tab.id ? "#1E3A5F" : "#fff",
              color: viewMode === tab.id ? "#fff" : "#334A63",
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
              boxShadow:
                viewMode === tab.id
                  ? "0 3px 10px rgba(30,58,95,.22)"
                  : "0 1px 3px rgba(15,41,66,.04)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(error || smartError) && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            borderRadius: 9,
            padding: 12,
            marginBottom: 14,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            lineHeight: 1.9,
          }}
        >
          {error || smartError}
        </div>
      )}
      {smartNotice && !(error || smartError) && (
        <div
          style={{
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            color: "#065F46",
            borderRadius: 9,
            padding: 12,
            marginBottom: 14,
            fontSize: 13,
            lineHeight: 1.9,
          }}
        >
          {smartNotice}
        </div>
      )}

      {autoLinkError && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #FECACA",
            color: "#991B1B",
            borderRadius: 9,
            padding: 12,
            marginBottom: 14,
            fontSize: 13,
            lineHeight: 1.9,
          }}
        >
          {autoLinkError}
        </div>
      )}

      {autoLinkReport && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            fontSize: 13,
            color: "#78350F",
            lineHeight: 1.9,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            🔗 نتيجة الربط التلقائي بالأرشيف
          </div>
          <div>
            أُضيف <b>{autoLinkReport.created}</b> رابطًا جديدًا.{" "}
            {[
              autoLinkReport.sources?.claim
                ? `مطالبات: ${autoLinkReport.sources.claim.linked}`
                : null,
              autoLinkReport.sources?.issue
                ? `قضايا: ${autoLinkReport.sources.issue.linked}`
                : null,
              autoLinkReport.sources?.study_leave
                ? `إجازات دراسية: ${autoLinkReport.sources.study_leave.linked}`
                : null,
            ]
              .filter(Boolean)
              .join(" • ")}
            {autoLinkReport.existing
              ? ` • موجود مسبقًا: ${autoLinkReport.existing}`
              : ""}
            {autoLinkReport.noMatch
              ? ` • بلا مطابقة: ${autoLinkReport.noMatch}`
              : ""}
            {autoLinkReport.confirmed
              ? ` • تم تأكيدها يدويًا: ${autoLinkReport.confirmed}`
              : ""}
          </div>

          {(autoLinkReport.review || []).length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                ⚠️ أسماء متشابهة تحتاج مراجعة (
                {(autoLinkReport.review || []).length}) — اضغطي لاختيار العضو
                الصحيح
              </summary>
              <div
                style={{
                  maxHeight: 340,
                  overflowY: "auto",
                  marginTop: 8,
                  paddingLeft: 4,
                }}
              >
                {(autoLinkReport.review || []).map((item, index) => (
                  <div
                    key={`${item.linkType}-${item.refId}-${index}`}
                    style={{
                      background: "#fff",
                      border: "1px solid #FDE68A",
                      borderRadius: 10,
                      padding: "9px 11px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#1F2937" }}>
                      [{LINK_SOURCES[item.linkType]?.label || item.linkType}]{" "}
                      {item.name || item.label}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 6,
                      }}
                    >
                      {(item.candidates || []).map((candidate) => (
                        <button
                          key={candidate.memberId}
                          type="button"
                          onClick={() =>
                            confirmAutoLinkCandidate(item, candidate)
                          }
                          style={{
                            border: "1px solid #BFDBFE",
                            background: "#EFF6FF",
                            color: "#1D4ED8",
                            borderRadius: 8,
                            padding: "4px 9px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          title="ربط هذا السجل بالعضو"
                        >
                          {candidate.name} (#{candidate.code || "—"}){" "}
                          {Math.round((candidate.score || 0) * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {autoLinkReport.writeErrors?.length > 0 && (
            <div style={{ color: "#B91C1C", marginTop: 6 }}>
              تعذّر حفظ {autoLinkReport.writeErrors.length} دفعة:{" "}
              {autoLinkReport.writeErrors[0]}
            </div>
          )}
        </div>
      )}

      {/* إحصاء */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          { label: "أعضاء هيئة التدريس", value: stats.members, icon: "👨‍🏫", bg: "#EFF6FF" },
          { label: "أعضاء لهم ارتباطات", value: stats.linked, icon: "🔗", bg: "#ECFDF5" },
          { label: "إجمالي الروابط", value: stats.links, icon: "🧩", bg: "#FEF3C7" },
          { label: "وثائق محفوظة", value: stats.documents, icon: "📎", bg: "#F3E8FF" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "#fff",
              border: "1px solid #E7EBF0",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 2px 8px rgba(15,41,66,.035)",
            }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: s.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              {s.icon}
            </span>
            <div>
              <div style={{ fontSize: 12.5, color: "#64748B" }}>{s.label}</div>
              <div style={{ fontSize: 23, fontWeight: 900, color: "#0F2942" }}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ============ الأرشيف ============ */}
      {viewMode === "archive" && (
        <div>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔎 البحث بالاسم أو رقم الصرف"
              style={{
                flex: 1,
                minWidth: 240,
                border: "1px solid #CBD5E1",
                borderRadius: 8,
                padding: "11px 12px",
                fontSize: 14,
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              style={{
                minWidth: 170,
                border: "1px solid #CBD5E1",
                background: "#fff",
                borderRadius: 8,
                padding: "11px 12px",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              <option value="">كل الوظائف</option>
              {jobOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{
                minWidth: 160,
                border: "1px solid #CBD5E1",
                background: "#fff",
                borderRadius: 8,
                padding: "11px 12px",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              <option value="">كل الدرجات</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value)}
              style={{
                minWidth: 170,
                border: "1px solid #CBD5E1",
                background: "#fff",
                borderRadius: 8,
                padding: "11px 12px",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            >
              <option value="">كل الأعضاء</option>
              <option value="linked">لهم ارتباطات</option>
              <option value="unlinked">بدون ارتباطات</option>
              <option value="docs">لهم وثائق</option>
            </select>
          </div>

          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>
            {loading
              ? "جارٍ التحميل…"
              : `النتائج: ${filtered.length} من ${members.length} عضو`}
          </div>

          {!loading && !filtered.length && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #E7EBF0",
                borderRadius: 14,
                padding: 40,
                textAlign: "center",
                color: "#94A3B8",
                fontSize: 14,
              }}
            >
              لا يوجد أعضاء مطابقون. جرّب تعديل البحث أو الفلاتر.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {filtered.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                linkCount={(linksByMember[m.id] || []).length}
                docCount={(docsByMember[m.id] || []).length}
                onOpen={() => setSelected(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ============ الوثائق ============ */}
      {viewMode === "documents" && (
        <div>
          <div
            style={{
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 12,
              padding: 16,
              marginBottom: 14,
              fontSize: 13,
              color: "#1E40AF",
              lineHeight: 1.9,
            }}
          >
            📎 كل وثائق الأرشيف الذكي. الملفات محفوظة في التخزين المشترك
            وتُفتح لأي مستخدم من أي جهاز.
          </div>

          {!documents.length && (
            <div style={emptyStyle}>
              لا توجد وثائق. افتح أي عضو من تبويب «الأرشيف الذكي» ثم أضف ملف PDF.
            </div>
          )}

          {documents.map((doc) => {
            const owner = members.find((m) => m.id === doc.member_id);
            return (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  background: "#fff",
                  border: "1px solid #E7EBF0",
                  borderRadius: 12,
                  padding: 13,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1E293B" }}>
                    📄 {doc.title || doc.original_filename}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                    {owner ? owner.full_name : "—"}
                    {doc.year ? ` • ${doc.year}/${String(doc.month || 0).padStart(2, "0")}` : ""}
                    {doc.size_bytes ? ` • ${fileSize(doc.size_bytes)}` : ""}
                    {` • ${formatDate(doc.created_at)}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => owner && setSelected(owner)}
                  style={linkPillStyle}
                >
                  فتح العضو
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ سجل الربط ============ */}
      {viewMode === "links" && (
        <div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #E7EBF0",
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              fontSize: 13,
              color: "#475569",
              lineHeight: 1.9,
            }}
          >
            كل الروابط التي تم إنشاؤها بين الأعضاء وبقية أقسام النظام.
            <br />
            «تطابق اسم» = تطابق كامل بعد تطبيع الكتابة العربية.
            <br />
            «تطابق نصي» = الاسم ورد داخل نص السجل (يحتاج مراجعة).
            <br />
            «ربط يدوي» = تم اختياره يدويًا من داخل صفحة العضو.
          </div>

          {!links.length && (
            <div style={emptyStyle}>لا توجد روابط بعد.</div>
          )}

          <div
            style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderRadius: 10,
              overflow: "auto",
              maxHeight: "60vh",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["العضو", "القسم", "نوع المطابقة", "المرجع", "التاريخ"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 10px",
                        background: "#F8FAFC",
                        borderBottom: "1px solid #E2E8F0",
                        textAlign: "right",
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const owner = members.find((m) => m.id === l.member_id);
                  const source = LINK_SOURCES[l.link_type];
                  return (
                    <tr key={l.id} style={{ background: "#fff" }}>
                      <td style={{ padding: 11, borderBottom: "1px solid #EEF2F6" }}>
                        {owner ? (
                          <button
                            type="button"
                            onClick={() => setSelected(owner)}
                            style={{
                              border: 0,
                              background: "transparent",
                              color: "#2563EB",
                              fontWeight: 800,
                              cursor: "pointer",
                              fontSize: 13,
                            }}
                          >
                            {owner.full_name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: 11, borderBottom: "1px solid #EEF2F6" }}>
                        {source?.icon} {source?.label || l.link_type}
                      </td>
                      <td style={{ padding: 11, borderBottom: "1px solid #EEF2F6" }}>
                        {MATCH_LABEL[l.matched_by] || l.matched_by}
                      </td>
                      <td style={{ padding: 11, borderBottom: "1px solid #EEF2F6" }}>
                        {l.ref_label || l.ref_id}
                      </td>
                      <td style={{ padding: 11, borderBottom: "1px solid #EEF2F6" }}>
                        {formatDate(l.ref_date)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {newMemberForm.open && (
        <div style={overlayStyle} onClick={() => setNewMemberForm({ ...newMemberForm, open: false })}>
          <div style={{ ...modalStyle, width: "min(560px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: "#102A43" }}>
                  {newMemberForm.ambiguous ? "تحديد العضو صاحب الملف" : "إضافة عضو جديد ورفع الملف"}
                </h3>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                  📄 {newMemberForm.file?.name}
                </div>
              </div>
              <button type="button" onClick={() => setNewMemberForm({ ...newMemberForm, open: false })} style={closeButtonStyle}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {newMemberForm.ambiguous && newMemberForm.candidates?.length > 0 && (
                <div
                  style={{
                    background: "#FEF3C7",
                    border: "1px solid #FDE68A",
                    color: "#92400E",
                    borderRadius: 9,
                    padding: 11,
                    fontSize: 12.5,
                    lineHeight: 1.8,
                  }}
                >
                  ⚠️ أكثر من عضو يطابق نفس الاسم — اختر العضو الصحيح:
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    {newMemberForm.candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setNewMemberForm({
                            ...newMemberForm,
                            ambiguous: false,
                            candidates: [],
                            name: c.full_name,
                            code: c.member_code,
                            jobTitle: c.job_title || "",
                          });
                        }}
                        style={{ ...linkPillStyle, fontSize: 12 }}
                      >
                        {c.full_name} — #{c.member_code}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label style={{ fontSize: 13, fontWeight: 800 }}>الاسم الكامل *</label>
              <input
                value={newMemberForm.name}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
                placeholder="مثال: د. محمد أحمد"
                style={smallInputStyle}
              />

              <label style={{ fontSize: 13, fontWeight: 800 }}>رقم الصرف *</label>
              <input
                value={newMemberForm.code}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, code: e.target.value })}
                placeholder="مثال: 4716"
                style={smallInputStyle}
              />

              <label style={{ fontSize: 13, fontWeight: 800 }}>الوظيفة (اختياري)</label>
              <input
                value={newMemberForm.jobTitle}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, jobTitle: e.target.value })}
                style={smallInputStyle}
              />

              <label style={{ fontSize: 13, fontWeight: 800 }}>الحالة *</label>
              <select
                value={newMemberForm.status}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, status: e.target.value })}
                style={smallSelectStyle}
              >
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
                <option value="on_leave">في إجازة</option>
                <option value="retired">متقاعد</option>
              </select>

              <label style={{ fontSize: 13, fontWeight: 800 }}>نوع الوثيقة</label>
              <select
                value={newMemberForm.docType}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, docType: e.target.value })}
                style={smallSelectStyle}
              >
                <option value="salary">مفردة مرتب</option>
                <option value="certificate">شهادة</option>
                <option value="contract">عقد / كتاب</option>
                <option value="decision">قرار</option>
                <option value="other">أخرى</option>
              </select>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newMemberForm.year}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, year: e.target.value })}
                  placeholder="السنة"
                  style={{ ...smallInputStyle, flex: 1 }}
                />
                <input
                  value={newMemberForm.month}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, month: e.target.value })}
                  placeholder="الشهر"
                  style={{ ...smallInputStyle, flex: 1 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setNewMemberForm({ ...newMemberForm, open: false })}
                  style={secondarySmallStyle}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={smartBusy}
                  onClick={async () => {
                    try {
                      if (!newMemberForm.name.trim()) throw new Error("الاسم مطلوب.");
                      if (!normalizeMemberCode(newMemberForm.code)) throw new Error("رقم الصرف مطلوب.");
                      setSmartBusy(true);
                      setSmartError("");
                      const member = await createOrFindMember({
                        fullName: newMemberForm.name,
                        memberCode: newMemberForm.code,
                        jobTitle: newMemberForm.jobTitle,
                        status: newMemberForm.status,
                      });
                      const existingCode = normalizeMemberCode(member.member_code);
                      const enteredCode = normalizeMemberCode(newMemberForm.code);
                      await uploadMemberDocument(member, newMemberForm.file, {
                        docType: newMemberForm.docType || "other",
                        title: newMemberForm.file.name,
                        year: newMemberForm.year ? Number(newMemberForm.year) : null,
                        month: newMemberForm.month ? Number(newMemberForm.month) : null,
                        createdBy: currentUser?.full_name || currentUser?.username || null,
                      });
                      setNewMemberForm({ ...newMemberForm, open: false });
                      setSmartNotice(
                        existingCode && enteredCode && existingCode !== enteredCode
                          ? `⚠️ العضو مسجّل مسبقًا برقم صرف ${existingCode} — تم رفع الملف إليه.`
                          : `✅ تم تسجيل العضو ورفع الملف إلى مكانه الصحيح (${member.full_name}).`
                      );
                      await loadAll();
                      setSelected(member);
                    } catch (err) {
                      setSmartError(err?.message || "فشل إضافة العضو أو رفع الملف.");
                    } finally {
                      setSmartBusy(false);
                    }
                  }}
                  style={primarySmallStyle}
                >
                  {smartBusy ? "جاري..." : "حفظ ورفع الملف"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <MemberDetail
          member={selected}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}

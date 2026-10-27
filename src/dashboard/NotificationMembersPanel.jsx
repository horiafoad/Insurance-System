import { useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { getSectionConfig, formatDateTime, statusMeta } from "./notificationsConfig";
import NotificationSheetImportModal from "./NotificationSheetImportModal";

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

/* مبالغ الشيت (أجور موسمين / إجمالي العقد...) محفوظة في metadata.amounts */
function amountEntries(member) {
  const amounts = member?.metadata?.amounts;
  if (!amounts || typeof amounts !== "object") return [];
  return Object.entries(amounts).filter(
    ([, value]) => String(value ?? "").trim() !== ""
  );
}

function toAmountNumber(value) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function formatAmount(value) {
  const num = toAmountNumber(value);
  if (num === null) return String(value ?? "—");
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function NotificationMembersPanel({
  section,
  members,
  reports,
  onRefresh,
  onOpenProfile,
  canManage,
}) {
  const cfg = getSectionConfig(section);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [form, setForm] = useState({
    full_name: "",
    external_id: "",
    job_title: "",
    department: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState("");

  const reportsByMember = useMemo(() => {
    const map = new Map();
    (reports || []).forEach((report) => {
      const keys = [
        report.member_id ? `id:${report.member_id}` : "",
        report.member_number ? `num:${String(report.member_number).trim()}` : "",
      ].filter(Boolean);
      keys.forEach((key) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(report);
      });
    });
    return map;
  }, [reports]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...(members || [])]
      .filter((member) => {
        if (!q) return true;
        return [member.full_name, member.external_id, member.job_title, member.department]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .map((member) => {
        const byId = reportsByMember.get(`id:${member.id}`) || [];
        const byNumber = reportsByMember.get(`num:${String(member.external_id || "").trim()}`) || [];
        const merged = [...byId];
        byNumber.forEach((report) => {
          if (!merged.some((item) => item.id === report.id)) merged.push(report);
        });
        const sorted = merged.sort(
          (a, b) =>
            (Number(b.year) || 0) - (Number(a.year) || 0) ||
            (Number(b.month) || 0) - (Number(a.month) || 0) ||
            new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );
        return { ...member, reports: sorted, latest: sorted[0] || null };
      })
      .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "ar"));
  }, [members, reportsByMember, search]);

  /* إجمالي كل بند مبالغ للصفوف المعروضة (يحترم البحث). */
  const amountTotals = useMemo(() => {
    const map = new Map();
    rows.forEach((member) => {
      amountEntries(member).forEach(([label, value]) => {
        const num = toAmountNumber(value);
        if (num === null) return;
        map.set(label, (map.get(label) || 0) + num);
      });
    });
    return [...map.entries()];
  }, [rows]);

  const openAdd = () => {
    setEditingMember(null);
    setForm({
      full_name: "",
      external_id: "",
      job_title: "",
      department: "",
      is_active: true,
    });
    setError("");
    setShowForm(true);
  };

  const openEdit = (member) => {
    setEditingMember(member);
    setForm({
      full_name: member.full_name || "",
      external_id: member.external_id || "",
      job_title: member.job_title || "",
      department: member.department || "",
      is_active: member.is_active !== false,
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError(`اسم ${cfg.memberLabel} مطلوب.`);
      return;
    }
    if (!form.external_id.trim()) {
      setError(`${cfg.numberLabel} مطلوب.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        section,
        full_name: form.full_name.trim(),
        external_id: form.external_id.trim(),
        job_title: form.job_title.trim() || null,
        department: form.department.trim() || null,
        is_active: Boolean(form.is_active),
        updated_at: new Date().toISOString(),
      };

      if (editingMember) {
        const { error: updateError } = await supabase
          .from("notification_members")
          .update(payload)
          .eq("id", editingMember.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("notification_members")
          .upsert(payload, { onConflict: "section,external_id" });
        if (insertError) throw insertError;
      }

      setShowForm(false);
      await onRefresh();
    } catch (saveError) {
      console.error("خطأ في حفظ عضو الفهرس:", saveError);
      setError(saveError.message || "تعذر حفظ العضو.");
    } finally {
      setSaving(false);
    }
  };

  const handleSheetImport = async (records, meta = {}) => {
    if (!records.length) return;

    const payload = records.map((record) => ({
      section,
      external_id: record.external_id,
      full_name: record.full_name,
      job_title: record.job_title || null,
      department: record.department || null,
      is_active: true,
      metadata: {
        source: "excel_sheet",
        file_name: meta.fileName || "",
        sheet_name: meta.sheetName || "",
        imported_at: new Date().toISOString(),
        amounts: record.amounts || {},
      },
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200);
      const { error: upsertError } = await supabase
        .from("notification_members")
        .upsert(chunk, { onConflict: "section,external_id" });
      if (upsertError) throw upsertError;
    }

    await onRefresh();
    setShowImport(false);
    window.alert(
      `تم استيراد/تحديث ${payload.length} من ${cfg.membersLabel} من شيت Excel إلى الفهرس.\nالربط بالأرشيف يتم تلقائيًا عبر ${cfg.numberLabel} دون نسخ أي ملفات.`
    );
  };

  const syncFromArchive = async () => {
    if (!cfg.archiveTable || !cfg.archiveNameColumn) return;
    setSyncing(true);
    setError("");
    try {
      const rowsFromArchive = [];
      let offset = 0;
      while (true) {
        const { data, error: loadError } = await supabase
          .from(cfg.archiveTable)
          .select(`computer_number, ${cfg.archiveNameColumn}`)
          .order("computer_number", { ascending: true })
          .range(offset, offset + 999);
        if (loadError) throw loadError;
        rowsFromArchive.push(...(data || []));
        if (!data || data.length < 1000) break;
        offset += 1000;
      }

      const unique = new Map();
      rowsFromArchive.forEach((row) => {
        const number = String(row.computer_number || "").trim();
        const name = String(row[cfg.archiveNameColumn] || "").trim();
        if (number && name && !unique.has(number)) unique.set(number, name);
      });

      const payload = [...unique.entries()].map(([external_id, full_name]) => ({
        section,
        external_id,
        full_name,
        metadata: { source: cfg.archiveTable },
        updated_at: new Date().toISOString(),
      }));

      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error: upsertError } = await supabase
          .from("notification_members")
          .upsert(chunk, { onConflict: "section,external_id" });
        if (upsertError) throw upsertError;
      }

      await onRefresh();
      window.alert(`تمت مزامنة ${payload.length} من ${cfg.membersLabel} من الأرشيف (بدون نسخ الملفات).`);
    } catch (syncError) {
      console.error("خطأ في مزامنة فهرس الأعضاء:", syncError);
      setError(syncError.message || "تعذرت المزامنة من الأرشيف.");
    } finally {
      setSyncing(false);
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
              📇 فهرس {cfg.membersLabel}
            </div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.8 }}>
              لكل عضو ملف ثابت. اضغط على «ملف العضو» لعرض جميع تبليغاته السابقة والحالية.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                style={{
                  ...smallButtonStyle,
                  background: "#EFF6FF",
                  color: "#1D4ED8",
                }}
              >
                📥 رفع شيت Excel
              </button>
            )}
            {cfg.archiveTable && canManage && (
              <button
                type="button"
                onClick={syncFromArchive}
                disabled={syncing}
                style={{
                  ...smallButtonStyle,
                  background: "#F0FDFA",
                  color: "#0F766E",
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                {syncing ? "⏳ جاري المزامنة..." : "🔄 مزامنة من أرشيف المرتبات"}
              </button>
            )}
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
                ＋ إضافة {cfg.memberLabel}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`🔎 ابحث بالاسم أو ${cfg.numberLabel}...`}
            style={{ ...inputStyle, flex: "1 1 260px" }}
          />
          <div style={{ fontSize: 12.5, color: "#64748B", alignSelf: "center" }}>
            عدد الأعضاء: {rows.length}
          </div>
        </div>

        {amountTotals.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {amountTotals.map(([label, total]) => (
              <span
                key={label}
                style={{
                  background: "#F0F9FF",
                  border: "1px solid #BAE6FD",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#0C4A6E",
                }}
              >
                إجمالي {label}: {formatAmount(total)}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: "9px 12px", fontSize: 12.5 }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
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
          لا يوجد أعضاء في الفهرس. {canManage ? "أضف عضوًا أو زامن من أرشيف المرتبات." : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((member) => (
            <div
              key={member.id}
              style={{
                background: "#fff",
                border: "1px solid #E7EBF0",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                opacity: member.is_active === false ? 0.65 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220, flex: 1 }}>
                <span
                  style={{
                    width: 42,
                    height: 42,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${cfg.accent}, #5B8BC9)`,
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {(member.full_name || "؟").trim().charAt(0)}
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#0F2942" }}>
                    {member.full_name}
                    {member.is_active === false ? " (موقوف)" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {cfg.numberLabel}: {member.external_id || "—"}
                    {member.job_title ? ` • ${member.job_title}` : ""}
                    {member.department ? ` • ${member.department}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4 }}>
                    التبليغات: {member.reports.length}
                    {member.latest
                      ? ` • آخر تبليغ: ${statusMeta(member.latest.status).label} — ${formatDateTime(member.latest.created_at)}`
                      : " • لا توجد تبليغات بعد"}
                  </div>
                  {amountEntries(member).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                      {amountEntries(member).map(([label, value]) => (
                        <span
                          key={label}
                          style={{
                            background: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            borderRadius: 999,
                            padding: "3px 9px",
                            fontSize: 11,
                            fontWeight: 800,
                            color: "#0F2942",
                          }}
                        >
                          {label}: {formatAmount(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onOpenProfile(member)}
                  style={{ ...smallButtonStyle, background: cfg.accentSoft, color: cfg.accent }}
                >
                  📁 ملف العضو
                </button>
                {canManage && (
                  <button type="button" onClick={() => openEdit(member)} style={smallButtonStyle}>
                    ✏️ تعديل
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
          <div style={{ background: "#fff", borderRadius: 16, width: "min(640px, 100%)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center", background: cfg.accentSoft }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#0F2942" }}>
                {editingMember ? `تعديل ${cfg.memberLabel}` : `إضافة ${cfg.memberLabel}`}
              </div>
              <button type="button" onClick={() => setShowForm(false)} style={{ ...smallButtonStyle, color: "#B91C1C" }}>✕ إغلاق</button>
            </div>

            <div style={{ padding: 18 }}>
              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div>
                  <label style={labelStyle}>الاسم *</label>
                  <input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{cfg.numberLabel} *</label>
                  <input value={form.external_id} onChange={(event) => setForm({ ...form, external_id: event.target.value })} placeholder={cfg.numberPlaceholder} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>المسمى الوظيفي</label>
                  <input value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>الإدارة / القسم</label>
                  <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: "#334155" }}>
                    <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} style={{ transform: "scale(1.2)" }} />
                    العضو نشط
                  </label>
                </div>
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
                {saving ? "⏳ جاري الحفظ..." : "💾 حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <NotificationSheetImportModal
          section={section}
          mode="import"
          members={members}
          onClose={() => setShowImport(false)}
          onImport={handleSheetImport}
        />
      )}
    </div>
  );
}

import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  NOTIFICATION_SECTION_LIST,
  detailValue,
  displayFields,
  formatDate,
  formatDateTime,
  getSectionConfig,
  monthName,
  reportSummary,
  statusMeta,
} from "./notificationsConfig";
import { canViewSection } from "../utils/notificationPermissions";

const inputStyle = {
  border: "1px solid #CBD5E1",
  background: "#fff",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13.5,
  fontFamily: "inherit",
  color: "#0F2942",
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

const STATUS_OPTIONS = [
  ["", "كل الحالات"],
  ["pending_entry", "بانتظار مراجعة المدخل"],
  ["entry_reviewed", "تمت مراجعة المدخل"],
  ["final_reviewed", "تمت المراجعة النهائية"],
  ["rejected", "مرفوض"],
  ["draft", "مسودة"],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function calcModeOf(report) {
  const details =
    report?.details && typeof report.details === "object" ? report.details : {};
  return details._calc_mode || "";
}

function monthKeyOf(report) {
  return `${report.year}-${String(report.month).padStart(2, "0")}`;
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: meta.bg,
        color: meta.color,
        borderRadius: 999,
        padding: "3px 9px",
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {meta.icon} {meta.shortLabel || meta.label}
    </span>
  );
}

/* ملخّص الشهر: عدد التبليغات + الخصومات + الاستردادات + المصروف + الحالات */
function summarizeMonth(rows) {
  return rows.reduce(
    (acc, report) => {
      acc.count += 1;
      const amount = Number(report.amount);
      const mode = calcModeOf(report);
      if (Number.isFinite(amount)) {
        if (mode === "deduct" || report.type_code === "deductions") {
          acc.deductions += amount;
        } else if (mode === "refund") {
          acc.refunds += amount;
        } else if (report.type_code === "salary_disbursement") {
          acc.disbursed += amount;
        }
      }
      if (report.status === "final_reviewed") acc.completed += 1;
      else if (report.status === "entry_reviewed") acc.entry += 1;
      else if (report.status === "rejected") acc.rejected += 1;
      else if (report.status === "draft") acc.drafts += 1;
      else acc.pending += 1;
      return acc;
    },
    {
      count: 0,
      deductions: 0,
      refunds: 0,
      disbursed: 0,
      completed: 0,
      entry: 0,
      pending: 0,
      rejected: 0,
      drafts: 0,
    }
  );
}

function detailRows(report) {
  return displayFields(report, null)
    .map((field) => {
      const raw = detailValue(report, field.key);
      if (raw === "" || raw == null) return null;
      let value = raw;
      if (field.type === "checkbox") value = raw ? "نعم" : "لا";
      else if (
        field.type === "date" ||
        String(field.key).includes("date") ||
        String(field.key).includes("start") ||
        String(field.key).includes("end")
      ) {
        value = formatDate(raw);
      }
      return { label: field.label, value: String(value) };
    })
    .filter(Boolean);
}

export default function NotificationArchivePage({ currentUser }) {
  const accessibleSections = useMemo(
    () => NOTIFICATION_SECTION_LIST.filter((item) => canViewSection(currentUser, item.id)),
    [currentUser]
  );

  const [section, setSection] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMonths, setOpenMonths] = useState({});
  const [openReports, setOpenReports] = useState({});

  const showAllTab = accessibleSections.length > 1;

  /* القسم الفعلي: نتحقق من الصلاحية دون تعديل الحالة داخل تأثير جانبي. */
  const activeSection = useMemo(() => {
    if (section === "all" && showAllTab) return "all";
    if (section && accessibleSections.some((item) => item.id === section)) {
      return section;
    }
    return accessibleSections[0]?.id || "";
  }, [accessibleSections, section, showAllTab]);

  const targetSections = useMemo(() => {
    if (activeSection === "all") return accessibleSections.map((item) => item.id);
    return activeSection ? [activeSection] : [];
  }, [accessibleSections, activeSection]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (targetSections.length === 0) {
      setReports([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        let query = supabase
          .from("notification_reports")
          .select("*")
          .in("section", targetSections)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3000);

        if (filterYear !== "all") query = query.eq("year", Number(filterYear));
        if (statusFilter) query = query.eq("status", statusFilter);

        const q = String(search || "").replace(/[%_,()]/g, " ").trim();
        if (q) {
          query = query.or(
            `member_name.ilike.%${q}%,member_number.ilike.%${q}%,type_name.ilike.%${q}%,notes.ilike.%${q}%`
          );
        }

        const { data, error: loadError } = await query;
        if (loadError) throw loadError;
        if (!cancelled) setReports(data || []);
      } catch (loadError) {
        console.error("خطأ في تحميل أرشيف التبليغات:", loadError);
        if (!cancelled) {
          setReports([]);
          setError(loadError?.message || "تعذر تحميل أرشيف التبليغات.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetSections, filterYear, statusFilter, search]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const yearOptions = useMemo(() => {
    const years = new Set(
      reports.map((report) => Number(report.year)).filter((year) => Number.isFinite(year))
    );
    if (Number.isFinite(Number(filterYear))) years.add(Number(filterYear));
    return [...years].sort((a, b) => b - a);
  }, [reports, filterYear]);

  const groups = useMemo(() => {
    const map = new Map();
    reports.forEach((report) => {
      const key = monthKeyOf(report);
      if (!map.has(key)) {
        map.set(key, {
          key,
          year: Number(report.year),
          month: Number(report.month),
          reports: [],
        });
      }
      map.get(key).reports.push(report);
    });
    return [...map.values()]
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .map((group) => ({ ...group, summary: summarizeMonth(group.reports) }));
  }, [reports]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (acc, group) => {
          acc.count += group.summary.count;
          acc.deductions += group.summary.deductions;
          acc.refunds += group.summary.refunds;
          acc.disbursed += group.summary.disbursed;
          acc.months += 1;
          return acc;
        },
        { count: 0, deductions: 0, refunds: 0, disbursed: 0, months: 0 }
      ),
    [groups]
  );

  const isMonthOpen = (group, index) =>
    group.key in openMonths ? openMonths[group.key] : index === 0;

  const toggleMonth = (group, index) => {
    const next = !isMonthOpen(group, index);
    setOpenMonths((current) => ({ ...current, [group.key]: next }));
  };

  const toggleReport = (id) => {
    setOpenReports((current) => ({ ...current, [id]: !current[id] }));
  };

  const printGroups = (printList) => {
    if (printList.length === 0) return;
    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      window.alert("اسمح بالنوافذ المنبثقة للطباعة.");
      return;
    }

    const rows = printList
      .flatMap((group) =>
        group.reports.map((report) => {
          const mode = calcModeOf(report);
          const amount =
            Number.isFinite(Number(report.amount)) && report.amount !== null
              ? `${mode === "deduct" ? "خصم " : mode === "refund" ? "استرداد " : ""}${formatAmount(report.amount)}`
              : "—";
          return `<tr>
            <td>${escapeHtml(report.member_name)}</td>
            <td>${escapeHtml(report.member_number || "—")}</td>
            <td>${escapeHtml(report.type_name || "—")}</td>
            <td>${escapeHtml(reportSummary(report) || "—")}</td>
            <td>${escapeHtml(amount)}</td>
            <td>${escapeHtml(statusMeta(report.status).label)}</td>
            <td>${escapeHtml(report.created_by_name || "—")}</td>
            <td>${escapeHtml(formatDateTime(report.created_at))}</td>
          </tr>`;
        })
      )
      .join("");

    const groupTotals = printList
      .map((group) => {
        const summary = group.summary;
        return `<tr>
          <th>${escapeHtml(`${monthName(group.month)} ${group.year}`)}</th>
          <td>${summary.count} تبليغ</td>
          <td>خصومات: ${formatAmount(summary.deductions)}</td>
          <td>استردادات: ${formatAmount(summary.refunds)}</td>
          <td>مصروف: ${formatAmount(summary.disbursed)}</td>
          <td>مكتمل: ${summary.completed} • مراجعة المدخل: ${summary.entry} • معلّق: ${summary.pending} • مرفوض: ${summary.rejected}</td>
        </tr>`;
      })
      .join("");

    const sectionLabel =
      activeSection === "all"
        ? "كل أقسام التبليغات"
        : getSectionConfig(activeSection).title;

    const title =
      printList.length === 1
        ? `أرشيف ${monthName(printList[0].month)} ${printList[0].year}`
        : "أرشيف التبليغات";

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>${escapeHtml(title)} — ${escapeHtml(sectionLabel)}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 22px; color: #0F2942; }
            h1 { font-size: 19px; margin: 0 0 4px; }
            .sub { color: #64748B; font-size: 12.5px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
            th, td { border: 1px solid #CBD5E1; padding: 7px 9px; font-size: 11.5px; text-align: right; vertical-align: top; }
            th { background: #F1F5F9; }
            .totals th { background: #F8FAFC; width: 150px; }
            @media print { body { margin: 8mm; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)} — ${escapeHtml(sectionLabel)}</h1>
          <div class="sub">
            عدد التبليغات: ${printList.reduce((sum, group) => sum + group.summary.count, 0)}
            • عدد الشهور: ${printList.length}
            • طُبع في: ${formatDateTime(new Date().toISOString())}
          </div>
          <table class="totals">
            <tr><th>الشهر</th><th>العدد</th><th>الخصومات</th><th>الاستردادات</th><th>المصروف</th><th>الحالات</th></tr>
            ${groupTotals}
          </table>
          <table>
            <thead>
              <tr>
                <th>المتعاقد / العضو</th>
                <th>الرقم</th>
                <th>النوع</th>
                <th>التفاصيل</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>أُنشئ بواسطة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8">لا توجد تبليغات</td></tr>'}
            </tbody>
          </table>
          <div style="margin-top:20px; font-size:11px; color:#94A3B8;">
            طُبع من نظام كلية الهندسة — أرشيف التبليغات
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const resetFilters = () => {
    setFilterYear("all");
    setStatusFilter("");
    setSearch("");
  };

  const selectedCfg = activeSection === "all" ? null : getSectionConfig(activeSection);
  const accent = selectedCfg?.accent || "#0F766E";
  const accentSoft = selectedCfg?.accentSoft || "#F0FDFA";

  return (
    <div dir="rtl" className="notif-page arch-page" style={{ paddingBottom: 20 }}>
      <style>{`
        .arch-page { background:#F7F8FA; border:1px solid #EEF1F5; border-radius:18px; padding:18px; }
        .arch-month { background:#fff; border:1px solid #E7EBF0; border-radius:14px; margin-bottom:14px; overflow:hidden; }
        .arch-month-head { display:flex; gap:12px; justify-content:space-between; align-items:center; flex-wrap:wrap; padding:14px 16px; cursor:pointer; }
        .arch-table-wrap { overflow-x:auto; border-top:1px solid #EEF2F7; }
        .arch-table { width:100%; border-collapse:collapse; min-width:900px; }
        .arch-table th { background:#F8FAFC; color:#475569; font-size:12px; font-weight:900; padding:10px 9px; text-align:right; border-bottom:1px solid #E2E8F0; white-space:nowrap; }
        .arch-table td { padding:10px 9px; border-bottom:1px solid #EEF2F7; font-size:12.5px; color:#334155; vertical-align:top; }
        .arch-table tbody tr:hover td { background:#F8FAFC; }
        .arch-detail { background:#FBFDFF; padding:14px 16px; }
        @media (max-width: 720px) {
          .arch-page { padding:12px; border-radius:14px; }
          .arch-filters { flex-direction:column !important; align-items:stretch !important; }
          .arch-filters > * { width:100% !important; flex:none !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700, marginBottom: 6 }}>قسم الاستحقاقات</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>🗂️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0F2942" }}>أرشيف التبليغات</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#64748B", lineHeight: 1.8 }}>
                كل شهر في أرشيف مستقل — مع ملخّص الخصومات والاستردادات والمصروف وحالة المراجعة.
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => printGroups(groups)}
            disabled={groups.length === 0}
            style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8", opacity: groups.length === 0 ? 0.5 : 1 }}
          >
            🖨️ طباعة كل النتائج
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.8, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {showAllTab && (
          <button
            type="button"
            onClick={() => setSection("all")}
            style={{
              border: activeSection === "all" ? "2px solid #0F766E" : "1px solid #CBD5E1",
              background: activeSection === "all" ? "#F0FDFA" : "#fff",
              color: activeSection === "all" ? "#0F766E" : "#475569",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            📚 كل الأقسام
          </button>
        )}
        {accessibleSections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            style={{
              border: activeSection === item.id ? `2px solid ${item.accent}` : "1px solid #CBD5E1",
              background: activeSection === item.id ? item.accentSoft : "#fff",
              color: activeSection === item.id ? item.accent : "#475569",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {item.emoji} {item.shortTitle}
          </button>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E7EBF0", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div className="arch-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="🔎 ابحث بالاسم أو الرقم أو النوع أو الملاحظات..."
            style={{ ...inputStyle, flex: "1 1 260px" }}
          />
          <select value={filterYear} onChange={(event) => setFilterYear(event.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
            <option value="all">كل السنوات</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ ...inputStyle, minWidth: 190 }}>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>
          <button type="button" onClick={resetFilters} style={smallButtonStyle}>مسح الفلاتر</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 8 }}>
          {loading
            ? "⏳ جاري تحميل الأرشيف..."
            : `${totals.count} تبليغ في ${totals.months} شهر — الخصومات: ${formatAmount(totals.deductions)} • الاستردادات: ${formatAmount(totals.refunds)} • المصروف: ${formatAmount(totals.disbursed)}`}
        </div>
      </div>

      {loading ? (
        <div style={{ background: "#fff", border: "1px solid #E7EBF0", borderRadius: 14, padding: 40, textAlign: "center", color: "#64748B" }}>
          ⏳ جاري تحميل الأرشيف...
        </div>
      ) : groups.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E7EBF0", borderRadius: 14, padding: 48, textAlign: "center", color: "#94A3B8" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#334155", marginBottom: 6 }}>لا توجد تبليغات مؤرشفة</div>
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>جرّب تغيير القسم أو السنة أو البحث، أو أضف تبليغًا جديدًا من صفحة القسم.</div>
        </div>
      ) : (
        groups.map((group, index) => {
          const open = isMonthOpen(group, index);
          const summary = group.summary;
          const groupSectionIds = [...new Set(group.reports.map((report) => report.section))];
          return (
            <div className="arch-month" key={group.key}>
              <div className="arch-month-head" onClick={() => toggleMonth(group, index)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{open ? "📂" : "📁"}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#0F2942" }}>
                      {monthName(group.month)} {group.year}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3 }}>
                      {summary.count} تبليغ
                      {activeSection === "all" && groupSectionIds.length > 0
                        ? ` • ${groupSectionIds
                            .map((id) => getSectionConfig(id).shortTitle)
                            .join(" / ")}`
                        : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: "#B91C1C", background: "#FEE2E2", borderRadius: 999, padding: "4px 10px" }}>
                    خصومات: {formatAmount(summary.deductions)}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: "#047857", background: "#D1FAE5", borderRadius: 999, padding: "4px 10px" }}>
                    استردادات: {formatAmount(summary.refunds)}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: "#1D4ED8", background: "#DBEAFE", borderRadius: 999, padding: "4px 10px" }}>
                    مصروف: {formatAmount(summary.disbursed)}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: "#334155", background: "#F1F5F9", borderRadius: 999, padding: "4px 10px" }}>
                    🟢 {summary.completed} • 🔵 {summary.entry} • 🟡 {summary.pending} • 🔴 {summary.rejected}
                    {summary.drafts > 0 ? ` • 📝 ${summary.drafts}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      printGroups([group]);
                    }}
                    style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}
                  >
                    🖨️ طباعة الشهر
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMonth(group, index);
                    }}
                    style={smallButtonStyle}
                  >
                    {open ? "▲ إخفاء" : "▼ عرض"}
                  </button>
                </div>
              </div>

              {open && (
                <div className="arch-table-wrap">
                  <table className="arch-table">
                    <thead>
                      <tr>
                        <th>العضو / المتعاقد</th>
                        <th>النوع</th>
                        <th>التفاصيل</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                        <th>أُنشئ بواسطة</th>
                        <th>إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.reports.map((report) => {
                        const cfg = getSectionConfig(report.section);
                        const mode = calcModeOf(report);
                        const isOpen = Boolean(openReports[report.id]);
                        const details =
                          report.details && typeof report.details === "object"
                            ? report.details
                            : {};
                        const rows = detailRows(report);
                        return (
                          <Fragment key={report.id}>
                            <tr>
                              <td>
                                <div style={{ fontWeight: 900, color: "#0F2942" }}>{report.member_name}</div>
                                <div style={{ fontSize: 11, color: "#64748B" }}>
                                  {cfg.numberLabel}: {report.member_number || "—"}
                                </div>
                                {activeSection === "all" && (
                                  <div style={{ fontSize: 10.5, color: cfg.accent, fontWeight: 800, marginTop: 2 }}>
                                    {cfg.emoji} {cfg.shortTitle}
                                  </div>
                                )}
                              </td>
                              <td style={{ fontWeight: 800 }}>{report.type_name || "—"}</td>
                              <td style={{ maxWidth: 320 }}>
                                <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.8 }}>
                                  {reportSummary(report) || "—"}
                                </div>
                              </td>
                              <td style={{ fontWeight: 900, color: mode === "deduct" ? "#B91C1C" : mode === "refund" ? "#047857" : "#0F2942", whiteSpace: "nowrap" }}>
                                {report.amount != null && report.amount !== ""
                                  ? formatAmount(report.amount)
                                  : "—"}
                              </td>
                              <td><StatusBadge status={report.status} /></td>
                              <td>
                                <div style={{ fontWeight: 800, color: "#334155" }}>{report.created_by_name || "—"}</div>
                                <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{formatDateTime(report.created_at)}</div>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => toggleReport(report.id)}
                                  style={{ ...smallButtonStyle, padding: "5px 9px" }}
                                >
                                  {isOpen ? "إخفاء التفاصيل" : "عرض"}
                                </button>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr key={`${report.id}-details`}>
                                <td colSpan={7} className="arch-detail">
                                  {mode && (
                                    <div
                                      style={{
                                        background: "#FFFBEB",
                                        border: "1px solid #FDE68A",
                                        borderRadius: 10,
                                        padding: "10px 12px",
                                        marginBottom: 12,
                                        fontSize: 12,
                                        lineHeight: 2,
                                        color: "#334155",
                                      }}
                                    >
                                      <div style={{ fontWeight: 900, color: "#92400E", marginBottom: 4 }}>
                                        🧮 {mode === "deduct" ? "حسبة الخصم" : "حسبة الاسترداد"}
                                      </div>
                                      <div>الإجمالي قبل: <b>{formatAmount(details._base_total)}</b></div>
                                      <div>قيمة اليوم: <b>{formatRate(details._daily_rate)}</b> × الأيام: <b>{details._calc_days ?? "—"}</b></div>
                                      <div>
                                        {mode === "deduct" ? "قيمة الخصم" : "قيمة الاسترداد"}:{" "}
                                        <b style={{ color: mode === "deduct" ? "#B91C1C" : "#047857" }}>
                                          {formatAmount(details._calc_amount ?? report.amount)}
                                        </b>
                                      </div>
                                      <div>الإجمالي بعد: <b style={{ color: "#0F2942" }}>{formatAmount(details._total_after)}</b></div>
                                    </div>
                                  )}

                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                                    {rows.length === 0 && (
                                      <div style={{ fontSize: 12, color: "#94A3B8" }}>لا توجد تفاصيل إضافية محفوظة.</div>
                                    )}
                                    {rows.map((row, rowIndex) => (
                                      <div key={`${row.label}-${rowIndex}`} style={{ background: "#fff", border: "1px solid #EEF2F7", borderRadius: 9, padding: "8px 10px" }}>
                                        <div style={{ fontSize: 10.5, color: "#94A3B8", fontWeight: 800 }}>{row.label}</div>
                                        <div style={{ fontSize: 12.5, color: "#0F2942", fontWeight: 800, marginTop: 2 }}>{row.value}</div>
                                      </div>
                                    ))}
                                  </div>

                                  <div style={{ marginTop: 10, fontSize: 11.5, color: "#64748B", lineHeight: 1.9 }}>
                                    أُنشئ بواسطة: <b>{report.created_by_name || "—"}</b> • {formatDateTime(report.created_at)}
                                    {report.updated_at ? ` • آخر تحديث: ${formatDateTime(report.updated_at)}` : ""}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {!loading && groups.length > 0 && (
        <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>
          الأرشيف يعرض حتى 3000 تبليغ — استخدم البحث أو السنة لتضييق النتائج.
          {" "}
          <span style={{ color: accent }}>{selectedCfg ? selectedCfg.title : "كل الأقسام"}</span>
          {" "}
          <span style={{ background: accentSoft, borderRadius: 999, padding: "2px 8px", fontWeight: 800 }}>{totals.count}</span>
        </div>
      )}
    </div>
  );
}

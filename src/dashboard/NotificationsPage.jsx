import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { deleteFile } from "../services/fileStorage";
import { FileAnchor, FileDownloadLink } from "../components/FileLink";
import { useRealtimeSync } from "../utils/realtimeSync";
import {
  canCreateReport,
  canDeleteReport,
  canEditReport,
  canManageMembers,
  canManageTypes,
  canReviewEntry,
  canReviewFinal,
  canViewSection,
} from "../utils/notificationPermissions";
import NotificationFormModal from "./NotificationFormModal";
import NotificationTypesManager from "./NotificationTypesManager";
import NotificationMembersPanel from "./NotificationMembersPanel";
import {
  getSectionConfig,
  currentYearMonth,
  monthName,
  MONTH_NAMES,
  statusMeta,
  formatDate,
  formatDateTime,
  displayFields,
  detailValue,
  reportSummary,
  NOTIFICATION_STAGES,
} from "./notificationsConfig";

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

function withMigrationHint(err) {
  const message = err?.message || String(err || "");
  if (
    /could not find the table|does not exist|relation .* does not exist|permission denied|row-level security|could not find the bucket/i.test(
      message
    )
  ) {
    return `${message}\n\n🚧 نفّذ ملف "create_notification_reports.sql" بالكامل في Supabase SQL Editor لإنشاء جداول التبليغات والفهرس والمرفقات.`;
  }
  return message;
}

function escFilter(value) {
  return String(value || "").replace(/[%_,()]/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function latestReview(reviews, stage) {
  const list = Array.isArray(reviews) ? reviews : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.stage === stage) return list[index];
  }
  return null;
}

function normalizeMember(input) {
  if (!input) return null;
  return {
    id: input.member_id || input.id || null,
    full_name:
      input.full_name ||
      input.faculty_name ||
      input.employee_name ||
      input.member_name ||
      "",
    external_id:
      input.external_id ||
      input.computer_number ||
      input.member_number ||
      "",
    job_title: input.job_title || "",
    department: input.department || "",
    is_active: input.is_active !== false,
  };
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: meta.bg,
        color: meta.color,
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 11.5,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

function FieldValue({ field, report }) {
  const value = detailValue(report, field.key);
  if (value === "" || value == null) return <span style={{ color: "#94A3B8" }}>—</span>;
  if (field.type === "date" || String(field.key).includes("date")) {
    return <>{formatDate(value)}</>;
  }
  if (field.type === "checkbox") {
    return <>{value ? "نعم" : "لا"}</>;
  }
  return <>{String(value)}</>;
}

export default function NotificationsPage({
  section,
  currentUser,
  initialMember,
  onConsumedInitialMember,
  onOpenArchive,
}) {
  const cfg = getSectionConfig(section);
  const now = currentYearMonth();

  const [tab, setTab] = useState("reports");
  const [types, setTypes] = useState([]);
  const [members, setMembers] = useState([]);
  const [reports, setReports] = useState([]);
  const [memberReports, setMemberReports] = useState([]);
  const [reviewsByReport, setReviewsByReport] = useState({});
  const [attachmentsByReport, setAttachmentsByReport] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [error, setError] = useState("");

  const [filterYear, setFilterYear] = useState(now.year);
  const [filterMonth, setFilterMonth] = useState(now.month);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [profileMember, setProfileMember] = useState(null);
  const [profileReports, setProfileReports] = useState([]);
  const [profileReviews, setProfileReviews] = useState({});
  const [profileAttachments, setProfileAttachments] = useState({});
  const [profileLoading, setProfileLoading] = useState(false);

  const canView = canViewSection(currentUser, section);
  const canCreate = canCreateReport(currentUser, section);
  const canTypes = canManageTypes(currentUser, section);
  const canMembers = canManageMembers(currentUser, section);
  const canEntry = canReviewEntry(currentUser, section);
  const canFinal = canReviewFinal(currentUser, section);

  const yearOptions = useMemo(() => {
    const years = new Set([
      now.year,
      now.year - 1,
      now.year - 2,
      now.year - 3,
      now.year + 1,
      Number(filterYear),
      ...(reports || []).map((report) => Number(report.year)).filter(Boolean),
    ]);
    return [...years].filter(Number.isFinite).sort((a, b) => b - a);
  }, [reports, now.year, filterYear]);

  const loadTypes = async () => {
    const { data, error: loadError } = await supabase
      .from("notification_types")
      .select("*")
      .eq("section", section)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (loadError) throw loadError;
    setTypes(data || []);
  };

  const loadMembers = async () => {
    const { data, error: loadError } = await supabase
      .from("notification_members")
      .select("*")
      .eq("section", section)
      .order("full_name", { ascending: true })
      .limit(5000);
    if (loadError) throw loadError;
    setMembers(data || []);
  };

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      let query = supabase
        .from("notification_reports")
        .select("*")
        .eq("section", section)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);

      if (filterYear) query = query.eq("year", Number(filterYear));
      if (filterMonth) query = query.eq("month", Number(filterMonth));
      if (statusFilter) query = query.eq("status", statusFilter);

      const q = escFilter(search);
      if (q) {
        query = query.or(
          `member_name.ilike.%${q}%,member_number.ilike.%${q}%,type_name.ilike.%${q}%,notes.ilike.%${q}%`
        );
      }

      const { data, error: reportsError } = await query;
      if (reportsError) throw reportsError;

      const rows = data || [];
      setReports(rows);

      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        const [{ data: reviewRows, error: reviewsError }, { data: attachmentRows, error: attachmentsError }] =
          await Promise.all([
            supabase
              .from("notification_reviews")
              .select("*")
              .in("notification_id", ids)
              .order("acted_at", { ascending: true }),
            supabase
              .from("notification_attachments")
              .select("*")
              .in("notification_id", ids)
              .order("created_at", { ascending: true }),
          ]);

        if (reviewsError) console.error("تعذر تحميل سجل المراجعة:", reviewsError);
        if (attachmentsError) console.error("تعذر تحميل المرفقات:", attachmentsError);

        const reviewMap = {};
        (reviewRows || []).forEach((row) => {
          if (!reviewMap[row.notification_id]) reviewMap[row.notification_id] = [];
          reviewMap[row.notification_id].push(row);
        });
        ids.forEach((id) => {
          if (!reviewMap[id]) reviewMap[id] = [];
        });

        const attachmentMap = {};
        (attachmentRows || []).forEach((row) => {
          if (!attachmentMap[row.notification_id]) attachmentMap[row.notification_id] = [];
          attachmentMap[row.notification_id].push(row);
        });
        ids.forEach((id) => {
          if (!attachmentMap[id]) attachmentMap[id] = [];
        });

        setReviewsByReport(reviewMap);
        setAttachmentsByReport(attachmentMap);
      } else {
        setReviewsByReport({});
        setAttachmentsByReport({});
      }
    } catch (loadError) {
      console.error("خطأ في تحميل التبليغات:", loadError);
      setError(withMigrationHint(loadError));
    } finally {
      setLoadingReports(false);
    }
  };

  const refreshTypesAndMembers = async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadTypes(), loadMembers()]);
    } catch (loadError) {
      console.error("خطأ في تحميل إعدادات التبليغات:", loadError);
      setError(withMigrationHint(loadError));
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTab("reports");
    setFilterYear(now.year);
    setFilterMonth(now.month);
    setStatusFilter("");
    setSearch("");
    setSelectedReport(null);
    setProfileMember(null);
    setMemberReports([]);
    refreshTypesAndMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReports();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, filterYear, filterMonth, statusFilter, search]);

  /* فهرس الأعضاء يعرض جميع التبليغات (وليس الشهر المفلتر فقط)،
     لذلك نجلب تاريخ القسم كاملًا عند فتح تبويب الفهرس. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab !== "members") return undefined;
    let cancelled = false;
    setMemberReports([]);
    supabase
      .from("notification_reports")
      .select("*")
      .eq("section", section)
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5000)
      .then(({ data, error: memberReportsError }) => {
        if (cancelled) return;
        if (memberReportsError) {
          console.error("تعذر تحميل تاريخ الأعضاء:", memberReportsError);
          setError(withMigrationHint(memberReportsError));
          return;
        }
        setMemberReports(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, section, reports]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtimeSync({
    table: "notification_reports",
    filter: `section=eq.${section}`,
    apply: () => {
      loadReports();
    },
    enabled: Boolean(section),
  });

  const refreshAll = async () => {
    setError("");
    await Promise.all([refreshTypesAndMembers(), loadReports()]);
  };

  const openCreate = () => {
    setEditingReport(null);
    setShowForm(true);
  };

  const openEdit = (report) => {
    setEditingReport(report);
    setShowForm(true);
  };

  const ensureReportDetails = async (reportId) => {
    if (!reportId) return;
    const needsReviews = !reviewsByReport[reportId];
    const needsAttachments = !attachmentsByReport[reportId];
    if (!needsReviews && !needsAttachments) return;

    const tasks = [];
    if (needsReviews) {
      tasks.push(
        supabase
          .from("notification_reviews")
          .select("*")
          .eq("notification_id", reportId)
          .order("acted_at", { ascending: true })
          .then(({ data }) => {
            setReviewsByReport((current) => ({ ...current, [reportId]: data || [] }));
          })
      );
    }
    if (needsAttachments) {
      tasks.push(
        supabase
          .from("notification_attachments")
          .select("*")
          .eq("notification_id", reportId)
          .order("created_at", { ascending: true })
          .then(({ data }) => {
            setAttachmentsByReport((current) => ({ ...current, [reportId]: data || [] }));
          })
      );
    }
    await Promise.all(tasks);
  };

  const openReport = (report) => {
    setSelectedReport(report);
    ensureReportDetails(report.id);
  };

  const openMemberProfile = async (memberInput) => {
    const member = normalizeMember(memberInput);
    if (!member) return;
    setError("");
    setProfileMember(member);
    setProfileLoading(true);
    setProfileReports([]);
    setProfileReviews({});
    setProfileAttachments({});

    try {
      const baseQuery = () =>
        supabase
          .from("notification_reports")
          .select("*")
          .eq("section", section)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1000);

      let rows = [];
      const collected = new Map();
      const addRows = (data) => {
        (data || []).forEach((row) => {
          if (!collected.has(row.id)) collected.set(row.id, row);
        });
      };

      const queries = [];
      if (member.id) queries.push(baseQuery().eq("member_id", member.id));
      if (member.external_id) {
        queries.push(baseQuery().eq("member_number", member.external_id));
      }

      if (queries.length > 0) {
        const results = await Promise.all(queries);
        results.forEach(({ data, error: profileQueryError }) => {
          if (profileQueryError) throw profileQueryError;
          addRows(data);
        });
      }

      /* توافق رجعي: تبليغات قديمة محفوظة بالاسم فقط دون رقم أو member_id. */
      if (collected.size === 0 && member.full_name) {
        const { data, error: byNameError } = await baseQuery().eq(
          "member_name",
          member.full_name
        );
        if (byNameError) throw byNameError;
        addRows(data);
      }

      rows = [...collected.values()].sort(
        (a, b) =>
          (Number(b.year) || 0) - (Number(a.year) || 0) ||
          (Number(b.month) || 0) - (Number(a.month) || 0) ||
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      setProfileReports(rows);

      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        const [{ data: reviewRows }, { data: attachmentRows }] = await Promise.all([
          supabase
            .from("notification_reviews")
            .select("*")
            .in("notification_id", ids)
            .order("acted_at", { ascending: true }),
          supabase
            .from("notification_attachments")
            .select("*")
            .in("notification_id", ids)
            .order("created_at", { ascending: true }),
        ]);

        const reviewMap = {};
        (reviewRows || []).forEach((row) => {
          if (!reviewMap[row.notification_id]) reviewMap[row.notification_id] = [];
          reviewMap[row.notification_id].push(row);
        });
        ids.forEach((id) => {
          if (!reviewMap[id]) reviewMap[id] = [];
        });
        const attachmentMap = {};
        (attachmentRows || []).forEach((row) => {
          if (!attachmentMap[row.notification_id]) attachmentMap[row.notification_id] = [];
          attachmentMap[row.notification_id].push(row);
        });
        ids.forEach((id) => {
          if (!attachmentMap[id]) attachmentMap[id] = [];
        });
        setProfileReviews(reviewMap);
        setProfileAttachments(attachmentMap);
      }
    } catch (profileError) {
      console.error("خطأ في تحميل ملف العضو:", profileError);
      setError(withMigrationHint(profileError));
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!initialMember) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openMemberProfile(initialMember);
    if (onConsumedInitialMember) onConsumedInitialMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMember]);

  const completeReview = async (report, stage) => {
    if (!report || actionLoading) return;
    if (stage === "entry" && report.status !== "pending_entry") return;
    if (stage === "final" && report.status !== "entry_reviewed") return;
    const notes = window.prompt("ملاحظات المراجعة (اختياري):", "");
    if (notes === null) return;

    setActionLoading(true);
    setError("");

    const previousStage = report.status;
    const nextStage = stage === "entry" ? "entry_reviewed" : "final_reviewed";
    const nowIso = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("notification_reports")
        .update({ status: nextStage, updated_at: nowIso })
        .eq("id", report.id);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("notification_reviews").insert({
        notification_id: report.id,
        stage,
        status: "completed",
        previous_stage: previousStage,
        next_stage: nextStage,
        user_id: currentUser?.id || null,
        user_name: currentUser?.full_name || currentUser?.username || "غير معروف",
        notes: notes.trim() || null,
        acted_at: nowIso,
      });

      if (logError) {
        await supabase
          .from("notification_reports")
          .update({ status: previousStage, updated_at: nowIso })
          .eq("id", report.id);
        throw logError;
      }

      setSelectedReport((current) =>
        current && current.id === report.id ? { ...current, status: nextStage } : current
      );
      await loadReports();
      await ensureReportDetails(report.id);
    } catch (reviewError) {
      console.error("خطأ في تسجيل المراجعة:", reviewError);
      setError(withMigrationHint(reviewError));
    } finally {
      setActionLoading(false);
    }
  };

  const rejectReport = async (report, stage) => {
    if (!report || actionLoading) return;
    if (stage === "entry" && report.status !== "pending_entry") return;
    if (stage === "final" && report.status !== "entry_reviewed") return;
    const reason = window.prompt("سبب الرفض (مطلوب):", "");
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("أدخل سبب الرفض.");
      return;
    }

    setActionLoading(true);
    setError("");
    const previousStage = report.status;
    const nowIso = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("notification_reports")
        .update({ status: "rejected", updated_at: nowIso })
        .eq("id", report.id);
      if (updateError) throw updateError;

      const { error: logError } = await supabase.from("notification_reviews").insert({
        notification_id: report.id,
        stage,
        status: "rejected",
        previous_stage: previousStage,
        next_stage: "rejected",
        user_id: currentUser?.id || null,
        user_name: currentUser?.full_name || currentUser?.username || "غير معروف",
        notes: reason.trim(),
        acted_at: nowIso,
      });

      if (logError) {
        await supabase
          .from("notification_reports")
          .update({ status: previousStage, updated_at: nowIso })
          .eq("id", report.id);
        throw logError;
      }

      setSelectedReport((current) =>
        current && current.id === report.id ? { ...current, status: "rejected" } : current
      );
      await loadReports();
      await ensureReportDetails(report.id);
    } catch (rejectError) {
      console.error("خطأ في رفض التبليغ:", rejectError);
      setError(withMigrationHint(rejectError));
    } finally {
      setActionLoading(false);
    }
  };

  const deleteReport = async (report) => {
    if (!report || actionLoading) return;
    const confirmed = window.confirm(
      `حذف التبليغ «${report.type_name}» الخاص بـ «${report.member_name}»؟\n\nسيُحذف سجل التبليغ وسجل مراجعته ومرفقاته.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    setError("");
    try {
      const { data: attachmentRows } = await supabase
        .from("notification_attachments")
        .select("*")
        .eq("notification_id", report.id);
      const attachments = attachmentRows || [];

      for (const attachment of attachments) {
        try {
          await deleteFile(attachment.file_url, {
            bucket: attachment.bucket || "notification-attachments",
            path: attachment.file_path,
            provider: attachment.storage_provider,
          });
        } catch (fileError) {
          console.error("تعذر حذف مرفق من التخزين:", fileError);
        }
      }

      const { error: deleteError } = await supabase
        .from("notification_reports")
        .delete()
        .eq("id", report.id);
      if (deleteError) throw deleteError;

      setSelectedReport(null);
      await loadReports();
    } catch (deleteError) {
      console.error("خطأ في حذف التبليغ:", deleteError);
      setError(withMigrationHint(deleteError));
    } finally {
      setActionLoading(false);
    }
  };

  const printReport = (report) => {
    const type = types.find((item) => item.id === report.type_id) || {
      name: report.type_name,
      extra_fields: [],
    };
    const fields = displayFields(report, type);
    const reviews = reviewsByReport[report.id] || [];
    const attachments = attachmentsByReport[report.id] || [];
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      window.alert("اسمح بالنوافذ المنبثقة للطباعة.");
      return;
    }

    const fieldRows = fields
      .map((field) => {
        const value = detailValue(report, field.key);
        const display =
          value === "" || value == null
            ? "—"
            : field.type === "date" || String(field.key).includes("date")
              ? formatDate(value)
              : field.type === "checkbox"
                ? value ? "نعم" : "لا"
                : String(value);
        return `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(display)}</td></tr>`;
      })
      .join("");

    const reviewRows = reviews
      .map(
        (review) =>
          `<tr><td>${escapeHtml(NOTIFICATION_STAGES[review.stage]?.label || review.stage)}</td><td>${escapeHtml(review.user_name || "—")}</td><td>${formatDateTime(review.acted_at)}</td><td>${review.status === "rejected" ? "مرفوض" : "مكتمل"}</td><td>${escapeHtml(review.notes || "—")}</td></tr>`
      )
      .join("");

    const attachmentRows = attachments
      .map((attachment) => `<li>${escapeHtml(attachment.file_name)}</li>`)
      .join("");

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>${escapeHtml(report.type_name)} — ${escapeHtml(report.member_name)}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 24px; color: #0F2942; }
            h1 { font-size: 20px; margin: 0 0 6px; }
            .sub { color: #64748B; font-size: 13px; margin-bottom: 18px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th, td { border: 1px solid #CBD5E1; padding: 8px 10px; font-size: 12.5px; text-align: right; }
            th { background: #F1F5F9; width: 30%; }
            .badge { display:inline-block; padding: 4px 10px; border-radius: 999px; background:#EFF6FF; color:#1D4ED8; font-weight:800; }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(cfg.title)} — ${escapeHtml(report.type_name)}</h1>
          <div class="sub">
            ${escapeHtml(cfg.memberLabel)}: ${escapeHtml(report.member_name)} • ${escapeHtml(cfg.numberLabel)}: ${escapeHtml(report.member_number || "—")}
            <br/>الشهر: ${monthName(report.month)} ${report.year} • الحالة: ${escapeHtml(statusMeta(report.status).label)}
          </div>
          <table>${fieldRows || '<tr><td colspan="2">لا توجد تفاصيل إضافية</td></tr>'}</table>
          ${report.notes ? `<p><strong>ملاحظات:</strong> ${escapeHtml(report.notes)}</p>` : ""}
          <h2 style="font-size:15px;">سجل المراجعة</h2>
          <table>
            <tr><th>المرحلة</th><th>المستخدم</th><th>التاريخ والوقت</th><th>الحالة</th><th>ملاحظات</th></tr>
            ${reviewRows || '<tr><td colspan="5">لم تُسجّل مراجعة بعد</td></tr>'}
          </table>
          <h2 style="font-size:15px;">المرفقات</h2>
          <ul>${attachmentRows || "<li>لا توجد مرفقات</li>"}</ul>
          <div style="margin-top:24px; font-size:11px; color:#94A3B8;">
            طُبع من نظام كلية الهندسة — ${formatDateTime(new Date().toISOString())}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const printStatement = () => {
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      window.alert("اسمح بالنوافذ المنبثقة للطباعة.");
      return;
    }

    const rows = reports
      .map((report) => {
        const reviews = reviewsByReport[report.id] || [];
        const entry = latestReview(reviews, "entry");
        const final = latestReview(reviews, "final");
        return `<tr>
          <td>${escapeHtml(report.member_name)}</td>
          <td>${escapeHtml(report.member_number || "—")}</td>
          <td>${escapeHtml(report.type_name)}</td>
          <td>${monthName(report.month)} ${report.year}</td>
          <td>${escapeHtml(statusMeta(report.status).label)}</td>
          <td>${entry ? `${escapeHtml(entry.user_name || "—")}<br/>${formatDateTime(entry.acted_at)}` : "—"}</td>
          <td>${final ? `${escapeHtml(final.user_name || "—")}<br/>${formatDateTime(final.acted_at)}` : "—"}</td>
        </tr>`;
      })
      .join("");

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>كشف تبليغات ${monthName(filterMonth)} ${filterYear}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 18px; color: #0F2942; }
            h1 { font-size: 19px; margin-bottom: 4px; }
            .sub { color:#64748B; font-size:12.5px; margin-bottom:14px; }
            table { width:100%; border-collapse: collapse; }
            th, td { border:1px solid #CBD5E1; padding:6px 8px; font-size:11.5px; text-align:right; vertical-align:top; }
            th { background:#F1F5F9; }
          </style>
        </head>
        <body>
          <h1>كشف ${escapeHtml(cfg.title)} — ${monthName(filterMonth)} ${filterYear}</h1>
          <div class="sub">عدد التبليغات: ${reports.length} • ${cfg.emoji} ${escapeHtml(cfg.title)}</div>
          <table>
            <tr>
              <th>${escapeHtml(cfg.memberLabel)}</th><th>${escapeHtml(cfg.numberLabel)}</th><th>النوع</th><th>الشهر/السنة</th>
              <th>حالة المراجعة</th><th>مدخل البيرول</th><th>مراجع البيرول</th>
            </tr>
            ${rows || '<tr><td colspan="7">لا توجد تبليغات في هذا الشهر</td></tr>'}
          </table>
          <div style="margin-top:20px; font-size:11px; color:#94A3B8;">طُبع من نظام كلية الهندسة — ${formatDateTime(new Date().toISOString())}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const printMemberProfile = () => {
    if (!profileMember) return;
    const printWindow = window.open("", "_blank", "width=1100,height=900");
    if (!printWindow) {
      window.alert("اسمح بالنوافذ المنبثقة للطباعة.");
      return;
    }

    const rows = profileReports
      .map((report) => {
        const reviews = profileReviews[report.id] || [];
        const entry = latestReview(reviews, "entry");
        const final = latestReview(reviews, "final");
        return `<tr>
          <td>${escapeHtml(report.type_name)}</td>
          <td>${monthName(report.month)} ${report.year}</td>
          <td>${escapeHtml(statusMeta(report.status).label)}</td>
          <td>${entry ? `${escapeHtml(entry.user_name || "—")}<br/>${formatDateTime(entry.acted_at)}` : "—"}</td>
          <td>${final ? `${escapeHtml(final.user_name || "—")}<br/>${formatDateTime(final.acted_at)}` : "—"}</td>
          <td>${escapeHtml(reportSummary(report) || "—")}</td>
        </tr>`;
      })
      .join("");

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>ملف ${escapeHtml(profileMember.full_name)}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 18px; color: #0F2942; }
            h1 { font-size: 19px; margin-bottom: 4px; }
            .sub { color:#64748B; font-size:12.5px; margin-bottom:14px; }
            table { width:100%; border-collapse: collapse; }
            th, td { border:1px solid #CBD5E1; padding:6px 8px; font-size:11.5px; text-align:right; vertical-align:top; }
            th { background:#F1F5F9; }
          </style>
        </head>
        <body>
          <h1>ملف ${escapeHtml(cfg.memberLabel)}: ${escapeHtml(profileMember.full_name)}</h1>
          <div class="sub">${escapeHtml(cfg.numberLabel)}: ${escapeHtml(profileMember.external_id || "—")} • عدد التبليغات: ${profileReports.length}</div>
          <table>
            <tr><th>النوع</th><th>الشهر/السنة</th><th>الحالة</th><th>مدخل البيرول</th><th>مراجع البيرول</th><th>ملخص</th></tr>
            ${rows || '<tr><td colspan="6">لا توجد تبليغات</td></tr>'}
          </table>
          <div style="margin-top:20px; font-size:11px; color:#94A3B8;">طُبع من نظام كلية الهندسة — ${formatDateTime(new Date().toISOString())}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const selectedType = useMemo(() => {
    if (!selectedReport) return null;
    return (
      types.find((type) => type.id === selectedReport.type_id) || {
        name: selectedReport.type_name,
        extra_fields: [],
      }
    );
  }, [types, selectedReport]);

  const selectedReviews = selectedReport ? reviewsByReport[selectedReport.id] || [] : [];
  const selectedAttachments = selectedReport
    ? attachmentsByReport[selectedReport.id] || []
    : [];

  const statementSummary = useMemo(() => {
    const summary = {
      total: reports.length,
      pending_entry: 0,
      entry_reviewed: 0,
      final_reviewed: 0,
      rejected: 0,
    };
    reports.forEach((report) => {
      if (summary[report.status] !== undefined) summary[report.status] += 1;
    });
    return summary;
  }, [reports]);

  const profileSummary = useMemo(() => {
    const summary = { total: profileReports.length, final: 0, pending: 0 };
    profileReports.forEach((report) => {
      if (report.status === "final_reviewed") summary.final += 1;
      if (["draft", "pending_entry", "entry_reviewed"].includes(report.status)) summary.pending += 1;
    });
    return summary;
  }, [profileReports]);

  if (!canView) {
    return (
      <div style={{ background: "#fff", border: "1px solid #FECACA", borderRadius: 14, padding: 24, color: "#991B1B", fontWeight: 800 }}>
        ⛔ غير مصرح لك بالوصول إلى {cfg.title}. تواصل مع مدير النظام لمنحك صلاحية العرض.
      </div>
    );
  }

  const tabs = [
    { id: "reports", label: "التبليغات", icon: "📣" },
    { id: "statement", label: "كشف الشهر", icon: "📅" },
    ...(canTypes ? [{ id: "types", label: "أنواع التبليغات", icon: "🧩" }] : []),
    { id: "members", label: `فهرس ${cfg.membersLabel}`, icon: "📇" },
  ];

  return (
    <div dir="rtl" className="notif-page" style={{ paddingBottom: 20 }}>
      <style>{`
        .notif-page { background:#F7F8FA; border:1px solid #EEF1F5; border-radius:18px; padding:18px; }
        .notif-table-wrap { overflow-x:auto; }
        .notif-table { width:100%; border-collapse:collapse; min-width:860px; }
        .notif-table th { background:#F8FAFC; color:#475569; font-size:12px; font-weight:900; padding:10px 9px; text-align:right; border-bottom:1px solid #E2E8F0; white-space:nowrap; }
        .notif-table td { padding:10px 9px; border-bottom:1px solid #EEF2F7; font-size:12.5px; color:#334155; vertical-align:top; }
        .notif-table tr:hover td { background:#F8FAFC; }
        .notif-card { background:#fff; border:1px solid #E7EBF0; border-radius:14px; }
        @media (max-width: 720px) {
          .notif-page { padding:12px; border-radius:14px; }
          .notif-filters { flex-direction:column !important; align-items:stretch !important; }
          .notif-filters > * { width:100% !important; flex:none !important; }
          .notif-desktop-only { display:none !important; }
        }
        @media (min-width: 721px) {
          .notif-mobile-only { display:none !important; }
        }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748B", fontWeight: 700, marginBottom: 6 }}>قسم الاستحقاقات</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28 }}>{cfg.emoji}</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#0F2942" }}>{cfg.title}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#64748B", lineHeight: 1.8 }}>
                تبليغات مرتبطة بفهرس {cfg.membersLabel} — مع المراجعة والاعتماد وسجل كامل لكل مرحلة.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={refreshAll} disabled={loading} style={smallButtonStyle}>
            🔄 تحديث
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              style={{
                border: 0,
                background: cfg.accent,
                color: "#fff",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 6px 16px rgba(37,99,235,.2)",
              }}
            >
              ＋ إضافة تبليغ
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.8, marginBottom: 14, whiteSpace: "pre-wrap" }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            style={{
              border: tab === item.id ? `2px solid ${cfg.accent}` : "1px solid #CBD5E1",
              background: tab === item.id ? cfg.accentSoft : "#fff",
              color: tab === item.id ? cfg.accent : "#475569",
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {tab === "reports" && (
        <>
          <div className="notif-card" style={{ padding: 14, marginBottom: 14 }}>
            <div className="notif-filters" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`🔎 ابحث بالاسم أو ${cfg.numberLabel} أو النوع...`}
                style={{ ...inputStyle, flex: "1 1 260px" }}
              />
              <select value={filterYear} onChange={(event) => setFilterYear(event.target.value)} style={{ ...inputStyle, minWidth: 120 }}>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} style={{ ...inputStyle, minWidth: 130 }}>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ ...inputStyle, minWidth: 180 }}>
                <option value="">كل حالات المراجعة</option>
                <option value="pending_entry">بانتظار مراجعة المدخل</option>
                <option value="entry_reviewed">تمت مراجعة المدخل</option>
                <option value="final_reviewed">تمت المراجعة النهائية</option>
                <option value="rejected">مرفوض</option>
                <option value="draft">مسودة</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilterYear(now.year);
                  setFilterMonth(now.month);
                  setStatusFilter("");
                }}
                style={smallButtonStyle}
              >
                مسح الفلاتر
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 8 }}>
              عرض {reports.length} تبليغ{reports.length >= 1000 ? " (الحد الأقصى 1000 — استخدم البحث أو الفلاتر لتضييق النتائج)" : ""}.
            </div>
          </div>

          {loadingReports ? (
            <div className="notif-card" style={{ padding: 40, textAlign: "center", color: "#64748B" }}>⏳ جاري تحميل التبليغات...</div>
          ) : reports.length === 0 ? (
            <div className="notif-card" style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>
              <div style={{ fontSize: 46, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#334155", marginBottom: 6 }}>لا توجد تبليغات مطابقة</div>
              <div style={{ fontSize: 13, lineHeight: 1.9 }}>جرّب تغيير الشهر أو السنة أو البحث، أو أضف تبليغًا جديدًا.</div>
            </div>
          ) : (
            <>
              <div className="notif-card notif-desktop-only notif-table-wrap">
                <table className="notif-table">
                  <thead>
                    <tr>
                      <th>{cfg.memberLabel}</th>
                      <th>النوع</th>
                      <th>الشهر / السنة</th>
                      <th>حالة المراجعة</th>
                      <th>مدخل البيرول</th>
                      <th>مراجع البيرول</th>
                      <th>المرفقات</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => {
                      const reviews = reviewsByReport[report.id] || [];
                      const entry = latestReview(reviews, "entry");
                      const final = latestReview(reviews, "final");
                      const attachments = attachmentsByReport[report.id] || [];
                      return (
                        <tr key={report.id} onClick={() => openReport(report)} style={{ cursor: "pointer" }}>
                          <td>
                            <div style={{ fontWeight: 900, color: "#0F2942" }}>{report.member_name}</div>
                            <div style={{ fontSize: 11, color: "#64748B" }}>{cfg.numberLabel}: {report.member_number || "—"}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 800 }}>{report.type_name}</div>
                            <div style={{ fontSize: 11, color: "#94A3B8", maxWidth: 220 }}>{reportSummary(report)}</div>
                          </td>
                          <td>{monthName(report.month)} {report.year}</td>
                          <td><StatusBadge status={report.status} /></td>
                          <td>
                            {entry ? (
                              <div>
                                <div style={{ fontWeight: 800, color: "#1D4ED8" }}>{entry.user_name || "—"}</div>
                                <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{formatDateTime(entry.acted_at)}</div>
                              </div>
                            ) : "—"}
                          </td>
                          <td>
                            {final ? (
                              <div>
                                <div style={{ fontWeight: 800, color: "#047857" }}>{final.user_name || "—"}</div>
                                <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{formatDateTime(final.acted_at)}</div>
                              </div>
                            ) : "—"}
                          </td>
                          <td>{attachments.length > 0 ? `📎 ${attachments.length}` : "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              <button type="button" onClick={(event) => { event.stopPropagation(); openReport(report); }} style={{ ...smallButtonStyle, padding: "5px 8px" }}>عرض</button>
                              {canEditReport(currentUser, section, report) && (
                                <button type="button" onClick={(event) => { event.stopPropagation(); openEdit(report); }} style={{ ...smallButtonStyle, padding: "5px 8px", color: "#1D4ED8" }}>تعديل</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="notif-mobile-only" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => openReport(report)}
                    style={{
                      textAlign: "right",
                      background: "#fff",
                      border: "1px solid #E7EBF0",
                      borderRadius: 12,
                      padding: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 900, color: "#0F2942", fontSize: 14 }}>{report.member_name}</div>
                        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>{report.type_name} • {monthName(report.month)} {report.year}</div>
                      </div>
                      <StatusBadge status={report.status} />
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 6 }}>{reportSummary(report) || "—"}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "statement" && (
        <>
          <div className="notif-card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#0F2942" }}>
                📅 كشف {monthName(filterMonth)} {filterYear}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={filterYear} onChange={(event) => setFilterYear(event.target.value)} style={inputStyle}>
                  {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
                <select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} style={inputStyle}>
                  {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </select>
                <button type="button" onClick={printStatement} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>🖨️ طباعة الكشف</button>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
            {[
              ["الإجمالي", statementSummary.total, "#0F2942", "#F1F5F9"],
              ["بانتظار المدخل", statementSummary.pending_entry, "#B45309", "#FEF3C7"],
              ["تمت مراجعة المدخل", statementSummary.entry_reviewed, "#1D4ED8", "#DBEAFE"],
              ["مكتمل نهائيًا", statementSummary.final_reviewed, "#047857", "#D1FAE5"],
              ["مرفوض", statementSummary.rejected, "#B91C1C", "#FEE2E2"],
            ].map(([label, value, color, bg]) => (
              <div key={label} style={{ background: bg, border: "1px solid #E7EBF0", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>

          {loadingReports ? (
            <div className="notif-card" style={{ padding: 40, textAlign: "center", color: "#64748B" }}>⏳ جاري تحميل كشف الشهر...</div>
          ) : reports.length === 0 ? (
            <div className="notif-card" style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>لا توجد تبليغات في هذا الشهر.</div>
          ) : (
            <div className="notif-card notif-table-wrap">
              <table className="notif-table">
                <thead>
                  <tr>
                    <th>{cfg.memberLabel}</th>
                    <th>النوع</th>
                    <th>الشهر/السنة</th>
                    <th>حالة المراجعة</th>
                    <th>مدخل البيرول</th>
                    <th>مراجع البيرول</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => {
                    const reviews = reviewsByReport[report.id] || [];
                    const entry = latestReview(reviews, "entry");
                    const final = latestReview(reviews, "final");
                    return (
                      <tr key={report.id} onClick={() => openReport(report)} style={{ cursor: "pointer" }}>
                        <td>
                          <div style={{ fontWeight: 900 }}>{report.member_name}</div>
                          <div style={{ fontSize: 11, color: "#64748B" }}>{report.member_number || "—"}</div>
                        </td>
                        <td>{report.type_name}</td>
                        <td>{monthName(report.month)} {report.year}</td>
                        <td><StatusBadge status={report.status} /></td>
                        <td>{entry ? `${entry.user_name || "—"} — ${formatDateTime(entry.acted_at)}` : "—"}</td>
                        <td>{final ? `${final.user_name || "—"} — ${formatDateTime(final.acted_at)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "types" && canTypes && (
        <NotificationTypesManager
          section={section}
          types={types}
          onRefresh={loadTypes}
          canManage={canTypes}
        />
      )}

      {tab === "members" && (
        <NotificationMembersPanel
          section={section}
          members={members}
          reports={memberReports}
          onRefresh={loadMembers}
          onOpenProfile={openMemberProfile}
          canManage={canMembers}
        />
      )}

      {showForm && (
        <NotificationFormModal
          section={section}
          currentUser={currentUser}
          types={types}
          members={members}
          report={editingReport}
          onClose={() => {
            setShowForm(false);
            setEditingReport(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditingReport(null);
            await refreshAll();
          }}
          onOpenArchive={onOpenArchive}
        />
      )}

      {selectedReport && (
        <div
          dir="rtl"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            zIndex: 3300,
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
              width: "min(900px, 100%)",
              maxHeight: "94vh",
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
                gap: 12,
                alignItems: "flex-start",
                background: cfg.accentSoft,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0F2942" }}>
                  {selectedReport.type_name}
                </div>
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>
                  {cfg.memberLabel}: {selectedReport.member_name} • {cfg.numberLabel}: {selectedReport.member_number || "—"} • {monthName(selectedReport.month)} {selectedReport.year}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedReport(null)} style={{ ...smallButtonStyle, color: "#B91C1C" }}>✕ إغلاق</button>
            </div>

            <div style={{ padding: 18, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
                <StatusBadge status={selectedReport.status} />
                <button type="button" onClick={() => { const target = selectedReport; setSelectedReport(null); openMemberProfile(target); }} style={{ ...smallButtonStyle, background: "#F5F3FF", color: "#7C3AED" }}>
                  📁 ملف العضو
                </button>
                {cfg.archiveMenu && onOpenArchive && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenArchive({
                        computer_number: selectedReport.member_number,
                        faculty_name: selectedReport.member_name,
                      })
                    }
                    style={{ ...smallButtonStyle, background: "#F0FDFA", color: "#0F766E" }}
                  >
                    🗂️ فتح في أرشيف المرتبات
                  </button>
                )}
                <button type="button" onClick={() => printReport(selectedReport)} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>
                  🖨️ طباعة
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
                {displayFields(selectedReport, selectedType).map((field) => (
                  <div key={field.key} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "9px 11px" }}>
                    <div style={{ fontSize: 11.5, color: "#64748B", fontWeight: 800, marginBottom: 4 }}>{field.label}</div>
                    <div style={{ fontSize: 13, color: "#0F2942", fontWeight: 700 }}>
                      <FieldValue field={field} report={selectedReport} />
                    </div>
                  </div>
                ))}
                {selectedReport.notes && (
                  <div style={{ gridColumn: "1 / -1", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 11px" }}>
                    <div style={{ fontSize: 11.5, color: "#92400E", fontWeight: 800, marginBottom: 4 }}>ملاحظات</div>
                    <div style={{ fontSize: 13, color: "#78350F", lineHeight: 1.8 }}>{selectedReport.notes}</div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942", marginBottom: 8 }}>🕒 سجل المراجعة</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {["entry", "final"].map((stage) => {
                    const review = latestReview(selectedReviews, stage);
                    return (
                      <div
                        key={stage}
                        style={{
                          border: review ? "1px solid #BBF7D0" : "1px dashed #CBD5E1",
                          background: review ? "#F0FDF4" : "#F8FAFC",
                          borderRadius: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 900, color: review ? "#047857" : "#64748B" }}>
                            {NOTIFICATION_STAGES[stage].fullLabel}
                          </div>
                          <div style={{ fontSize: 11.5, color: review ? "#047857" : "#94A3B8" }}>
                            {review ? (review.status === "rejected" ? "🔴 مرفوض" : "🟢 مكتمل") : "⏳ لم تكتمل"}
                          </div>
                        </div>
                        {review ? (
                          <div style={{ fontSize: 11.5, color: "#475569", marginTop: 5, lineHeight: 1.8 }}>
                            المستخدم: {review.user_name || "—"} • {formatDateTime(review.acted_at)}
                            <br />
                            المرحلة السابقة: {statusMeta(review.previous_stage).label} → المرحلة التالية: {statusMeta(review.next_stage).label}
                            {review.notes ? <><br />ملاحظات: {review.notes}</> : null}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4 }}>
                            لا تُسجَّل المرحلة إلا بضغط المستخدم المخول على زر التأكيد.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedReviews.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px dashed #CBD5E1", paddingTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#475569", marginBottom: 6 }}>
                      📜 كل أحداث المراجعة ({selectedReviews.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {selectedReviews.map((review) => (
                        <div
                          key={review.id}
                          style={{
                            fontSize: 11.5,
                            color: "#475569",
                            lineHeight: 1.8,
                            background: "#F8FAFC",
                            border: "1px solid #E2E8F0",
                            borderRadius: 8,
                            padding: "7px 9px",
                          }}
                        >
                          <strong>{NOTIFICATION_STAGES[review.stage]?.label || review.stage}</strong>
                          {" • "}
                          {review.status === "rejected" ? "مرفوض" : "مكتمل"}
                          {" • "}
                          {review.user_name || "—"}
                          {" • "}
                          {formatDateTime(review.acted_at)}
                          <br />
                          {statusMeta(review.previous_stage).label} → {statusMeta(review.next_stage).label}
                          {review.notes ? ` • ${review.notes}` : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942", marginBottom: 8 }}>📎 المرفقات</div>
                {selectedAttachments.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "#94A3B8" }}>لا توجد مرفقات.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {selectedAttachments.map((attachment) => (
                      <div key={attachment.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, padding: "8px 10px" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>📎 {attachment.file_name}</span>
                        <span style={{ display: "flex", gap: 10 }}>
                          <FileAnchor fileRef={attachment.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1D4ED8", fontWeight: 800, textDecoration: "none" }}>فتح</FileAnchor>
                          <FileDownloadLink fileRef={attachment.file_url} fileName={attachment.file_name} style={{ fontSize: 12, color: "#047857", fontWeight: 800, textDecoration: "none" }}>تحميل</FileDownloadLink>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, marginBottom: 12, whiteSpace: "pre-wrap" }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #E2E8F0", paddingTop: 14 }}>
                {canEditReport(currentUser, section, selectedReport) && (
                  <button type="button" onClick={() => { setSelectedReport(null); openEdit(selectedReport); }} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>✏️ تعديل</button>
                )}
                {canDeleteReport(currentUser, section, selectedReport) && (
                  <button type="button" onClick={() => deleteReport(selectedReport)} disabled={actionLoading} style={{ ...smallButtonStyle, background: "#FEF2F2", color: "#B91C1C" }}>🗑️ حذف</button>
                )}

                {canEntry && selectedReport.status === "pending_entry" && (
                  <>
                    <button type="button" onClick={() => completeReview(selectedReport, "entry")} disabled={actionLoading} style={{ ...smallButtonStyle, background: "#FEF3C7", color: "#92400E" }}>
                      {NOTIFICATION_STAGES.entry.buttonLabel}
                    </button>
                    <button type="button" onClick={() => rejectReport(selectedReport, "entry")} disabled={actionLoading} style={{ ...smallButtonStyle, background: "#FEE2E2", color: "#B91C1C" }}>رفض</button>
                  </>
                )}

                {canFinal && selectedReport.status === "entry_reviewed" && (
                  <>
                    <button type="button" onClick={() => completeReview(selectedReport, "final")} disabled={actionLoading} style={{ ...smallButtonStyle, background: "#D1FAE5", color: "#047857" }}>
                      {NOTIFICATION_STAGES.final.buttonLabel}
                    </button>
                    <button type="button" onClick={() => rejectReport(selectedReport, "final")} disabled={actionLoading} style={{ ...smallButtonStyle, background: "#FEE2E2", color: "#B91C1C" }}>رفض</button>
                  </>
                )}

                {!canEntry && selectedReport.status === "pending_entry" && (
                  <span style={{ fontSize: 11.5, color: "#94A3B8", alignSelf: "center" }}>مراجعة المدخل تتطلب صلاحية مستقلة.</span>
                )}
                {!canFinal && selectedReport.status === "entry_reviewed" && (
                  <span style={{ fontSize: 11.5, color: "#94A3B8", alignSelf: "center" }}>المراجعة النهائية تتطلب صلاحية مستقلة.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {profileMember && (
        <div
          dir="rtl"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            zIndex: 3150,
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
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                background: cfg.accentSoft,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#0F2942" }}>
                  📁 ملف {cfg.memberLabel}: {profileMember.full_name}
                </div>
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>
                  {cfg.numberLabel}: {profileMember.external_id || "—"} • جميع التبليغات السابقة والحالية
                </div>
              </div>
              <button type="button" onClick={() => setProfileMember(null)} style={{ ...smallButtonStyle, color: "#B91C1C" }}>✕ إغلاق</button>
            </div>

            <div style={{ padding: 18, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <span style={{ background: "#F1F5F9", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, color: "#334155" }}>الإجمالي: {profileSummary.total}</span>
                <span style={{ background: "#D1FAE5", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, color: "#047857" }}>مكتمل نهائيًا: {profileSummary.final}</span>
                <span style={{ background: "#FEF3C7", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, color: "#92400E" }}>قيد المراجعة: {profileSummary.pending}</span>
                <button type="button" onClick={printMemberProfile} style={{ ...smallButtonStyle, background: "#EFF6FF", color: "#1D4ED8" }}>🖨️ طباعة الملف</button>
                {cfg.archiveMenu && onOpenArchive && (
                  <button
                    type="button"
                    onClick={() => onOpenArchive(profileMember)}
                    style={{ ...smallButtonStyle, background: "#F0FDFA", color: "#0F766E" }}
                  >
                    🗂️ عرض في الأرشيف
                  </button>
                )}
              </div>

              {profileLoading ? (
                <div style={{ padding: 36, textAlign: "center", color: "#64748B" }}>⏳ جاري تحميل تبليغات العضو...</div>
              ) : profileReports.length === 0 ? (
                <div style={{ padding: 36, textAlign: "center", color: "#94A3B8" }}>لا توجد تبليغات لهذا العضو بعد.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {profileReports.map((report) => {
                    const reviews = profileReviews[report.id] || [];
                    const entry = latestReview(reviews, "entry");
                    const final = latestReview(reviews, "final");
                    const attachments = profileAttachments[report.id] || [];
                    return (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => {
                          setSelectedReport(report);
                          setReviewsByReport((current) => ({ ...current, ...profileReviews }));
                          setAttachmentsByReport((current) => ({ ...current, ...profileAttachments }));
                          ensureReportDetails(report.id);
                        }}
                        style={{
                          textAlign: "right",
                          background: "#fff",
                          border: "1px solid #E7EBF0",
                          borderRadius: 12,
                          padding: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 900, color: "#0F2942" }}>{report.type_name}</div>
                            <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
                              {monthName(report.month)} {report.year} • {reportSummary(report) || "—"}
                            </div>
                          </div>
                          <StatusBadge status={report.status} />
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
                          مدخل البيرول: {entry ? `${entry.user_name || "—"} — ${formatDateTime(entry.acted_at)}` : "—"}
                          {" • "}
                          مراجع البيرول: {final ? `${final.user_name || "—"} — ${formatDateTime(final.acted_at)}` : "—"}
                          {attachments.length > 0 ? ` • 📎 ${attachments.length}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

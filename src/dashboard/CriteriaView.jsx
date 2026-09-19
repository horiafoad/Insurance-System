import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";
import { notifyPushEvent, getAppBase } from "../utils/pushNotifications";

/* =========================================================================
   DEMO WHATSAPP — معاينة إشعار عند إتمام الطلب
   مرحلة التجربة فقط: بدون WhatsApp API، بدون إرسال فعلي، بدون مفاتيح سرية.
   ========================================================================= */

// رقم الإرسال التجريبي (ليس رقم الإدارة النهائي).
const WHATSAPP_DEMO_NUMBER = "01055662546";
const WHATSAPP_DEMO_NOTE =
  "للعرض التجريبي فقط – سيتم استبداله برقم الإدارة لاحقًا.";

// الرابط العام للمتابعة — نفس نطاق التطبيق مع معامل track (يُفتح منه نموذج متابعة الطلب).
function requestTrackingUrl(requestId) {
  let base = "";

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;

    if (protocol === "http:" || protocol === "https:") {
      base = getAppBase();
    }
  }

  // احتياط داخل تطبيق الأندرويد (capacitor/file://) — نفس الرابط العام المستخدم
  // أصلًا في المشروع لروابط متابعة الخطابات QR.
  if (!base) {
    base = "https://insurance-system-9et.pages.dev/";
  }

  return base + "?track=" + encodeURIComponent(String(requestId));
}

// تحويل رقم مقدم الطلب إلى صيغة دولية +20 لاستخدام wa.me (يمنع فتح الرابط برقم خاطئ).
function normalizePhoneToIntl(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("20") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 11) {
    return "20" + digits.slice(1);
  }

  return null;
}

// نص رسالة WhatsApp بالشكل النهائي المقترح للمراسلة.
function buildWhatsAppCompletedMessage(request) {
  const trackingUrl = requestTrackingUrl(request?.id);
  const notes = String(request?.notes || "").trim();

  const lines = [
    "إدارة الاستحقاقات – كلية الهندسة – جامعة عين شمس",
    "",
    "السيد/السيدة مقدم الطلب،",
    "",
    "نحيطكم علمًا بأنه تم الانتهاء من تنفيذ طلبكم رقم " +
      (request?.id ?? "") +
      ".",
  ];

  // ملاحظة الموظف على الطلب تُضاف تلقائيًا في الرسالة إن وجدت (لا يُعرض قسم إذا لم توجد).
  if (notes) {
    lines.push("", "ملاحظات إدارة الاستحقاقات:", notes);
  }

  lines.push(
    "",
    "لمتابعة تفاصيل الطلب:",
    trackingUrl,
    "",
    "مع خالص التحية،",
    "إدارة الاستحقاقات"
  );

  return lines.join("\n");
}

/* =========================================================================
   نافذة معاينة إشعار WhatsApp (تجريبية)
   ========================================================================= */

function WhatsAppPreviewModal({ request, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!request) return null;

  const message = buildWhatsAppCompletedMessage(request);
  const intlNumber = normalizePhoneToIntl(request.phone);
  const hasPhone = Boolean(request.phone && String(request.phone).trim());
  const invalidPhone = hasPhone && !intlNumber;

  const handleOpenWhatsApp = () => {
    if (!hasPhone) {
      alert("لا يوجد رقم موبايل مسجل لهذا الطلب.");
      return;
    }

    if (!intlNumber) {
      alert(
        "رقم الهاتف غير صالح لفتح محادثة WhatsApp: " + request.phone
      );
      return;
    }

    const waUrl =
      "https://wa.me/" +
      intlNumber +
      "?text=" +
      encodeURIComponent(message);

    // فتح المحادثة فقط — لا يتم إرسال أي رسالة تلقائيًا.
    // المستخدم هو الذي يضغط زر الإرسال يدويًا أثناء العرض.
    routeWhatsAppOpen(waUrl);
  };

  const routeWhatsAppOpen = (waUrl) => {
    try {
      // داخل تطبيق الأندرويد (Capacitor): فتح رسميّ خارج التطبيق ليتجه مباشرة إلى WhatsApp.
      if (
        typeof window !== "undefined" &&
        window.Capacitor &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform()
      ) {
        window.open(waUrl, "_system", "noopener,noreferrer");
        return;
      }

      // ويب/ديسكتوب: رابط حقيقي في تبويب جديد — أضمن من window.open
      // ولا يحجزه مانع النوافذ المنبثقة.
      const link = document.createElement("a");
      link.href = waUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (openError) {
      console.error("Open WhatsApp error:", openError);
      alert("تعذر فتح WhatsApp، يرجى المحاولة من متصفح آخر.");
    }
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = message;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (copyError) {
      console.error("Copy WhatsApp message error:", copyError);
      alert("تعذر نسخ الرسالة، يرجى المحاولة مرة أخرى.");
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{
          ...styles.loginBox,
          width: "min(560px, 95%)",
          padding: 0,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            background: "#075E54",
            color: "#FFFFFF",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>💬</span>

            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  fontSize: 14,
                  marginBottom: 2,
                }}
              >
                معاينة إشعار WhatsApp
              </strong>

              <small style={{ opacity: 0.85, fontSize: 11, lineHeight: 1.5 }}>
                عرض الشكل النهائي للإدارة — بدون إرسال فعلي
              </small>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="إغلاق المعاينة"
            title="إغلاق"
            style={{
              border: 0,
              background: "rgba(255,255,255,.18)",
              color: "#FFFFFF",
              width: 30,
              height: 30,
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: "18px 18px 10px",
            background: "#ECE5DD",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              maxWidth: "88%",
              background: "#DCF8C6",
              borderRadius: "12px",
              borderTopRightRadius: 2,
              padding: "12px 14px",
              color: "#111B21",
              fontSize: 14,
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              boxShadow: "0 1px 1px rgba(0,0,0,.12)",
            }}
          >
            {message}
          </div>
        </div>

        <div style={{ padding: "12px 18px 18px", background: "#FFFFFF" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              background: "#F0FDF4",
              border: "1px solid #BBF7D0",
              marginBottom: 12,
            }}
          >
            <span style={{ color: "#16A34A", flexShrink: 0 }}>📱</span>

            <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.7 }}>
              <strong>
                رقم الإرسال التجريبي: {WHATSAPP_DEMO_NUMBER}
              </strong>

              <div>{WHATSAPP_DEMO_NOTE}</div>
            </div>
          </div>

          {!hasPhone ? (
            <div
              style={{
                ...styles.errorBox,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              ⚠️ لا يوجد رقم موبايل مسجل لهذا الطلب.
            </div>
          ) : invalidPhone ? (
            <div
              style={{
                ...styles.errorBox,
                marginBottom: 12,
                fontSize: 13,
              }}
            >
              ⚠️ رقم الهاتف غير صالح ولا يمكن فتح محادثة WhatsApp عليه:{" "}
              <strong dir="ltr">{request.phone}</strong>
            </div>
          ) : (
            <div
              style={{
                ...styles.infoBox,
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              سيُفتح WhatsApp على الرقم{" "}
              <strong dir="ltr">{request.phone}</strong> — لن تُرسل الرسالة
              تلقائيًا، يضغط المستخدم زر الإرسال يدويًا.
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <button
              style={{
                ...styles.secondaryButton,
                background: "#ECFDF5",
                color: "#047857",
                border: "1px solid #A7F3D0",
              }}
              onClick={handleCopy}
            >
              {copied ? "✅ تم النسخ" : "📋 نسخ الرسالة"}
            </button>

            <button style={styles.secondaryButton} onClick={onClose}>
              إغلاق
            </button>

            <button
              style={{
                ...styles.primaryButton,
                background: "#25D366",
                border: "1px solid #1DA851",
              }}
              onClick={handleOpenWhatsApp}
            >
              💬 فتح WhatsApp للعرض
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MONTH_LABELS = {
  1: "يناير",
  2: "فبراير",
  3: "مارس",
  4: "أبريل",
  5: "مايو",
  6: "يونيو",
  7: "يوليو",
  8: "أغسطس",
  9: "سبتمبر",
  10: "أكتوبر",
  11: "نوفمبر",
  12: "ديسمبر",
};

const REQUEST_STATUSES = [
  { value: "جديدة", icon: "🟡", color: "#B45309", bg: "#FEF3C7" },
  { value: "قيد التنفيذ", icon: "🔵", color: "#2563EB", bg: "#DBEAFE" },
  { value: "تم التنفيذ", icon: "🟢", color: "#047857", bg: "#D1FAE5" },
  { value: "مرفوضة", icon: "🔴", color: "#DC2626", bg: "#FEE2E2" },
];

const STATUS_ALIASES = {
  "جديد": "جديدة",
  "قيد المراجعة": "قيد التنفيذ",
  "جاري التنفيذ": "قيد التنفيذ",
  "قيد المعالجة": "قيد التنفيذ",
  "معلق": "قيد التنفيذ",
  "مقبولة": "تم التنفيذ",
  "مكتمل": "تم التنفيذ",
  "منتهي": "تم التنفيذ",
  "تم الصرف": "تم التنفيذ",
};

const SERVICE_FILTER_ALIASES = {
  "مفردات مرتب": [
    "مفردات مرتب",
    "مفردات المرتب",
    "مفرد مرتب",
    "مفرد المرتب",
    "طلب استخراج مفرد",
  ],
  "الرعاية الصحية": ["الرعاية الصحية", "خدمة الرعاية", "الرعاية الاجتماعية"],
  "صندوق الزمالة": ["صندوق الزمالة", "الزمالة"],
};

function formatMonth(value) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (MONTH_LABELS[numeric]) return MONTH_LABELS[numeric];
  return String(value);
}

function formatRequestDate(row) {
  const value = row?.created_at ?? row?.createdAt ?? row?.submitted_at ?? row?.request_date;
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMeta(status) {
  const value = STATUS_ALIASES[status] || status;
  return (
    REQUEST_STATUSES.find((item) => item.value === value) || {
      icon: "⚪",
      color: "#64748B",
      bg: "#F1F5F9",
    }
  );
}

function getStatusStyle(status) {
  const match = statusMeta(status);

  return {
    ...styles.statusBadge,
    color: match.color,
    background: match.bg,
  };
}

function statusIcon(status) {
  return statusMeta(status).icon;
}

function statusOptionLabel(status) {
  const match = REQUEST_STATUSES.find((item) => item.value === status);
  return match ? `${match.icon} ${match.value}` : status;
}

function KpiDonut({ items }) {
  const total = items.reduce((sum, item) => sum + Number(item[1] || 0), 0);
  let start = 0;
  const segments = items.map((item) => {
    const value = Number(item[1] || 0);
    const end = total ? start + (value / total) * 100 : start;
    const segment = `${item[3]} ${start}% ${end}%`;
    start = end;
    return segment;
  });

  return (
    <div
      style={{
        width: 190,
        height: 190,
        borderRadius: "50%",
        background: total ? `conic-gradient(${segments.join(", ")})` : "#E2E8F0",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
      aria-label="توزيع مؤشرات الأداء"
      role="img"
    >
      <div
        style={{
          width: 126,
          height: 126,
          borderRadius: "50%",
          background: "#fff",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          color: "#1E293B",
          boxShadow: "0 2px 8px rgba(15,41,66,.08)",
        }}
      >
        <div>
          <strong style={{ display: "block", fontSize: 24 }}>
            {items.length ? Math.round(items.reduce((sum, item) => sum + Number(item[1] || 0), 0) / items.length) : 0}%
          </strong>
          <small style={{ color: "#64748B" }}>متوسط الـ KPI</small>
        </div>
      </div>
    </div>
  );
}

export default function CriteriaView() {
  const [requests, setRequests] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIndicators = async () => {
      const [
        { data: requestData, error: requestError },
        { data: feedbackData, error: feedbackError },
        { data: evaluationData, error: evaluationError },
        { data: taskData, error: taskError },
      ] =
        await Promise.all([
          supabase.from("service_requests").select("*"),
          supabase.from("public_feedback").select("*"),
          supabase.from("performance_evaluations").select("*"),
          supabase.from("employee_tasks").select("*"),
        ]);

      if (requestError || feedbackError || evaluationError || taskError) {
        console.error("خطأ في تحميل المؤشرات:", requestError || feedbackError || evaluationError || taskError);
      }
      setRequests(requestData || []);
      setFeedback(feedbackData || []);
      setEvaluations(evaluationData || []);
      setTasks(taskData || []);
      setLoading(false);
    };

    loadIndicators();
  }, []);

  const serviceRatings = feedback.filter(
    (item) => item.feedback_type === "تقييم خدمة" && item.rating !== null
  );
  const averageRating = serviceRatings.length
    ? (serviceRatings.reduce((sum, item) => sum + Number(item.rating || 0), 0) / serviceRatings.length).toFixed(1)
    : "0.0";
  const qualityCriteria = [
    { name: "رضا المستفيدين (CSAT)", standard: "≥ 90%", value: serviceRatings.length ? `${Math.round((Number(averageRating) / 5) * 100)}%` : "—", color: "#2563EB", icon: "⭐", desc: "قياس رضا المستفيد بعد الحصول على الخدمة." },
    { name: "الالتزام بمستوى الخدمة (SLA)", standard: "≥ 95%", value: "—", color: "#047857", icon: "⏱️", desc: "إنجاز الطلبات داخل المدة الزمنية المعتمدة." },
    { name: "دقة المعاملة", standard: "≥ 98%", value: "—", color: "#7C3AED", icon: "🎯", desc: "نسبة المعاملات الصحيحة من أول مرة دون إعادة أو أخطاء." },
    { name: "زمن إنجاز الخدمة", standard: "تحسين مستمر", value: "—", color: "#B45309", icon: "⚡", desc: "متوسط الوقت من استلام الطلب حتى إتمامه." },
    { name: "نسبة الحل من أول تواصل (FCR)", standard: "≥ 85%", value: "—", color: "#0891B2", icon: "✅", desc: "حل طلب المستفيد دون تحويله أو طلب متابعة إضافية." },
    { name: "معدل الشكاوى", standard: "≤ 2%", value: "—", color: "#DC2626", icon: "💬", desc: "متابعة الشكاوى وتحليل أسبابها واتخاذ إجراء تصحيحي." },
  ];
  const average = (values) => values.length
    ? Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length)
    : 0;
  const employeeKpis = [
    ["التقييم العام للموظفين", average(evaluations.map((item) => item.total_score)), "👥", "#2563EB"],
    ["الكفاءة الرقمية", average(evaluations.map((item) => item.completion_rate)), "💻", "#4338CA"],
    ["جودة ودقة العمل", average(evaluations.map((item) => item.accuracy_rate)), "🎯", "#7C3AED"],
    ["خدمات المكتب", average(evaluations.map((item) => item.speed_rate)), "🏢", "#047857"],
    ["الالتزام والانضباط", average(evaluations.map((item) => item.on_time_rate)), "⏱️", "#B45309"],
    ["إنجاز المهام", tasks.length ? Math.round((tasks.filter((task) => task.status === "مكتمل").length / tasks.length) * 100) : 0, "✅", "#0891B2"],
  ];
  const serviceKpis = [
    ["إجمالي الطلبات", requests.length, "🧾", "#2563EB"],
    ["نسبة الطلبات المقبولة", requests.length ? Math.round((requests.filter((request) => ["مقبولة", "مكتمل", "مكتملة"].includes(request.status)).length / requests.length) * 100) : 0, "📌", "#047857"],
    ["متوسط رضا المستفيدين", `${averageRating}/5`, "⭐", "#B45309"],
    ["الشكاوى والمقترحات", feedback.filter((item) => item.feedback_type === "شكوى / مقترح").length, "💬", "#DC2626"],
  ];

  return (
    <div>
      <div style={{ ...styles.card, marginBottom: 18 }}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>📈 مؤشرات ومعايير الجودة</h2>
            <p style={styles.cardSub}>لوحة KPI موحدة لأداء الموظفين وجودة الخدمات الإلكترونية وخدمات المكتب</p>
          </div>
          <div style={{ ...styles.statusBadge, background: "#D1FAE5", color: "#047857" }}>{loading ? "جاري التحديث..." : "بيانات مباشرة"}</div>
        </div>
        <h3 style={styles.cardTitle}>🎯 مؤشرات الأداء الرئيسية للموظفين</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          {employeeKpis.map(([label, value, icon, color]) => (
            <div key={label} style={{ padding: 18, borderRadius: 14, background: "#F8FAFC", border: `1px solid ${color}33` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 25 }}>{icon}</span><strong style={{ color, fontSize: 27 }}>{value}%</strong></div>
              <div style={{ color: "#334155", fontWeight: 800, fontSize: 13, margin: "8px 0" }}>{label}</div>
              <div style={{ height: 8, background: "#E2E8F0", borderRadius: 10 }}><div style={{ width: `${Math.min(100, Number(value) || 0)}%`, height: "100%", background: color, borderRadius: 10 }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 18 }}>
        <h3 style={styles.cardTitle}>🏛️ مؤشرات جودة الخدمات</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          {serviceKpis.map(([label, value, icon, color]) => (
            <div key={label} style={{ padding: 18, borderRadius: 14, background: "#fff", border: `1px solid ${color}33`, boxShadow: "0 5px 14px rgba(15,41,66,.05)" }}>
              <div style={{ fontSize: 25 }}>{icon}</div><strong style={{ display: "block", color, fontSize: 27, marginTop: 7 }}>{value}</strong><div style={{ color: "#475569", fontWeight: 800, fontSize: 13 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 18, display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={styles.cardTitle}>🥧 توزيع مؤشرات أداء الموظفين</h3>
          <p style={styles.cardSub}>رسم دائري يتغير تلقائيًا حسب بيانات التقييمات.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
            {employeeKpis.map(([label, value, icon, color]) => <div key={label} style={{ color: "#475569", fontSize: 13 }}><span style={{ color, fontSize: 16 }}>●</span> {icon} {label}: <strong style={{ color }}>{value}%</strong></div>)}
          </div>
        </div>
        <KpiDonut items={employeeKpis} />
      </div>

      <div style={{ ...styles.card, marginBottom: 18 }}>
        <h3 style={styles.cardTitle}>📋 معايير الجودة العالمية</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
          {qualityCriteria.map((criterion) => (
            <div key={criterion.name} style={{ padding: 20, border: "1px solid #E2E8F0", borderRadius: 16, background: "#fff", boxShadow: "0 5px 16px rgba(15,41,66,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ fontSize: 26 }}>{criterion.icon}</span><strong style={{ color: "#1E293B" }}>{criterion.name}</strong></div><span style={{ color: criterion.color, background: `${criterion.color}18`, borderRadius: 20, padding: "5px 9px", fontSize: 12, fontWeight: 800 }}>{criterion.standard}</span></div>
              <p style={{ color: "#64748B", fontSize: 13, lineHeight: 1.7, minHeight: 42 }}>{criterion.desc}</p>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748B", fontSize: 12, marginBottom: 7 }}><span>القراءة الحالية</span><strong style={{ color: criterion.color, fontSize: 18 }}>{criterion.value}</strong></div>
              <div style={{ height: 9, background: "#E2E8F0", borderRadius: 10 }}><div style={{ height: "100%", width: criterion.value === "—" ? "8%" : criterion.value, background: criterion.color, borderRadius: 10 }} /></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, padding: 18, borderRadius: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569", lineHeight: 1.9 }}><strong style={{ color: "#1E293B" }}>منهجية القياس:</strong> يتم تطبيق المعايير على الخدمات الإلكترونية وخدمات المكتب، وتسجيل القيمة الفعلية شهريًا ومقارنتها بالهدف.</div>
      </div>
    </div>
  );
}

export function ServiceRequestsView({
  selectedService = "all",
  onServiceFilterChange,
  focusRequestId,
}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [toast, setToast] = useState("");
  const [rejectPending, setRejectPending] = useState(null);
  const [waPreviewRequest, setWaPreviewRequest] = useState(null);

  const activeServiceFilter = onServiceFilterChange
    ? selectedService
    : serviceFilter;

  // إبراز الطلب المفتوح من الإشعار (عند الضغط على الإشعار من خدمة Web Push).
  useEffect(() => {
    if (focusRequestId && requests.length > 0) {
      const timer = window.setTimeout(() => {
        const row = document.getElementById(
          "service-request-" + focusRequestId
        );
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.style.transition = "background 0.6s";
          row.style.background = "#FEF3C7";
          window.setTimeout(() => {
            row.style.background = "";
          }, 2600);
        }
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [focusRequestId, requests.length]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("service_requests")
        .select("*")
        .order("id", { ascending: false });

      if (loadError) {
        console.error(loadError);
        setError("حدث خطأ أثناء تحميل الطلبات: " + loadError.message);
        setRequests([]);
        return;
      }

      setRequests(data || []);
    } catch (loadError) {
      console.error(loadError);
      setError("تعذر الاتصال بقاعدة البيانات.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const serviceTypes = useMemo(() => {
    return [...new Set(requests.map((item) => item.service_type).filter(Boolean))];
  }, [requests]);

  const statusOptions = useMemo(() => {
    const existing = requests.map((item) => item.status).filter(Boolean);
    return [...new Set([...REQUEST_STATUSES.map((item) => item.value), ...existing])];
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requests.filter((request) => {
      const statusMatch =
        statusFilter === "all" || request.status === statusFilter;
      const aliases = SERVICE_FILTER_ALIASES[activeServiceFilter] || [activeServiceFilter];
      const serviceMatch =
        activeServiceFilter === "all" ||
        aliases.some((alias) => request.service_type?.includes(alias));

      if (!statusMatch || !serviceMatch) return false;
      if (!query) return true;

      const haystack = [
        request.name,
        request.job_title,
        request.phone,
        request.service_type,
        request.status,
        request.request_year,
        formatMonth(request.request_month),
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [requests, search, statusFilter, activeServiceFilter]);

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const saveRequestUpdate = async (id, overrideStatus, overrideNotes) => {
    const previous = requests.find((item) => item.id === id);
    if (!previous) return;

    const draft = drafts[id] || {};
    const newStatus = overrideStatus || draft.status || previous.status || "جديدة";
    const newNotes =
      overrideNotes !== undefined
        ? overrideNotes
        : draft.notes !== undefined
          ? draft.notes
          : previous.notes;

    if (newStatus === previous.status && newNotes === (previous.notes || "")) {
      showToast("لا يوجد تغيير في الحالة أو الملاحظات.");
      return;
    }

    setUpdatingId(id);
    setError("");
    setRequests((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: newStatus, notes: newNotes } : item
      )
    );
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    try {
      const { error: updateError } = await supabase
        .from("service_requests")
        .update({
          status: newStatus,
          notes: newNotes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        console.error(updateError);
        setRequests((current) =>
          current.map((item) => (item.id === id ? previous : item))
        );
        setError("حدث خطأ أثناء حفظ التحديث: " + updateError.message);
        return;
      }

      showToast("تم تحديث الطلب بنجاح.");

      // إشعار الموبايل (fire-and-forget) عند تغيير الحالة أو إضافة ملاحظة.
      if (newStatus !== previous.status) {
        notifyPushEvent("status_change", {
          requestId: id,
          requestNumber: id,
          status: newStatus,
        });
      } else if (newNotes !== (previous.notes || "")) {
        notifyPushEvent("note_added", {
          requestId: id,
          requestNumber: id,
        });
      }
    } catch (updateError) {
      console.error(updateError);
      setRequests((current) =>
        current.map((item) => (item.id === id ? previous : item))
      );
      setError("تعذر حفظ التحديث في قاعدة البيانات.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveClick = (id) => {
    const previous = requests.find((item) => item.id === id);
    if (!previous) return;

    const draft = drafts[id] || {};
    const newStatus = draft.status || previous.status || "جديدة";

    if (newStatus === "مرفوضة" && newStatus !== previous.status) {
      setRejectPending({
        id,
        status: newStatus,
        notes: draft.notes !== undefined ? draft.notes : previous.notes,
      });
      return;
    }

    saveRequestUpdate(id);
  };

  const handleDeleteRequest = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الطلب نهائياً؟")) return;

    try {
      setRequests((curr) => curr.filter((r) => r.id !== id));
      const { error: delError } = await supabase
        .from("service_requests")
        .delete()
        .eq("id", id);

      if (delError) {
        console.warn("Delete request error:", delError.message);
      }
      alert("تم حذف الطلب بنجاح.");
    } catch (e) {
      console.error(e);
      alert("تعذر حذف الطلب.");
    }
  };

  const handleSaveEditRequest = async (e) => {
    e.preventDefault();
    if (!editingRequest) return;

    const prevRequest = requests.find(
      (r) => r.id === editingRequest.id
    );

    if (!prevRequest) {
      setError("تعذر العثور على الطلب المطلوب تعديله.");
      return;
    }

    setUpdatingId(editingRequest.id);
    setError("");

    try {
      const { data: savedRow, error: saveError } = await supabase
        .from("service_requests")
        .update({
          name: editingRequest.name,
          job_title: editingRequest.job_title,
          phone: editingRequest.phone,
          service_type: editingRequest.service_type,
          certificate_type: editingRequest.certificate_type || null,
          request_month: Number(editingRequest.request_month),
          request_year: Number(editingRequest.request_year),
          notes: editingRequest.notes || null,
          status: editingRequest.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingRequest.id)
        .select()
        .single();

      // لا نعرض نجاحًا إلا بعد تأكيد التحديث من قاعدة البيانات فعلاً.
      if (saveError) {
        console.error("Save request update error:", saveError);
        setRequests((curr) =>
          curr.map((r) => (r.id === editingRequest.id ? prevRequest : r))
        );
        setError(
          "حدث خطأ أثناء حفظ تعديل الطلب: " + saveError.message
        );
        return;
      }

      // نعرض القيم المؤكدة من قاعدة البيانات مباشرة في نفس الصفحة.
      const confirmedRow = savedRow || editingRequest;
      setRequests((curr) =>
        curr.map((r) =>
          r.id === editingRequest.id ? confirmedRow : r
        )
      );

      setEditingRequest(null);
      showToast("تم حفظ تعديل الطلب بنجاح.");

      // إشعار الموبايل (fire-and-forget) عند تغيير الحالة أو إضافة ملاحظة.
      if (editingRequest.status !== prevRequest.status) {
        notifyPushEvent("status_change", {
          requestId: editingRequest.id,
          requestNumber: editingRequest.id,
          status: editingRequest.status,
        });
      } else if (
        (editingRequest.notes || "") !== (prevRequest.notes || "")
      ) {
        notifyPushEvent("note_added", {
          requestId: editingRequest.id,
          requestNumber: editingRequest.id,
        });
      }
    } catch (saveException) {
      console.error("Save request exception:", saveException);
      setRequests((curr) =>
        curr.map((r) => (r.id === editingRequest.id ? prevRequest : r))
      );
      setError(
        "تعذر حفظ التعديل في قاعدة البيانات: " +
          (saveException?.message || "")
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const exportExcel = () => {
    if (requests.length === 0) {
      alert("لا توجد طلبات لتصديرها.");
      return;
    }

    const rows = filteredRequests.map((r, i) => ({
      "م": i + 1,
      "اسم مقدم الطلب": r.name || "—",
      "الوظيفة": r.job_title || "—",
      "الهاتف": r.phone || "—",
      "نوع الخدمة": r.service_type || "—",
      "الشهر المطلوب": formatMonth(r.request_month),
      "السنة المطلوبة": r.request_year || "—",
      "حالة الطلب": r.status || "جديدة",
      "تاريخ التقديم": formatRequestDate(r),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الطلبات الواردة");
    XLSX.writeFile(wb, "الطلبات_الواردة_" + new Date().toISOString().split("T")[0] + ".xlsx");
  };

  const counts = useMemo(() => {
    return {
      total: requests.length,
      newCount: requests.filter(
        (item) => ["جديدة", "جديد"].includes(item.status)
      ).length,
      inProgress: requests.filter((item) =>
        ["قيد التنفيذ", "قيد المراجعة", "جاري التنفيذ", "قيد المعالجة", "معلق"].includes(
          item.status
        )
      ).length,
      completed: requests.filter((item) =>
        ["تم التنفيذ", "مقبولة", "مكتمل", "منتهي", "تم الصرف"].includes(item.status)
      ).length,
      rejected: requests.filter((item) => item.status === "مرفوضة").length,
    };
  }, [requests]);

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>📥 الطلبات الواردة</h2>
          <p style={styles.cardSub}>طلبات الخدمات الإلكترونية الواردة مع إمكانية التعديل والحذف والمتابعة</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={styles.secondaryButton} onClick={loadRequests}>
            🔄 تحديث
          </button>
          <button style={styles.primaryButton} onClick={exportExcel}>
            📊 تصدير Excel
          </button>
        </div>
      </div>

      <div style={styles.infoBox}>
        💬 <strong>وضع تجريبي WhatsApp:</strong> عند وصول أي طلب بحالة «تم
        التنفيذ» يظهر زر «معاينة رسالة WhatsApp» لعرض شكل الإشعار المقترح —
        لا يتم إرسال أي رسالة فعلية في هذه المرحلة.
      </div>

      {loading && <div style={styles.infoBox}>جاري تحميل الطلبات...</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {toast && (
        <div style={{ ...styles.successBox, marginTop: 12 }}>{toast}</div>
      )}

      <div style={styles.claimStats}>
        <ClaimStat title="إجمالي الطلبات" value={counts.total} icon="📥" />
        <ClaimStat title="جديدة" value={counts.newCount} icon="🟡" />
        <ClaimStat title="قيد التنفيذ" value={counts.inProgress} icon="🔵" />
        <ClaimStat title="تم التنفيذ" value={counts.completed} icon="🟢" />
        <ClaimStat title="مرفوضة" value={counts.rejected} icon="🔴" />
      </div>

      <div className="service-filter-bar" style={styles.filterRow}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 بحث بالاسم أو الوظيفة أو الهاتف أو نوع الخدمة"
          style={styles.claimSearch}
        />

        <select
          value={activeServiceFilter}
          onChange={(e) => {
            if (onServiceFilterChange) {
              onServiceFilterChange(e.target.value);
            } else {
              setServiceFilter(e.target.value);
            }
          }}
          style={styles.claimSelect}
        >
          <option value="all">كل الخدمات</option>
          {serviceTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.claimSelect}
        >
          <option value="all">كل الحالات</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {statusOptionLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.resultText}>
        عدد النتائج الحالية: <strong>{filteredRequests.length}</strong> من{" "}
        <strong>{requests.length}</strong>
      </div>

      {!loading && filteredRequests.length > 0 && (
        <div className="service-table-wrap mobile-hscroll" style={styles.claimTableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>اسم مقدم الطلب</th>
                <th style={styles.th}>الوظيفة</th>
                <th style={styles.th}>رقم الهاتف</th>
                <th style={styles.th}>نوع الخدمة</th>
                <th style={styles.th}>نوع الإفادة</th>
                <th style={styles.th}>الشهر المطلوب</th>
                <th style={styles.th}>السنة المطلوبة</th>
                <th style={styles.th}>ملاحظات</th>
                <th style={styles.th}>حالة الطلب</th>
                <th style={styles.th}>تاريخ التقديم</th>
                <th style={styles.th}>إجراءات المدير</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => {
                const currentStatus = request.status || "جديدة";
                const selectOptions = [
                  ...new Set([
                    currentStatus,
                    ...REQUEST_STATUSES.map((item) => item.value),
                  ]),
                ];

                return (
                  <tr key={request.id} id={"service-request-" + request.id} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{request.name || "—"}</strong>
                    </td>
                    <td style={styles.td}>{request.job_title || "—"}</td>
                    <td style={styles.td}>
                      {request.phone ? (
                        <a href={"tel:" + request.phone} style={{ color: "#2563EB", textDecoration: "none" }}>
                          📞 {request.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={{ fontWeight: "600", color: "#1E293B" }}>
                        {request.service_type || "—"}
                      </span>
                    </td>
                    <td style={styles.td}>{request.certificate_type || "—"}</td>
                    <td style={styles.td}>{formatMonth(request.request_month)}</td>
                    <td style={styles.td}>{request.request_year || "—"}</td>
                    <td style={styles.td}>{request.notes || "—"}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 190 }}>
                        <span style={getStatusStyle(currentStatus)}>
                          {statusIcon(currentStatus)} {currentStatus}
                        </span>
                        <select
                          value={drafts[request.id]?.status || currentStatus}
                          disabled={updatingId === request.id}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [request.id]: {
                                ...(prev[request.id] || {}),
                                status: e.target.value,
                              },
                            }))
                          }
                          style={{ ...styles.claimSelect, padding: "5px 8px", fontSize: "12px" }}
                        >
                          {selectOptions.map((status) => (
                            <option key={status} value={status}>
                              {statusOptionLabel(status)}
                            </option>
                          ))}
                        </select>
                        <textarea
                          rows={2}
                          value={
                            drafts[request.id]?.notes !== undefined
                              ? drafts[request.id].notes
                              : request.notes || ""
                          }
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [request.id]: {
                                ...(prev[request.id] || {}),
                                notes: e.target.value,
                              },
                            }))
                          }
                          placeholder="أضف ملاحظة لمقدم الطلب..."
                          style={{
                            ...styles.input,
                            minHeight: 46,
                            resize: "vertical",
                            fontSize: 12,
                            padding: "6px 8px",
                          }}
                        />
                        <button
                          disabled={updatingId === request.id}
                          onClick={() => handleSaveClick(request.id)}
                          style={{
                            ...styles.primaryButton,
                            padding: "6px 10px",
                            fontSize: "12px",
                          }}
                        >
                          {updatingId === request.id
                            ? "⏳ جاري الحفظ..."
                            : "💾 حفظ التحديث"}
                        </button>
                      </div>
                    </td>
                    <td style={styles.td}>{formatRequestDate(request)}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {currentStatus === "تم التنفيذ" && (
                          <button
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              background: "#DCFCE7",
                              color: "#15803D",
                              border: "1px solid #86EFAC",
                              borderRadius: 8,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            onClick={() =>
                              setWaPreviewRequest(request)
                            }
                            title="عرض شكل رسالة WhatsApp عند إتمام الطلب"
                          >
                            💬 معاينة رسالة WhatsApp
                          </button>
                        )}

                        <button
                          style={{
                            ...styles.viewButton,
                            background: "#FEF3C7",
                            color: "#92400E",
                            borderColor: "#FDE68A",
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => setEditingRequest({ ...request })}
                          title="تعديل الطلب"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          style={{
                            ...styles.deleteButton,
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => handleDeleteRequest(request.id)}
                          title="حذف الطلب"
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && requests.length === 0 && !error && (
        <EmptyState text="لا توجد طلبات واردة حتى الآن." />
      )}

      {!loading && requests.length > 0 && filteredRequests.length === 0 && (
        <EmptyState text="لا توجد طلبات مطابقة للبحث أو التصفية." />
      )}

      {/* Modal تعديل الطلب */}
      {editingRequest && (
        <div style={styles.modalOverlay} onClick={() => setEditingRequest(null)}>
          <div
            style={{ ...styles.loginBox, width: "min(520px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeButton} onClick={() => setEditingRequest(null)}>
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>✏️</div>

            <h3 style={styles.loginTitle}>تعديل بيانات الطلب</h3>

            <form onSubmit={handleSaveEditRequest}>
              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  اسم مقدم الطلب
                </label>
                <input
                  type="text"
                  value={editingRequest.name || ""}
                  onChange={(e) =>
                    setEditingRequest((prev) => ({ ...prev, name: e.target.value }))
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  نوع الإفادة (إن وجد)
                </label>
                <input
                  type="text"
                  value={editingRequest.certificate_type || ""}
                  onChange={(e) =>
                    setEditingRequest((prev) => ({ ...prev, certificate_type: e.target.value }))
                  }
                  style={styles.input}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    الوظيفة
                  </label>
                  <input
                    type="text"
                    value={editingRequest.job_title || ""}
                    onChange={(e) =>
                      setEditingRequest((prev) => ({ ...prev, job_title: e.target.value }))
                    }
                    style={styles.input}
                    required
                  />
                </div>

                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={editingRequest.phone || ""}
                    onChange={(e) =>
                      setEditingRequest((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  نوع الخدمة
                </label>
                <input
                  type="text"
                  value={editingRequest.service_type || ""}
                  onChange={(e) =>
                    setEditingRequest((prev) => ({ ...prev, service_type: e.target.value }))
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    الشهر المطلوب
                  </label>
                  <select
                    value={editingRequest.request_month || "1"}
                    onChange={(e) =>
                      setEditingRequest((prev) => ({ ...prev, request_month: e.target.value }))
                    }
                    style={styles.input}
                  >
                    {Object.entries(MONTH_LABELS).map(([num, name]) => (
                      <option key={num} value={num}>
                        {name} ({num})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    السنة المطلوبة
                  </label>
                  <input
                    type="number"
                    value={editingRequest.request_year || new Date().getFullYear()}
                    onChange={(e) =>
                      setEditingRequest((prev) => ({ ...prev, request_year: e.target.value }))
                    }
                    style={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  حالة الطلب
                </label>
                <select
                  value={editingRequest.status || "جديدة"}
                  onChange={(e) =>
                    setEditingRequest((prev) => ({ ...prev, status: e.target.value }))
                  }
                  style={styles.input}
                >
                  {REQUEST_STATUSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.icon} {item.value}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  ملاحظات (اختياري)
                </label>
                <textarea
                  value={editingRequest.notes || ""}
                  onChange={(e) =>
                    setEditingRequest((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  style={{ ...styles.input, minHeight: "80px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setEditingRequest(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={updatingId === editingRequest.id}
                  style={styles.primaryButton}
                >
                  {updatingId === editingRequest.id
                    ? "⏳ جاري الحفظ..."
                    : "💾 حفظ التعديل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal معاينة إشعار WhatsApp (تجريبي) */}
      {waPreviewRequest && (
        <WhatsAppPreviewModal
          request={waPreviewRequest}
          onClose={() => setWaPreviewRequest(null)}
        />
      )}

      {/* Modal تأكيد رفض الطلب */}
      {rejectPending && (
        <div
          style={styles.modalOverlay}
          onClick={() => setRejectPending(null)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(420px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "38px", marginBottom: "8px" }}>
              ⛔
            </div>

            <h3 style={styles.loginTitle}>تأكيد رفض الطلب</h3>

            <p style={styles.loginDescription}>
              هل أنت متأكد من رفض هذا الطلب؟<br />
              لن يتم تغيير حالة الطلب إلا بعد التأكيد.
            </p>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                marginTop: "18px",
              }}
            >
              <button
                style={styles.secondaryButton}
                onClick={() => setRejectPending(null)}
              >
                إلغاء
              </button>
              <button
                style={{ ...styles.primaryButton, background: "#DC2626" }}
                onClick={() => {
                  const pending = rejectPending;
                  setRejectPending(null);
                  saveRequestUpdate(pending.id, pending.status, pending.notes || "");
                }}
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

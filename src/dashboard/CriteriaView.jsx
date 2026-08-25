import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";

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
  { value: "جديدة", color: "#2563EB", bg: "#DBEAFE" },
  { value: "قيد المراجعة", color: "#B45309", bg: "#FEF3C7" },
  { value: "مقبولة", color: "#047857", bg: "#D1FAE5" },
  { value: "مرفوضة", color: "#DC2626", bg: "#FEE2E2" },
];

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

function getStatusStyle(status) {
  const match =
    REQUEST_STATUSES.find((item) => item.value === status) ||
    (status === "جديد"
      ? { color: "#2563EB", bg: "#DBEAFE" }
      : { color: "#64748B", bg: "#F1F5F9" });

  return {
    ...styles.statusBadge,
    color: match.color,
    background: match.bg,
  };
}

export default function CriteriaView() {
  const criteria = [
    {
      name: "نسبة إنجاز المهام",
      weight: 30,
      desc: "نسبة الأعمال التي تم تنفيذها.",
    },
    {
      name: "الالتزام بالمواعيد",
      weight: 25,
      desc: "الالتزام بمواعيد التنفيذ.",
    },
    {
      name: "دقة العمل والمراجعة",
      weight: 20,
      desc: "المراجعة وتقليل الأخطاء.",
    },
    {
      name: "سرعة الإنجاز",
      weight: 10,
      desc: "سرعة تنفيذ المعاملات.",
    },
    {
      name: "المراجعة والرفع",
      weight: 10,
      desc: "إتمام المراجعة والرفع.",
    },
    {
      name: "تنظيم وتسجيل العمل",
      weight: 5,
      desc: "اكتمال البيانات والملاحظات.",
    },
  ];

  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>معايير تقييم أداء قسم الاستحقاقات</h2>
      <p style={styles.cardSub}>الأوزان قابلة للتعديل لاحقًا.</p>

      {criteria.map((item) => (
        <div key={item.name} style={styles.criteriaCard}>
          <div style={styles.criteriaTop}>
            <div>
              <b>{item.name}</b>
              <p style={styles.criteriaDescription}>{item.desc}</p>
            </div>
            <strong>{item.weight}%</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ServiceRequestsView() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);

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
      const serviceMatch =
        serviceFilter === "all" || request.service_type === serviceFilter;

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
  }, [requests, search, statusFilter, serviceFilter]);

  const updateStatus = async (id, status) => {
    const previous = requests.find((item) => item.id === id);
    if (!previous || previous.status === status) return;

    setUpdatingId(id);
    setError("");
    setRequests((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item))
    );

    try {
      const { error: updateError } = await supabase
        .from("service_requests")
        .update({ status })
        .eq("id", id);

      if (updateError) {
        console.error(updateError);
        setRequests((current) =>
          current.map((item) =>
            item.id === id ? { ...item, status: previous.status } : item
          )
        );
        setError("حدث خطأ أثناء تحديث حالة الطلب: " + updateError.message);
      }
    } catch (updateError) {
      console.error(updateError);
      setRequests((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: previous.status } : item
        )
      );
      setError("تعذر حفظ حالة الطلب في قاعدة البيانات.");
    } finally {
      setUpdatingId(null);
    }
  };

  const counts = useMemo(() => {
    return {
      total: requests.length,
      newCount: requests.filter(
        (item) => item.status === "جديدة" || item.status === "جديد"
      ).length,
      reviewing: requests.filter((item) => item.status === "قيد المراجعة").length,
      accepted: requests.filter((item) => item.status === "مقبولة").length,
      rejected: requests.filter((item) => item.status === "مرفوضة").length,
    };
  }, [requests]);

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>📥 الطلبات الواردة</h2>
          <p style={styles.cardSub}>طلبات الخدمات الإلكترونية الواردة</p>
        </div>
      </div>

      {loading && <div style={styles.infoBox}>جاري تحميل الطلبات...</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.claimStats}>
        <ClaimStat title="إجمالي الطلبات" value={counts.total} icon="📥" />
        <ClaimStat title="جديدة" value={counts.newCount} icon="🆕" />
        <ClaimStat title="قيد المراجعة" value={counts.reviewing} icon="🔎" />
        <ClaimStat title="مقبولة" value={counts.accepted} icon="✅" />
        <ClaimStat title="مرفوضة" value={counts.rejected} icon="⛔" />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 بحث بالاسم أو الوظيفة أو الهاتف أو نوع الخدمة"
          style={styles.claimSearch}
        />

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
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
              {status}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.resultText}>
        عدد النتائج الحالية: <strong>{filteredRequests.length}</strong> من{" "}
        <strong>{requests.length}</strong>
      </div>

      {!loading && filteredRequests.length > 0 && (
        <div style={styles.claimTableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>اسم مقدم الطلب</th>
                <th style={styles.th}>الوظيفة</th>
                <th style={styles.th}>رقم الهاتف</th>
                <th style={styles.th}>نوع الخدمة</th>
                <th style={styles.th}>الشهر المطلوب</th>
                <th style={styles.th}>السنة المطلوبة</th>
                <th style={styles.th}>حالة الطلب</th>
                <th style={styles.th}>تاريخ التقديم</th>
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
                  <tr key={request.id} style={styles.tr}>
                    <td style={styles.td}>{request.name || "—"}</td>
                    <td style={styles.td}>{request.job_title || "—"}</td>
                    <td style={styles.td}>{request.phone || "—"}</td>
                    <td style={styles.td}>{request.service_type || "—"}</td>
                    <td style={styles.td}>{formatMonth(request.request_month)}</td>
                    <td style={styles.td}>{request.request_year || "—"}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style={getStatusStyle(currentStatus)}>
                          {currentStatus}
                        </span>
                        <select
                          value={currentStatus}
                          disabled={updatingId === request.id}
                          onChange={(e) => updateStatus(request.id, e.target.value)}
                          style={styles.filter}
                        >
                          {selectOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={styles.td}>{formatRequestDate(request)}</td>
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
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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

export function ServiceRequestsView({
  selectedService = "all",
  onServiceFilterChange,
  canManage = false,
}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);

  const activeServiceFilter = onServiceFilterChange
    ? selectedService
    : serviceFilter;

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
        activeServiceFilter === "all" || request.service_type === activeServiceFilter;

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

    try {
      setRequests((curr) =>
        curr.map((r) => (r.id === editingRequest.id ? editingRequest : r))
      );

      const { error: saveError } = await supabase
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
        })
        .eq("id", editingRequest.id);

      if (saveError) {
        console.warn("Save request update error:", saveError.message);
      }

      setEditingRequest(null);
      alert("تم حفظ تعديل الطلب بنجاح.");
    } catch (e) {
      console.error(e);
      alert("تعذر حفظ التعديل.");
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
                  <tr key={request.id} style={styles.tr}>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={getStatusStyle(currentStatus)}>
                          {currentStatus}
                        </span>
                        <select
                          value={currentStatus}
                          disabled={updatingId === request.id}
                          onChange={(e) => updateStatus(request.id, e.target.value)}
                          style={{ ...styles.filter, padding: "4px 8px", fontSize: "12px" }}
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
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "6px" }}>
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
                  <option value="جديدة">جديدة</option>
                  <option value="قيد المراجعة">قيد المراجعة</option>
                  <option value="مقبولة">مقبولة</option>
                  <option value="مرفوضة">مرفوضة</option>
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
                <button type="submit" style={styles.primaryButton}>
                  💾 حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

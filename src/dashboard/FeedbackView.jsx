import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";

const FEEDBACK_STATUSES = [
  { value: "جديد", color: "#2563EB", bg: "#DBEAFE" },
  { value: "قيد المراجعة", color: "#B45309", bg: "#FEF3C7" },
  { value: "تم الرد / المعالجة", color: "#047857", bg: "#D1FAE5" },
  { value: "مكتمل", color: "#059669", bg: "#E6F4EA" },
  { value: "مؤرشف", color: "#64748B", bg: "#F1F5F9" },
];

function formatFeedbackDate(value) {
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

function getStatusBadgeStyle(status) {
  const match = FEEDBACK_STATUSES.find((s) => s.value === status) || {
    color: "#2563EB",
    bg: "#DBEAFE",
  };
  return {
    ...styles.statusBadge,
    color: match.color,
    background: match.bg,
    display: "inline-block",
    fontWeight: "700",
    fontSize: "12px",
    padding: "4px 10px",
    borderRadius: "12px",
  };
}

export default function FeedbackView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      setError("");

      let remoteItems = [];
      try {
        const { data, error: loadError } = await supabase
          .from("public_feedback")
          .select("*")
          .order("created_at", { ascending: false });

        if (loadError) {
          console.warn("Supabase feedback fetch warning:", loadError.message);
        } else if (data) {
          remoteItems = data;
        }
      } catch (err) {
        console.warn("Supabase fetch error:", err);
      }

      // Load local backups from localStorage
      let localItems = [];
      try {
        const raw = localStorage.getItem("backup_public_feedback");
        if (raw) {
          localItems = JSON.parse(raw);
        }
      } catch (err) {
        console.error("Failed to parse local feedback backups:", err);
      }

      // Combine remote and local items without duplicates
      const seenIds = new Set();
      const combined = [];

      remoteItems.forEach((item) => {
        if (item.id) seenIds.add(String(item.id));
        combined.push(item);
      });

      localItems.forEach((item) => {
        if (!item.id || !seenIds.has(String(item.id))) {
          combined.push(item);
        }
      });

      // Sort by created_at desc
      combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      setItems(combined);
    } catch (err) {
      console.error(err);
      setError("تعذر تحميل بيانات التقييمات والشكاوى.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, []);

  const updateStatus = async (id, newStatus) => {
    const previous = items.find((item) => item.id === id);
    if (!previous || previous.status === newStatus) return;

    setUpdatingId(id);
    setItems((curr) =>
      curr.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );

    // Update in localStorage
    try {
      const raw = localStorage.getItem("backup_public_feedback");
      if (raw) {
        const localList = JSON.parse(raw);
        const updatedLocal = localList.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        );
        localStorage.setItem("backup_public_feedback", JSON.stringify(updatedLocal));
      }
    } catch (e) {
      console.error("Local update error:", e);
    }

    // Update in Supabase if not a pure local id
    if (!String(id).startsWith("local-")) {
      try {
        const { error: updateError } = await supabase
          .from("public_feedback")
          .update({ status: newStatus })
          .eq("id", id);

        if (updateError) {
          console.warn("Supabase status update error:", updateError.message);
        }
      } catch (e) {
        console.warn("Supabase status update exception:", e);
      }
    }

    setUpdatingId(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      setItems((curr) =>
        curr.map((item) => (item.id === editingItem.id ? editingItem : item))
      );

      // Save in localStorage
      try {
        const raw = localStorage.getItem("backup_public_feedback");
        if (raw) {
          const list = JSON.parse(raw);
          const updated = list.map((item) =>
            item.id === editingItem.id ? editingItem : item
          );
          localStorage.setItem("backup_public_feedback", JSON.stringify(updated));
        }
      } catch (e) {
        console.error(e);
      }

      // Save in Supabase
      if (!String(editingItem.id).startsWith("local-")) {
        try {
          await supabase
            .from("public_feedback")
            .update({
              name: editingItem.name,
              phone: editingItem.phone,
              feedback_type: editingItem.feedback_type,
              rating: editingItem.rating ? Number(editingItem.rating) : null,
              message: editingItem.message,
              status: editingItem.status,
            })
            .eq("id", editingItem.id);
        } catch (e) {
          console.warn("Supabase feedback update error:", e);
        }
      }

      setEditingItem(null);
      alert("تم حفظ تعديل الشكوى / التقييم بنجاح.");
    } catch (e) {
      console.error(e);
      alert("تعذر حفظ التعديل.");
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السجل نهائياً؟")) return;

    setItems((curr) => curr.filter((item) => item.id !== id));

    // Delete from localStorage
    try {
      const raw = localStorage.getItem("backup_public_feedback");
      if (raw) {
        const localList = JSON.parse(raw);
        const updatedLocal = localList.filter((item) => item.id !== id);
        localStorage.setItem("backup_public_feedback", JSON.stringify(updatedLocal));
      }
    } catch (e) {
      console.error("Local delete error:", e);
    }

    // Delete from Supabase
    if (!String(id).startsWith("local-")) {
      try {
        const { error: delError } = await supabase
          .from("public_feedback")
          .delete()
          .eq("id", id);

        if (delError) {
          console.warn("Supabase delete error:", delError.message);
        }
      } catch (e) {
        console.warn("Supabase delete exception:", e);
      }
    }
  };

  const stats = useMemo(() => {
    const ratings = items.filter(
      (item) => item.feedback_type === "تقييم خدمة" && item.rating !== null && item.rating !== undefined
    );
    const complaints = items.filter((item) => item.feedback_type === "شكوى / مقترح");
    const newItems = items.filter(
      (item) => !item.status || item.status === "جديد" || item.status === "جديدة"
    );

    const avg = ratings.length
      ? (
          ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
          ratings.length
        ).toFixed(1)
      : "0.0";

    return {
      total: items.length,
      ratingsCount: ratings.length,
      averageRating: avg,
      complaintsCount: complaints.length,
      newCount: newItems.length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesType =
        typeFilter === "all" || item.feedback_type === typeFilter;

      const matchesStatus =
        statusFilter === "all" || (item.status || "جديد") === statusFilter;

      if (!matchesType || !matchesStatus) return false;
      if (!query) return true;

      const haystack = [
        item.name,
        item.phone,
        item.message,
        item.feedback_type,
        item.status,
        item.rating ? (item.rating + " نجوم") : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [items, search, typeFilter, statusFilter]);

  const exportExcel = () => {
    if (items.length === 0) {
      alert("لا توجد بيانات لتصديرها.");
      return;
    }

    const rows = filteredItems.map((item, index) => ({
      "م": index + 1,
      "النوع": item.feedback_type || "—",
      "الاسم": item.name || "—",
      "الهاتف": item.phone || "—",
      "التقييم": item.rating ? (item.rating + " / 5") : "—",
      "الشكوى / المقترح / الملاحظات": item.message || "—",
      "الحالة": item.status || "جديد",
      "تاريخ الإرسال": formatFeedbackDate(item.created_at),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الشكاوى والتقييمات");
    XLSX.writeFile(wb, "الشكاوى_والتقييمات_" + new Date().toISOString().split("T")[0] + ".xlsx");
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>💬 إدارة الشكاوى والتقييمات</h2>
          <p style={styles.cardSub}>
            متابعة وتعديل وحذف كافة التقييمات والشكاوى والمقترحات الواردة
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={styles.secondaryButton} onClick={loadFeedback}>
            🔄 تحديث
          </button>
          <button style={styles.primaryButton} onClick={exportExcel}>
            📊 تصدير Excel
          </button>
        </div>
      </div>

      {loading && <div style={styles.infoBox}>جاري تحميل الشكاوى والتقييمات...</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.claimStats}>
        <ClaimStat title="إجمالي الوارد" value={stats.total} icon="📥" />
        <ClaimStat title="وارد جديد" value={stats.newCount} icon="🆕" />
        <ClaimStat title="تقييمات الخدمة" value={stats.ratingsCount} icon="⭐" />
        <ClaimStat title="متوسط الرضا" value={(stats.averageRating + " / 5")} icon="🌟" />
        <ClaimStat title="الشكاوى والمقترحات" value={stats.complaintsCount} icon="💬" />
      </div>

      <div style={styles.filterRow}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 بحث بالاسم، رقم الهاتف، أو نص الشكوى/الملاحظات..."
          style={styles.claimSearch}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={styles.claimSelect}
        >
          <option value="all">كل الأنواع</option>
          <option value="تقييم خدمة">⭐ تقييم خدمة</option>
          <option value="شكوى / مقترح">💬 شكوى / مقترح</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.claimSelect}
        >
          <option value="all">كل الحالات</option>
          {FEEDBACK_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.value}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.resultText}>
        عدد النتائج المعروضة: <strong>{filteredItems.length}</strong> من <strong>{items.length}</strong>
      </div>

      {!loading && filteredItems.length > 0 && (
        <div style={styles.claimTableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>النوع</th>
                <th style={styles.th}>الاسم</th>
                <th style={styles.th}>الهاتف</th>
                <th style={styles.th}>التقييم</th>
                <th style={styles.th}>الرسالة / الشكوى</th>
                <th style={styles.th}>الحالة</th>
                <th style={styles.th}>التاريخ</th>
                <th style={styles.th}>إجراءات المدير</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const currentStatus = item.status || "جديد";
                return (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span
                        style={{
                          fontWeight: "600",
                          color: item.feedback_type === "تقييم خدمة" ? "#D97706" : "#2563EB",
                        }}
                      >
                        {item.feedback_type === "تقييم خدمة" ? "⭐ تقييم خدمة" : "💬 شكوى / مقترح"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <strong>{item.name || "—"}</strong>
                    </td>
                    <td style={styles.td}>
                      {item.phone ? (
                        <a
                          href={"tel:" + item.phone}
                          style={{ color: "#2563EB", textDecoration: "none" }}
                        >
                          📞 {item.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={styles.td}>
                      {item.rating ? (
                        <div style={{ color: "#F59E0B", fontWeight: "bold" }}>
                          {"⭐".repeat(Math.min(5, Math.max(1, Number(item.rating))))}
                          <span style={{ color: "#64748B", fontSize: "12px", marginRight: "4px" }}>
                            ({item.rating}/5)
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={styles.td}>
                      <div
                        style={{
                          maxWidth: "240px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}
                        title={item.message || ""}
                        onClick={() => setSelectedItem(item)}
                      >
                        {item.message || "—"}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={getStatusBadgeStyle(currentStatus)}>{currentStatus}</span>
                        <select
                          value={currentStatus}
                          disabled={updatingId === item.id}
                          onChange={(e) => updateStatus(item.id, e.target.value)}
                          style={{
                            ...styles.filter,
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                        >
                          {FEEDBACK_STATUSES.map((st) => (
                            <option key={st.value} value={st.value}>
                              {st.value}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={styles.td}>{formatFeedbackDate(item.created_at)}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          style={{
                            ...styles.secondaryButton,
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => setSelectedItem(item)}
                          title="عرض كامل التفاصيل"
                        >
                          👁️
                        </button>
                        <button
                          style={{
                            ...styles.viewButton,
                            background: "#FEF3C7",
                            color: "#92400E",
                            borderColor: "#FDE68A",
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => setEditingItem({ ...item })}
                          title="تعديل الشكوى / التقييم"
                        >
                          ✏️
                        </button>
                        <button
                          style={{
                            ...styles.deleteButton,
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => deleteItem(item.id)}
                          title="حذف"
                        >
                          🗑️
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

      {!loading && items.length === 0 && !error && (
        <EmptyState text="لا توجد أي تقييمات أو شكاوى مسجلة حتى الآن." />
      )}

      {!loading && items.length > 0 && filteredItems.length === 0 && (
        <EmptyState text="لا توجد نتائج مطابقة لشروط البحث والتصفية." />
      )}

      {/* Modal تعديل الشكوى / التقييم */}
      {editingItem && (
        <div style={styles.modalOverlay} onClick={() => setEditingItem(null)}>
          <div
            style={{ ...styles.loginBox, width: "min(540px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeButton} onClick={() => setEditingItem(null)}>
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>✏️</div>

            <h3 style={styles.loginTitle}>تعديل الشكوى / التقييم</h3>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  الاسم
                </label>
                <input
                  type="text"
                  value={editingItem.name || ""}
                  onChange={(e) =>
                    setEditingItem((prev) => ({ ...prev, name: e.target.value }))
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={editingItem.phone || ""}
                    onChange={(e) =>
                      setEditingItem((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    style={styles.input}
                  />
                </div>

                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    النوع
                  </label>
                  <select
                    value={editingItem.feedback_type || "تقييم خدمة"}
                    onChange={(e) =>
                      setEditingItem((prev) => ({ ...prev, feedback_type: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="تقييم خدمة">تقييم خدمة</option>
                    <option value="شكوى / مقترح">شكوى / مقترح</option>
                  </select>
                </div>
              </div>

              {editingItem.feedback_type === "تقييم خدمة" && (
                <div style={{ marginBottom: "10px", textAlign: "right" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    درجة التقييم (من 1 إلى 5)
                  </label>
                  <select
                    value={editingItem.rating || "5"}
                    onChange={(e) =>
                      setEditingItem((prev) => ({ ...prev, rating: e.target.value }))
                    }
                    style={styles.input}
                  >
                    <option value="5">⭐⭐⭐⭐⭐ 5 - ممتاز</option>
                    <option value="4">⭐⭐⭐⭐ 4 - جيد جداً</option>
                    <option value="3">⭐⭐⭐ 3 - جيد</option>
                    <option value="2">⭐⭐ 2 - مقبول</option>
                    <option value="1">⭐ 1 - ضعيف</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  نص الشكوى / الملاحظات
                </label>
                <textarea
                  value={editingItem.message || ""}
                  onChange={(e) =>
                    setEditingItem((prev) => ({ ...prev, message: e.target.value }))
                  }
                  style={{ ...styles.input, minHeight: "90px", resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  الحالة
                </label>
                <select
                  value={editingItem.status || "جديد"}
                  onChange={(e) =>
                    setEditingItem((prev) => ({ ...prev, status: e.target.value }))
                  }
                  style={styles.input}
                >
                  {FEEDBACK_STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.value}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setEditingItem(null)}
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

      {/* Modal تفاصيل الشكوى أو التقييم */}
      {selectedItem && (
        <div style={styles.modalOverlay} onClick={() => setSelectedItem(null)}>
          <div
            style={{ ...styles.loginBox, width: "min(550px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeButton} onClick={() => setSelectedItem(null)}>
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>
              {selectedItem.feedback_type === "تقييم خدمة" ? "⭐" : "💬"}
            </div>

            <h3 style={styles.loginTitle}>
              {selectedItem.feedback_type === "تقييم خدمة"
                ? "تفاصيل تقييم الخدمة"
                : "تفاصيل الشكوى / المقترح"}
            </h3>

            <div style={{ textAlign: "right", marginTop: "16px", lineHeight: "1.8" }}>
              <div style={{ marginBottom: "10px" }}>
                <strong>الاسم:</strong> {selectedItem.name || "—"}
              </div>
              <div style={{ marginBottom: "10px" }}>
                <strong>الهاتف:</strong>{" "}
                {selectedItem.phone ? (
                  <a
                    href={"tel:" + selectedItem.phone}
                    style={{ color: "#2563EB", textDecoration: "none" }}
                  >
                    📞 {selectedItem.phone}
                  </a>
                ) : (
                  "غير متوفر"
                )}
              </div>
              {selectedItem.rating && (
                <div style={{ marginBottom: "10px" }}>
                  <strong>التقييم:</strong> {selectedItem.rating} من 5{" "}
                  {"⭐".repeat(Math.min(5, Math.max(1, Number(selectedItem.rating))))}
                </div>
              )}
              <div style={{ marginBottom: "10px" }}>
                <strong>التاريخ:</strong> {formatFeedbackDate(selectedItem.created_at)}
              </div>
              <div style={{ marginBottom: "14px" }}>
                <strong>الحالة الحالية:</strong>{" "}
                <span style={getStatusBadgeStyle(selectedItem.status || "جديد")}>
                  {selectedItem.status || "جديد"}
                </span>
              </div>

              <div
                style={{
                  background: "#F8FAFC",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  marginTop: "12px",
                }}
              >
                <strong style={{ display: "block", marginBottom: "6px", color: "#1E293B" }}>
                  نص الرسالة / الملاحظات:
                </strong>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#334155" }}>
                  {selectedItem.message || "لا توجد ملاحظات مرفقة."}
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.primaryButton} onClick={() => setSelectedItem(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

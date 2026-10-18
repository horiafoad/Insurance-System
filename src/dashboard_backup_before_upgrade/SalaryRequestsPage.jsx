import { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

export default function SalaryRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeName: "",
    employeeCode: "",
    department: "",
    requestMonth: "",
    requestYear: new Date().getFullYear(),
    notes: "",
  });

  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("salary_requests")
        .select("*")
        .order("request_date", { ascending: false });

      if (error) {
        console.error(error);
        setError("حدث خطأ أثناء تحميل الطلبات: " + error.message);
        return;
      }

      setRequests(data || []);
    } catch (error) {
      console.error(error);
      setError("تعذر تحميل الطلبات من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employeeName || !formData.requestMonth || !formData.requestYear) {
      alert("من فضلك أدخلي الاسم والشهر والسنة المطلوبة.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("salary_requests")
        .insert({
          employee_name: formData.employeeName,
          employee_code: formData.employeeCode,
          department: formData.department,
          request_month: formData.requestMonth,
          request_year: Number(formData.requestYear),
          notes: formData.notes,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء إنشاء الطلب: " + error.message);
        return;
      }

      await loadRequests();
      setShowForm(false);
      setFormData({
        employeeName: "",
        employeeCode: "",
        department: "",
        requestMonth: "",
        requestYear: new Date().getFullYear(),
        notes: "",
      });
      alert("تم إنشاء الطلب بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر إنشاء الطلب.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل تريدين حذف هذا الطلب؟")) return;

    try {
      const { error } = await supabase
        .from("salary_requests")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف الطلب: " + error.message);
        return;
      }

      await loadRequests();
      alert("تم حذف الطلب بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف الطلب.");
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from("salary_requests")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء تحديث الحالة: " + error.message);
        return;
      }

      await loadRequests();
    } catch (error) {
      console.error(error);
      alert("تعذر تحديث الحالة.");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "جديد": return "#DBEAFE";
      case "قيد المراجعة": return "#FEF3C7";
      case "جاري التنفيذ": return "#FEE2E2";
      case "مكتمل": return "#D1FAE5";
      case "مرفوض": return "#F1F5F9";
      default: return "#F1F5F9";
    }
  };

  const getStatusTextColor = (status) => {
    switch (status) {
      case "جديد": return "#1D4ED8";
      case "قيد المراجعة": return "#B45309";
      case "جاري التنفيذ": return "#B91C1C";
      case "مكتمل": return "#047857";
      case "مرفوض": return "#64748B";
      default: return "#64748B";
    }
  };

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === "جديد").length,
    inProgress: requests.filter(r => r.status === "جاري التنفيذ").length,
    completed: requests.filter(r => r.status === "مكتمل").length,
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل الطلبات...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>📄 طلبات مفرد مرتب</h2>
            <p style={styles.cardSub}>
              إدارة طلبات استخراج مفرد مرتب إلكترونيًا
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={() => setShowForm(true)}
          >
            ＋ إضافة طلب
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.claimStats}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.total}</div>
            <div style={styles.statLabel}>إجمالي الطلبات</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.pending}</div>
            <div style={styles.statLabel}>جديد</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.inProgress}</div>
            <div style={styles.statLabel}>جاري التنفيذ</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.completed}</div>
            <div style={styles.statLabel}>مكتمل</div>
          </div>
        </div>

        <div style={styles.resultText}>
          عدد الطلبات: <strong>{requests.length}</strong>
        </div>

        {requests.length === 0 ? (
          <div style={styles.infoBox}>لا يوجد طلبات حالياً.</div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اسم الموظف</th>
                  <th style={styles.th}>الكود</th>
                  <th style={styles.th}>القسم</th>
                  <th style={styles.th}>الشهر</th>
                  <th style={styles.th}>السنة</th>
                  <th style={styles.th}>تاريخ الطلب</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} style={styles.tr}>
                    <td style={styles.td}>{request.employee_name}</td>
                    <td style={styles.td}>{request.employee_code || "—"}</td>
                    <td style={styles.td}>{request.department || "—"}</td>
                    <td style={styles.td}>{request.request_month}</td>
                    <td style={styles.td}>{request.request_year}</td>
                    <td style={styles.td}>
                      {new Date(request.request_date).toLocaleDateString("ar-EG")}
                    </td>
                    <td style={styles.td}>
                      <select
                        value={request.status}
                        onChange={(e) => handleStatusChange(request.id, e.target.value)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "8px",
                          border: "1px solid #E2E8F0",
                          background: getStatusColor(request.status),
                          color: getStatusTextColor(request.status),
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        <option value="جديد">جديد</option>
                        <option value="قيد المراجعة">قيد المراجعة</option>
                        <option value="جاري التنفيذ">جاري التنفيذ</option>
                        <option value="مكتمل">مكتمل</option>
                        <option value="مرفوض">مرفوض</option>
                      </select>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.deleteButton}
                        onClick={() => handleDelete(request.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowForm(false)}
        >
          <div
            style={styles.loginBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "40px", marginBottom: "10px" }}>
              📄
            </div>

            <h2 style={styles.loginTitle}>إضافة طلب مفرد مرتب</h2>

            <p style={styles.loginDescription}>
              أدخل بيانات الطلب المطلوب
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="اسم الموظف"
                value={formData.employeeName}
                onChange={(e) =>
                  setFormData({ ...formData, employeeName: e.target.value })
                }
                style={styles.input}
                required
              />

              <input
                type="text"
                placeholder="كود الموظف (اختياري)"
                value={formData.employeeCode}
                onChange={(e) =>
                  setFormData({ ...formData, employeeCode: e.target.value })
                }
                style={styles.input}
              />

              <input
                type="text"
                placeholder="القسم (اختياري)"
                value={formData.department}
                onChange={(e) =>
                  setFormData({ ...formData, department: e.target.value })
                }
                style={styles.input}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    الشهر المطلوب
                  </label>
                  <select
                    value={formData.requestMonth}
                    onChange={(e) =>
                      setFormData({ ...formData, requestMonth: e.target.value })
                    }
                    style={styles.input}
                    required
                  >
                    {months.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    السنة المطلوبة
                  </label>
                  <input
                    type="number"
                    value={formData.requestYear}
                    onChange={(e) =>
                      setFormData({ ...formData, requestYear: parseInt(e.target.value) })
                    }
                    style={styles.input}
                    min="2020"
                    max="2030"
                    required
                  />
                </div>
              </div>

              <textarea
                placeholder="ملاحظات (اختياري)"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                style={{ ...styles.input, minHeight: "60px", resize: "vertical" }}
              />

              <button type="submit" style={styles.loginButton}>
                إرسال الطلب
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
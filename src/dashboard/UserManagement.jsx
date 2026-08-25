import { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "admin",
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setError("حدث خطأ أثناء تحميل المستخدمين: " + error.message);
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.error(error);
      setError("تعذر تحميل المستخدمين من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password || !formData.fullName) {
      alert("من فضلك أدخلي جميع البيانات المطلوبة.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("users")
        .insert({
          username: formData.username,
          password: formData.password,
          full_name: formData.fullName,
          role: formData.role,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء إنشاء المستخدم: " + error.message);
        return;
      }

      await loadUsers();
      setShowForm(false);
      setFormData({
        username: "",
        password: "",
        fullName: "",
        role: "admin",
      });
      alert("تم إنشاء المستخدم بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر إنشاء المستخدم.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل تريدين حذف هذا المستخدم؟")) return;

    try {
      const { error } = await supabase.from("users").delete().eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف المستخدم: " + error.message);
        return;
      }

      await loadUsers();
      alert("تم حذف المستخدم بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف المستخدم.");
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل المستخدمين...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>إدارة المستخدمين</h2>
            <p style={styles.cardSub}>
              إنشاء وإدارة حسابات المستخدمين المصرح لهم بالدخول
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={() => setShowForm(true)}
          >
            ＋ إضافة مستخدم
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.resultText}>
          عدد المستخدمين: <strong>{users.length}</strong>
        </div>

        {users.length === 0 ? (
          <div style={styles.infoBox}>لا يوجد مستخدمين حالياً.</div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اسم المستخدم</th>
                  <th style={styles.th}>الاسم الكامل</th>
                  <th style={styles.th}>الدور</th>
                  <th style={styles.th}>تاريخ الإنشاء</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>{user.username}</td>
                    <td style={styles.td}>{user.full_name}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background:
                            user.role === "super_admin"
                              ? "#FEE2E2"
                              : "#E0F2FE",
                          color:
                            user.role === "super_admin"
                              ? "#B91C1C"
                              : "#0369A1",
                        }}
                      >
                        {user.role === "super_admin"
                          ? "مدير رئيسي"
                          : user.role === "admin"
                          ? "مدير"
                          : "مستخدم"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {new Date(user.created_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td style={styles.td}>
                      {user.role !== "super_admin" && (
                        <button
                          style={styles.deleteButton}
                          onClick={() => handleDelete(user.id)}
                        >
                          حذف
                        </button>
                      )}
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
              👤
            </div>

            <h2 style={styles.loginTitle}>إضافة مستخدم جديد</h2>

            <p style={styles.loginDescription}>
              أدخل بيانات المستخدم الجديد
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="اسم المستخدم"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                style={styles.input}
                required
              />

              <input
                type="text"
                placeholder="الاسم الكامل"
                value={formData.fullName}
                onChange={(e) =>
                  setFormData({ ...formData, fullName: e.target.value })
                }
                style={styles.input}
                required
              />

              <input
                type="password"
                placeholder="كلمة المرور"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                style={styles.input}
                required
              />

              <select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                style={styles.input}
              >
                <option value="admin">مدير</option>
                <option value="user">مستخدم</option>
              </select>

              <button type="submit" style={styles.loginButton}>
                إنشاء المستخدم
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
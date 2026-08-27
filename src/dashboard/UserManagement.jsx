import React, { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
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

  const handleOpenCreate = () => {
    setEditingUserId(null);
    setFormData({
      username: "",
      password: "",
      fullName: "",
      role: "admin",
    });
    setShowForm(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUserId(user.id);
    setFormData({
      username: user.username || "",
      password: user.password || "",
      fullName: user.full_name || "",
      role: user.role || "admin",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.fullName.trim()) {
      alert("من فضلك أدخلي اسم المستخدم والاسم الكامل.");
      return;
    }

    try {
      if (editingUserId) {
        // Update user
        const updatePayload = {
          username: formData.username.trim(),
          full_name: formData.fullName.trim(),
          role: formData.role,
        };
        if (formData.password) {
          updatePayload.password = formData.password;
        }

        const { error: updateError } = await supabase
          .from("users")
          .update(updatePayload)
          .eq("id", editingUserId);

        if (updateError) {
          console.error(updateError);
          alert("حدث خطأ أثناء تعديل المستخدم: " + updateError.message);
          return;
        }

        alert("تم تعديل بيانات المستخدم بنجاح.");
      } else {
        // Create user
        if (!formData.password) {
          alert("من فضلك أدخلي كلمة المرور.");
          return;
        }

        const { error: insertError } = await supabase
          .from("users")
          .insert({
            username: formData.username.trim(),
            password: formData.password,
            full_name: formData.fullName.trim(),
            role: formData.role,
          })
          .select()
          .single();

        if (insertError) {
          console.error(insertError);
          alert("حدث خطأ أثناء إنشاء المستخدم: " + insertError.message);
          return;
        }

        alert("تم إنشاء المستخدم بنجاح.");
      }

      await loadUsers();
      setShowForm(false);
      setEditingUserId(null);
    } catch (error) {
      console.error(error);
      alert("تعذر حفظ بيانات المستخدم.");
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${username}" نهائياً؟`)) {
      return;
    }

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
            <h2 style={styles.cardTitle}>👥 إدارة المستخدمين</h2>
            <p style={styles.cardSub}>
              إنشاء وتعديل وحذف حسابات المستخدمين المصرح لهم بالدخول للوحة الإدارة
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={handleOpenCreate}
          >
            ＋ إضافة مستخدم جديد
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.resultText}>
          عدد المستخدمين المسجلين: <strong>{users.length}</strong>
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
                  <th style={styles.th}>الدور / الصلاحية</th>
                  <th style={styles.th}>تاريخ الإنشاء</th>
                  <th style={styles.th}>إجراءات المدير الرئيسي</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{user.username}</strong>
                    </td>
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
                              : user.role === "admin"
                              ? "#DBEAFE"
                              : "#E0F2FE",
                          color:
                            user.role === "super_admin"
                              ? "#B91C1C"
                              : user.role === "admin"
                              ? "#1E40AF"
                              : "#0369A1",
                        }}
                      >
                        {user.role === "super_admin"
                          ? "👑 مدير رئيسي (horia)"
                          : user.role === "admin"
                          ? "🛡️ مدير"
                          : "👤 مستخدم"}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("ar-EG")
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          style={{
                            ...styles.viewButton,
                            background: "#FEF3C7",
                            color: "#92400E",
                            borderColor: "#FDE68A",
                            padding: "4px 10px",
                            fontSize: "12px",
                          }}
                          onClick={() => handleOpenEdit(user)}
                          title="تعديل المستخدم"
                        >
                          ✏️ تعديل
                        </button>
                        {user.role !== "super_admin" && user.username !== "horia" && (
                          <button
                            style={{
                              ...styles.deleteButton,
                              padding: "4px 10px",
                              fontSize: "12px",
                            }}
                            onClick={() => handleDelete(user.id, user.username)}
                            title="حذف المستخدم"
                          >
                            🗑️ حذف
                          </button>
                        )}
                      </div>
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
            style={{ ...styles.loginBox, width: "min(480px, 95%)" }}
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

            <h2 style={styles.loginTitle}>
              {editingUserId ? "تعديل بيانات المستخدم" : "إضافة مستخدم جديد"}
            </h2>

            <p style={styles.loginDescription}>
              {editingUserId
                ? "تعديل الاسم أو كلمة المرور أو الصلاحيات"
                : "أدخل بيانات الحساب الجديد لمنحه صلاحية الدخول"}
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  اسم المستخدم (Username)
                </label>
                <input
                  type="text"
                  placeholder="اسم المستخدم للدخول"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  placeholder="الاسم ثلاثي أو رباعي"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  كلمة المرور {editingUserId && "(اتركيها فارغة إن لم ترغبي بتغييرها)"}
                </label>
                <input
                  type="password"
                  placeholder="كلمة المرور"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  style={styles.input}
                  required={!editingUserId}
                />
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  الدور / الصلاحية
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  style={styles.input}
                >
                  <option value="admin">مدير (صلاحيات كاملة)</option>
                  <option value="user">مستخدم (عرض وتعديل محدود)</option>
                  <option value="super_admin">مدير رئيسي (Super Admin)</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setShowForm(false)}
                >
                  إلغاء
                </button>
                <button type="submit" style={styles.primaryButton}>
                  {editingUserId ? "💾 حفظ التعديل" : "＋ إنشاء المستخدم"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

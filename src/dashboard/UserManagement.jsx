import React, { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";
import { PERMISSIONS } from "../utils/permissions";

export default function UserManagement({ currentUser }) {
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
    sectorId: "",
    departmentId: "",
  });
  const [sectors, setSectors] = useState([]);
  const [departments, setDepartments] = useState([]);

  const canDelete = ["creator", "super_admin"].includes(currentUser?.role);
  const isSelf = (user) =>
    currentUser?.id === user.id || currentUser?.username === user.username;

  const [permissionsEnabled, setPermissionsEnabled] = useState(false);

  const checkPermissionsColumn = async () => {
    const { error } = await supabase
      .from("users")
      .select("permissions")
      .limit(1);

    setPermissionsEnabled(!error);
  };

  const loadOrgData = async () => {
    const sectorsRes = await supabase
      .from("letter_sectors")
      .select("id,name,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("id");

    if (!sectorsRes.error) {
      setSectors(sectorsRes.data || []);
    }

    const deptsRes = await supabase
      .from("letter_departments")
      .select("id,name,is_active,sector_id")
      .eq("is_active", true)
      .order("name");

    if (!deptsRes.error) {
      setDepartments(deptsRes.data || []);
    }
  };

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

  useEffect(() => {
    loadUsers();
    loadOrgData();
    checkPermissionsColumn();
  }, []);

  const handleOpenCreate = () => {
    setEditingUserId(null);
    setFormData({
      username: "",
      password: "",
      fullName: "",
      role: "admin",
      sectorId: "",
      departmentId: "",
      permissions: [],
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
      sectorId:
        user.sector_id != null ? String(user.sector_id) : "",
      departmentId:
        user.department_id != null
          ? String(user.department_id)
          : "",
      permissions:
        user.permissions == null
          ? PERMISSIONS.map((permission) => permission.id)
          : Array.isArray(user.permissions)
            ? user.permissions
            : [],
    });
    setShowForm(true);
  };

  const togglePermission = (permissionId) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((id) => id !== permissionId)
        : [...prev.permissions, permissionId],
    }));
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
          sector_id: formData.sectorId
            ? Number(formData.sectorId)
            : null,
          department_id: formData.departmentId
            ? Number(formData.departmentId)
            : null,
          ...(permissionsEnabled
            ? { permissions: formData.permissions }
            : {}),
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
            sector_id: formData.sectorId
              ? Number(formData.sectorId)
              : null,
            department_id: formData.departmentId
              ? Number(formData.departmentId)
              : null,
            ...(permissionsEnabled
              ? { permissions: formData.permissions }
              : {}),
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
    if (!canDelete) {
      alert("⛔ خاصية الحذف متاحة للمنشئ الرئيسي فقط.");
      return;
    }
    if (currentUser?.id === id || currentUser?.username === username) {
      alert("⚠️ لا يمكنك حذف حسابك المسجل به حالياً.");
      return;
    }
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
            {!canDelete && (
              <span style={{ fontSize: 12, color: "#92400E", fontWeight: 700 }}>
                🔒 الحذف متاح للمنشئ الرئيسي فقط
              </span>
            )}
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
                  <th style={styles.th}>الهيكل التنظيمي</th>
                  <th style={styles.th}>الصلاحيات 🛡️</th>
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
                      {isSelf(user) && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "#2563EB",
                            fontWeight: 700,
                          }}
                        >
                          (أنت)
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>{user.full_name}</td>
                    <td style={styles.td}>
                      {(() => {
                        const sector = sectors.find(
                          (s) =>
                            String(s.id) === String(user.sector_id)
                        );
                        const department = departments.find(
                          (d) =>
                            String(d.id) ===
                            String(user.department_id)
                        );
                        return sector || department ? (
                          <div>
                            {sector && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#1E40AF",
                                  fontWeight: 800,
                                }}
                              >
                                🏛️ {sector.name}
                              </div>
                            )}
                            {department && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#475569",
                                  fontWeight: 700,
                                }}
                              >
                                🗂️ {department.name}
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        );
                      })()}
                    </td>
                    <td style={styles.td}>
                      {user.permissions == null ? (
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: 800,
                            background: "#E0E7FF",
                            color: "#3730A3",
                          }}
                        >
                          وصول كامل
                        </span>
                      ) : user.permissions.length === 0 ? (
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: 800,
                            background: "#FEE2E2",
                            color: "#991B1B",
                          }}
                        >
                          بدون صلاحيات
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                          }}
                        >
                          {user.permissions.map(
                            (permissionId) => {
                              const meta = PERMISSIONS.find(
                                (p) => p.id === permissionId
                              );
                              return meta ? (
                                <span
                                  key={permissionId}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "10px",
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    background: "#DBEAFE",
                                    color: "#1E40AF",
                                  }}
                                >
                                  {meta.icon} {meta.title}
                                </span>
                              ) : null;
                            }
                          )}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background:
                            ["creator", "super_admin"].includes(user.role)
                              ? "#FEE2E2"
                              : user.role === "admin"
                              ? "#DBEAFE"
                              : "#E0F2FE",
                          color:
                            ["creator", "super_admin"].includes(user.role)
                              ? "#B91C1C"
                              : user.role === "admin"
                              ? "#1E40AF"
                              : "#0369A1",
                        }}
                      >
                        {["creator", "super_admin"].includes(user.role)
                          ? "منشئ البرنامج"
                          : user.role === "admin"
                          ? "👑 مدير"
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
                        {canDelete && !isSelf(user) && !["creator", "super_admin"].includes(user.role) && user.username !== "horia" && (
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
                  <option value="super_admin">منشئ البرنامج (صلاحيات كاملة)</option>
                </select>
              </div>

              <div style={{ marginBottom: "10px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  القطاع 🏛️
                </label>
                <select
                  value={formData.sectorId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sectorId: e.target.value,
                      departmentId: "",
                    })
                  }
                  style={styles.input}
                >
                  <option value="">بدون قطاع</option>
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  الإدارة 🏢
                </label>
                <select
                  value={formData.departmentId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      departmentId: e.target.value,
                    })
                  }
                  style={styles.input}
                  disabled={!formData.sectorId}
                >
                  <option value="">
                    {!formData.sectorId
                      ? "اختر القطاع أولًا"
                      : departments.filter(
                          (d) =>
                            String(d.sector_id) ===
                            String(formData.sectorId)
                        ).length === 0
                      ? "لا توجد إدارات في هذا القطاع"
                      : "اختر الإدارة..."}
                  </option>
                  {departments
                    .filter(
                      (d) =>
                        String(d.sector_id) ===
                        String(formData.sectorId)
                    )
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </select>
              </div>

              <div
                style={{
                  marginBottom: "18px",
                  textAlign: "right",
                }}
              >
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    marginBottom: "4px",
                    display: "block",
                  }}
                >
                  🛡️ صلاحيات المستخدم
                </label>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "10px",
                    marginTop: "8px",
                  }}
                >
                  {PERMISSIONS.map((permission) => (
                    <label
                      key={permission.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border:
                          formData.permissions.includes(
                            permission.id
                          )
                            ? "2px solid #3B82F6"
                            : "1px solid #E2E8F0",
                        background:
                          formData.permissions.includes(
                            permission.id
                          )
                            ? "#EFF6FF"
                            : "#F8FAFC",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#1E293B",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(
                          permission.id
                        )}
                        onChange={() =>
                          togglePermission(permission.id)
                        }
                        style={{
                          accentColor: "#3B82F6",
                          transform: "scale(1.25)",
                        }}
                      />
                      {permission.icon} {permission.title}
                    </label>
                  ))}
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    color: "#94A3B8",
                  }}
                >
                  اتركها فارغة إذا كان الموظف لا يحتاج أي صلاحية
                  — ولا تظهر الاستحقاقات تلقائيًا لأي شخص.
                </div>
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

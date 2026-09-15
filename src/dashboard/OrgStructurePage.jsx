import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { Modal } from "./ui";

const SECTOR_ICONS = ["👨‍🏫", "🏢", "🌱", "🎓", "📚"];

const SECTOR_ACCENTS = [
  { main: "#3b82f6", soft: "#eff6ff", border: "#bfdbfe" },
  { main: "#8b5cf6", soft: "#f5f3ff", border: "#ddd6fe" },
  { main: "#10b981", soft: "#ecfdf5", border: "#a7f3d0" },
  { main: "#f59e0b", soft: "#fffbeb", border: "#fde68a" },
  { main: "#ef4444", soft: "#fef2f2", border: "#fecaca" },
];

const pageCard = {
  background: "#fff",
  borderRadius: 18,
  padding: 24,
  marginBottom: 24,
  border: "1px solid #e5e7eb",
  boxShadow: "0 8px 30px rgba(15,23,42,.06)",
  direction: "rtl",
};

const toastStyle = {
  position: "fixed",
  bottom: 24,
  right: 24,
  zIndex: 9999,
  background: "#0f172a",
  color: "#fff",
  padding: "12px 18px",
  borderRadius: 12,
  fontWeight: 800,
  fontSize: 14,
  boxShadow: "0 12px 30px rgba(15,23,42,.3)",
  animation: "orgToastIn .3s ease",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "11px 13px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

function SkeletonCard() {
  return (
    <div style={pageCard}>
      <div
        style={{
          height: 22,
          width: "55%",
          borderRadius: 8,
          background: "#e2e8f0",
          marginBottom: 14,
        }}
      />
      <div
        style={{
          height: 14,
          width: "90%",
          borderRadius: 8,
          background: "#f1f5f9",
          marginBottom: 10,
        }}
      />
      <div
        style={{
          height: 14,
          width: "70%",
          borderRadius: 8,
          background: "#f1f5f9",
        }}
      />
    </div>
  );
}

export default function OrgStructurePage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sectors, setSectors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [modal, setModal] = useState(null); // { mode: "add"|"edit", sector, dept }
  const [deptName, setDeptName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setLoadError("");

      const [sectorsRes, deptsRes, usersRes] = await Promise.all([
        supabase
          .from("letter_sectors")
          .select("id,name,is_active,sort_order")
          .eq("is_active", true)
          .order("sort_order")
          .order("id"),
        supabase
          .from("letter_departments")
          .select("id,name,is_active,sector_id")
          .order("name"),
        supabase
          .from("users")
          .select("id,full_name,sector_id,department_id"),
      ]);

      if (!mounted) return;

      if (sectorsRes.error) {
        setLoadError(
          sectorsRes.error?.code === "42P01"
            ? "⚠️ جدول القطاعات غير موجود بعد. شغِّل سكربت create_org_structure.sql في Supabase أولًا."
            : "تعذر تحميل القطاعات: " + sectorsRes.error.message
        );
      } else {
        setSectors(sectorsRes.data || []);
      }

      if (deptsRes.error) {
        if (deptsRes.error?.code !== "42P01") {
          setLoadError(
            (prev) => (prev ? prev + "\n" : "") + "تعذر تحميل الإدارات: " + deptsRes.error.message
          );
        }
      } else {
        setDepartments(deptsRes.data || []);
      }

      if (!usersRes.error) {
        setUsers(usersRes.data || []);
      }

      setLoading(false);
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const departmentsBySector = useMemo(() => {
    const map = {};
    sectors.forEach((sector) => {
      map[sector.id] = departments.filter(
        (dept) =>
          dept.sector_id !== null &&
          String(dept.sector_id) === String(sector.id)
      );
    });
    return map;
  }, [sectors, departments]);

  const totalDepartments = departments.length;
  const activeDepartments = departments.filter(
    (dept) => dept.is_active
  ).length;
  const linkedUsers = users.filter(
    (user) => user.department_id
  ).length;

  const usersInDepartment = (departmentId) =>
    users.filter(
      (user) =>
        String(user.department_id) === String(departmentId)
    ).length;

  const toggleSector = (id) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const openAdd = (sector) => {
    setModal({ mode: "add", sector });
    setDeptName("");
  };

  const openEdit = (dept) => {
    setModal({ mode: "edit", dept });
    setDeptName(dept.name);
  };

  const closeModal = () => {
    if (!saving) setModal(null);
  };

  const saveDepartment = async () => {
    if (!modal || saving) return;

    const name = deptName.trim();
    if (!name) {
      showToast("⚠️ اكتب اسم الإدارة أولًا");
      return;
    }

    setSaving(true);

    const isAdd = modal.mode === "add";

    if (isAdd) {
      const { data, error } = await supabase
        .from("letter_departments")
        .insert({
          name,
          sector_id: modal.sector.id,
          is_active: true,
        })
        .select("id,name,is_active,sector_id")
        .single();

      if (error) {
        if (error.code === "23505") {
          showToast("⚠️ هذا الإسم موجود بالفعل.");
        } else {
          showToast("❌ حدث خطأ أثناء الحفظ: " + error.message);
        }
        setSaving(false);
        return;
      }

      setDepartments((prev) => [...prev, data].sort((a, b) =>
        a.name.localeCompare(b.name, "ar")
      ));
      showToast("✅ تم إضافة الإدارة بنجاح");
    } else {
      const { error } = await supabase
        .from("letter_departments")
        .update({ name })
        .eq("id", modal.dept.id);

      if (error) {
        if (error.code === "23505") {
          showToast("⚠️ هذا الإسم موجود بالفعل.");
        } else {
          showToast("❌ حدث خطأ أثناء الحفظ: " + error.message);
        }
        setSaving(false);
        return;
      }

      setDepartments((prev) =>
        prev
          .map((dept) =>
            dept.id === modal.dept.id ? { ...dept, name } : dept
          )
          .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      );
      showToast("✅ تم تحديث الإدارة بنجاح");
    }

    setModal(null);
    setDeptName("");
    setSaving(false);
  };

  const toggleActive = async (dept) => {
    if (busyId) return;
    setBusyId(dept.id);

    const nextActive = !dept.is_active;

    const { error } = await supabase
      .from("letter_departments")
      .update({ is_active: nextActive })
      .eq("id", dept.id);

    if (error) {
      showToast("❌ حدث خطأ: " + error.message);
    } else {
      setDepartments((prev) =>
        prev.map((item) =>
          item.id === dept.id ? { ...item, is_active: nextActive } : item
        )
      );
      showToast(nextActive ? "✅ تم تفعيل الإدارة" : "⏸️ تم تعطيل الإدارة");
    }

    setBusyId(null);
  };

  const deleteDepartment = async (dept) => {
    if (busyId) return;

    const confirmed = window.confirm(
      `هل تريد حذف الإدارة «${dept.name}»؟\nلا يمكن التراجع عن هذه الخطوة.`
    );

    if (!confirmed) return;

    setBusyId(dept.id);

    const { count: movementsCount } = await supabase
      .from("letter_movements")
      .select("id", { count: "exact", head: true })
      .eq("department_id", dept.id);

    const { count: usersCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("department_id", dept.id);

    if ((movementsCount || 0) > 0 || (usersCount || 0) > 0) {
      showToast(
        "🚫 لا يمكن حذف إدارة مرتبطة ببيانات — يمكنك تعطيلها بدلًا من ذلك."
      );
      setBusyId(null);
      return;
    }

    const { error } = await supabase
      .from("letter_departments")
      .delete()
      .eq("id", dept.id);

    if (error) {
      showToast("❌ حدث خطأ أثناء الحذف: " + error.message);
    } else {
      setDepartments((prev) =>
        prev.filter((item) => item.id !== dept.id)
      );
      showToast("🗑️ تم حذف الإدارة بنجاح");
    }

    setBusyId(null);
  };

  const renderSectorCard = (sector, index) => {
    const accent = SECTOR_ACCENTS[index % SECTOR_ACCENTS.length];
    const icon = SECTOR_ICONS[index % SECTOR_ICONS.length];
    const isOpen = Boolean(expanded[sector.id]);
    const sectorDepts = departmentsBySector[sector.id] || [];
    const activeInSector = sectorDepts.filter((d) => d.is_active).length;

    return (
      <div key={sector.id} style={pageCard}>
        <button
          type="button"
          onClick={() => toggleSector(sector.id)}
          style={{
            width: "100%",
            border: 0,
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "right",
            padding: 0,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: accent.soft,
              border: `1px solid ${accent.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              {sector.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              {sectorDepts.length} إدارة — {activeInSector} نشطة
            </div>
          </div>

          <span
            style={{
              fontSize: 13,
              fontWeight: 900,
              color: accent.main,
              transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform .3s ease",
            }}
          >
            ▶
          </span>
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateRows: isOpen ? "1fr" : "0fr",
            transition: "grid-template-rows .38s ease",
          }}
        >
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            <div style={{ marginTop: 16 }}>
              {sectorDepts.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "18px",
                    borderRadius: 12,
                    border: "1px dashed #cbd5e1",
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: 13,
                  }}
                >
                  لا توجد إدارات بعد — أضف أول إدارة لهذا القطاع.
                </div>
              ) : (
                sectorDepts.map((dept) => (
                  <div
                    key={dept.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "12px 14px",
                      marginBottom: 8,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: dept.is_active ? "#fff" : "#f8fafc",
                      opacity: dept.is_active ? 1 : 0.65,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>🗂️</span>

                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          color: "#0f172a",
                          fontSize: 14,
                        }}
                      >
                        {dept.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          fontWeight: 700,
                          marginTop: 1,
                        }}
                      >
                        {usersInDepartment(dept.id)} موظف
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: dept.is_active ? "#ecfdf5" : "#f1f5f9",
                        color: dept.is_active ? "#15803d" : "#64748b",
                      }}
                    >
                      {dept.is_active ? "نشطة" : "معطّلة"}
                    </span>

                    <button
                      type="button"
                      onClick={() => openEdit(dept)}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: 9,
                        padding: "6px 11px",
                        background: "#fff",
                        color: "#1d4ed8",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      ✏️ تعديل
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleActive(dept)}
                      disabled={busyId === dept.id}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: 9,
                        padding: "6px 11px",
                        background: "#fff",
                        color: dept.is_active ? "#b45309" : "#15803d",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: busyId === dept.id ? "not-allowed" : "pointer",
                      }}
                    >
                      🔄 {dept.is_active ? "تعطيل" : "تفعيل"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteDepartment(dept)}
                      disabled={busyId === dept.id}
                      style={{
                        border: "1px solid #fecaca",
                        borderRadius: 9,
                        padding: "6px 11px",
                        background: "#fff",
                        color: "#dc2626",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: busyId === dept.id ? "not-allowed" : "pointer",
                      }}
                    >
                      🗑️ حذف
                    </button>
                  </div>
                ))
              )}

              <button
                type="button"
                onClick={() => openAdd(sector)}
                style={{
                  width: "100%",
                  border: "1px dashed #93c5fd",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                  marginTop: 4,
                  transition: "background .2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#dbeafe";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#eff6ff";
                }}
              >
                ➕ إضافة إدارة
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div dir="rtl">
      <style>{`
        @keyframes orgToastIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={pageCard}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 900,
                color: "#0f172a",
              }}
            >
              🏛️ الهيكل التنظيمي
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 13,
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              كلية الهندسة — القطاعات الخمسة الثابتة وإداراتها
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(160px,1fr))",
            gap: 12,
            marginBottom: 8,
          }}
        >
          {[
            { label: "القطاعات", value: sectors.length, icon: "🏛️" },
            { label: "الإدارات", value: totalDepartments, icon: "🗂️" },
            { label: "الإدارات النشطة", value: activeDepartments, icon: "✅" },
            { label: "موظفون مرتبطون بإدارة", value: linkedUsers, icon: "👥" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "#f8fafc",
                borderRadius: 14,
                border: "1px solid #e2e8f0",
                padding: "14px 16px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 20 }}>{stat.icon}</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: "#0f172a",
                  marginTop: 2,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#64748b",
                  fontWeight: 800,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {loadError && (
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {loadError}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ marginTop: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : !loadError ? (
        sectors.map((sector, index) =>
          renderSectorCard(sector, index)
        )
      ) : null}

      {modal && (
        <Modal
          title={
            modal.mode === "add"
              ? "🏢 إضافة إدارة جديدة"
              : "✏️ تعديل الإدارة"
          }
          onClose={closeModal}
        >
          <div style={{ marginTop: 4 }}>
            {modal.mode === "add" && (
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#64748b",
                }}
              >
                القطاع: {modal.sector.name}
              </div>
            )}

            <label
              style={{
                display: "block",
                marginBottom: 6,
                color: "#334155",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              اسم الإدارة
            </label>
            <input
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="مثل: إدارة الاستحقاقات"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDepartment();
              }}
              style={inputStyle}
            />

            <button
              type="button"
              onClick={saveDepartment}
              disabled={saving}
              style={{
                width: "100%",
                marginTop: 14,
                border: 0,
                borderRadius: 11,
                padding: "12px",
                background: saving ? "#93c5fd" : "#2563eb",
                color: "#fff",
                fontSize: 14,
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "جاري الحفظ..." : "💾 حفظ الإدارة"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
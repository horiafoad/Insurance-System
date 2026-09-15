import { styles } from "./styles";
import { MENU_ITEMS, TASK_TYPES } from "./data";
import { hasPermission } from "../utils/permissions";

const SERVICE_REQUEST_TYPES = {
  salary_statement: "مفردات مرتب",
  care: "الرعاية الصحية",
  fellowship: "صندوق الزمالة",
};

const MENU_ITEMS_PERMISSION = {
  criteria: "reports",
  service_requests: "requests",
  feedback: "entitlements",
  employee_performance: "reports",
  performance_dashboard: "reports",
  employee_profiles: "reports",
  training_courses: "entitlements",
  user_management: "user_management",
  org_structure: "org_structure",
  connection_test: "system_settings",
};

function taskActionType(typeId) {
  if (SERVICE_REQUEST_TYPES[typeId]) return "requests";
  return "entitlements";
}

export default function Sidebar({
  activeMenu,
  filterType,
  setActiveMenu,
  setFilterType,
  setServiceRequestFilter,
  currentUser,
}) {
  const controlItems = MENU_ITEMS.filter((item) =>
    hasPermission(currentUser, MENU_ITEMS_PERMISSION[item.id])
  );

  const workItems = TASK_TYPES.filter((type) =>
    hasPermission(currentUser, taskActionType(type.id))
  );

  const canLetters = hasPermission(currentUser, "letters");
  const canEntitlements = hasPermission(
    currentUser,
    "entitlements"
  );
  const canArchive =
    canEntitlements || hasPermission(currentUser, "system_settings");

  return (
    <aside style={styles.sidebar}>
      {/* اسم القسم */}
      <div style={styles.brand}>
        <div style={styles.logo}>🏛️</div>

        <div>
          <div style={styles.college}>كلية الهندسة</div>
          <div style={styles.department}>قسم الاستحقاقات</div>
        </div>
      </div>

      {/* لوحة التحكم */}
      {controlItems.length > 0 && (
        <>
          <div style={styles.sidebarLabel}>لوحة التحكم</div>

          {controlItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveMenu(item.id)}
              style={{
                ...styles.menuButton,
                ...(activeMenu === item.id
                  ? styles.menuButtonActive
                  : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.title}</span>
            </button>
          ))}
        </>
      )}

      {workItems.length > 0 && (
        <>
          <div style={styles.sidebarDivider} />

          {/* الأعمال */}
          <div style={styles.sidebarLabel}>الأعمال</div>

          {workItems.map((type) => (
            <div key={type.id}>
              <button
                onClick={() => {
                  // الإجازات الدراسية
                  if (type.id === "staff_changes") {
                    setActiveMenu("study_leaves");
                    return;
                  }

                  // المطالبات
                  if (type.id === "claims") {
                    setActiveMenu("claims");
                    return;
                  }

                  // إدارة القضايا
                  if (type.id === "issues_management") {
                    setActiveMenu("issues_management");
                    return;
                  }

                  // طلبات الخدمات
                  if (SERVICE_REQUEST_TYPES[type.id]) {
                    setServiceRequestFilter(
                      SERVICE_REQUEST_TYPES[type.id]
                    );
                    setActiveMenu("service_requests");
                    return;
                  }

                  // مرتبات هيئة التدريس
                  if (type.id === "faculty_salaries") {
                    setActiveMenu("faculty_salaries");
                    return;
                  }

                  // باقي الأعمال
                  setFilterType(type.id);
                  setActiveMenu("daily");
                }}
                style={{
                  ...styles.smallMenuButton,

                  ...(type.id === "staff_changes" &&
                  activeMenu === "study_leaves"
                    ? styles.smallMenuButtonActive
                    : {}),

                  ...(type.id === "claims" &&
                  activeMenu === "claims"
                    ? styles.smallMenuButtonActive
                    : {}),

                  ...(type.id === "issues_management" &&
                  activeMenu === "issues_management"
                    ? styles.smallMenuButtonActive
                    : {}),

                  ...(SERVICE_REQUEST_TYPES[type.id] &&
                  activeMenu === "service_requests"
                    ? styles.smallMenuButtonActive
                    : {}),

                  ...(activeMenu === "daily" &&
                  filterType === type.id
                    ? styles.smallMenuButtonActive
                    : {}),
                }}
              >
                <span>{type.icon}</span>
                <span>{type.title}</span>
              </button>
            </div>
          ))}
        </>
      )}

      {/* =========================================
          متابعة الخطابات - قسم مستقل
          ========================================= */}

      {canLetters && (
        <>
          <div style={styles.sidebarDivider} />

          <button
            onClick={() => setActiveMenu("letters_tracking")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "letters_tracking"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>📋</span>
            <span>متابعة الخطابات</span>
          </button>
        </>
      )}

      {/* =========================================
          أرشيف مفردات المرتب - قسم مستقل (هيئة التدريس والموظفون)
          ========================================= */}

      {canArchive && (
        <>
          <div style={styles.sidebarDivider} />

          <div style={{ padding: "6px 14px 2px", fontSize: 11, fontWeight: 800, color: "#94A3B8" }}>
            💰 أرشيف مفردات المرتب
          </div>

          <button
            onClick={() => setActiveMenu("faculty_salary_archive")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "faculty_salary_archive"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>👨‍🏫</span>
            <span>أعضاء هيئة التدريس</span>
          </button>

          <button
            onClick={() => setActiveMenu("employee_salary_archive")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "employee_salary_archive"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>👨‍💼</span>
            <span>الموظفون</span>
          </button>
        </>
      )}

      {/* =========================================
          أرشيف الأوامر التنفيذية - قسم مستقل
          ========================================= */}

      {canEntitlements && (
        <>
          <div style={styles.sidebarDivider} />

          <div style={{ padding: "6px 14px 2px", fontSize: 11, fontWeight: 800, color: "#94A3B8" }}>
            📜 أرشيف الأوامر التنفيذية
          </div>

          <button
            onClick={() => setActiveMenu("executive_orders_add")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "executive_orders_add"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>➕</span>
            <span>إضافة أمر تنفيذي</span>
          </button>

          <button
            onClick={() => setActiveMenu("executive_orders_archive")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "executive_orders_archive"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>🗂️</span>
            <span>أرشيف الأوامر التنفيذية</span>
          </button>
        </>
      )}
    </aside>
  );
}
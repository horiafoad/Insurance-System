import { styles } from "./styles";
import { MENU_ITEMS, TASK_TYPES } from "./data";
import { hasPermission } from "../utils/permissions";
import { canViewSection } from "../utils/notificationPermissions";
import { NOTIFICATION_SECTION_LIST } from "./notificationsConfig";

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
  monthly_reports: "monthly_reports",
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
  setServiceRequestsView,
  serviceRequestsView = "incoming",
  currentUser,
  isMobile = false,
  sidebarOpen = false,
  onCloseSidebar,
}) {
  const navigate = (nextMenu) => {
    setActiveMenu(nextMenu);
    if (onCloseSidebar) onCloseSidebar();
  };

  // فتح طلبات الخدمة: الوارد من زر القائمة، والأرشيف من أقسام الخدمات.
  const openServiceRequests = (viewMode) => {
    if (setServiceRequestsView) setServiceRequestsView(viewMode);
    setActiveMenu("service_requests");
  };
  const controlItems = MENU_ITEMS.filter((item) =>
    item.id === "push_settings"
      ? true
      : hasPermission(currentUser, MENU_ITEMS_PERMISSION[item.id])
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

  const notificationSections = NOTIFICATION_SECTION_LIST.filter((section) =>
    canViewSection(currentUser, section.id)
  );

  return (
    <aside
      className="dashboard-sidebar"
      style={{          ...styles.sidebar,
        ...(isMobile
          ? {
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              transform: sidebarOpen
                ? "translateX(0)"
                : "translateX(100%)",
              boxShadow: sidebarOpen
                ? "0 0 40px rgba(15,23,42,0.35)"
                : "none",
              transition: "transform 0.28s ease",
              overflowY: "auto",
            }
          : {}),
      }}
    >
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
              onClick={() => {
                if (item.id === "service_requests") {
                  openServiceRequests("incoming");
                  return;
                }
                setActiveMenu(item.id);
              }}
              style={{
                ...styles.menuButton,
                ...(activeMenu === item.id &&
                !(item.id === "service_requests" && serviceRequestsView === "archive")
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

                  // طلبات الخدمات — تفتح بند الخدمة (المنفّذ والمستلَم)
                  if (SERVICE_REQUEST_TYPES[type.id]) {
                    setServiceRequestFilter(
                      SERVICE_REQUEST_TYPES[type.id]
                    );
                    if (setServiceRequestsView) {
                      setServiceRequestsView("archive");
                    }
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
                  activeMenu === "service_requests" &&
                  serviceRequestsView === "archive"
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
          الأرشيف الذكي لأعضاء هيئة التدريس - قسم مستقل
          ========================================= */}

      {canArchive && (
        <>
          <div style={styles.sidebarDivider} />

          <button
            onClick={() => setActiveMenu("faculty_smart_archive")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "faculty_smart_archive"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>🧠</span>
            <span>الأرشيف الذكي (أعضاء هيئة التدريس)</span>
          </button>
        </>
      )}

      {/* =========================================
          التبليغات الشهرية - قسم مستقل
          ========================================= */}

      {hasPermission(currentUser, "monthly_reports") && (
        <>
          <div style={styles.sidebarDivider} />

          <button
            onClick={() => setActiveMenu("monthly_reports")}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "monthly_reports"
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>📝</span>
            <span>التبليغات الشهرية</span>
          </button>
        </>
      )}

      {/* =========================================
          تبليغات الاستحقاقات: هيئة التدريس / الموظفون / العقود
          ========================================= */}

      {notificationSections.length > 0 && (
        <>
          <div style={styles.sidebarDivider} />

          <div style={{ padding: "6px 14px 2px", fontSize: 11, fontWeight: 800, color: "#94A3B8" }}>
            📣 تبليغات الاستحقاقات
          </div>

          {notificationSections.map((section) => {
            const menuId = `notifications_${section.id}`;
            return (
              <button
                key={menuId}
                onClick={() => navigate(menuId)}
                style={{
                  ...styles.smallMenuButton,
                  ...(activeMenu === menuId ? styles.smallMenuButtonActive : {}),
                }}
              >
                <span>{section.emoji}</span>
                <span>{section.shortTitle}</span>
              </button>
            );
          })}
        </>
      )}
    </aside>
  );
}
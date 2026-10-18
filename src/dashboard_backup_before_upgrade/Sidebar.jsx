import { styles } from "./styles";
import { MENU_ITEMS, TASK_TYPES } from "./data";

const SERVICE_REQUEST_TYPES = {
  salary_statement: "مفردات مرتب",
  care: "الرعاية الصحية",
  fellowship: "صندوق الزمالة",
};

export default function Sidebar({
  activeMenu,
  filterType,
  setActiveMenu,
  setFilterType,
  setServiceRequestFilter,
}) {
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
      <div style={styles.sidebarLabel}>لوحة التحكم</div>

      {MENU_ITEMS.map((item) => (
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

      <div style={styles.sidebarDivider} />

      {/* الأعمال */}
      <div style={styles.sidebarLabel}>الأعمال</div>

      {TASK_TYPES.map((type) => (
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

      {/* =========================================
          متابعة الخطابات - قسم مستقل
          ========================================= */}

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
    </aside>
  );
}
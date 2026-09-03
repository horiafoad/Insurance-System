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
      <div style={styles.brand}>
        <div style={styles.logo}>🏛️</div>
        <div>
          <div style={styles.college}>كلية الهندسة</div>
          <div style={styles.department}>قسم الاستحقاقات</div>
        </div>
      </div>

      <div style={styles.sidebarLabel}>لوحة التحكم</div>

      {MENU_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveMenu(item.id)}
          style={{
            ...styles.menuButton,
            ...(activeMenu === item.id ? styles.menuButtonActive : {}),
          }}
        >
          <span>{item.icon}</span>
          <span>{item.title}</span>
        </button>
      ))}

      <div style={styles.sidebarDivider} />

      <div style={styles.sidebarLabel}>الأعمال</div>

      {TASK_TYPES.map((type) => (
        <div key={type.id}>
          <button
            onClick={() => {
              if (type.id === "staff_changes") {
                setActiveMenu("study_leaves");
                return;
              }
              if (type.id === "claims") {
                setActiveMenu("claims");
                return;
              }
              if (type.id === "legal") {
                setActiveMenu("cases");
                return;
              }
              if (SERVICE_REQUEST_TYPES[type.id]) {
                setServiceRequestFilter(SERVICE_REQUEST_TYPES[type.id]);
                setActiveMenu("service_requests");
                return;
              }
              if (type.id === "faculty_salaries") {
                setActiveMenu("faculty_salaries");
                return;
              }
              setFilterType(type.id);
              setActiveMenu("daily");
            }}
            style={{
              ...styles.smallMenuButton,
              ...(type.id === "staff_changes" && activeMenu === "study_leaves"
                ? styles.smallMenuButtonActive
                : {}),
              ...(type.id === "claims" && activeMenu === "claims"
                ? styles.smallMenuButtonActive
                : {}),
              ...(type.id === "legal" && activeMenu === "cases"
                ? styles.smallMenuButtonActive
                : {}),
              ...(SERVICE_REQUEST_TYPES[type.id] && activeMenu === "service_requests"
                ? styles.smallMenuButtonActive
                : {}),
              ...(activeMenu === "daily" && filterType === type.id
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>{type.icon}</span>
            <span>{type.title}</span>
          </button>
        </div>
      ))}
    </aside>
  );
}

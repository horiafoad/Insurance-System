import { styles } from "./styles";
import { MENU_ITEMS, TASK_TYPES } from "./data";

export default function Sidebar({
  activeMenu,
  filterType,
  setActiveMenu,
  setFilterType,
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
        <button
          key={type.id}
          onClick={() => {
            if (type.id === "staff_changes") {
              setActiveMenu("study_leaves");
              return;
            }
            if (type.id === "claims") {
              setActiveMenu("claims");
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
            ...(activeMenu === "daily" && filterType === type.id
              ? styles.smallMenuButtonActive
              : {}),
          }}
        >
          <span>{type.icon}</span>
          <span>{type.title}</span>
        </button>
      ))}
    </aside>
  );
}

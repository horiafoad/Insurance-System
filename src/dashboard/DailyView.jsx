import { styles } from "./styles";
import { STATUS, TASK_TYPES, getType } from "./data";
import { EmptyState, StatusBadge } from "./ui";

export default function DailyView({
  tasks,
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  onAdd,
  onSelect,
  onDelete,
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>متابعة الأعمال</h2>
          <p style={styles.cardSub}>تصفية المهام حسب النوع والحالة</p>
        </div>
        <button style={styles.primaryButton} onClick={onAdd}>
          ＋ إضافة مهمة جديدة
        </button>
      </div>

      <div style={styles.filterRow}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={styles.filter}
        >
          <option value="all">كل الأنواع</option>
          {TASK_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.title}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={styles.filter}
        >
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.resultText}>
        عدد النتائج الحالية: <strong>{tasks.length}</strong>
      </div>

      {tasks.length > 0 ? (
        <div style={styles.claimTableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>المهمة</th>
                <th style={styles.th}>النوع</th>
                <th style={styles.th}>المسؤول</th>
                <th style={styles.th}>تاريخ الورود</th>
                <th style={styles.th}>موعد التنفيذ</th>
                <th style={styles.th}>الحالة</th>
                <th style={styles.th}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} style={styles.tr}>
                  <td style={styles.td}>{task.title}</td>
                  <td style={styles.td}>{getType(task.type)?.title || "—"}</td>
                  <td style={styles.td}>{task.responsible || "—"}</td>
                  <td style={styles.td}>{task.receivedDate || "—"}</td>
                  <td style={styles.td}>{task.dueDate || "غير محدد"}</td>
                  <td style={styles.td}>
                    <StatusBadge status={task.status} />
                  </td>
                  <td style={styles.td}>
                    <button
                      style={styles.viewButton}
                      onClick={() => onSelect(task)}
                    >
                      عرض
                    </button>
                    <button
                      style={styles.deleteButton}
                      onClick={() => onDelete(task.id)}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="لا توجد مهام مطابقة للتصفية." />
      )}
    </div>
  );
}

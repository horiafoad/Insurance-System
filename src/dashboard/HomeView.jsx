import { styles } from "./styles";
import { TASK_TYPES } from "./data";
import { EmptyState, MetricBar, StatCard, TaskMini } from "./ui";

export default function HomeView({
  stats,
  performance,
  tasks,
  studyLeavesCount = 0,
  claimsCount = 0,
  setActiveMenu,
  setFilterType,
  setSelectedTask,
}) {
  return (
    <>
      <div style={styles.statsGrid}>
        <StatCard title="إجمالي المهام" value={stats.total} icon="📋" />
        <StatCard title="تم التنفيذ" value={stats.completed} icon="✅" />
        <StatCard title="جاري التنفيذ" value={stats.inProgress} icon="🔄" />
        <StatCard title="متأخر" value={stats.late} icon="⚠️" />
      </div>

      <div style={styles.dashboardGrid}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>أداء القسم</h2>
              <p style={styles.cardSub}>التقييم الحالي بناءً على المهام المسجلة</p>
            </div>
            <div style={styles.scoreCircle}>{performance.score}%</div>
          </div>

          <MetricBar label="نسبة الإنجاز" value={stats.completionRate} />
          <MetricBar label="المراجعة" value={stats.reviewRate} />
          <MetricBar label="الرفع" value={stats.uploadRate} />

          <div style={styles.gradeBox}>
            <span>التقدير العام</span>
            <strong>{performance.grade}</strong>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>مهام اليوم</h2>
              <p style={styles.cardSub}>المهام الحالية</p>
            </div>
            <button
              style={styles.linkButton}
              onClick={() => setActiveMenu("daily")}
            >
              عرض الكل
            </button>
          </div>

          {tasks.slice(0, 5).map((task) => (
            <TaskMini
              key={task.id}
              task={task}
              onClick={() => setSelectedTask(task)}
            />
          ))}

          {!tasks.length && <EmptyState text="لا توجد مهام مسجلة." />}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>أعمال قسم الاستحقاقات</h2>
            <p style={styles.cardSub}>التصنيف حسب طبيعة العمل والتكرار</p>
          </div>
        </div>

        <div style={styles.workGrid}>
          {TASK_TYPES.map((type) => {
            let count;
            if (type.id === "staff_changes") {
              count = studyLeavesCount;
            } else if (type.id === "claims" || type.id === "legal") {
              count = claimsCount;
            } else {
              count = tasks.filter((task) => task.type === type.id).length;
            }

            return (
              <button
                key={type.id}
                style={styles.workCard}
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
                  setFilterType(type.id);
                  setActiveMenu("daily");
                }}
              >
                <span
                  style={{
                    ...styles.workIcon,
                    background: type.color,
                  }}
                >
                  {type.icon}
                </span>
                <span style={styles.workInfo}>
                  <b>{type.title}</b>
                  <small>{type.frequency}</small>
                </span>
                <span style={styles.workCount}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

    </>
  );
}

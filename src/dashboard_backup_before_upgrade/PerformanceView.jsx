import { styles } from "./styles";
import { MetricRow, StatCard } from "./ui";

export default function PerformanceView({ title, period, performance, stats }) {
  return (
    <div>
      {title && <h2 style={styles.sectionHeading}>{title}</h2>}

      <p style={styles.cardSub}>{period}</p>

      <div style={styles.statsGrid}>
        <StatCard
          title="نسبة الإنجاز"
          value={`${stats.completionRate}%`}
          icon="✅"
        />
        <StatCard
          title="الالتزام بالمواعيد"
          value={`${performance.onTime}%`}
          icon="⏱️"
        />
        <StatCard
          title="المراجعة"
          value={`${stats.reviewRate}%`}
          icon="🔎"
        />
        <StatCard title="الرفع" value={`${stats.uploadRate}%`} icon="⬆️" />
      </div>

      <div style={styles.performanceBox}>
        <div style={styles.bigScore}>{performance.score}%</div>
        <div>
          <h3 style={{ margin: 0 }}>التقييم العام: {performance.grade}</h3>
          <p style={styles.cardSub}>النتيجة محسوبة تلقائيًا.</p>
        </div>
      </div>

      <div style={styles.criteriaList}>
        <MetricRow
          name="نسبة إنجاز المهام"
          value={performance.completion}
          weight="30%"
        />
        <MetricRow
          name="الالتزام بالمواعيد"
          value={performance.onTime}
          weight="25%"
        />
        <MetricRow
          name="دقة العمل والمراجعة"
          value={performance.accuracy}
          weight="20%"
        />
        <MetricRow
          name="سرعة الإنجاز"
          value={performance.speed}
          weight="10%"
        />
        <MetricRow
          name="المراجعة والرفع"
          value={performance.reviewUpload}
          weight="10%"
        />
        <MetricRow
          name="تنظيم وتسجيل العمل"
          value={performance.organization}
          weight="5%"
        />
      </div>
    </div>
  );
}

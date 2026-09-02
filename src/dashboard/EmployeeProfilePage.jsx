import { useEffect, useMemo, useState } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

const EMPLOYEES = [
  { id: 1, name: "صفاء عبد الوهاب" },
  { id: 2, name: "ياسمين عبد الوهاب" },
  { id: 3, name: "حورية فؤاد" },
  { id: 4, name: "أماني صلاح" },
  { id: 5, name: "عبد الله السعيد" },
  { id: 6, name: "جهاد عاطف" },
];

const STATUS_META = {
  جديد: { label: "جديد", color: "#2563EB", background: "#DBEAFE" },
  جاري: { label: "جاري", color: "#B45309", background: "#FEF3C7" },
  مكتمل: { label: "مكتمل", color: "#047857", background: "#D1FAE5" },
  متأخر: { label: "متأخر", color: "#DC2626", background: "#FEE2E2" },
};

function getEmployeeStats(tasks) {
  const completed = tasks.filter((task) => task.status === "مكتمل").length;
  const late = tasks.filter((task) => task.status === "متأخر").length;
  return {
    total: tasks.length,
    completed,
    late,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

export default function EmployeeProfilePage({ onManageTasks }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(1);
  const [tasks, setTasks] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProfileData = async () => {
      setLoading(true);
      setError("");
      try {
        const [{ data: taskData, error: taskError }, { data: evaluationData, error: evaluationError }] =
          await Promise.all([
            supabase.from("employee_tasks").select("*").order("created_at", { ascending: false }),
            supabase
              .from("performance_evaluations")
              .select("*")
              .order("evaluation_year", { ascending: false })
              .order("evaluation_month", { ascending: false }),
          ]);

        if (taskError || evaluationError) {
          console.error("خطأ في تحميل ملف الموظف:", taskError || evaluationError);
          setError("تعذر تحميل بيانات ملف الموظف. تأكدي من تشغيل ملفات إنشاء الجداول.");
        }
        setTasks(taskData || []);
        setEvaluations(evaluationData || []);
      } catch (loadError) {
        console.error("خطأ عام في تحميل ملف الموظف:", loadError);
        setError("تعذر تحميل بيانات ملف الموظف.");
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, []);

  const employee = EMPLOYEES.find((item) => item.id === selectedEmployeeId) || EMPLOYEES[0];
  const employeeTasks = useMemo(
    () => tasks.filter((task) => task.employee_id === employee.id),
    [tasks, employee.id]
  );
  const employeeEvaluations = useMemo(
    () => evaluations.filter((evaluation) => Number(evaluation.employee_id) === employee.id),
    [evaluations, employee.id]
  );
  const stats = getEmployeeStats(employeeTasks);
  const latestEvaluation = employeeEvaluations[0];
  const evaluationMetrics = latestEvaluation
    ? [
        ["نسبة الإنجاز", latestEvaluation.completion_rate],
        ["الالتزام بالموعد", latestEvaluation.on_time_rate],
        ["الدقة", latestEvaluation.accuracy_rate],
        ["السرعة", latestEvaluation.speed_rate],
        ["المراجعة", latestEvaluation.review_rate],
        ["الرفع", latestEvaluation.upload_rate],
        ["التنظيم", latestEvaluation.organization_rate],
      ]
    : [];

  if (loading) {
    return <div style={styles.card}><div style={styles.infoBox}>جاري تحميل ملف الموظف...</div></div>;
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>📁 صفحة تقييم الموظف</h2>
            <p style={styles.cardSub}>تقييم تفصيلي لكل موظف مع مهامه ومؤشرات أدائه</p>
          </div>
          <button style={styles.secondaryButton} onClick={onManageTasks}>📝 إدارة المهام وإضافة مهمة</button>
        </div>
        {error && <div style={styles.errorBox}>{error}</div>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
          {EMPLOYEES.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedEmployeeId(item.id)}
              style={{
                ...styles.secondaryButton,
                background: item.id === employee.id ? "#2563EB" : "#fff",
                color: item.id === employee.id ? "#fff" : "#334155",
                borderColor: item.id === employee.id ? "#2563EB" : "#CBD5E1",
              }}
            >
              👤 {item.name}
            </button>
          ))}
        </div>

        <div style={{ ...styles.card, margin: 0, background: "linear-gradient(135deg,#0F2942,#2563EB)", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{employee.name}</div>
              <div style={{ opacity: 0.8, marginTop: 5 }}>ملف الأداء والمهام</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 110 }}>
              <div style={{ fontSize: 38, fontWeight: 900 }}>{stats.completionRate}%</div>
              <div style={{ opacity: 0.8 }}>نسبة إنجاز المهام</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, margin: "18px 0" }}>
          {[
            ["إجمالي المهام", stats.total, "#F8FAFC", "#1E293B"],
            ["مكتمل", stats.completed, "#D1FAE5", "#047857"],
            ["متأخر", stats.late, "#FEE2E2", "#DC2626"],
            ["آخر تقييم", latestEvaluation?.total_score ?? "—", "#DBEAFE", "#1D4ED8"],
          ].map(([label, value, background, color]) => (
            <div key={label} style={{ padding: 18, borderRadius: 14, background, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
              <div style={{ color, fontSize: 13, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)", gap: 18 }}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📋 مهام الموظف</h3>
            {employeeTasks.length === 0 ? <div style={styles.infoBox}>لا توجد مهام مضافة لهذا الموظف بعد.</div> : (
              <div style={{ display: "grid", gap: 10 }}>
                {employeeTasks.map((task) => {
                  const status = STATUS_META[task.status] || STATUS_META.جديد;
                  return (
                    <div key={task.id} style={{ padding: 14, border: "1px solid #E2E8F0", borderRadius: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <strong>{task.title}</strong>
                        <span style={{ padding: "4px 9px", borderRadius: 20, color: status.color, background: status.background, fontSize: 12, whiteSpace: "nowrap" }}>{status.label}</span>
                      </div>
                      {task.description && <div style={{ color: "#64748B", fontSize: 13, marginTop: 6 }}>{task.description}</div>}
                      <div style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>موعد التسليم: {task.due_date || "غير محدد"} · الأولوية: {task.priority || "عادي"}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📊 سجل التقييمات</h3>
            {employeeEvaluations.length === 0 ? <div style={styles.infoBox}>لا توجد تقييمات مسجلة لهذا الموظف بعد.</div> : (
              <div style={{ display: "grid", gap: 12 }}>
                {employeeEvaluations.map((evaluation) => (
                  <div key={evaluation.id} style={{ padding: 14, border: "1px solid #E2E8F0", borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{evaluation.evaluation_month} {evaluation.evaluation_year}</strong>
                      <strong style={{ color: "#2563EB", fontSize: 22 }}>{evaluation.total_score ?? 0}%</strong>
                    </div>
                    <div style={{ color: "#047857", fontWeight: 700, marginTop: 4 }}>{evaluation.grade || "غير مصنف"}</div>
                    <div style={{ height: 8, background: "#E2E8F0", borderRadius: 10, overflow: "hidden", marginTop: 10 }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, Number(evaluation.total_score) || 0))}%`, height: "100%", background: "#2563EB" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {latestEvaluation && (
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid #E2E8F0" }}>
                <h4 style={{ margin: "0 0 14px", color: "#334155" }}>تفاصيل آخر تقييم</h4>
                <div style={{ display: "grid", gap: 11 }}>
                  {evaluationMetrics.map(([label, value]) => {
                    const metricValue = Math.min(100, Math.max(0, Number(value) || 0));
                    return (
                      <div key={label}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 5 }}>
                          <span>{label}</span>
                          <strong style={{ color: "#1D4ED8" }}>{metricValue}%</strong>
                        </div>
                        <div style={{ height: 8, background: "#E2E8F0", borderRadius: 10, overflow: "hidden" }}>
                          <div style={{ width: `${metricValue}%`, height: "100%", background: "linear-gradient(90deg,#2563EB,#60A5FA)", borderRadius: 10 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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

const MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const TASK_STATUS = [
  { value: "جديد", color: "#3B82F6", label: "جديد" },
  { value: "جاري", color: "#F59E0B", label: "جاري" },
  { value: "مكتمل", color: "#10B981", label: "مكتمل" },
  { value: "متأخر", color: "#EF4444", label: "متأخر" },
];

export default function EmployeePerformanceEvaluation() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState("all");

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError("");
      
      console.log("جاري تحميل المهام للتقييم...");
      
      const { data, error } = await supabase
        .from("employee_tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("خطأ في تحميل المهام:", error);
        setError("حدث خطأ أثناء تحميل المهام: " + error.message);
        return;
      }

      console.log("تم تحميل المهام:", data);
      setTasks(data || []);
    } catch (error) {
      console.error("خطأ عام:", error);
      setError("تعذر تحميل المهام من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const employeeMatch = selectedEmployee === "all" || task.employee_id === Number(selectedEmployee);
      const yearMatch = selectedYear === "all" || task.task_year === Number(selectedYear);
      const monthMatch = selectedMonth === "all" || task.task_month === Number(selectedMonth);
      return employeeMatch && yearMatch && monthMatch;
    });
  }, [tasks, selectedEmployee, selectedYear, selectedMonth]);

  const employeePerformance = useMemo(() => {
    return EMPLOYEES.map((employee) => {
      const employeeTasks = tasks.filter((t) => t.employee_id === employee.id);
      
      const totalTasks = employeeTasks.length;
      const completed = employeeTasks.filter((t) => t.status === "مكتمل").length;
      const pending = employeeTasks.filter((t) => t.status === "جديد" || t.status === "جاري").length;
      const late = employeeTasks.filter((t) => t.status === "متأخر").length;
      
      const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
      
      // حساب الأداء الشهري
      const monthlyPerformance = {};
      for (let month = 1; month <= 12; month++) {
        const monthTasks = employeeTasks.filter((t) => t.task_month === month);
        const monthCompleted = monthTasks.filter((t) => t.status === "مكتمل").length;
        monthlyPerformance[month] = monthTasks.length > 0 
          ? Math.round((monthCompleted / monthTasks.length) * 100) 
          : 0;
      }

      return {
        ...employee,
        totalTasks,
        completed,
        pending,
        late,
        completionRate,
        monthlyPerformance,
      };
    });
  }, [tasks]);

  const getPerformanceColor = (rate) => {
    if (rate >= 90) return { bg: "#D1FAE5", color: "#047857", border: "#34D399" };
    if (rate >= 75) return { bg: "#DBEAFE", color: "#1D4ED8", border: "#60A5FA" };
    if (rate >= 60) return { bg: "#FEF3C7", color: "#B45309", border: "#FBBF24" };
    if (rate >= 40) return { bg: "#FEE2E2", color: "#DC2626", border: "#F87171" };
    return { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" };
  };

  const getPerformanceGrade = (rate) => {
    if (rate >= 90) return "ممتاز";
    if (rate >= 75) return "جيد جداً";
    if (rate >= 60) return "جيد";
    if (rate >= 40) return "مقبول";
    return "ضعيف";
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل بيانات التقييم...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>📊 تقييم أداء الموظفين</h2>
            <p style={styles.cardSub}>
              تحليل وعرض أداء الموظفين بشكل بياني ومنظم
            </p>
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* فلاتر التحديد */}
        <div style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
          padding: "16px",
          background: "#F8FAFC",
          borderRadius: "12px",
          border: "1px solid #E2E8F0"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748B" }}>
              👤
            </span>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              style={{ 
                ...styles.input, 
                padding: "8px 12px", 
                minWidth: "150px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1"
              }}
            >
              <option value="all">جميع الموظفين</option>
              {EMPLOYEES.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748B" }}>
              📅
            </span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{ 
                ...styles.input, 
                padding: "8px 12px", 
                minWidth: "100px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1"
              }}
            >
              <option value="all">جميع السنوات</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748B" }}>
              📆
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ 
                ...styles.input, 
                padding: "8px 12px", 
                minWidth: "120px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1"
              }}
            >
              <option value="all">جميع الشهور</option>
              {MONTHS.map((month, index) => (
                <option key={index + 1} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>
        </div>

        {/* عرض الموظفين */}
        {selectedEmployee === "all" ? (
          <div>
            <h3 style={{ 
              fontSize: "18px", 
              fontWeight: "700", 
              marginBottom: "20px", 
              color: "#1E293B",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>👥</span> ملخص أداء جميع الموظفين
            </h3>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
              gap: "20px"
            }}>
              {employeePerformance.map((employee) => {
                const perfStyle = getPerformanceColor(employee.completionRate);
                return (
                  <div
                    key={employee.id}
                    style={{
                      padding: "24px",
                      borderRadius: "16px",
                      background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                      border: `2px solid ${perfStyle.border}`,
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                      transition: "all 0.3s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
                      <div style={{ fontSize: "48px", marginRight: "16px" }}>👤</div>
                      <div>
                        <div style={{ 
                          fontWeight: "800", 
                          color: "#1E293B", 
                          fontSize: "18px",
                          marginBottom: "4px"
                        }}>
                          {employee.name}
                        </div>
                        <div style={{ fontSize: "13px", color: "#64748B" }}>
                          {employee.totalTasks} مهمة
                        </div>
                      </div>
                    </div>

                    {/* شريط التقدم العام */}
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between", 
                        marginBottom: "8px",
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#64748B"
                      }}>
                        <span>نسبة الإنجاز الكلية</span>
                        <span style={{ color: perfStyle.color }}>{employee.completionRate}%</span>
                      </div>
                      <div style={{
                        height: "10px",
                        background: "#E2E8F0",
                        borderRadius: "5px",
                        overflow: "hidden"
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${employee.completionRate}%`,
                          background: `linear-gradient(90deg, ${perfStyle.color} 0%, ${perfStyle.border} 100%)`,
                          borderRadius: "5px",
                          transition: "width 0.3s ease"
                        }} />
                      </div>
                      <div style={{ 
                        marginTop: "8px",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: perfStyle.color
                      }}>
                        التقدير: {getPerformanceGrade(employee.completionRate)}
                      </div>
                    </div>

                    {/* الرسم البياني الشهري */}
                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ 
                        fontSize: "12px", 
                        fontWeight: "700", 
                        marginBottom: "8px", 
                        color: "#64748B" 
                      }}>
                        الأداء الشهري
                      </div>
                      <div style={{
                        display: "flex",
                        gap: "4px",
                        height: "60px",
                        alignItems: "flex-end"
                      }}>
                        {MONTHS.map((month, index) => {
                          const rate = employee.monthlyPerformance[index + 1];
                          const style = getPerformanceColor(rate);
                          return (
                            <div 
                              key={index}
                              style={{ 
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <div style={{
                                width: "100%",
                                height: `${rate}%`,
                                background: style.bg,
                                border: `1px solid ${style.border}`,
                                borderRadius: "4px 4px 0 0",
                                minHeight: "4px",
                                transition: "height 0.3s ease"
                              }} />
                              <div style={{ 
                                fontSize: "9px", 
                                color: "#64748B",
                                fontWeight: "600"
                              }}>
                                {index + 1}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* إحصائيات */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: "#D1FAE5",
                        color: "#047857",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <span>✅</span> مكتمل: {employee.completed}
                      </span>
                      <span style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: "700",
                        background: "#DBEAFE",
                        color: "#1D4ED8",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <span>⏳</span> قيد التنفيذ: {employee.pending}
                      </span>
                      {employee.late > 0 && (
                        <span style={{
                          padding: "6px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background: "#FEE2E2",
                          color: "#DC2626",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}>
                          <span>⚠️</span> متأخر: {employee.late}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            {(() => {
              const employee = EMPLOYEES.find((e) => e.id === Number(selectedEmployee));
              const performance = employeePerformance.find((e) => e.id === Number(selectedEmployee));
              if (!employee || !performance) return null;

              const perfStyle = getPerformanceColor(performance.completionRate);

              return (
                <div>
                  <div style={{ 
                    marginBottom: "24px",
                    padding: "24px",
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    border: `2px solid ${perfStyle.border}`,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
                      <div style={{ fontSize: "64px", marginRight: "20px" }}>👤</div>
                      <div>
                        <div style={{ 
                          fontWeight: "800", 
                          color: "#1E293B", 
                          fontSize: "24px",
                          marginBottom: "8px"
                        }}>
                          {employee.name}
                        </div>
                        <div style={{ fontSize: "14px", color: "#64748B" }}>
                          تقارير الأداء الشهري والتحليل الإحصائي
                        </div>
                      </div>
                    </div>

                    {/* الإحصائيات الرئيسية */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "16px",
                      marginBottom: "24px"
                    }}>
                      <div style={{
                        padding: "16px",
                        borderRadius: "12px",
                        background: "#F8FAFC",
                        border: "1px solid #E2E8F0",
                        textAlign: "center"
                      }}>
                        <div style={{ fontSize: "32px", fontWeight: "800", color: "#1E293B" }}>
                          {performance.totalTasks}
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                          إجمالي المهام
                        </div>
                      </div>
                      <div style={{
                        padding: "16px",
                        borderRadius: "12px",
                        background: "#D1FAE5",
                        border: "1px solid #34D399",
                        textAlign: "center"
                      }}>
                        <div style={{ fontSize: "32px", fontWeight: "800", color: "#047857" }}>
                          {performance.completed}
                        </div>
                        <div style={{ fontSize: "12px", color: "#047857", marginTop: "4px" }}>
                          مكتمل
                        </div>
                      </div>
                      <div style={{
                        padding: "16px",
                        borderRadius: "12px",
                        background: "#DBEAFE",
                        border: "1px solid #60A5FA",
                        textAlign: "center"
                      }}>
                        <div style={{ fontSize: "32px", fontWeight: "800", color: "#1D4ED8" }}>
                          {performance.pending}
                        </div>
                        <div style={{ fontSize: "12px", color: "#1D4ED8", marginTop: "4px" }}>
                          قيد التنفيذ
                        </div>
                      </div>
                      <div style={{
                        padding: "16px",
                        borderRadius: "12px",
                        background: perfStyle.bg,
                        border: `1px solid ${perfStyle.border}`,
                        textAlign: "center"
                      }}>
                        <div style={{ fontSize: "32px", fontWeight: "800", color: perfStyle.color }}>
                          {performance.completionRate}%
                        </div>
                        <div style={{ fontSize: "12px", color: perfStyle.color, marginTop: "4px" }}>
                          نسبة الإنجاز
                        </div>
                      </div>
                    </div>

                    {/* الرسم البياني الشهري المفصل */}
                    <div>
                      <div style={{ 
                        fontSize: "16px", 
                        fontWeight: "700", 
                        marginBottom: "16px", 
                        color: "#1E293B" 
                      }}>
                        📊 الأداء الشهري المفصل
                      </div>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                        gap: "12px"
                      }}>
                        {MONTHS.map((month, index) => {
                          const rate = performance.monthlyPerformance[index + 1];
                          const style = getPerformanceColor(rate);
                          return (
                            <div
                              key={index}
                              style={{
                                padding: "16px",
                                borderRadius: "12px",
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                textAlign: "center"
                              }}
                            >
                              <div style={{ 
                                fontSize: "12px", 
                                fontWeight: "700", 
                                marginBottom: "8px", 
                                color: "#64748B" 
                              }}>
                                {month}
                              </div>
                              <div style={{
                                height: "100px",
                                background: "#E2E8F0",
                                borderRadius: "8px",
                                position: "relative",
                                marginBottom: "8px"
                              }}>
                                <div style={{
                                  position: "absolute",
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: `${rate}%`,
                                  background: `linear-gradient(180deg, ${style.color} 0%, ${style.border} 100%)`,
                                  borderRadius: "0 0 8px 8px",
                                  transition: "height 0.3s ease"
                                }} />
                              </div>
                              <div style={{ 
                                fontSize: "18px", 
                                fontWeight: "800", 
                                color: style.color 
                              }}>
                                {rate}%
                              </div>
                              <div style={{ 
                                fontSize: "11px", 
                                fontWeight: "700", 
                                color: style.color,
                                marginTop: "4px"
                              }}>
                                {getPerformanceGrade(rate)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* جدول المهام التفصيلي */}
                  <div style={{ marginTop: "24px" }}>
                    <h3 style={{ 
                      fontSize: "18px", 
                      fontWeight: "700", 
                      marginBottom: "16px", 
                      color: "#1E293B",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}>
                      <span>📋</span> المهام التفصيلية
                    </h3>
                    
                    {filteredTasks.length === 0 ? (
                      <div style={{
                        ...styles.infoBox,
                        padding: "40px",
                        textAlign: "center",
                        borderRadius: "16px"
                      }}>
                        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
                        <div style={{ fontSize: "16px", fontWeight: "600", color: "#64748B" }}>
                          لا توجد مهام لهذا الموظف في الفترة المحددة
                        </div>
                      </div>
                    ) : (
                      <div style={styles.claimTableWrapper}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.th}>عنوان المهمة</th>
                              <th style={styles.th}>الوصف</th>
                              <th style={styles.th}>الشهر</th>
                              <th style={styles.th}>السنة</th>
                              <th style={styles.th}>تاريخ الاستحقاق</th>
                              <th style={styles.th}>الحالة</th>
                              <th style={styles.th}>الأولوية</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTasks.map((task) => {
                              const statusInfo = TASK_STATUS.find((s) => s.value === task.status) || TASK_STATUS[0];
                              return (
                                <tr key={task.id} style={styles.tr}>
                                  <td style={styles.td}>
                                    <strong>{task.title}</strong>
                                  </td>
                                  <td style={styles.td}>
                                    {task.description || "—"}
                                  </td>
                                  <td style={styles.td}>
                                    {MONTHS[task.task_month - 1]}
                                  </td>
                                  <td style={styles.td}>
                                    {task.task_year}
                                  </td>
                                  <td style={styles.td}>
                                    {task.due_date ? new Date(task.due_date).toLocaleDateString("ar-EG") : "—"}
                                  </td>
                                  <td style={styles.td}>
                                    <span style={{
                                      padding: "4px 8px",
                                      borderRadius: "12px",
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      background: statusInfo.color + "20",
                                      color: statusInfo.color
                                    }}>
                                      {statusInfo.label}
                                    </span>
                                  </td>
                                  <td style={styles.td}>
                                    {task.priority}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
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

const TASK_STATUS = [
  { value: "جديد", color: "#3B82F6", bg: "#EFF6FF", icon: "🆕" },
  { value: "جاري", color: "#F59E0B", bg: "#FEF3C7", icon: "⏳" },
  { value: "مكتمل", color: "#10B981", bg: "#D1FAE5", icon: "✅" },
  { value: "متأخر", color: "#EF4444", bg: "#FEE2E2", icon: "⚠️" },
];

const PRIORITY_LEVELS = [
  { value: "عادي", color: "#64748B", bg: "#F1F5F9", icon: "📋" },
  { value: "مهم", color: "#F59E0B", bg: "#FEF3C7", icon: "⭐" },
  { value: "عاجل", color: "#EF4444", bg: "#FEE2E2", icon: "🔥" },
];

const defaultFormData = {
  employeeId: "",
  title: "",
  description: "",
  dueDate: "",
  taskMonth: new Date().getMonth() + 1,
  taskYear: new Date().getFullYear(),
  status: "جديد",
  priority: "عادي",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("ar-EG", { 
    year: "numeric", 
    month: "short", 
    day: "numeric" 
  });
}

export default function EmployeePerformance() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [viewMode, setViewMode] = useState("cards"); // cards or table

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError("");
      
      console.log("جاري تحميل المهام من جدول employee_tasks...");
      
      const { data, error } = await supabase
        .from("employee_tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("خطأ في تحميل المهام:", error);
        
        // التحقق من نوع الخطأ
        if (error.code === '42P01') {
          setError("جدول المهام غير موجود. يرجى تشغيل ملف SQL لإنشاء الجدول.");
        } else {
          setError("حدث خطأ أثناء تحميل المهام: " + error.message);
        }
        return;
      }

      console.log("تم تحميل المهام بنجاح:", data);
      setTasks(data || []);
    } catch (error) {
      console.error("خطأ عام في تحميل المهام:", error);
      setError("تعذر تحميل المهام من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const employeeMatch = selectedEmployee === "all" || task.employee_id === Number(selectedEmployee);
      const statusMatch = selectedStatus === "all" || task.status === selectedStatus;
      return employeeMatch && statusMatch;
    });
  }, [tasks, selectedEmployee, selectedStatus]);

  const employeeStats = useMemo(() => {
    return EMPLOYEES.map((employee) => {
      const employeeTasks = tasks.filter((t) => t.employee_id === employee.id);
      const completed = employeeTasks.filter((t) => t.status === "مكتمل").length;
      const pending = employeeTasks.filter((t) => t.status === "جديد" || t.status === "جاري").length;
      const late = employeeTasks.filter((t) => t.status === "متأخر").length;
      const completionRate = employeeTasks.length > 0 
        ? Math.round((completed / employeeTasks.length) * 100) 
        : 0;
      
      return {
        ...employee,
        totalTasks: employeeTasks.length,
        completed,
        pending,
        late,
        completionRate,
      };
    });
  }, [tasks]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.title) {
      alert("من فضلك اختاري الموظف وعنوان المهمة.");
      return;
    }

    try {
      const payload = {
        employee_id: Number(formData.employeeId),
        title: formData.title,
        description: formData.description || null,
        due_date: formData.dueDate || null,
        task_month: Number(formData.taskMonth),
        task_year: Number(formData.taskYear),
        status: formData.status,
        priority: formData.priority,
      };

      if (editingId) {
        const { error } = await supabase
          .from("employee_tasks")
          .update(payload)
          .eq("id", editingId);

        if (error) {
          console.error(error);
          alert("حدث خطأ أثناء تعديل المهمة: " + error.message);
          return;
        }

        alert("تم تعديل المهمة بنجاح.");
      } else {
        const { error } = await supabase
          .from("employee_tasks")
          .insert(payload);

        if (error) {
          console.error(error);
          alert("حدث خطأ أثناء إضافة المهمة: " + error.message);
          return;
        }

        alert("تم إضافة المهمة بنجاح.");
      }

      await loadTasks();
      setShowForm(false);
      setEditingId(null);
      setFormData(defaultFormData);
    } catch (error) {
      console.error(error);
      alert("تعذر حفظ المهمة.");
    }
  };

  const handleEdit = (task) => {
    setEditingId(task.id);
    setFormData({
      employeeId: String(task.employee_id),
      title: task.title,
      description: task.description || "",
      dueDate: task.due_date || "",
      taskMonth: task.task_month || new Date().getMonth() + 1,
      taskYear: task.task_year || new Date().getFullYear(),
      status: task.status,
      priority: task.priority,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل تريدين حذف هذه المهمة؟")) return;

    try {
      const { error } = await supabase
        .from("employee_tasks")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف المهمة: " + error.message);
        return;
      }

      await loadTasks();
      alert("تم حذف المهمة بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف المهمة.");
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supabase
        .from("employee_tasks")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء تحديث الحالة: " + error.message);
        return;
      }

      await loadTasks();
    } catch (error) {
      console.error(error);
      alert("تعذر تحديث الحالة.");
    }
  };

  const getStatusInfo = (status) => {
    return TASK_STATUS.find((s) => s.value === status) || TASK_STATUS[0];
  };

  const getPriorityInfo = (priority) => {
    return PRIORITY_LEVELS.find((p) => p.value === priority) || PRIORITY_LEVELS[0];
  };

  const getCompletionColor = (rate) => {
    if (rate >= 80) return { bg: "#D1FAE5", color: "#047857", border: "#34D399" };
    if (rate >= 60) return { bg: "#FEF3C7", color: "#B45309", border: "#FBBF24" };
    if (rate >= 40) return { bg: "#FEE2E2", color: "#DC2626", border: "#F87171" };
    return { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" };
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل المهام...</div>
      </div>
    );
  }

  if (error && error.includes("جدول المهام غير موجود")) {
    return (
      <div style={styles.card}>
        <div style={{
          ...styles.errorBox,
          padding: "24px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
          <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px" }}>
            جدول المهام غير موجود
          </h3>
          <p style={{ marginBottom: "16px", lineHeight: "1.6" }}>
            يرجى تشغيل ملف <strong>create_employee_evaluations_table.sql</strong> في قاعدة البيانات لإنشاء جدول المهام.
          </p>
          <div style={{
            background: "#F8FAFC",
            padding: "16px",
            borderRadius: "8px",
            textAlign: "left",
            direction: "ltr",
            fontSize: "13px"
          }}>
            <code>psql -U your_username -d your_database -f create_employee_evaluations_table.sql</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>👥 مهام الموظفين</h2>
            <p style={styles.cardSub}>
              إدارة وتوزيع المهام على موظفي قسم الاستحقاقات
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={() => {
              setEditingId(null);
              setFormData(defaultFormData);
              setShowForm(true);
            }}
          >
            ＋ إضافة مهمة جديدة
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {/* إحصائيات الموظفين - تصميم بطاقات أنيق */}
        <div style={{ marginBottom: "32px" }}>
          <h3 style={{ 
            fontSize: "18px", 
            fontWeight: "700", 
            marginBottom: "20px", 
            color: "#1E293B",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span>📊</span> ملخص أداء الموظفين
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
          }}>
            {employeeStats.map((employee) => {
              const completionStyle = getCompletionColor(employee.completionRate);
              return (
                <div
                  key={employee.id}
                  style={{
                    padding: "24px",
                    borderRadius: "16px",
                    background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                    border: `2px solid ${completionStyle.border}`,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
                    <div style={{
                      fontSize: "48px",
                      marginRight: "16px",
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
                    }}>
                      👤
                    </div>
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

                  {/* شريط التقدم */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      marginBottom: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#64748B"
                    }}>
                      <span>نسبة الإنجاز</span>
                      <span style={{ color: completionStyle.color }}>{employee.completionRate}%</span>
                    </div>
                    <div style={{
                      height: "8px",
                      background: "#E2E8F0",
                      borderRadius: "4px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${employee.completionRate}%`,
                        background: `linear-gradient(90deg, ${completionStyle.color} 0%, ${completionStyle.border} 100%)`,
                        borderRadius: "4px",
                        transition: "width 0.3s ease"
                      }} />
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

        {/* فلاتر البحث - تصميم محسن */}
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
              🔍
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
              📋
            </span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ 
                ...styles.input, 
                padding: "8px 12px", 
                minWidth: "120px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1"
              }}
            >
              <option value="all">جميع الحالات</option>
              {TASK_STATUS.map((status) => (
                <option key={status.value} value={status.value}>{status.icon} {status.value}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#64748B" }}>
              👁️
            </span>
            <button
              onClick={() => setViewMode(viewMode === "cards" ? "table" : "cards")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                background: viewMode === "cards" ? "#3B82F6" : "#fff",
                color: viewMode === "cards" ? "#fff" : "#334155",
                fontWeight: "600",
                fontSize: "13px",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              {viewMode === "cards" ? "🃏 بطاقات" : "📊 جدول"}
            </button>
          </div>
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px"
        }}>
          <div style={styles.resultText}>
            عدد المهام: <strong>{filteredTasks.length}</strong>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div style={{
            ...styles.infoBox,
            padding: "40px",
            textAlign: "center",
            borderRadius: "16px"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "#64748B" }}>
              لا توجد مهام مطابقة للفلاتر المحددة
            </div>
          </div>
        ) : viewMode === "cards" ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px"
          }}>
            {filteredTasks.map((task) => {
              const employee = EMPLOYEES.find((e) => e.id === task.employee_id);
              const statusInfo = getStatusInfo(task.status);
              const priorityInfo = getPriorityInfo(task.priority);
              
              return (
                <div
                  key={task.id}
                  style={{
                    padding: "20px",
                    borderRadius: "16px",
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    transition: "all 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ fontSize: "32px" }}>👤</div>
                      <div>
                        <div style={{ fontWeight: "700", color: "#1E293B", fontSize: "14px" }}>
                          {employee?.name || "—"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748B" }}>
                          {formatDate(task.due_date)}
                        </div>
                      </div>
                    </div>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "700",
                      background: priorityInfo.bg,
                      color: priorityInfo.color,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      {priorityInfo.icon} {task.priority}
                    </span>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ 
                      fontWeight: "700", 
                      color: "#1E293B", 
                      fontSize: "16px",
                      marginBottom: "8px"
                    }}>
                      {task.title}
                    </div>
                    {task.description && (
                      <div style={{ 
                        fontSize: "13px", 
                        color: "#64748B",
                        lineHeight: "1.5"
                      }}>
                        {task.description}
                      </div>
                    )}
                  </div>

                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    paddingTop: "16px",
                    borderTop: "1px solid #E2E8F0"
                  }}>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                        background: statusInfo.bg,
                        color: statusInfo.color,
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer"
                      }}
                    >
                      {TASK_STATUS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.icon} {status.value}
                        </option>
                      ))}
                    </select>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleEdit(task)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "8px",
                          border: "1px solid #CBD5E1",
                          background: "#F8FAFC",
                          color: "#334155",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#E2E8F0";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#F8FAFC";
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "8px",
                          border: "1px solid #FECACA",
                          background: "#FEF2F2",
                          color: "#DC2626",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#FEE2E2";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#FEF2F2";
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>الموظف</th>
                  <th style={styles.th}>عنوان المهمة</th>
                  <th style={styles.th}>الوصف</th>
                  <th style={styles.th}>تاريخ الاستحقاق</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>الأولوية</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const employee = EMPLOYEES.find((e) => e.id === task.employee_id);
                  const statusInfo = getStatusInfo(task.status);
                  const priorityInfo = getPriorityInfo(task.priority);
                  
                  return (
                    <tr key={task.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "20px" }}>👤</span>
                          <strong>{employee?.name || "—"}</strong>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <strong>{task.title}</strong>
                      </td>
                      <td style={styles.td}>
                        {task.description || "—"}
                      </td>
                      <td style={styles.td}>
                        {formatDate(task.due_date)}
                      </td>
                      <td style={styles.td}>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "1px solid #E2E8F0",
                            background: statusInfo.bg,
                            color: statusInfo.color,
                            fontSize: "12px",
                            fontWeight: "700",
                          }}
                        >
                          {TASK_STATUS.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.icon} {status.value}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "12px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: priorityInfo.bg,
                            color: priorityInfo.color,
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            width: "fit-content"
                          }}
                        >
                          {priorityInfo.icon} {task.priority}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            style={{ ...styles.viewButton, padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleEdit(task)}
                            title="تعديل"
                          >
                            ✏️
                          </button>
                          <button
                            style={{ ...styles.deleteButton, padding: "4px 8px", fontSize: "11px" }}
                            onClick={() => handleDelete(task.id)}
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowForm(false)}
        >
          <div
            style={{ 
              ...styles.loginBox, 
              width: "min(520px, 95%)", 
              maxHeight: "90vh", 
              overflowY: "auto",
              borderRadius: "20px"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "48px", marginBottom: "16px", textAlign: "center" }}>
              📋
            </div>

            <h2 style={{ ...styles.loginTitle, textAlign: "center" }}>
              {editingId ? "تعديل المهمة" : "إضافة مهمة جديدة"}
            </h2>

            <p style={{ ...styles.loginDescription, textAlign: "center" }}>
              حددي الموظف والمهمة المطلوبة إنجازها
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ 
                  fontSize: "13px", 
                  fontWeight: "700", 
                  marginBottom: "8px", 
                  display: "block",
                  color: "#1E293B"
                }}>
                  👤 الموظف
                </label>
                <select
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  style={styles.input}
                  required
                >
                  <option value="">اختيار الموظف</option>
                  {EMPLOYEES.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ 
                  fontSize: "13px", 
                  fontWeight: "700", 
                  marginBottom: "8px", 
                  display: "block",
                  color: "#1E293B"
                }}>
                  📝 عنوان المهمة
                </label>
                <input
                  type="text"
                  placeholder="عنوان المهمة"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ 
                  fontSize: "13px", 
                  fontWeight: "700", 
                  marginBottom: "8px", 
                  display: "block",
                  color: "#1E293B"
                }}>
                  📄 وصف المهمة (اختياري)
                </label>
                <textarea
                  placeholder="تفاصيل المهمة..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ ...styles.input, minHeight: "100px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    fontSize: "13px", 
                    fontWeight: "700", 
                    marginBottom: "8px", 
                    display: "block",
                    color: "#1E293B"
                  }}>
                    📅 تاريخ الاستحقاق
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    fontSize: "13px", 
                    fontWeight: "700", 
                    marginBottom: "8px", 
                    display: "block",
                    color: "#1E293B"
                  }}>
                    ⚡ الأولوية
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    style={styles.input}
                  >
                    {PRIORITY_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.icon} {level.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    fontSize: "13px", 
                    fontWeight: "700", 
                    marginBottom: "8px", 
                    display: "block",
                    color: "#1E293B"
                  }}>
                    📆 الشهر
                  </label>
                  <select
                    value={formData.taskMonth}
                    onChange={(e) => setFormData({ ...formData, taskMonth: e.target.value })}
                    style={styles.input}
                    required
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"][i]}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ 
                    fontSize: "13px", 
                    fontWeight: "700", 
                    marginBottom: "8px", 
                    display: "block",
                    color: "#1E293B"
                  }}>
                    📅 السنة
                  </label>
                  <select
                    value={formData.taskYear}
                    onChange={(e) => setFormData({ ...formData, taskYear: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ 
                  fontSize: "13px", 
                  fontWeight: "700", 
                  marginBottom: "8px", 
                  display: "block",
                  color: "#1E293B"
                }}>
                  📊 الحالة
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={styles.input}
                >
                  {TASK_STATUS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.icon} {status.value}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                type="submit" 
                style={{
                  ...styles.loginButton,
                  width: "100%",
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: "700",
                  borderRadius: "12px"
                }}
              >
                {editingId ? "💾 حفظ التعديل" : "＋ إضافة المهمة"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
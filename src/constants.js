export const TASK_TYPES = [
  { id: "salaries", title: "استمارات المرتبات", icon: "💰", color: "#FEF3C7", frequency: "شهري" },
  { id: "bonuses", title: "المكافآت", icon: "🎁", color: "#FEE2E2", frequency: "شهري / حسب الورود" },
  { id: "orange", title: "فواتير أورانج", icon: "📱", color: "#FFEDD5", frequency: "حسب الورود" },
  { id: "legal", title: "القضايا والمطالبات", icon: "⚖️", color: "#ECE9FE", frequency: "حسب الحالة" },
  { id: "medical", title: "فواتير العلاج", icon: "🏥", color: "#DBEAFE", frequency: "حسب الورود" },
  { id: "insurance", title: "التأمينات", icon: "🛡️", color: "#D1FAE5", frequency: "حسب الحالة" },
  { id: "variable_wages", title: "الأجور المتغيرة", icon: "📖", color: "#E0F2FE", frequency: "حسب الطلب" },
  { id: "salary_statement", title: "مفردات المرتب", icon: "🧾", color: "#F3E8FF", frequency: "حسب الطلب" },
  { id: "care", title: "خدمة الرعاية", icon: "🤲", color: "#CCFBF1", frequency: "حسب الطلب" },
  { id: "fellowship", title: "الزمالة", icon: "🤝", color: "#DCFCE7", frequency: "حسب الحالة" },
  { id: "taxes", title: "إعارات", icon: "💼", color: "#FDE68A", frequency: "دوري" },
  { id: "staff_changes", title: "الإجازات الدراسية", icon: "🎓", color: "#F1F5F9", frequency: "حسب الوارد" },
];

export const STATUS = {
  not_started: { label: "لم يبدأ", icon: "⚪", color: "#64748B", bg: "#F1F5F9" },
  in_progress: { label: "جاري", icon: "🔵", color: "#2563EB", bg: "#DBEAFE" },
  waiting: { label: "في انتظار مستندات", icon: "🟡", color: "#B45309", bg: "#FEF3C7" },
  completed: { label: "تم التنفيذ", icon: "🟢", color: "#047857", bg: "#D1FAE5" },
  late: { label: "متأخر", icon: "🔴", color: "#DC2626", bg: "#FEE2E2" },
};
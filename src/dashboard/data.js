export const TASK_TYPES = [
  {
    id: "salaries",
    title: "استمارات المرتبات",
    icon: "💰",
    color: "#FEF3C7",
    frequency: "شهري",
  },
  {
    id: "bonuses",
    title: "المكافآت",
    icon: "🎁",
    color: "#FEE2E2",
    frequency: "شهري / حسب الورود",
  },
  {
    id: "orange",
    title: "فواتير أورانج",
    icon: "📱",
    color: "#FFEDD5",
    frequency: "حسب الورود",
  },
  {
    id: "legal",
    title: "القضايا والمطالبات",
    icon: "⚖️",
    color: "#ECE9FE",
    frequency: "حسب الحالة",
  },
  {
    id: "medical",
    title: "فواتير العلاج",
    icon: "🏥",
    color: "#DBEAFE",
    frequency: "حسب الورود",
  },
  {
    id: "insurance",
    title: "التأمينات",
    icon: "🛡️",
    color: "#D1FAE5",
    frequency: "حسب الحالة",
  },
  {
    id: "variable_wages",
    title: "الأجور المتغيرة",
    icon: "📑",
    color: "#E0F2FE",
    frequency: "حسب الطلب",
  },
  {
    id: "salary_statement",
    title: "مفردات المرتب",
    icon: "🧾",
    color: "#F3E8FF",
    frequency: "حسب الطلب",
  },
  {
    id: "faculty_salaries",
    title: "مرتبات هيئة التدريس",
    icon: "👨‍🏫",
    color: "#EDE9FE",
    frequency: "حسب الشهر",
  },
  {
    id: "care",
    title: "خدمة الرعاية",
    icon: "🤲",
    color: "#CCFBF1",
    frequency: "حسب الطلب",
  },
  {
    id: "fellowship",
    title: "الزمالة",
    icon: "🤝",
    color: "#DCFCE7",
    frequency: "حسب الحالة",
  },
  {
    id: "taxes",
    title: "إعارات",
    icon: "💼",
    color: "#FDE68A",
    frequency: "دوري",
  },
  {
    id: "staff_changes",
    title: "الإجازات الدراسية",
    icon: "🎓",
    color: "#F1F5F9",
    frequency: "حسب الوارد",
  },
  {
    id: "claims",
    title: "المطالبات",
    icon: "📋",
    color: "#E0F2FE",
    frequency: "حسب الورود",
  },
];

export const STATUS = {
  not_started: {
    label: "لم يبدأ",
    icon: "⚪",
    color: "#64748B",
    bg: "#F1F5F9",
  },
  in_progress: {
    label: "جاري",
    icon: "🔵",
    color: "#2563EB",
    bg: "#DBEAFE",
  },
  waiting: {
    label: "في انتظار مستندات",
    icon: "🟡",
    color: "#B45309",
    bg: "#FEF3C7",
  },
  completed: {
    label: "تم التنفيذ",
    icon: "🟢",
    color: "#047857",
    bg: "#D1FAE5",
  },
  late: {
    label: "متأخر",
    icon: "🔴",
    color: "#DC2626",
    bg: "#FEE2E2",
  },
};

export const MENU_ITEMS = [
  {
    id: "criteria",
    title: "المؤشرات",
    icon: "📈",
  },
  {
    id: "service_requests",
    title: "الطلبات الواردة",
    icon: "📥",
  },
  {
    id: "feedback",
    title: "الشكاوى والتقييمات",
    icon: "💬",
  },
  {
    id: "employee_performance",
    title: "تقييم أداء الموظفين",
    icon: "👥",
  },
  {
    id: "performance_dashboard",
    title: "تقييم الأداء الإلكتروني وخدمات المكتب",
    icon: "📊",
  },
  {
    id: "employee_profiles",
    title: "تقييم كل موظف",
    icon: "📁",
  },
  {
    id: "training_courses",
    title: "الدورات التدريبية",
    icon: "📚",
  },
  {
    id: "user_management",
    title: "إدارة المستخدمين",
    icon: "�",
  },
];

export const createEmptyTask = () => ({
  title: "",
  type: "salaries",
  responsible: "",
  receivedDate: new Date().toISOString().split("T")[0],
  dueDate: "",
  status: "not_started",
  reviewed: false,
  uploaded: false,
  notes: "",
});

export const createEmptyClaim = () => ({
  sheetName: "إضافة يدوية",
  claimantName: "",
  claimNumber: "",
  claimDate: new Date().toISOString().split("T")[0],
  amount: "",
  status: "",
  notes: "",
});

export const initialTasks = [
  {
    id: 1,
    title: "استمارة مرتبات شهر أغسطس",
    type: "salaries",
    responsible: "مسؤول المرتبات",
    receivedDate: "2026-08-01",
    dueDate: "2026-08-20",
    status: "completed",
    reviewed: true,
    uploaded: true,
    notes: "تمت المراجعة والرفع",
  },
  {
    id: 2,
    title: "فواتير أورانج للعاملين",
    type: "orange",
    responsible: "مسؤول الفواتير",
    receivedDate: "2026-08-18",
    dueDate: "",
    status: "in_progress",
    reviewed: false,
    uploaded: false,
    notes: "",
  },
];

export function mapTaskFromDatabase(row) {
  return {
    id: row.id,
    title: row.title || "",
    type: row.type || "salaries",
    responsible: row.responsible || "",
    receivedDate: row.received_date || "",
    dueDate: row.due_date || "",
    status: row.status || "not_started",
    reviewed: Boolean(row.reviewed),
    uploaded: Boolean(row.uploaded),
    notes: row.notes || "",
  };
}

export function mapTaskToDatabase(task) {
  return {
    title: task.title,
    type: task.type,
    responsible: task.responsible || null,
    received_date: task.receivedDate || null,
    due_date: task.dueDate || null,
    status: task.status || "not_started",
    reviewed: Boolean(task.reviewed),
    uploaded: Boolean(task.uploaded),
    notes: task.notes || null,
  };
}

export function getType(id) {
  return TASK_TYPES.find((type) => type.id === id);
}

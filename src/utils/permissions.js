// نظام الصلاحيات المستقل عن الأدوار والهيكل التنظيمي.
// تُخزَّن الصلاحيات في عمود users.permissions (jsonb array) وتُقرأ بعد تسجيل الدخول.
// القيمة NULL = حساب قديم بوصول كامل (توافق رجعي)، [] = لا توجد أي صلاحية.

export const PERMISSIONS = [
  { id: "letters", title: "حركة الخطابات", icon: "📨" },
  { id: "entitlements", title: "الاستحقاقات", icon: "💰" },
  { id: "requests", title: "الطلبات", icon: "📄" },
  { id: "reports", title: "التقارير", icon: "📊" },
  { id: "user_management", title: "إدارة المستخدمين", icon: "👥" },
  { id: "org_structure", title: "الهيكل التنظيمي", icon: "🏛️" },
  { id: "system_settings", title: "إعدادات النظام", icon: "⚙️" },
];

export const MENU_PERMISSION = {
  criteria: "reports",
  service_requests: "requests",
  feedback: "entitlements",
  employee_performance: "reports",
  performance_dashboard: "reports",
  employee_profiles: "reports",
  training_courses: "entitlements",
  user_management: "user_management",
  org_structure: "org_structure",
  connection_test: "system_settings",
  daily: "entitlements",
  weekly: "reports",
  monthly: "reports",
  claims: "entitlements",
  study_leaves: "entitlements",
  issues_management: "entitlements",
  faculty_salaries: "entitlements",
  faculty_salary_archive: "entitlements",
  employee_salary_archive: "entitlements",
  executive_orders_add: "entitlements",
  executive_orders_archive: "entitlements",
  letters_tracking: "letters",
};

export function hasPermission(user, permissionId) {
  if (!user) return false;
  if (user.permissions == null) return true;
  if (!Array.isArray(user.permissions)) return false;
  return user.permissions.includes(permissionId);
}

export function hasAnyPermission(user, permissionIds = []) {
  if (!user) return false;
  if (user.permissions == null) return true;
  if (!Array.isArray(user.permissions)) return false;
  return permissionIds.some((id) => user.permissions.includes(id));
}

export function canAccessMenu(user, menuId) {
  const permission = MENU_PERMISSION[menuId];
  if (!permission) return true;
  return hasPermission(user, permission);
}
// نظام الصلاحيات المستقل عن الأدوار والهيكل التنظيمي.
// تُخزَّن الصلاحيات في عمود users.permissions (jsonb array) وتُقرأ بعد تسجيل الدخول.
// القيمة NULL = حساب قديم بوصول كامل (توافق رجعي)، [] = لا توجد أي صلاحية.

export const PERMISSIONS = [
  { id: "letters", title: "حركة الخطابات", icon: "📨", group: "الأقسام" },
  { id: "entitlements", title: "الاستحقاقات", icon: "💰", group: "الأقسام" },
  { id: "requests", title: "الطلبات", icon: "📄", group: "الأقسام" },
  { id: "reports", title: "التقارير", icon: "📊", group: "الأقسام" },
  { id: "user_management", title: "إدارة المستخدمين", icon: "👥", group: "الإدارة" },
  { id: "org_structure", title: "الهيكل التنظيمي", icon: "🏛️", group: "الإدارة" },
  { id: "system_settings", title: "إعدادات النظام", icon: "⚙️", group: "الإدارة" },

  /* تبليغات هيئة التدريس — صلاحيات مستقلة */
  { id: "notifications_faculty_view", title: "تبليغات هيئة التدريس: عرض", icon: "👁️", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_create", title: "تبليغات هيئة التدريس: إنشاء", icon: "➕", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_edit", title: "تبليغات هيئة التدريس: تعديل", icon: "✏️", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_delete", title: "تبليغات هيئة التدريس: حذف", icon: "🗑️", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_review_entry", title: "تبليغات هيئة التدريس: مراجعة المدخل", icon: "🟡", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_review_final", title: "تبليغات هيئة التدريس: المراجعة النهائية", icon: "🟢", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_types", title: "تبليغات هيئة التدريس: إدارة الأنواع", icon: "🧩", group: "تبليغات هيئة التدريس" },
  { id: "notifications_faculty_admin", title: "تبليغات هيئة التدريس: إدارة كاملة", icon: "👑", group: "تبليغات هيئة التدريس" },

  /* تبليغات الموظفين — صلاحيات مستقلة */
  { id: "notifications_employees_view", title: "تبليغات الموظفين: عرض", icon: "👁️", group: "تبليغات الموظفين" },
  { id: "notifications_employees_create", title: "تبليغات الموظفين: إنشاء", icon: "➕", group: "تبليغات الموظفين" },
  { id: "notifications_employees_edit", title: "تبليغات الموظفين: تعديل", icon: "✏️", group: "تبليغات الموظفين" },
  { id: "notifications_employees_delete", title: "تبليغات الموظفين: حذف", icon: "🗑️", group: "تبليغات الموظفين" },
  { id: "notifications_employees_review_entry", title: "تبليغات الموظفين: مراجعة المدخل", icon: "🟡", group: "تبليغات الموظفين" },
  { id: "notifications_employees_review_final", title: "تبليغات الموظفين: المراجعة النهائية", icon: "🟢", group: "تبليغات الموظفين" },
  { id: "notifications_employees_types", title: "تبليغات الموظفين: إدارة الأنواع", icon: "🧩", group: "تبليغات الموظفين" },
  { id: "notifications_employees_admin", title: "تبليغات الموظفين: إدارة كاملة", icon: "👑", group: "تبليغات الموظفين" },

  /* تبليغات العقود — صلاحيات مستقلة */
  { id: "notifications_contracts_view", title: "تبليغات العقود: عرض", icon: "👁️", group: "تبليغات العقود" },
  { id: "notifications_contracts_create", title: "تبليغات العقود: إنشاء", icon: "➕", group: "تبليغات العقود" },
  { id: "notifications_contracts_edit", title: "تبليغات العقود: تعديل", icon: "✏️", group: "تبليغات العقود" },
  { id: "notifications_contracts_delete", title: "تبليغات العقود: حذف", icon: "🗑️", group: "تبليغات العقود" },
  { id: "notifications_contracts_review_entry", title: "تبليغات العقود: مراجعة المدخل", icon: "🟡", group: "تبليغات العقود" },
  { id: "notifications_contracts_review_final", title: "تبليغات العقود: المراجعة النهائية", icon: "🟢", group: "تبليغات العقود" },
  { id: "notifications_contracts_types", title: "تبليغات العقود: إدارة الأنواع", icon: "🧩", group: "تبليغات العقود" },
  { id: "notifications_contracts_admin", title: "تبليغات العقود: إدارة كاملة", icon: "👑", group: "تبليغات العقود" },
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
  notifications_faculty: "notifications_faculty_view",
  notifications_employees: "notifications_employees_view",
  notifications_contracts: "notifications_contracts_view",
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

const NOTIFICATION_MENU_SECTION = {
  notifications_faculty: "faculty",
  notifications_employees: "employees",
  notifications_contracts: "contracts",
};

export function canAccessMenu(user, menuId) {
  const section = NOTIFICATION_MENU_SECTION[menuId];
  if (section) {
    /* أي صلاحية داخل قسم التبليغات تمنح الوصول للعرض،
       لكنها لا تمنح أي صلاحية أخرى داخل القسم. */
    if (!user) return false;
    if (user.permissions == null) return true;
    if (!Array.isArray(user.permissions)) return false;
    const prefix = `notifications_${section}_`;
    return user.permissions.some((permission) =>
      String(permission).startsWith(prefix)
    );
  }

  const permission = MENU_PERMISSION[menuId];
  if (!permission) return true;
  return hasPermission(user, permission);
}

// مسؤول الدعم الفني: منشئ البرنامج فقط (حساب horia).
// تبويب "إدارة الدعم الفني" وعدّاد الطلبات الإدارية متاحان حصريًا له.
export function canManageSupport(user) {
  if (!user) return false;
  const username = String(user.username || "").toLowerCase().trim();
  return username === "horia";
}
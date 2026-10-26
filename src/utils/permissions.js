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
  { id: "monthly_reports", title: "التبليغات الشهرية", icon: "📝" },

  /* تبليغات هيئة التدريس — صلاحيات مستقلة */
  { id: "notifications_faculty_view", title: "تبليغات هيئة التدريس: عرض", icon: "👁️" },
  { id: "notifications_faculty_create", title: "تبليغات هيئة التدريس: إنشاء", icon: "➕" },
  { id: "notifications_faculty_edit", title: "تبليغات هيئة التدريس: تعديل", icon: "✏️" },
  { id: "notifications_faculty_delete", title: "تبليغات هيئة التدريس: حذف", icon: "🗑️" },
  { id: "notifications_faculty_review_entry", title: "تبليغات هيئة التدريس: مراجعة المدخل", icon: "🟡" },
  { id: "notifications_faculty_review_final", title: "تبليغات هيئة التدريس: المراجعة النهائية", icon: "🟢" },
  { id: "notifications_faculty_types", title: "تبليغات هيئة التدريس: إدارة الأنواع", icon: "🧩" },
  { id: "notifications_faculty_admin", title: "تبليغات هيئة التدريس: إدارة كاملة", icon: "👑" },

  /* تبليغات الموظفين — صلاحيات مستقلة */
  { id: "notifications_employees_view", title: "تبليغات الموظفين: عرض", icon: "👁️" },
  { id: "notifications_employees_create", title: "تبليغات الموظفين: إنشاء", icon: "➕" },
  { id: "notifications_employees_edit", title: "تبليغات الموظفين: تعديل", icon: "✏️" },
  { id: "notifications_employees_delete", title: "تبليغات الموظفين: حذف", icon: "🗑️" },
  { id: "notifications_employees_review_entry", title: "تبليغات الموظفين: مراجعة المدخل", icon: "🟡" },
  { id: "notifications_employees_review_final", title: "تبليغات الموظفين: المراجعة النهائية", icon: "🟢" },
  { id: "notifications_employees_types", title: "تبليغات الموظفين: إدارة الأنواع", icon: "🧩" },
  { id: "notifications_employees_admin", title: "تبليغات الموظفين: إدارة كاملة", icon: "👑" },

  /* تبليغات العقود — صلاحيات مستقلة */
  { id: "notifications_contracts_view", title: "تبليغات العقود: عرض", icon: "👁️" },
  { id: "notifications_contracts_create", title: "تبليغات العقود: إنشاء", icon: "➕" },
  { id: "notifications_contracts_edit", title: "تبليغات العقود: تعديل", icon: "✏️" },
  { id: "notifications_contracts_delete", title: "تبليغات العقود: حذف", icon: "🗑️" },
  { id: "notifications_contracts_review_entry", title: "تبليغات العقود: مراجعة المدخل", icon: "🟡" },
  { id: "notifications_contracts_review_final", title: "تبليغات العقود: المراجعة النهائية", icon: "🟢" },
  { id: "notifications_contracts_types", title: "تبليغات العقود: إدارة الأنواع", icon: "🧩" },
  { id: "notifications_contracts_admin", title: "تبليغات العقود: إدارة كاملة", icon: "👑" },
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
  faculty_smart_archive: "entitlements",
  employee_salary_archive: "entitlements",
  executive_orders_add: "entitlements",
  executive_orders_archive: "entitlements",
  letters_tracking: "letters",
  monthly_reports: "monthly_reports",
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

// ============================================================================
// أدوار تبليغات هيئة التدريس
// ============================================================================

export const FACULTY_NOTIFICATION_ROLES = {
  CREATOR: "creator",
  INPUT_REVIEWER: "input_reviewer",
  FINAL_REVIEWER: "final_reviewer",
};

export const FACULTY_NOTIFICATION_ROLE_LABELS = {
  [FACULTY_NOTIFICATION_ROLES.CREATOR]: "منشئ التبليغ",
  [FACULTY_NOTIFICATION_ROLES.INPUT_REVIEWER]: "مدخل البيرول",
  [FACULTY_NOTIFICATION_ROLES.FINAL_REVIEWER]: "مراجع البيرول",
};

/**
 * التحقق من دور المستخدم في تبليغات هيئة التدريس
 * الدور يُخزّن في عمود users.faculty_notification_role
 */
export function getFacultyNotificationRole(user) {
  if (!user) return null;
  return user.faculty_notification_role || null;
}

/**
 * هل المستخدم منشئ تبليغ؟
 */
export function isFacultyNotificationCreator(user) {
  return getFacultyNotificationRole(user) === FACULTY_NOTIFICATION_ROLES.CREATOR;
}

/**
 * هل المستخدم مدخل بيرول؟
 */
export function isFacultyNotificationInputReviewer(user) {
  return getFacultyNotificationRole(user) === FACULTY_NOTIFICATION_ROLES.INPUT_REVIEWER;
}

/**
 * هل المستخدم مراجع بيرول نهائي؟
 */
export function isFacultyNotificationFinalReviewer(user) {
  return getFacultyNotificationRole(user) === FACULTY_NOTIFICATION_ROLES.FINAL_REVIEWER;
}

/**
 * هل يمكن للمستخدم إكمال مرحلة الإدخال والمراجعة؟
 */
export function canCompleteInputStage(user) {
  return isFacultyNotificationInputReviewer(user);
}

/**
 * هل يمكن للمستخدم إكمال المراجعة النهائية؟
 */
export function canCompleteReviewStage(user) {
  return isFacultyNotificationFinalReviewer(user);
}

/**
 * هل يمكن للمستخدم إنشاء تبليغات جديدة؟
 */
export function canCreateFacultyNotification(user) {
  return isFacultyNotificationCreator(user);
}

/**
 * هل يمكن للمستخدم إعادة التبليغ للتصحيح؟
 */
export function canReturnForCorrection(user) {
  return isFacultyNotificationInputReviewer(user) || isFacultyNotificationFinalReviewer(user);
}
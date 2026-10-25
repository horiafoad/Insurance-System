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
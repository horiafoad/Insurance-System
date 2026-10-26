/* ------------------------------------------------------------------
   notificationPermissions.js
   صلاحيات تبليغات منفصلة تمامًا لكل قسم ولكل مرحلة.

   الصلاحيات تُخزَّن في users.permissions (نفس نظام الصلاحيات الحالي).
   وجود permissions = null يعني حسابًا قديمًا بوصول كامل (توافق رجعي).
   امتلاك صلاحية واحدة لا يمنح أي صلاحية أخرى.
------------------------------------------------------------------ */

import { NOTIFICATION_SECTION_LIST } from "../dashboard/notificationsConfig";

export const NOTIFICATION_CAPABILITIES = {
  view: "view",
  create: "create",
  edit: "edit",
  delete: "delete",
  reviewEntry: "review_entry",
  reviewFinal: "review_final",
  types: "types",
  admin: "admin",
};

export const NOTIFICATION_CAPABILITY_LABELS = {
  view: "عرض التبليغات",
  create: "إنشاء تبليغ",
  edit: "تعديل التبليغ",
  delete: "حذف التبليغ",
  review_entry: "مراجعة مدخل البيرول",
  review_final: "المراجعة النهائية",
  types: "إدارة أنواع التبليغات",
  admin: "إدارة كاملة للقسم",
};

export function notificationPermissionId(section, capability) {
  return `notifications_${section}_${capability}`;
}

export function notificationPermissionIds(section) {
  return Object.keys(NOTIFICATION_CAPABILITY_LABELS).map((capability) =>
    notificationPermissionId(section, capability)
  );
}

function permissionList(user) {
  if (!user) return [];
  if (!Array.isArray(user.permissions)) return [];
  return user.permissions.map((value) => String(value));
}

function isFullAccessUser(user) {
  if (!user) return false;
  if (user.permissions == null) return true;
  return user.role === "super_admin" || user.role === "creator";
}

export function canNotification(user, section, capability) {
  if (!user) return false;
  if (isFullAccessUser(user)) return true;

  const prefix = `notifications_${section}_`;
  const permissions = permissionList(user);

  if (permissions.includes(`${prefix}admin`)) return true;

  if (permissions.includes(`${prefix}${capability}`)) return true;

  /* أي صلاحية في القسم تمنح العرض، لكنها لا تمنح أي صلاحية أخرى */
  if (capability === NOTIFICATION_CAPABILITIES.view) {
    return permissions.some((permission) => permission.startsWith(prefix));
  }

  return false;
}

export function canViewSection(user, section) {
  return canNotification(user, section, NOTIFICATION_CAPABILITIES.view);
}

export function canCreateReport(user, section) {
  return canNotification(user, section, NOTIFICATION_CAPABILITIES.create);
}

export function canEditReport(user, section, report) {
  if (!report) return false;
  if (canNotification(user, section, NOTIFICATION_CAPABILITIES.admin)) return true;
  if (!canNotification(user, section, NOTIFICATION_CAPABILITIES.edit)) return false;
  if (String(report.created_by || "") !== String(user?.id || "")) return false;
  return ["draft", "pending_entry", "rejected"].includes(report.status);
}

export function canDeleteReport(user, section, report) {
  if (!report) return false;
  if (canNotification(user, section, NOTIFICATION_CAPABILITIES.admin)) return true;
  if (!canNotification(user, section, NOTIFICATION_CAPABILITIES.delete)) return false;
  if (String(report.created_by || "") !== String(user?.id || "")) return false;
  return ["draft", "pending_entry", "rejected"].includes(report.status);
}

export function canReviewEntry(user, section) {
  return canNotification(user, section, NOTIFICATION_CAPABILITIES.reviewEntry);
}

export function canReviewFinal(user, section) {
  return canNotification(user, section, NOTIFICATION_CAPABILITIES.reviewFinal);
}

export function canManageTypes(user, section) {
  return (
    canNotification(user, section, NOTIFICATION_CAPABILITIES.types) ||
    canNotification(user, section, NOTIFICATION_CAPABILITIES.admin)
  );
}

export function canManageMembers(user, section) {
  return (
    canManageTypes(user, section) ||
    canNotification(user, section, NOTIFICATION_CAPABILITIES.admin)
  );
}

export function canSeeTypesTab(user, section) {
  return canManageTypes(user, section);
}

/* الصلاحيات المقترحة عند اختيار دور من أدوار التبليغات في إدارة المستخدمين.
   لا تُمنح تلقائيًا وقت التشغيل — مجرد تعبئة مريحة للمسؤول. */
export const NOTIFICATION_ROLES = {
  notifications_creator: {
    label: "منشئ التبليغ",
    description: "إنشاء وتعديل وحذف تبليغاته أثناء فترة العمل",
    capabilities: ["view", "create", "edit", "delete"],
  },
  payroll_entry: {
    label: "مدخل البيرول",
    description: "مراجعة التبليغات وتسجيل إتمام مرحلة المدخل",
    capabilities: ["view", "review_entry"],
  },
  payroll_reviewer: {
    label: "مراجع البيرول",
    description: "إتمام المراجعة النهائية بعد مدخل البيرول",
    capabilities: ["view", "review_final"],
  },
  notifications_admin: {
    label: "مدير التبليغات",
    description: "إدارة كاملة للتبليغات وأنواعها في الأقسام الثلاثة",
    capabilities: ["view", "admin"],
  },
};

export function isNotificationRole(role) {
  return Boolean(NOTIFICATION_ROLES[role]);
}

export function recommendedNotificationPermissions(role) {
  const definition = NOTIFICATION_ROLES[role];
  if (!definition) return [];
  return NOTIFICATION_SECTION_LIST.flatMap((section) =>
    definition.capabilities.map((capability) =>
      notificationPermissionId(section.id, capability)
    )
  );
}

/* يضمن أن أي صلاحية تبليغات في قسم ما تسبقها صلاحية العرض */
export function normalizeNotificationPermissions(permissions) {
  const values = new Set(Array.isArray(permissions) ? permissions : []);
  NOTIFICATION_SECTION_LIST.forEach((section) => {
    const prefix = `notifications_${section.id}_`;
    const hasAny = [...values].some((permission) => permission.startsWith(prefix));
    if (hasAny) values.add(`${prefix}view`);
  });
  return [...values];
}

// ============================================================================
// facultyNotificationsService.js
// ---------------------------------------------------------------------------
// طبقة الوصول للبيانات الخاصة بـ«تبليغات هيئة التدريس».
// كل استعلامات Supabase الخاصة بهذه الصفحة في هذا الملف.
//
// أنواع التبليغات:
//   • salary_payment        - صرف مرتب
//   • salary_stop           - وقف مرتب
//   • payment_method_change - تغيير طريقة الدفع
//   • study_leave_with_salary - إجازة دراسية بمرتب
//   • deduction             - خصومات
//   • promotion             - ترقية
//
// حالات سير العمل:
//   • new                   - جديد
//   • awaiting_input        - بانتظار مدخل البيرول
//   • input_completed       - تم الإدخال والمراجعة
//   • awaiting_review       - بانتظار المراجع النهائي
//   • review_completed      - تمت المراجعة النهائية
//   • returned_for_correction - معاد للتصحيح
// ============================================================================

import { supabase } from "../supabaseClient";
import {
  uploadFile,
  deleteFile as storageDeleteFile,
  openFile,
  downloadFileToDisk,
} from "./fileStorage";
import { fetchMembers } from "./facultyArchiveService";

export const FACULTY_NOTIFICATIONS_TABLE = "faculty_notifications";
export const FACULTY_MEMBERS_TABLE = "faculty_members";

// ----------------------------------------------------------------------------
// أنواع التبليغات
// ----------------------------------------------------------------------------
export const NOTIFICATION_TYPES = {
  SALARY_PAYMENT: "salary_payment",
  SALARY_STOP: "salary_stop",
  PAYMENT_METHOD_CHANGE: "payment_method_change",
  STUDY_LEAVE_WITH_SALARY: "study_leave_with_salary",
  DEDUCTION: "deduction",
  PROMOTION: "promotion",
};

export const NOTIFICATION_TYPES_LABELS = {
  [NOTIFICATION_TYPES.SALARY_PAYMENT]: "صرف مرتب",
  [NOTIFICATION_TYPES.SALARY_STOP]: "وقف مرتب",
  [NOTIFICATION_TYPES.PAYMENT_METHOD_CHANGE]: "تغيير طريقة الدفع",
  [NOTIFICATION_TYPES.STUDY_LEAVE_WITH_SALARY]: "إجازة دراسية بمرتب",
  [NOTIFICATION_TYPES.DEDUCTION]: "الخصومات",
  [NOTIFICATION_TYPES.PROMOTION]: "الترقية",
};

// أسباب وقف المرتب
export const SALARY_STOP_REASONS = [
  "استقالة",
  "وفاة",
  "إعارة داخلية",
  "إعارة خارجية",
  "مهمة علمية بدون مرتب",
  "إجازة دراسية بدون مرتب",
  "رعاية طفل",
];

// أنواع الخصومات
export const DEDUCTION_TYPES = [
  "خصم رعاية طبية",
  "خصم صندوق زمالة",
  "خصم ضرائب",
];

// الدرجات العلمية للترقية
export const ACADEMIC_GRADES = [
  "معيد",
  "مدرس مساعد",
  "مدرس",
  "أستاذ مساعد",
  "أستاذ",
];

// حالات سير العمل
export const WORKFLOW_STATUS = {
  NEW: "new",
  AWAITING_INPUT: "awaiting_input",
  INPUT_COMPLETED: "input_completed",
  AWAITING_REVIEW: "awaiting_review",
  REVIEW_COMPLETED: "review_completed",
  RETURNED_FOR_CORRECTION: "returned_for_correction",
};

export const WORKFLOW_STATUS_LABELS = {
  [WORKFLOW_STATUS.NEW]: "جديد",
  [WORKFLOW_STATUS.AWAITING_INPUT]: "بانتظار مدخل البيرول",
  [WORKFLOW_STATUS.INPUT_COMPLETED]: "تم الإدخال والمراجعة",
  [WORKFLOW_STATUS.AWAITING_REVIEW]: "بانتظار المراجع النهائي",
  [WORKFLOW_STATUS.REVIEW_COMPLETED]: "تمت المراجعة النهائية",
  [WORKFLOW_STATUS.RETURNED_FOR_CORRECTION]: "معاد للتصحيح",
};

// ----------------------------------------------------------------------------
// تحويل الصفوف
// ----------------------------------------------------------------------------
export function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    facultyMemberId: row.faculty_member_id,
    notificationType: row.notification_type,
    payrollMonth: row.payroll_month,
    payrollYear: row.payroll_year,
    notificationData: row.notification_data || {},
    decisionNumber: row.decision_number,
    decisionDate: row.decision_date,
    effectiveDate: row.effective_date,
    notes: row.notes,
    pdfUrl: row.pdf_url,
    pdfFileName: row.pdf_file_name,
    pdfStorageProvider: row.pdf_storage_provider,
    pdfStorageKey: row.pdf_storage_key,
    pdfUploadedAt: row.pdf_uploaded_at,
    pdfUploadedBy: row.pdf_uploaded_by,
    hasPdf: Boolean(row.pdf_url),
    workflowStatus: row.workflow_status,
    inputBy: row.input_by,
    inputAt: row.input_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    returnReason: row.return_reason,
    returnReasonDetail: row.return_reason_detail,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedById: row.updated_by_id,
    updatedByName: row.updated_by_name,
    updatedAt: row.updated_at,
  };
}

export function mapNotificationToRow(notification) {
  return {
    faculty_member_id: notification.facultyMemberId || null,
    notification_type: notification.notificationType,
    payroll_month: notification.payrollMonth,
    payroll_year: notification.payrollYear,
    notification_data: notification.notificationData || {},
    decision_number: notification.decisionNumber || null,
    decision_date: notification.decisionDate || null,
    effective_date: notification.effectiveDate || null,
    notes: notification.notes || null,
    pdf_url: notification.pdfUrl || null,
    pdf_file_name: notification.pdfFileName || null,
    pdf_storage_provider: notification.pdfStorageProvider || null,
    pdf_storage_key: notification.pdfStorageKey || null,
    pdf_uploaded_at: notification.pdfUploadedAt || null,
    pdf_uploaded_by: notification.pdfUploadedBy || null,
    workflow_status: notification.workflowStatus || WORKFLOW_STATUS.NEW,
    input_by: notification.inputBy || null,
    input_at: notification.inputAt || null,
    reviewed_by: notification.reviewedBy || null,
    reviewed_at: notification.reviewedAt || null,
    return_reason: notification.returnReason || null,
    return_reason_detail: notification.returnReasonDetail || null,
    created_by_id: notification.createdById || null,
    created_by_name: notification.createdByName,
    updated_by_id: notification.updatedById || null,
    updated_by_name: notification.updatedByName,
  };
}

// ----------------------------------------------------------------------------
// قراءة البيانات
// ----------------------------------------------------------------------------
export async function fetchNotifications(filters = {}) {
  let query = supabase.from(FACULTY_NOTIFICATIONS_TABLE).select("*");

  if (filters.year && filters.month) {
    query = query.eq("payroll_year", filters.year).eq("payroll_month", filters.month);
  }

  if (filters.facultyMemberId) {
    query = query.eq("faculty_member_id", filters.facultyMemberId);
  }

  if (filters.type) {
    query = query.eq("notification_type", filters.type);
  }

  if (filters.status) {
    query = query.eq("workflow_status", filters.status);
  }

  if (filters.createdById) {
    query = query.eq("created_by_id", filters.createdById);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapNotificationRow);
}

export async function fetchNotificationById(id) {
  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return mapNotificationRow(data);
}

export async function fetchNotificationStats(year, month) {
  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .select("workflow_status")
    .eq("payroll_year", year)
    .eq("payroll_month", month);

  if (error) throw error;

  const stats = {
    total: 0,
    new: 0,
    awaitingInput: 0,
    inputCompleted: 0,
    awaitingReview: 0,
    reviewCompleted: 0,
    returnedForCorrection: 0,
  };

  (data || []).forEach((row) => {
    stats.total++;
    if (row.workflow_status === WORKFLOW_STATUS.NEW) stats.new++;
    else if (row.workflow_status === WORKFLOW_STATUS.AWAITING_INPUT) stats.awaitingInput++;
    else if (row.workflow_status === WORKFLOW_STATUS.INPUT_COMPLETED) stats.inputCompleted++;
    else if (row.workflow_status === WORKFLOW_STATUS.AWAITING_REVIEW) stats.awaitingReview++;
    else if (row.workflow_status === WORKFLOW_STATUS.REVIEW_COMPLETED) stats.reviewCompleted++;
    else if (row.workflow_status === WORKFLOW_STATUS.RETURNED_FOR_CORRECTION) stats.returnedForCorrection++;
  });

  return stats;
}

// ----------------------------------------------------------------------------
// إنشاء التبليغات
// ----------------------------------------------------------------------------
export async function createNotification(notification, { user = null } = {}) {
  if (!notification.notificationType) {
    throw new Error("نوع التبليغ مطلوب.");
  }

  if (!notification.payrollMonth || !notification.payrollYear) {
    throw new Error("شهر البيرول والسنة مطلوبان.");
  }

  const row = {
    ...mapNotificationToRow(notification),
    created_by_id: user?.id || null,
    created_by_name: user?.full_name || user?.username || "مستخدم",
    workflow_status: WORKFLOW_STATUS.NEW,
  };

  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return mapNotificationRow(data);
}

// ----------------------------------------------------------------------------
// تحديث التبليغات
// ----------------------------------------------------------------------------
export async function updateNotification(id, updates, { user = null } = {}) {
  const row = {
    ...mapNotificationToRow(updates),
    updated_by_id: user?.id || null,
    updated_by_name: user?.full_name || user?.username || null,
  };

  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return mapNotificationRow(data);
}

export async function deleteNotification(id) {
  const { error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ----------------------------------------------------------------------------
// سير العمل الصلاحيات
// ----------------------------------------------------------------------------
export async function submitForInput(id, { user = null } = {}) {
  return updateNotification(
    id,
    {
      workflowStatus: WORKFLOW_STATUS.AWAITING_INPUT,
    },
    { user }
  );
}

export async function completeInput(id, { user = null } = {}) {
  return updateNotification(
    id,
    {
      workflowStatus: WORKFLOW_STATUS.INPUT_COMPLETED,
      inputBy: user?.full_name || user?.username || null,
      inputAt: new Date().toISOString(),
    },
    { user }
  );
}

export async function completeReview(id, { user = null } = {}) {
  return updateNotification(
    id,
    {
      workflowStatus: WORKFLOW_STATUS.REVIEW_COMPLETED,
      reviewedBy: user?.full_name || user?.username || null,
      reviewedAt: new Date().toISOString(),
    },
    { user }
  );
}

export async function returnForCorrection(id, reason, detail = "", { user = null } = {}) {
  return updateNotification(
    id,
    {
      workflowStatus: WORKFLOW_STATUS.RETURNED_FOR_CORRECTION,
      returnReason: reason,
      returnReasonDetail: detail,
    },
    { user }
  );
}

// ----------------------------------------------------------------------------
// مرفقات PDF
// ----------------------------------------------------------------------------
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

export function validatePdfFile(file) {
  if (!file) return "لم يتم اختيار ملف.";
  const isPdf =
    file.type === "application/pdf" || /\.pdf$/i.test(String(file.name || ""));
  if (!isPdf) return "الملف يجب أن يكون PDF فقط.";
  if (file.size > MAX_PDF_BYTES) {
    return `حجم الملف أكبر من الحد المسموح (${Math.round(
      MAX_PDF_BYTES / (1024 * 1024)
    )} ميجابايت).`;
  }
  if (!file.size) return "الملف فارغ.";
  return "";
}

export async function attachNotificationPdf(notification, file, { user = null } = {}) {
  if (!notification?.id) throw new Error("احفظ التبليغ أولًا ثم أرفق الملف.");
  const invalid = validatePdfFile(file);
  if (invalid) throw new Error(invalid);

  const oldUrl = notification.pdfUrl;
  const oldKey = notification.pdfStorageKey;

  const safeName = String(file.name || "file.pdf")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .slice(-80);
  const path = `faculty-notifications/${notification.id}/${Date.now()}-${safeName}`;

  const saved = await uploadFile("executive-orders", path, file, {
    contentType: "application/pdf",
    upsert: true,
  });

  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .update({
      pdf_url: saved.url,
      pdf_file_name: file.name || safeName,
      pdf_storage_provider: saved.provider,
      pdf_storage_key: saved.key,
      pdf_uploaded_at: new Date().toISOString(),
      pdf_uploaded_by: user?.full_name || user?.username || null,
    })
    .eq("id", notification.id)
    .select()
    .single();

  if (error) {
    // لا نترك ملفًا يتيمًا لو فشل تحديث القاعدة
    try {
      await storageDeleteFile(saved.url, { path: saved.key });
    } catch {
      /* تجاهل */
    }
    throw error;
  }

  if (oldUrl && oldUrl !== saved.url) {
    try {
      await storageDeleteFile(oldUrl, { path: oldKey });
    } catch {
      /* الملف القديم قد يكون محذوفًا */
    }
  }

  return mapNotificationRow(data);
}

export async function openNotificationPdf(notification) {
  if (!notification?.pdfUrl) throw new Error("لا يوجد ملف PDF لهذا التبليغ.");
  return openFile(notification.pdfUrl, { path: notification.pdfStorageKey });
}

export async function downloadNotificationPdf(notification) {
  if (!notification?.pdfUrl) throw new Error("لا يوجد ملف PDF لهذا التبليغ.");
  const name =
    notification.pdfFileName ||
    `notification-${notification.facultyMemberId || notification.id}.pdf`;
  await downloadFileToDisk(notification.pdfUrl, name, {
    path: notification.pdfStorageKey,
  });
}

export async function deleteNotificationPdf(notification) {
  if (!notification?.id) throw new Error("معرّف التبليغ غير موجود.");
  if (notification.pdfUrl) {
    try {
      await storageDeleteFile(notification.pdfUrl, {
        path: notification.pdfStorageKey,
      });
    } catch (error) {
      console.warn("تعذر حذف ملف PDF:", error);
    }
  }
  const { data, error } = await supabase
    .from(FACULTY_NOTIFICATIONS_TABLE)
    .update({
      pdf_url: null,
      pdf_file_name: null,
      pdf_storage_provider: null,
      pdf_storage_key: null,
      pdf_uploaded_at: null,
      pdf_uploaded_by: null,
    })
    .eq("id", notification.id)
    .select()
    .single();

  if (error) throw error;
  return mapNotificationRow(data);
}

// ----------------------------------------------------------------------------
// دوال مساعدة للترقية
// ----------------------------------------------------------------------------
export function getNextAcademicGrade(currentGrade) {
  const index = ACADEMIC_GRADES.indexOf(currentGrade);
  if (index === -1) return null;
  if (index >= ACADEMIC_GRADES.length - 1) return null; // أستاذ لا يوجد درجة أعلى
  return ACADEMIC_GRADES[index + 1];
}

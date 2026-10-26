import { supabase } from "../../supabaseClient";

/**
 * خدمة إدارة تبليغات هيئة التدريس
 * تتعامل مع رفع ملفات Excel، المطابقة مع الأرشيف، وإدارة التبليغات
 */

export const NOTIFICATION_TYPES = {
  SALARY_PAYMENT: "صرف مرتب",
  SALARY_STOP: "وقف مرتب",
  PAYMENT_METHOD_CHANGE: "تغيير طريقة الدفع",
  STUDY_LEAVE_WITH_SALARY: "إجازة دراسية بمرتب",
  DEDUCTION: "خصومات",
  PROMOTION: "ترقية",
};

export const SALARY_STOP_REASONS = [
  "استقالة",
  "وفاة",
  "إعارة داخلية",
  "إعارة خارجية",
  "مهمة علمية بدون مرتب",
  "إجازة دراسية بدون مرتب",
  "رعاية طفل",
];

export const DEDUCTION_TYPES = [
  "خصم رعاية طبية",
  "خصم صندوق زمالة",
  "خصم ضرائب",
];

export const ACADEMIC_GRADES = [
  "معيد",
  "مدرس مساعد",
  "مدرس",
  "أستاذ مساعد",
  "أستاذ",
];

export const WORKFLOW_STATUS = {
  NEW: "جديد",
  SENT_TO_INPUT: "مرسل للمراجعة",
  PENDING_INPUT: "بانتظار مدخل البيرول",
  INPUT_COMPLETED: "تم الإدخال والمراجعة",
  PENDING_REVIEW: "بانتظار المراجع النهائي",
  REVIEW_COMPLETED: "تمت المراجعة النهائية",
  RETURNED_FOR_CORRECTION: "معاد للتصحيح",
};

export const WORKFLOW_STATUS_LABELS = {
  [WORKFLOW_STATUS.NEW]: "جديد",
  [WORKFLOW_STATUS.SENT_TO_INPUT]: "مرسل للمراجعة",
  [WORKFLOW_STATUS.PENDING_INPUT]: "بانتظار مدخل البيرول",
  [WORKFLOW_STATUS.INPUT_COMPLETED]: "تم الإدخال والمراجعة",
  [WORKFLOW_STATUS.PENDING_REVIEW]: "بانتظار المراجع النهائي",
  [WORKFLOW_STATUS.REVIEW_COMPLETED]: "تمت المراجعة النهائية",
  [WORKFLOW_STATUS.RETURNED_FOR_CORRECTION]: "معاد للتصحيح",
};

export function getNextAcademicGrade(currentGrade) {
  const index = ACADEMIC_GRADES.indexOf(currentGrade);
  if (index !== -1 && index < ACADEMIC_GRADES.length - 1) {
    return ACADEMIC_GRADES[index + 1];
  }
  return null;
}

/**
 * جلب قائمة أعضاء هيئة التدريس من الأرشيف الذكي (الفهرس الأساسي)
 * للمطابقة مع ملفات Excel
 */
export async function fetchFacultyFromArchive() {
  const { data, error } = await supabase
    .from("faculty_members")
    .select("id, full_name, academic_grade, department");

  if (error) {
    console.error("Error fetching faculty:", error);
    throw error;
  }
  return data;
}

/**
 * مطابقة الأسماء من ملف Excel مع الفهرس
 * @param {Array} excelData - البيانات المستخرجة من Excel
 * @param {Array} archiveData - البيانات من الأرشيف (faculty_members)
 * @returns {Array} قائمة الأسماء المرفقة بالمعرفات الصحيحة
 */
export function matchExcelFacultyWithArchive(excelData, archiveData) {
  // تحويل الأرشيف إلى Map للبحث السريع (الاسم كـ key)
  // سنستخدم الاسم الكامل للبحث
  const archiveMap = new Map();
  archiveData.forEach((member) => {
    const name = member.full_name?.trim().toLowerCase();
    if (name) archiveMap.set(name, member);
  });

  const matchedList = [];
  const unmatchedList = [];

  excelData.forEach((row) => {
    // نفترض أن العمود في الإكسيل اسمه 'الاسم' أو 'Name'
    const excelName = (row["الاسم"] || row["Name"] || row["full_name"] || "").toString().trim();
    
    if (!excelName) return;

    const normalizedExcelName = excelName.toLowerCase();
    const match = archiveMap.get(normalizedExcelName);

    if (match) {
      matchedList.push({
        excelName: excelName,
        memberId: match.id,
        fullName: match.full_name,
        academicGrade: match.academic_grade,
        department: match.department,
        sourceRow: row
      });
    } else {
      unmatchedList.push({
        excelName: excelName,
        sourceRow: row
      });
    }
  });

  return { matchedList, unmatchedList };
}

/**
 * جلب التبليغات بناءً على الشهر والسنة
 */
export async function fetchNotifications(month, year) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const { data, error } = await supabase
    .from("faculty_notifications")
    .select(`
      *,
      faculty_members (
        id,
        full_name,
        academic_grade,
        department
      )
    `)
    .gte("payroll_month_date", startOfMonth.toISOString())
    .lte("payroll_month_date", endOfMonth.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching notifications:", error);
    throw error;
  }
  return data;
}

/**
 * جلب إحصائيات التبليغات لشهر معين
 */
export async function fetchNotificationStats(month, year) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const { data, error } = await supabase
    .from("faculty_notifications")
    .select("status", { count: 'exact', head: true })
    .gte("payroll_month_date", startOfMonth.toISOString())
    .lte("payroll_month_date", endOfMonth.toISOString());

  if (error) throw error;

  // ملاحظة: Supabase count يعيد إجمالي السجلات. 
  // للحصول على توزيع الحالات، نحتاج لجلب البيانات أو عمل استعلامات متعددة.
  // سنقوم بجلب البيانات الفعلية لتسهيل الحساب في الواجهة الأمامية
  const { data: allData, error: dataError } = await supabase
    .from("faculty_notifications")
    .select("status")
    .gte("payroll_month_date", startOfMonth.toISOString())
    .lte("payroll_month_date", endOfMonth.toISOString());

  if (dataError) throw dataError;

  const stats = {
    total: allData.length,
    new: 0,
    pending_input: 0,
    completed_input: 0,
    pending_review: 0,
    completed_review: 0,
    returned: 0
  };

  allData.forEach(n => {
    if (n.status === WORKFLOW_STATUS.NEW) stats.new++;
    else if (n.status === WORKFLOW_STATUS.PENDING_INPUT) stats.pending_input++;
    else if (n.status === WORKFLOW_STATUS.INPUT_COMPLETED) stats.completed_input++;
    else if (n.status === WORKFLOW_STATUS.PENDING_REVIEW) stats.pending_review++;
    else if (n.status === WORKFLOW_STATUS.REVIEW_COMPLETED) stats.completed_review++;
    else if (n.status === WORKFLOW_STATUS.RETURNED_FOR_CORRECTION) stats.returned++;
  });

  return stats;
}

/**
 * إنشاء تبليغ جديد
 */
export async function createNotification(notificationData) {
  const { data, error } = await supabase
    .from("faculty_notifications")
    .insert([notificationData])
    .select();

  if (error) throw error;
  return data[0];
}

/**
 * تحديث حالة التبليغ وتوثيق العملية (Audit Log)
 */
export async function updateNotificationStatus(id, newStatus, userId, notes = "") {
  // 1. تحديث حالة التبليغ
  const { error: updateError } = await supabase
    .from("faculty_notifications")
    .update({ 
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (updateError) throw updateError;

  // 2. إضافة سجل في جدول سجل التدقيق (Audit Log)
  const { error: logError } = await supabase
    .from("notification_audit_logs")
    .insert([{
      notification_id: id,
      user_id: userId,
      old_status: null, // يمكن تطويره لجلب الحالة القديمة أولاً
      new_status: newStatus,
      notes: notes
    }]);

  if (logError) console.warn("Failed to log notification change:", logError);

  return true;
}

/**
 * جلب سجل التدقيق لتبليغ معين
 */
export async function fetchNotificationLogs(notificationId) {
  const { data, error } = await supabase
    .from("notification_audit_logs")
    .select(`
      *,
      profiles (
        full_name
      )
    `)
    .eq("notification_id", notificationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

import { styles } from "./styles";

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

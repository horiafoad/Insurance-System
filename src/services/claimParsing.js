// دوال مساعدة نقية لتحليل بيانات المطالبات (بدون أي اتصال بقاعدة البيانات).

export const PAYMENT_STATUS = {
  NOT_PAID: "لم يسدد",
  IN_PROGRESS: "جاري السداد",
  SETTLED: "خالي الطرف",
};

export function normalizePaymentStatus(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (
    s === "خالي الطرف" ||
    s === "خالى الطرف" ||
    s === "مكتمل" ||
    s === "تم السداد" ||
    s === "تم السداد بالكامل"
  )
    return PAYMENT_STATUS.SETTLED;
  if (s === "جاري السداد" || s === "جارى السداد" || s === "في السداد" || s === "جاري")
    return PAYMENT_STATUS.IN_PROGRESS;
  if (s === "لم يسدد" || s === "لم يسدد بعد" || s === "جديد" || s === "في انتظار")
    return PAYMENT_STATUS.NOT_PAID;
  return null;
}

export function parseNumeric(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (s === "") return 0;
  const cleaned = s.replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

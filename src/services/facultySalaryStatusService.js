// ============================================================================
// facultySalaryStatusService.js
// ---------------------------------------------------------------------------
// إيقاف/إعادة تفعيل مرتب عضو هيئة التدريس — بدون حذف أي بيانات أو ملفات.
//
// الحالة محفوظة في جدول faculty_salary_status بمفتاح منطقي:
//   (faculty_name, computer_number) — نفس تجميع صفحة أرشيف المرتبات.
//
// الإيقاف لا يمس faculty_salary_archive ولا ملفات PDF إطلاقًا؛ هو مجرد
// تسجيل حالة + تاريخ/مستخدم الإيقاف لعرضه في الواجهة.
// ============================================================================

import { supabase } from "../supabaseClient";

export const FACULTY_SALARY_STATUS_TABLE = "faculty_salary_status";

export function salaryMemberKey(facultyName, computerNumber) {
  return `${String(facultyName || "").trim()}|${String(
    computerNumber || ""
  ).trim()}`;
}

const actorName = (user) => user?.full_name || user?.username || null;

export function mapSalaryStatusRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    facultyName: row.faculty_name || "",
    computerNumber: row.computer_number || "",
    status: row.status || "active",
    stoppedAt: row.stopped_at || "",
    stoppedBy: row.stopped_by || "",
    stopReason: row.stop_reason || "",
    reactivatedAt: row.reactivated_at || "",
    reactivatedBy: row.reactivated_by || "",
    updatedAt: row.updated_at || "",
  };
}

export async function fetchFacultySalaryStatuses() {
  const { data, error } = await supabase
    .from(FACULTY_SALARY_STATUS_TABLE)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSalaryStatusRow);
}

/** خريطة جاهزة للعرض: key = name|number */
export function indexSalaryStatuses(rows) {
  const map = {};
  (rows || []).forEach((row) => {
    map[salaryMemberKey(row.facultyName, row.computerNumber)] = row;
  });
  return map;
}

export async function stopFacultySalary({
  facultyName,
  computerNumber,
  reason = "",
  user = null,
}) {
  if (!String(facultyName || "").trim()) {
    throw new Error("اسم عضو هيئة التدريس مطلوب.");
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(FACULTY_SALARY_STATUS_TABLE)
    .upsert(
      {
        faculty_name: String(facultyName).trim(),
        computer_number: String(computerNumber || "").trim(),
        status: "stopped",
        stopped_at: now,
        stopped_by: actorName(user),
        stop_reason: String(reason || "").trim() || null,
        reactivated_at: null,
        reactivated_by: null,
      },
      { onConflict: "faculty_name,computer_number" }
    )
    .select()
    .single();
  if (error) throw error;
  return mapSalaryStatusRow(data);
}

export async function reactivateFacultySalary({
  facultyName,
  computerNumber,
  user = null,
}) {
  if (!String(facultyName || "").trim()) {
    throw new Error("اسم عضو هيئة التدريس مطلوب.");
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(FACULTY_SALARY_STATUS_TABLE)
    .upsert(
      {
        faculty_name: String(facultyName).trim(),
        computer_number: String(computerNumber || "").trim(),
        status: "active",
        reactivated_at: now,
        reactivated_by: actorName(user),
      },
      { onConflict: "faculty_name,computer_number" }
    )
    .select()
    .single();
  if (error) throw error;
  return mapSalaryStatusRow(data);
}

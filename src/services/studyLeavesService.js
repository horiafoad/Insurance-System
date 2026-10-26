// ============================================================================
// studyLeavesService.js
// ---------------------------------------------------------------------------
// كل استعلامات Supabase الخاصة بالإجازات الدراسية في هذا الملف.
//
// الضمانات:
//   • الاستبدال آمن: نُدرج البيانات الجديدة أولًا، وبعد نجاحها نحذف القديمة.
//     لو فشل الإدراج لا يُحذف أي شيء، ولو فشل الحذف نتراجع عن الإدراج.
//   • نسخة احتياطية كاملة (JSON) في localStorage قبل أي استبدال/استعادة.
//   • مرفقات PDF تُحفظ في مساحة التخزين المتاحة: محليًا داخل تطبيق الديسكتوب،
//     أو عبر مزوّد التخزين المضبوط (asu/R2) عند العمل من المتصفح.
// ============================================================================

import { supabase } from "../supabaseClient";
import {
  uploadFile,
  openFile,
  downloadFileToDisk,
  deleteFile as storageDeleteFile,
} from "./fileStorage";

export const STUDY_LEAVES_TABLE = "study_leaves";
// بوابة التخزين لا تقبل إلا الحاويات المعتمدة لديها (executive-orders،
// issues-files، faculty-salaries، faculty-salary-archive،
// employee-salary-archive، letter-images، scanner-inbox)، ولذلك تُحفظ
// مرفقات الإجازات داخل حاوية الأوامر التنفيذية تحت مسار مستقل study-leaves/
// بدل إنشاء حاوية جديدة غير مدعومة. المسار يمنع أي تعارض مع ملفات الأوامر.
export const STUDY_LEAVES_BUCKET = "executive-orders";
export const STUDY_LEAVES_PDF_PREFIX = "study-leaves";
export const STUDY_LEAVES_BACKUP_KEY = "study_leaves_db_backup_v1";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const PAGE_SIZE = 1000;
const WRITE_CHUNK = 200;

/* -------------------------------------------------------------------------- */
/* تحويل الصفوف                                                               */
/* -------------------------------------------------------------------------- */

export function mapStudyLeaveRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    legacyId: row.legacy_id || "",
    serial: row.serial || "",
    employeeCode: row.employee_code || "",
    name: row.name || "",
    jobTitle: row.job_title || "",
    grade: row.grade || "",
    leavePayType: row.leave_pay_type || "",
    orderNumber: row.order_number || "",
    orderDate: row.order_date || "",
    orderNote: row.order_note || "",
    leaveKind: row.leave_kind || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    fiveYearEnd: row.five_year_end || "",
    remainingDays: row.remaining_days || "",
    salaryStatus: row.salary_status || "",
    returnedToWork: row.returned_to_work || "",
    endReason: row.end_reason || "",
    claimMade: row.claim_made || "",
    notes: row.notes || "",
    pdfUrl: row.pdf_url || "",
    pdfFileName: row.pdf_file_name || "",
    pdfStorageProvider: row.pdf_storage_provider || "",
    pdfStorageKey: row.pdf_storage_key || "",
    pdfUploadedAt: row.pdf_uploaded_at || "",
    pdfUploadedBy: row.pdf_uploaded_by || "",
    hasPdf: Boolean(row.pdf_url),
    data: row.data && typeof row.data === "object" ? row.data : {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

const emptyToNull = (value) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

/**
 * مفتاح طبيعي ثابت لسجل الإجازة — يُستخدم لمطابقة السجل القديم بالجديد
 * أثناء الاستبدال حتى لا يتغيّر المعرّف (وبالتالي لا تنكسر روابط الأرشيف).
 */
function naturalKeyFromParts(employeeCode, startDate, name) {
  const code = String(employeeCode || "").trim();
  const start = String(startDate || "").trim();
  const person = String(name || "").trim();
  if (code && start) return `${code}|${start}`;
  if (code) return `${code}|name:${person}`;
  return `name:${person}|${start}`;
}

function naturalKeyOf(row) {
  return naturalKeyFromParts(row.employee_code, row.start_date, row.name);
}

export function mapStudyLeaveToRow(leave, { includeId = false } = {}) {
  const row = {
    serial: emptyToNull(leave.serial),
    employee_code: emptyToNull(leave.employeeCode),
    name: String(leave.name || "").trim(),
    job_title: emptyToNull(leave.jobTitle),
    grade: emptyToNull(leave.grade),
    leave_pay_type: emptyToNull(leave.leavePayType),
    order_number: emptyToNull(leave.orderNumber),
    order_date: emptyToNull(leave.orderDate),
    order_note: emptyToNull(leave.orderNote),
    leave_kind: emptyToNull(leave.leaveKind),
    start_date: emptyToNull(leave.startDate),
    end_date: emptyToNull(leave.endDate),
    five_year_end: emptyToNull(leave.fiveYearEnd),
    remaining_days: emptyToNull(leave.remainingDays),
    salary_status: emptyToNull(leave.salaryStatus),
    returned_to_work: emptyToNull(leave.returnedToWork),
    end_reason: emptyToNull(leave.endReason),
    claim_made: emptyToNull(leave.claimMade),
    notes: emptyToNull(leave.notes),
    data: leave.data && typeof leave.data === "object" ? leave.data : {},
  };
  if (includeId && leave.id) row.id = leave.id;
  return row;
}

function sortLeaves(leaves) {
  return [...leaves].sort((a, b) => {
    const na = Number(a.serial);
    const nb = Number(b.serial);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.name || "").localeCompare(String(b.name || ""), "ar");
  });
}

/* -------------------------------------------------------------------------- */
/* قراءة / كتابة                                                              */
/* -------------------------------------------------------------------------- */

export async function fetchStudyLeaves() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(STUDY_LEAVES_TABLE)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return sortLeaves(rows.map(mapStudyLeaveRow));
}

/** يقرأ الصفوف الخام (بأسماء أعمدة قاعدة البيانات) — للنسخ الاحتياطي. */
export async function fetchStudyLeaveRowsRaw() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(STUDY_LEAVES_TABLE)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function saveStudyLeaveRecord(leave, { user = null } = {}) {
  if (!leave?.name || !String(leave.name).trim()) {
    throw new Error("اسم الموظف مطلوب.");
  }

  const isExisting = Boolean(leave.id && leave.id.length > 20);
  if (isExisting) {
    const { data, error } = await supabase
      .from(STUDY_LEAVES_TABLE)
      .update(mapStudyLeaveToRow(leave))
      .eq("id", leave.id)
      .select()
      .single();
    if (error) throw error;
    return mapStudyLeaveRow(data);
  }

  const row = {
    ...mapStudyLeaveToRow(leave),
    legacy_id: emptyToNull(leave.legacyId || leave.id),
  };
  if (!row.data || Object.keys(row.data).length === 0) {
    row.data = { source: "manual", created_by: user?.full_name || user?.username || null };
  }
  const { data, error } = await supabase
    .from(STUDY_LEAVES_TABLE)
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return mapStudyLeaveRow(data);
}

export async function deleteStudyLeaveRecord(id) {
  if (!id) throw new Error("معرّف الإجازة غير موجود.");
  const { error } = await supabase
    .from(STUDY_LEAVES_TABLE)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function setStudyLeaveSalaryStatus(id, salaryStatus) {
  if (!id) throw new Error("معرّف الإجازة غير موجود.");
  const { data, error } = await supabase
    .from(STUDY_LEAVES_TABLE)
    .update({ salary_status: emptyToNull(salaryStatus) })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapStudyLeaveRow(data);
}

/* -------------------------------------------------------------------------- */
/* نسخة احتياطية قابلة للاستعادة                                              */
/* -------------------------------------------------------------------------- */

export function saveStudyLeavesBackup(rows, meta = {}) {
  try {
    if (typeof localStorage === "undefined") return null;
    const payload = {
      savedAt: new Date().toISOString(),
      count: Array.isArray(rows) ? rows.length : 0,
      ...meta,
      rows: Array.isArray(rows) ? rows : [],
    };
    localStorage.setItem(STUDY_LEAVES_BACKUP_KEY, JSON.stringify(payload));
    return payload;
  } catch (error) {
    console.error("تعذر حفظ النسخة الاحتياطية محليًا:", error);
    return null;
  }
}

export function loadStudyLeavesBackup() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STUDY_LEAVES_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** ينزّل النسخة الاحتياطية كملف JSON على جهاز المستخدم. */
export function downloadStudyLeavesBackup(backup = loadStudyLeavesBackup()) {
  if (!backup) throw new Error("لا توجد نسخة احتياطية محفوظة.");
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = String(backup.savedAt || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `study-leaves-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * يستعيد النسخة الاحتياطية بكامل المعرّفات (حتى تبقى روابط الأرشيف الذكي).
 * لا يحذف شيئًا قبل نجاح إدراج بيانات النسخة.
 */
export async function restoreStudyLeavesBackup(backup = loadStudyLeavesBackup()) {
  if (!backup || !Array.isArray(backup.rows) || backup.rows.length === 0) {
    throw new Error("لا توجد نسخة احتياطية صالحة للاستعادة.");
  }

  const current = await fetchStudyLeaveRowsRaw();
  const currentIds = new Set(current.map((row) => String(row.id)));
  const batch = backupBatchId();

  const rows = backup.rows.map((row) => ({
    ...row,
    import_batch: batch,
  }));

  try {
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      const chunk = rows.slice(i, i + WRITE_CHUNK);
      const { error } = await supabase
        .from(STUDY_LEAVES_TABLE)
        .upsert(chunk, { onConflict: "id" });
      if (error) throw error;
    }
  } catch (error) {
    // التراجع: احذف الصفوف التي أُدرجت للتو فقط.
    const restoredIds = rows.map((row) => row.id).filter((id) => !currentIds.has(String(id)));
    if (restoredIds.length > 0) {
      await supabase.from(STUDY_LEAVES_TABLE).delete().in("id", restoredIds);
    }
    throw error;
  }

  const keep = new Set(rows.map((row) => String(row.id)));
  const staleIds = current
    .map((row) => String(row.id))
    .filter((id) => !keep.has(id));

  if (staleIds.length > 0) {
    for (let i = 0; i < staleIds.length; i += WRITE_CHUNK) {
      const { error } = await supabase
        .from(STUDY_LEAVES_TABLE)
        .delete()
        .in("id", staleIds.slice(i, i + WRITE_CHUNK));
      if (error) throw error;
    }
  }

  return fetchStudyLeaves();
}

/* -------------------------------------------------------------------------- */
/* الاستبدال الآمن (استيراد Excel)                                            */
/* -------------------------------------------------------------------------- */

function backupBatchId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** خريطة مرفقات PDF القديمة لترحيلها إلى البيانات الجديدة. */
function buildPdfCarryOver(currentRows) {
  const byKey = new Map();
  const byCode = new Map();
  currentRows.forEach((row) => {
    if (!row.pdf_url) return;
    const code = String(row.employee_code || "").trim();
    const start = String(row.start_date || "").trim();
    if (code && start) byKey.set(`${code}|${start}`, row);
    if (code) {
      const list = byCode.get(code) || [];
      list.push(row);
      byCode.set(code, list);
    }
  });
  return { byKey, byCode };
}

/**
 * يستبدل كل بيانات الإجازات بالبيانات الجديدة (Excel).
 * - يقرأ الحالي ويأخذ نسخة احتياطية أولًا.
 * - يُدرج الجديد، ثم يحذف القديم.
 * - يرحّل مرفقات PDF القديمة عند تطابق (كود الموظف + بداية الإجازة).
 */
export async function replaceStudyLeaves(leaves, { user = null } = {}) {
  const clean = (leaves || []).filter((leave) => String(leave.name || "").trim());
  if (clean.length === 0) {
    throw new Error("لا توجد سجلات صالحة للاستبدال.");
  }

  const currentRows = await fetchStudyLeaveRowsRaw();
  const backup = saveStudyLeavesBackup(currentRows, {
    reason: "before_replace",
    importedCount: clean.length,
    user: user?.full_name || user?.username || null,
  });

  const batch = backupBatchId();
  const { byCode } = buildPdfCarryOver(currentRows);

  const currentByKey = new Map();
  currentRows.forEach((row) => {
    const key = naturalKeyOf(row);
    if (!currentByKey.has(key)) currentByKey.set(key, row);
  });
  const currentByCode = new Map();
  currentRows.forEach((row) => {
    const code = String(row.employee_code || "").trim();
    if (!code) return;
    const list = currentByCode.get(code) || [];
    list.push(row);
    currentByCode.set(code, list);
  });

  const matchedRows = [];
  const freshRows = [];
  const keptIds = new Set();

  clean.forEach((leave, index) => {
    const row = mapStudyLeaveToRow(leave);
    row.serial = row.serial || String(index + 1);
    row.import_batch = batch;

    // مطابقة السجل القديم بنفس (الكود + بداية الإجازة) للحفاظ على معرّفه
    // وروابط الأرشيف الذكي ومرفق PDF. هذا يمنع يتيم الروابط عند كل استيراد.
    let match = currentByKey.get(
      naturalKeyFromParts(row.employee_code, row.start_date, row.name)
    );
    if (!match && row.employee_code) {
      const candidates = currentByCode.get(row.employee_code) || [];
      if (candidates.length === 1) match = candidates[0];
    }

    if (match) {
      keptIds.add(String(match.id));
      // لا نرسل أعمدة PDF في التحديث → تبقى كما هي بلا أي مساس.
      matchedRows.push({ ...row, id: match.id });
      return;
    }

    const pdfMatch =
      row.employee_code && (byCode.get(row.employee_code) || []).length === 1
        ? byCode.get(row.employee_code)[0]
        : null;
    if (pdfMatch) {
      row.pdf_url = pdfMatch.pdf_url || null;
      row.pdf_file_name = pdfMatch.pdf_file_name || null;
      row.pdf_storage_provider = pdfMatch.pdf_storage_provider || null;
      row.pdf_storage_key = pdfMatch.pdf_storage_key || null;
      row.pdf_uploaded_at = pdfMatch.pdf_uploaded_at || null;
      row.pdf_uploaded_by = pdfMatch.pdf_uploaded_by || null;
    }
    row.legacy_id = null;
    freshRows.push(row);
  });

  const insertedIds = [];

  try {
    // 1) الصفوف الجديدة فقط.
    for (let i = 0; i < freshRows.length; i += WRITE_CHUNK) {
      const chunk = freshRows.slice(i, i + WRITE_CHUNK);
      const { data, error } = await supabase
        .from(STUDY_LEAVES_TABLE)
        .insert(chunk)
        .select("id");
      if (error) throw error;
      (data || []).forEach((row) => insertedIds.push(row.id));
    }

    // 2) تحديث الصفوف الموجودة مع الحفاظ على id (وبالتالي روابط الأرشيف).
    for (let i = 0; i < matchedRows.length; i += WRITE_CHUNK) {
      const chunk = matchedRows.slice(i, i + WRITE_CHUNK);
      const { error } = await supabase
        .from(STUDY_LEAVES_TABLE)
        .upsert(chunk, { onConflict: "id" });
      if (error) throw error;
    }
  } catch (error) {
    if (insertedIds.length > 0) {
      try {
        await supabase.from(STUDY_LEAVES_TABLE).delete().in("id", insertedIds);
      } catch (rollbackError) {
        console.error("تعذر التراجع بعد فشل الإدراج:", rollbackError);
      }
    }
    throw error;
  }

  // 3) حذف السجلات القديمة التي لم تعد موجودة في الملف الجديد.
  const staleIds = currentRows
    .map((row) => String(row.id))
    .filter((id) => !keptIds.has(id));

  if (staleIds.length > 0) {
    try {
      for (let i = 0; i < staleIds.length; i += WRITE_CHUNK) {
        const { error } = await supabase
          .from(STUDY_LEAVES_TABLE)
          .delete()
          .in("id", staleIds.slice(i, i + WRITE_CHUNK));
        if (error) throw error;
      }
    } catch (error) {
      const wrapped = new Error(
        `تم حفظ البيانات الجديدة لكن تعذر حذف بعض السجلات القديمة. النسخة الاحتياطية محفوظة. التفاصيل: ${error.message}`
      );
      wrapped.code = "DELETE_FAILED";
      throw wrapped;
    }
  }

  const result = await fetchStudyLeaves();
  return { leaves: result, backup };
}

/* -------------------------------------------------------------------------- */
/* مرفقات PDF (محلية على جهاز المستخدم)                                       */
/* -------------------------------------------------------------------------- */

const SAFE_NAME = /[^\p{L}\p{N}._-]+/gu;

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

export async function attachStudyLeavePdf(leave, file, { user = null } = {}) {
  if (!leave?.id) throw new Error("احفظي الإجازة أولًا ثم أرفقي الملف.");
  const invalid = validatePdfFile(file);
  if (invalid) throw new Error(invalid);

  const oldUrl = leave.pdfUrl;
  const oldKey = leave.pdfStorageKey;

  const safeName = String(file.name || "file.pdf").replace(SAFE_NAME, "_").slice(-80);
  const path = `${STUDY_LEAVES_PDF_PREFIX}/${leave.id}/${Date.now()}-${safeName}`;

  const saved = await uploadFile(STUDY_LEAVES_BUCKET, path, file, {
    contentType: "application/pdf",
    upsert: true,
  });

  const { data, error } = await supabase
    .from(STUDY_LEAVES_TABLE)
    .update({
      pdf_url: saved.url,
      pdf_file_name: file.name || safeName,
      pdf_storage_provider: saved.provider,
      pdf_storage_key: saved.key,
      pdf_uploaded_at: new Date().toISOString(),
      pdf_uploaded_by: user?.full_name || user?.username || null,
    })
    .eq("id", leave.id)
    .select()
    .single();

  if (error) {
    // لا نترك ملفًا يتيمًا لو فشل تحديث القاعدة.
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

  return mapStudyLeaveRow(data);
}

export async function openStudyLeavePdf(leave) {
  if (!leave?.pdfUrl) throw new Error("لا يوجد ملف PDF لهذه الإجازة.");
  return openFile(leave.pdfUrl, { path: leave.pdfStorageKey });
}

export async function downloadStudyLeavePdf(leave) {
  if (!leave?.pdfUrl) throw new Error("لا يوجد ملف PDF لهذه الإجازة.");
  const name = leave.pdfFileName || `study-leave-${leave.employeeCode || leave.id}.pdf`;
  await downloadFileToDisk(leave.pdfUrl, name, { path: leave.pdfStorageKey });
}

export async function deleteStudyLeavePdf(leave) {
  if (!leave?.id) throw new Error("معرّف الإجازة غير موجود.");
  if (leave.pdfUrl) {
    try {
      await storageDeleteFile(leave.pdfUrl, { path: leave.pdfStorageKey });
    } catch (error) {
      console.warn("تعذر حذف ملف PDF من الجهاز:", error);
    }
  }
  const { data, error } = await supabase
    .from(STUDY_LEAVES_TABLE)
    .update({
      pdf_url: null,
      pdf_file_name: null,
      pdf_storage_provider: null,
      pdf_storage_key: null,
      pdf_uploaded_at: null,
      pdf_uploaded_by: null,
    })
    .eq("id", leave.id)
    .select()
    .single();
  if (error) throw error;
  return mapStudyLeaveRow(data);
}

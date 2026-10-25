// ============================================================================
// claimDocumentsService.js
// ---------------------------------------------------------------------------
// مرفقات PDF للمطالبات — تُحفظ في مساحة التخزين المتاحة: محليًا داخل تطبيق
// الديسكتوب، أو عبر مزوّد التخزين المضبوط (asu/R2) عند العمل من المتصفح.
//
// الربط بالمعرّف الفريد claims.id (وليس بالاسم أو رقم الصف).
// ============================================================================

import { supabase } from "../supabaseClient";
import {
  uploadFile,
  openFile,
  downloadFileToDisk,
  deleteFile as storageDeleteFile,
} from "./fileStorage";

export const CLAIMS_TABLE = "claims";
export const CLAIMS_BUCKET = "claims-files";
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const SAFE_NAME = /[^\p{L}\p{N}._-]+/gu;

export function validateClaimPdf(file) {
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

export function claimHasPdf(claim) {
  return Boolean(claim?.pdf_url);
}

export async function attachClaimPdf(claim, file, { user = null } = {}) {
  if (!claim?.id) throw new Error("معرّف المطالبة غير موجود.");
  const invalid = validateClaimPdf(file);
  if (invalid) throw new Error(invalid);

  const oldUrl = claim.pdf_url;
  const oldKey = claim.pdf_storage_key;
  const safeName = String(file.name || "file.pdf").replace(SAFE_NAME, "_").slice(-80);
  const path = `${claim.id}/${Date.now()}-${safeName}`;

  const saved = await uploadFile(CLAIMS_BUCKET, path, file, {
    contentType: "application/pdf",
    upsert: true,
  });

  const { data, error } = await supabase
    .from(CLAIMS_TABLE)
    .update({
      pdf_url: saved.url,
      pdf_file_name: file.name || safeName,
      pdf_storage_provider: saved.provider,
      pdf_storage_key: saved.key,
      pdf_uploaded_at: new Date().toISOString(),
      pdf_uploaded_by: user?.full_name || user?.username || null,
    })
    .eq("id", claim.id)
    .select()
    .single();

  if (error) {
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

  return data;
}

export async function openClaimPdf(claim) {
  if (!claim?.pdf_url) throw new Error("لا يوجد ملف PDF لهذه المطالبة.");
  return openFile(claim.pdf_url, { path: claim.pdf_storage_key });
}

export async function downloadClaimPdf(claim) {
  if (!claim?.pdf_url) throw new Error("لا يوجد ملف PDF لهذه المطالبة.");
  const name =
    claim.pdf_file_name || `claim-${claim.claim_number || claim.id}.pdf`;
  await downloadFileToDisk(claim.pdf_url, name, { path: claim.pdf_storage_key });
}

export async function deleteClaimPdf(claim) {
  if (!claim?.id) throw new Error("معرّف المطالبة غير موجود.");
  if (claim.pdf_url) {
    try {
      await storageDeleteFile(claim.pdf_url, { path: claim.pdf_storage_key });
    } catch (error) {
      console.warn("تعذر حذف ملف PDF من الجهاز:", error);
    }
  }
  const { data, error } = await supabase
    .from(CLAIMS_TABLE)
    .update({
      pdf_url: null,
      pdf_file_name: null,
      pdf_storage_provider: null,
      pdf_storage_key: null,
      pdf_uploaded_at: null,
      pdf_uploaded_by: null,
    })
    .eq("id", claim.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

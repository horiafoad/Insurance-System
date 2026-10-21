// ============================================================================
// monthlyReportsService.js
// ---------------------------------------------------------------------------
// طبقة الوصول للبيانات الخاصة بوحدة "التبليغات الشهرية".
// كل استعلامات Supabase الخاصة بهذه الوحدة في هذا الملف.
// ============================================================================

import { supabase } from "../supabaseClient";
import {
  uploadFile,
  deleteFile as storageDeleteFile,
} from "./fileStorage";

export const SECTIONS_TABLE = "monthly_report_sections";
export const TYPES_TABLE = "monthly_report_types";
export const FIELD_DEFINITIONS_TABLE = "monthly_report_field_definitions";
export const REPORTS_TABLE = "monthly_reports";
export const FIELD_VALUES_TABLE = "monthly_report_field_values";
export const ATTACHMENTS_TABLE = "monthly_report_attachments";

export const SECTION_CODES = {
  FACULTY: "faculty",
  EMPLOYEE: "employee",
  CONTRACT: "contract",
};

export const FIELD_TYPES = {
  TEXT: "text",
  TEXTAREA: "textarea",
  DATE: "date",
  NUMBER: "number",
  SELECT: "select",
  BOOLEAN: "boolean",
  FILE: "file",
};

export const REPORT_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  ARCHIVED: "archived",
};

// ============================================================================
// الأقسام
// ============================================================================

export async function fetchSections() {
  const { data, error } = await supabase
    .from(SECTIONS_TABLE)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchSectionByCode(code) {
  const { data, error } = await supabase
    .from(SECTIONS_TABLE)
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================================
// أنواع التبليغات
// ============================================================================

export async function fetchTypes(sectionId) {
  const { data, error } = await supabase
    .from(TYPES_TABLE)
    .select("*")
    .eq("section_id", sectionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchActiveTypes(sectionId) {
  const { data, error } = await supabase
    .from(TYPES_TABLE)
    .select("*")
    .eq("section_id", sectionId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTypeById(typeId) {
  const { data, error } = await supabase
    .from(TYPES_TABLE)
    .select("*")
    .eq("id", typeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createType(typeData) {
  const { data, error } = await supabase
    .from(TYPES_TABLE)
    .insert(typeData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateType(typeId, updates) {
  const { data, error } = await supabase
    .from(TYPES_TABLE)
    .update(updates)
    .eq("id", typeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteType(typeId) {
  const { error } = await supabase
    .from(TYPES_TABLE)
    .delete()
    .eq("id", typeId);
  if (error) throw error;
}

export async function countReportsByType(typeId) {
  const { count, error } = await supabase
    .from(REPORTS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("type_id", typeId);
  if (error) throw error;
  return count || 0;
}

// ============================================================================
// تعريفات الحقول
// ============================================================================

export async function fetchFieldDefinitions(typeId) {
  const { data, error } = await supabase
    .from(FIELD_DEFINITIONS_TABLE)
    .select("*")
    .eq("type_id", typeId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchActiveFieldDefinitions(typeId) {
  const { data, error } = await supabase
    .from(FIELD_DEFINITIONS_TABLE)
    .select("*")
    .eq("type_id", typeId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createFieldDefinition(fieldData) {
  const { data, error } = await supabase
    .from(FIELD_DEFINITIONS_TABLE)
    .insert(fieldData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFieldDefinition(fieldId, updates) {
  const { data, error } = await supabase
    .from(FIELD_DEFINITIONS_TABLE)
    .update(updates)
    .eq("id", fieldId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFieldDefinition(fieldId) {
  const { error } = await supabase
    .from(FIELD_DEFINITIONS_TABLE)
    .delete()
    .eq("id", fieldId);
  if (error) throw error;
}

// ============================================================================
// سجلات التبليغات
// ============================================================================

export async function fetchReports(filters = {}) {
  let query = supabase.from(REPORTS_TABLE).select(`
    *,
    section:monthly_report_sections(*),
    type:monthly_report_types(*)
  `);

  if (filters.sectionId) {
    query = query.eq("section_id", filters.sectionId);
  }
  if (filters.typeId) {
    query = query.eq("type_id", filters.typeId);
  }
  if (filters.year && filters.month) {
    query = query.eq("report_year", filters.year).eq("report_month", filters.month);
  }
  if (filters.facultyMemberId) {
    query = query.eq("faculty_member_id", filters.facultyMemberId);
  }
  if (filters.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }
  if (filters.createdById) {
    query = query.eq("created_by_id", filters.createdById);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchReportById(reportId) {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .select(`
      *,
      section:monthly_report_sections(*),
      type:monthly_report_types(*)
    `)
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createReport(reportData) {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .insert(reportData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateReport(reportId, updates) {
  const { data, error } = await supabase
    .from(REPORTS_TABLE)
    .update(updates)
    .eq("id", reportId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReport(reportId) {
  const { error } = await supabase
    .from(REPORTS_TABLE)
    .delete()
    .eq("id", reportId);
  if (error) throw error;
}

// ============================================================================
// قيم الحقول
// ============================================================================

export async function fetchFieldValues(reportId) {
  const { data, error } = await supabase
    .from(FIELD_VALUES_TABLE)
    .select(`
      *,
      field_definition:monthly_report_field_definitions(*)
    `)
    .eq("report_id", reportId);
  if (error) throw error;
  return data || [];
}

export async function createFieldValue(valueData) {
  const { data, error } = await supabase
    .from(FIELD_VALUES_TABLE)
    .insert(valueData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFieldValue(valueId, updates) {
  const { data, error } = await supabase
    .from(FIELD_VALUES_TABLE)
    .update(updates)
    .eq("id", valueId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFieldValue(valueId) {
  const { error } = await supabase
    .from(FIELD_VALUES_TABLE)
    .delete()
    .eq("id", valueId);
  if (error) throw error;
}

export async function batchUpsertFieldValues(values) {
  const { data, error } = await supabase
    .from(FIELD_VALUES_TABLE)
    .upsert(values, { onConflict: "report_id,field_id" })
    .select();
  if (error) throw error;
  return data || [];
}

// ============================================================================
// المرفقات
// ============================================================================

export async function fetchAttachments(reportId) {
  const { data, error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createAttachment(attachmentData) {
  const { data, error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .insert(attachmentData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAttachment(attachmentId) {
  const { error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;
}

export async function uploadReportAttachment(reportId, file, options = {}) {
  const bucket = options.bucket || "monthly-reports";
  const path = `${reportId}/${Date.now()}-${file.name}`;
  
  const saved = await uploadFile(bucket, path, file, {
    contentType: file.type || "application/pdf",
    upsert: true,
    provider: options.provider,
  });

  const { data, error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .insert({
      report_id: reportId,
      storage_provider: saved.provider,
      storage_key: saved.key,
      file_path: path,
      file_url: saved.url,
      original_filename: file.name,
      mime_type: saved.mimeType,
      size_bytes: saved.size,
      created_by: options.createdBy || null,
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteReportAttachment(attachment) {
  if (attachment?.file_url) {
    try {
      await storageDeleteFile(attachment.file_url, { path: attachment.file_path });
    } catch {
      /* الملف قد يكون محذوفًا أصلًا — نكمل حذف السجل */
    }
  }
  const { error } = await supabase
    .from(ATTACHMENTS_TABLE)
    .delete()
    .eq("id", attachment.id);
  if (error) throw error;
}

// ============================================================================
// الأنواع الابتدائية لهيئة التدريس
// ============================================================================

export async function seedFacultyTypes() {
  const section = await fetchSectionByCode(SECTION_CODES.FACULTY);
  if (!section) return;

  const initialTypes = [
    {
      section_id: section.id,
      name: "Resignation",
      name_ar: "الاستقالة",
      description: "استقالة عضو هيئة تدريس",
      sort_order: 1,
    },
    {
      section_id: section.id,
      name: "Study Leave",
      name_ar: "الإجازة الدراسية",
      description: "إجازة دراسية لعضو هيئة التدريس",
      sort_order: 2,
    },
    {
      section_id: section.id,
      name: "Scientific Mission",
      name_ar: "المهمة العلمية",
      description: "مهمة علمية خارج البلاد",
      sort_order: 3,
    },
    {
      section_id: section.id,
      name: "Spouse Accompaniment Leave",
      name_ar: "إجازة مرافقة الزوج أو الزوجة",
      description: "إجازة مرافقة الزوج أو الزوجة في الخارج",
      sort_order: 4,
    },
    {
      section_id: section.id,
      name: "Child Care Leave",
      name_ar: "إجازة رعاية الطفل",
      description: "إجازة لرعاية الطفل",
      sort_order: 5,
    },
    {
      section_id: section.id,
      name: "Appointment",
      name_ar: "التعيين",
      description: "تعيين عضو هيئة تدريس جديد",
      sort_order: 6,
    },
    {
      section_id: section.id,
      name: "Promotion",
      name_ar: "الترقية",
      description: "ترقية عضو هيئة التدريس",
      sort_order: 7,
    },
  ];

  for (const typeData of initialTypes) {
    try {
      await createType(typeData);
    } catch (error) {
      // تجاهل التكرار (UNIQUE constraint)
      if (error.code !== "23505") {
        console.error("Error seeding faculty type:", error);
      }
    }
  }
}

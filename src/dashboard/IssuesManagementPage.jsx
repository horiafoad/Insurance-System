import React, { useState, useEffect, useCallback } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";
import { useRealtimeSync } from "../utils/realtimeSync";
import * as XLSX from "xlsx";

const PAYMENT_STATUS_OPTIONS = [
  "جاري التنفيذ",
  "تم التنفيذ وفي انتظار الصرف",
  "تم الصرف",
  "مرفوضة",
];

function normalizePaymentStatus(status) {
  if (status === "تم التنفيذ" || status === "في انتظار الصرف") {
    return "تم التنفيذ وفي انتظار الصرف";
  }
  return status;
}

const CASE_FIELD_ORDER = [
  "الاسم",
  "رقم القضيه",
  "شهر تغير الاساسي",
  "الاساسي بعد التغيير",
  "الاجمالي",
  "الصافي",
  "حاله الصرف",
  "تاريخ الصرف",
];

// الحقول الرقمية داخل بيانات القضية (JSONB data) — تُحوَّل بطريقة آمنة.
const ISSUE_NUMERIC_FIELDS = ["الاساسي بعد التغيير", "الاجمالي", "الصافي"];

// شهور السنة لقائمة «شهر تغيير الأساسي».
const MONTHS_LIST = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

// يحوّل أي قيمة محفوظة (اسم شهر أو رقم 1-12) إلى اسم الشهر للعرض/اختيار القائمة.
function normalizeMonthValue(value) {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return MONTHS_LIST[n - 1];
  return s;
}

// يعرض المبلغ مع عملة «ج.م» بعده.
function formatMoneyValue(value) {
  if (value == null || String(value).trim() === "") return "-";
  return `${value} ج.م`;
}

// تحويل رقمي آمن:
// - الأرقام تُترك أرقامًا.
// - النص الرقمي الصحيح (مثل "15000" أو "15000.50") يُحول إلى رقم.
// - القيم الفارغة تبقى فارغة (لا تتحول إلى 0).
// - أي نص غير رقمي يُرجع كما هو بدون كسر.
function normalizeIssueNumber(value) {
  if (value == null) return value;
  if (typeof value === "number") return value;
  const trimmed = String(value).trim();
  if (trimmed === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function cleanFileName(name) {
  return name
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();
}

export default function IssuesManagementPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [excelFile, setExcelFile] = useState(null);
  const [excelUploading, setExcelUploading] = useState(false);

  const [pdfFile, setPdfFile] = useState(null);
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [pdfUploading, setPdfUploading] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");

  const [editingIssue, setEditingIssue] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [detailModalIssue, setDetailModalIssue] = useState(null);

  // يتحكم في إظهار/إخفاء قسم إضافة قضية جديدة (Excel أو PDF) —
  // افتراضيًا تظهر القضايا المسجلة فقط ويُفتح القسم من زرار الصفحة.
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [addDocUploading, setAddDocUploading] = useState(false);
  const [addDocFile, setAddDocFile] = useState(null);

  const [mainPdfUploading, setMainPdfUploading] = useState(false);

  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      setLoading(true);
      setError("");

      const { data, error: issuesError } = await supabase
        .from("issues")
        .select("*")
        .order("created_at", { ascending: false });

      if (issuesError) throw issuesError;

      const issuesWithDocs = await Promise.all(
        (data || []).map(async (issue) => {
          let excel_data = null;
          if (issue.case_type === "individual") {
            const { data: details } = await supabase
              .from("issue_details")
              .select("data")
              .eq("issue_id", issue.id)
              .order("id", { ascending: false })
              .limit(1);
            excel_data = details?.[0]?.data ?? null;
          }

          const { data: docs } = await supabase
            .from("case_documents")
            .select("*")
            .eq("case_id", issue.id)
            .order("created_at", { ascending: true });

          return { ...issue, excel_data, additionalDocs: docs || [] };
        })
      );

      setIssues(issuesWithDocs);
    } catch (err) {
      setError("فشل تحميل القضايا: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAdditionalDocs = async (issueId) => {
    const { data } = await supabase
      .from("case_documents")
      .select("*")
      .eq("case_id", issueId)
      .order("created_at", { ascending: true });
    setAdditionalDocs(data || []);
  };

  /* ===== المزامنة اللحظية (Supabase Realtime) — القضية المتأثرة فقط =====
     البيانات المعروضة متداخلة (تفاصيل + مستندات مرفقة)، لذا عند أي حدث
     نعيد جلب صف القضية الواحد بملحقاته ثم نستبدله في القائمة محليًا
     دون إعادة جلب كل القضايا. */
  const loadIssueRow = async (id) => {
    if (id == null) return null;
    const { data, error } = await supabase
      .from("issues")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;

    let excel_data = null;
    if (data.case_type === "individual") {
      const { data: details } = await supabase
        .from("issue_details")
        .select("data")
        .eq("issue_id", data.id)
        .order("id", { ascending: false })
        .limit(1);
      excel_data = details?.[0]?.data ?? null;
    }

    const { data: docs } = await supabase
      .from("case_documents")
      .select("*")
      .eq("case_id", data.id)
      .order("created_at", { ascending: true });

    return { ...data, excel_data, additionalDocs: docs || [] };
  };

  const upsertIssue = (row) => {
    if (!row) return;
    setIssues((prev) => {
      const index = prev.findIndex((item) => item.id === row.id);
      if (index === -1) return [row, ...prev];
      const next = [...prev];
      next[index] = row;
      return next;
    });
  };

  const reloadIssueByExternalId = (id) => {
    if (id == null) return;
    loadIssueRow(id).then((row) => {
      if (row) upsertIssue(row);
    });
  };

  useRealtimeSync({
    table: "issues",
    apply: (payload) => {
      if (payload.eventType === "DELETE") {
        const oldId = payload.old?.id ?? payload.new?.id;
        if (oldId != null) {
          setIssues((prev) => prev.filter((item) => item.id !== oldId));
        }
        return;
      }
      loadIssueRow(payload.new?.id ?? payload.old?.id).then((row) => {
        if (row) upsertIssue(row);
      });
    },
  });

  useRealtimeSync({
    table: "issue_details",
    apply: (payload) => {
      reloadIssueByExternalId(payload.new?.issue_id ?? payload.old?.issue_id);
    },
  });

  useRealtimeSync({
    table: "case_documents",
    apply: (payload) => {
      reloadIssueByExternalId(payload.new?.case_id ?? payload.old?.case_id);
    },
  });

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!validTypes.includes(file.type)) {
      setError("يرجى اختيار ملف Excel صالح (.xlsx أو .xls)");
      return;
    }
    setExcelFile(file);
    setError("");
  };

  const handleExcelSubmit = async (e) => {
    e.preventDefault();
    if (!excelFile) {
      setError("يرجى اختيار ملف Excel أولاً");
      return;
    }

    try {
      setExcelUploading(true);
      setError("");
      setSuccess("");

      const arrayBuf = await excelFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuf);
      if (workbook.SheetNames.length === 0)
        throw new Error("الملف لا يحتوي على أي أوراق");

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0)
        throw new Error("الملف فارغ أو لا يحتوي على بيانات");

      const cleanName = cleanFileName(excelFile.name);
      const fileName = `excel_${Date.now()}_${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, excelFile);
      if (uploadError)
        throw new Error("فشل رفع الملف إلى Storage: " + uploadError.message);

      const { data: urlData } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const { data: mainIssue, error: mainErr } = await supabase
        .from("issues")
        .insert({
          case_number: `EXCEL_${Date.now()}`,
          case_title: `قائمة قضايا من Excel - ${excelFile.name}`,
          case_description: `قائمة تحتوي على ${jsonData.length} قضية`,
          case_type: "bulk",
          file_type: "excel",
          file_url: publicUrl,
          file_name: excelFile.name,
          file_size: excelFile.size,
          status: "pending",
        })
        .select()
        .single();

      if (mainErr)
        throw new Error("فشل إنشاء سجل القضية الرئيسي: " + mainErr.message);

      let created = 0;
      let failedDetails = 0;
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const caseNumberVal =
          row["رقم القضيه"] ||
          row["رقم القضية"] ||
          row["Case Number"] ||
          row["رقم"] ||
          `CASE_${Date.now()}_${i + 1}`;
        const caseTitleVal =
          row["الاسم"] ||
          row["عنوان القضية"] ||
          row["Case Title"] ||
          row["العنوان"] ||
          `قضية ${i + 1}`;

        const paymentStatusVal =
          row["حاله الصرف"] || row["حالة الصرف"] || null;
        const paymentDateVal = row["تاريخ الصرف"] || null;

        const { data: issueData, error: issueErr } = await supabase
          .from("issues")
          .insert({
            case_number: caseNumberVal,
            case_title: caseTitleVal,
            case_description: row["وصف"] || row["Description"] || "",
            case_type: "individual",
            file_type: "excel",
            file_url: publicUrl,
            file_name: excelFile.name,
            file_size: excelFile.size,
            status: "pending",
            payment_status: PAYMENT_STATUS_OPTIONS.includes(
              normalizePaymentStatus(paymentStatusVal)
            )
              ? normalizePaymentStatus(paymentStatusVal)
              : null,
            payment_date: paymentDateVal || null,
          })
          .select()
          .single();

        if (issueErr) continue;

        const { error: detailErr } = await supabase
          .from("issue_details")
          .insert({
            issue_id: issueData.id,
            row_number: i + 1,
            data: row,
          });

        if (detailErr) {
          failedDetails++;
          continue;
        }

        created++;
      }

      setSuccess(
        `تم رفع ملف Excel بنجاح! تم إنشاء ${created} قضية منفصلة.` +
          (failedDetails > 0
            ? ` تعذّر حفظ تفاصيل ${failedDetails} قضية — شغّل fix_issue_details_save.sql في Supabase ثم أعد الرفع.`
            : "")
      );
      setExcelFile(null);
      loadIssues();
    } catch (err) {
      setError("فشل رفع ملف Excel: " + err.message);
    } finally {
      setExcelUploading(false);
    }
  };

  const handlePdfSubmit = async (e) => {
    e.preventDefault();
    if (!pdfFile || !caseNumber || !caseTitle) {
      setError("يرجى ملء جميع الحقول المطلوبة واختيار ملف PDF");
      return;
    }

    try {
      setPdfUploading(true);
      setError("");
      setSuccess("");

      if (pdfFile.type !== "application/pdf") {
        throw new Error("يرجى اختيار ملف PDF صالح");
      }

      const fileName = `pdf_${Date.now()}_${cleanFileName(pdfFile.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, pdfFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);

      const { error: issueError } = await supabase.from("issues").insert({
        case_number: caseNumber,
        case_title: caseTitle,
        case_description: caseDescription,
        case_type: "individual",
        file_type: "pdf",
        file_url: urlData.publicUrl,
        file_name: pdfFile.name,
        file_size: pdfFile.size,
        status: "pending",
      });

      if (issueError) throw issueError;

      setSuccess("تم رفع ملف القضية بنجاح!");
      setPdfFile(null);
      setCaseNumber("");
      setCaseTitle("");
      setCaseDescription("");
      loadIssues();
    } catch (err) {
      setError("فشل رفع ملف PDF: " + err.message);
    } finally {
      setPdfUploading(false);
    }
  };

  const handleMainPdfUpload = async (issueId, file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("يرجى اختيار ملف PDF صالح");
      return;
    }

    try {
      setMainPdfUploading(true);
      setError("");

      const fileName = `pdf_${issueId}_${Date.now()}_${cleanFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("case_documents")
        .insert({
          case_id: issueId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_size: file.size,
          doc_type: "additional_pdf",
        });

      if (insertError) throw insertError;

      setSuccess("تم إضافة PDF للقضية بنجاح!");
      loadIssues();
      if (detailModalIssue && detailModalIssue.id === issueId) {
        loadAdditionalDocs(issueId);
      }
    } catch (err) {
      setError("فشل إضافة PDF للقضية: " + err.message);
    } finally {
      setMainPdfUploading(false);
    }
  };

  const handleAdditionalPdfUpload = async () => {
    if (!addDocFile || !detailModalIssue) return;

    if (addDocFile.type !== "application/pdf") {
      setError("يرجى اختيار ملف PDF صالح");
      return;
    }

    try {
      setAddDocUploading(true);
      setError("");

      const fileName = `doc_${detailModalIssue.id}_${Date.now()}_${cleanFileName(addDocFile.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, addDocFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from("case_documents")
        .insert({
          case_id: detailModalIssue.id,
          file_name: addDocFile.name,
          file_url: urlData.publicUrl,
          file_size: addDocFile.size,
          doc_type: "additional_pdf",
        });

      if (insertError) throw insertError;

      setSuccess("تم إضافة الملف بنجاح!");
      setAddDocFile(null);
      loadAdditionalDocs(detailModalIssue.id);
      loadIssues();
    } catch (err) {
      setError("فشل إضافة الملف: " + err.message);
    } finally {
      setAddDocUploading(false);
    }
  };

  const handleDeleteAdditionalDoc = async (docId) => {
    if (!confirm("هل أنت متأكد من حذف هذا الملف؟")) return;
    try {
      const { error } = await supabase
        .from("case_documents")
        .delete()
        .eq("id", docId);
      if (error) throw error;
      setSuccess("تم حذف الملف بنجاح");
      if (detailModalIssue) loadAdditionalDocs(detailModalIssue.id);
      loadIssues();
    } catch (err) {
      setError("فشل حذف الملف: " + err.message);
    }
  };

  const handleDeleteIssue = async (issueId) => {
    if (!confirm("هل أنت متأكد من حذف هذه القضية؟")) return;
    try {
      setError("");
      const { error } = await supabase
        .from("issues")
        .delete()
        .eq("id", issueId);
      if (error) throw error;
      setSuccess("تم حذف القضية بنجاح");
      loadIssues();
    } catch (err) {
      setError("فشل حذف القضية: " + err.message);
    }
  };

  const handleUpdateStatus = async (issueId, newStatus) => {
    try {
      setError("");
      const { error } = await supabase
        .from("issues")
        .update({ status: newStatus })
        .eq("id", issueId);
      if (error) throw error;
      setSuccess("تم تحديث الحالة بنجاح");
      loadIssues();
    } catch (err) {
      setError("فشل تحديث الحالة: " + err.message);
    }
  };

  const handleUpdatePaymentStatus = async (issueId, newPaymentStatus) => {
    try {
      setError("");
      const { error } = await supabase
        .from("issues")
        .update({ payment_status: newPaymentStatus })
        .eq("id", issueId);
      if (error) throw error;
      setSuccess("تم تحديث حالة الصرف بنجاح");
      loadIssues();
    } catch (err) {
      setError("فشل تحديث حالة الصرف: " + err.message);
    }
  };

  const openEditModal = (issue) => {
    const formData = {
      id: issue.id,
      case_number: issue.case_number ?? "",
      case_title: issue.case_title ?? "",
      case_description: issue.case_description ?? "",
      status: issue.status ?? "pending",
      payment_status: issue.payment_status ?? "",
      payment_date: issue.payment_date ?? "",
    };
    if (issue.excel_data) {
      CASE_FIELD_ORDER.forEach((field) => {
        if (!(field in formData)) {
          formData[field] = issue.excel_data[field] ?? "";
        }
      });
    }
    setEditingIssue(issue);
    setEditForm(formData);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    console.log("SAVE BUTTON CLICKED");
    if (!editingIssue) return;

    try {
      setError("");
      setSuccess("");
      const { id, case_number, case_title, case_description, status, payment_status, payment_date, ...rest } = editForm;

      const issuesPayload = {
        case_number: case_number ?? "",
        case_title: case_title ?? "",
        case_description: case_description ?? "",
        status: status ?? "pending",
        payment_status: payment_status !== "" ? payment_status : null,
        payment_date: payment_date !== "" ? payment_date : null,
      };

      console.log("SAVE DATA:", editForm);

      // تحديث جدول القضايا مع التحقق الفعلي من أن الصف اكتمل تحديثه.
      console.log("START SUPABASE UPDATE");
      const { data: updatedIssues, error: updateErr } = await supabase
        .from("issues")
        .update(issuesPayload)
        .eq("id", id)
        .select("id");

      console.log("SUPABASE RESULT:", { data: updatedIssues, error: updateErr });

      if (updateErr) throw updateErr;
      if (!updatedIssues || updatedIssues.length === 0) {
        throw new Error(
          "لم يتم تحديث القضية — سياسات قاعدة البيانات (RLS) تمنع التعديل. شغّل create_issues_tables.sql ثم أعد المحاولة."
        );
      }

      if (editingIssue.case_type === "individual") {
        const { data: existing, error: selectErr } = await supabase
          .from("issue_details")
          .select('id, "row_number", data')
          .eq("issue_id", id)
          .order("id", { ascending: false })
          .limit(1);
        if (selectErr) throw selectErr;

        // نبدأ من آخر بيانات محفوظة (لا نمسح الأعمدة الأخرى غير المعروضة في النموذج).
        const baseData = (existing && existing.length > 0 && existing[0].data) ? { ...existing[0].data } : {};
        CASE_FIELD_ORDER.forEach((field) => {
          let value = rest[field] !== undefined ? rest[field] : "";
          if (ISSUE_NUMERIC_FIELDS.includes(field)) {
            value = normalizeIssueNumber(value);
          }
          baseData[field] = value;
        });

        const rowNumber = existing?.[0]?.row_number ?? 1;

        if (existing && existing.length > 0) {
          const { data: updatedRows, error: detailErr } = await supabase
            .from("issue_details")
            .update({ data: baseData })
            .eq("issue_id", id)
            .select("id");

          console.log("DETAIL RESULT:", { updatedRows, detailErr });

          if (detailErr) throw detailErr;

          // إذا لم يتأثر أي صف (سياسات RLS تمنع UPDATE بصمت)،
          // نضيف صفًا جديدًا بأحدث البيانات بدل الحذف — تُبقى كل البيانات
          // ويقرأ النظام دائمًا أحدث صف (ترتيب تنازلي على id).
          if (!updatedRows || updatedRows.length === 0) {
            const { data: insertedRows, error: insErr } = await supabase
              .from("issue_details")
              .insert({
                issue_id: id,
                row_number: rowNumber,
                data: baseData,
              })
              .select("id");
            if (insErr) throw insErr;
            if (!insertedRows || insertedRows.length === 0) {
              throw new Error(
                "سياسات قاعدة البيانات تمنع حفظ تفاصيل القضية - شغّل ملف fix_issue_details_update_policy.sql (أو create_issues_tables.sql) في Supabase SQL Editor"
              );
            }
          }
        } else {
          const newDetailData = {};
          CASE_FIELD_ORDER.forEach((field) => {
            let value = rest[field] !== undefined ? rest[field] : "";
            if (ISSUE_NUMERIC_FIELDS.includes(field)) {
              value = normalizeIssueNumber(value);
            }
            newDetailData[field] = value;
          });

          const { error: detailErr, data: insertedRows } = await supabase
            .from("issue_details")
            .insert({
              issue_id: id,
              row_number: 1,
              data: newDetailData,
            })
            .select("id");
          if (detailErr) throw detailErr;
          if (!insertedRows || insertedRows.length === 0) {
            throw new Error(
              "سياسات قاعدة البيانات تمنع إضافة تفاصيل القضية - شغّل create_issues_tables.sql ثم أعد المحاولة."
            );
          }
        }
      }

      // إعادة تحميل القضية من قاعدة البيانات لضمان أن الشاشة تعكس ما حُفظ فعلاً.
      const refreshed = await loadIssueRow(id);
      if (refreshed) upsertIssue(refreshed);

      setSuccess("تم حفظ التعديلات بنجاح");
      setEditingIssue(null);
    } catch (err) {
      setError("فشل حفظ التعديلات: " + err.message);
    }
  };

  const openDetailModal = (issue) => {
    setDetailModalIssue(issue);
    loadAdditionalDocs(issue.id);
    setAddDocFile(null);
  };

  const filteredIssues = issues.filter((issue) => {
    const q = search.toLowerCase();
    const matchSearch =
      (issue.case_number || "").toLowerCase().includes(q) ||
      (issue.case_title || "").toLowerCase().includes(q) ||
      (issue.case_description || "").toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" || issue.status === statusFilter;
    const matchPaymentStatus =
      paymentStatusFilter === "all" ||
      normalizePaymentStatus(issue.payment_status) === paymentStatusFilter;
    return matchSearch && matchStatus && matchPaymentStatus;
  });

  const getPaymentBadge = (status) => {
    if (!status)
      return (
        <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>
      );
    const map = {
      "جاري التنفيذ": { bg: "#E0E7FF", color: "#4338CA" },
      "تم التنفيذ وفي انتظار الصرف": { bg: "#FEF3C7", color: "#92400E" },
      "تم الصرف": { bg: "#D1FAE5", color: "#047857" },
      "مرفوضة": { bg: "#FEE2E2", color: "#DC2626" },
    };
    const displayStatus = normalizePaymentStatus(status);
    const s = map[displayStatus] || { bg: "#F1F5F9", color: "#475569" };
    return (
      <span
        style={{
          background: s.bg,
          color: s.color,
          padding: "3px 10px",
          borderRadius: "20px",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {displayStatus}
      </span>
    );
  };

  const stats = {
    total: issues.length,
    pending: issues.filter((i) => i.status === "pending").length,
    inProgress: issues.filter((i) => i.status === "in_progress").length,
    completed: issues.filter((i) => i.status === "approved").length,
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.pageHeader}>
          <div>
            <h2 style={styles.cardTitle}>⚖️ إدارة القضايا</h2>
            <p style={styles.cardSub}>
              رفع وإدارة القضايا مع ملفات Excel و PDF
            </p>
          </div>
          <button
            type="button"
            style={{
              ...styles.primaryButton,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: showAddPanel ? "#DC2626" : "#2563EB",
            }}
            onClick={() => setShowAddPanel((open) => !open)}
          >
            <span style={{ fontSize: 15 }}>
              {showAddPanel ? "✕" : "➕"}
            </span>
            <span>
              {showAddPanel ? "إغلاق" : "إضافة قضية جديدة"}
            </span>
          </button>
        </div>

        {error && (
          <div
            style={{
              ...styles.errorBox,
              whiteSpace: "pre-line",
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}
        {success && <div style={styles.successBox}>{success}</div>}

        <div style={styles.statsGrid} className="issues-stats-grid">
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📋</div>
            <div style={styles.statValue}>{stats.total}</div>
            <div style={styles.statLabel}>إجمالي القضايا</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>⏳</div>
            <div style={styles.statValue}>{stats.pending}</div>
            <div style={styles.statLabel}>قيد المعالجة</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🔄</div>
            <div style={styles.statValue}>{stats.inProgress}</div>
            <div style={styles.statLabel}>جاري التنفيذ</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>✅</div>
            <div style={styles.statValue}>{stats.completed}</div>
            <div style={styles.statLabel}>مكتملة</div>
          </div>
        </div>

        {showAddPanel && (
        <div style={styles.uploadSections} className="issues-upload-grid">
          <div style={styles.uploadSection}>
            <h3 style={styles.uploadSectionTitle}>
              📊 رفع قائمة قضايا (Excel)
            </h3>
            <form onSubmit={handleExcelSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>ملف Excel:</label>
                <div style={styles.fileUploadArea}>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    style={{ display: "none" }}
                    id="excel-upload"
                  />
                  <label
                    htmlFor="excel-upload"
                    style={styles.fileUploadLabel}
                  >
                    {excelFile ? excelFile.name : "اختر ملف Excel"}
                  </label>
                </div>
              </div>
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={excelUploading || !excelFile}
              >
                {excelUploading ? "جاري الرفع..." : "📥 رفع ملف Excel"}
              </button>
            </form>
          </div>

          <div style={styles.uploadSection}>
            <h3 style={styles.uploadSectionTitle}>
              📄 رفع قضية فردية (PDF)
            </h3>
            <form onSubmit={handlePdfSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>رقم القضية *</label>
                <input
                  type="text"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  style={styles.input}
                  placeholder="أدخل رقم القضية"
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>اسم صاحب القضية *</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  style={styles.input}
                  placeholder="أدخل اسم صاحب القضية"
                  required
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>وصف القضية</label>
                <textarea
                  value={caseDescription}
                  onChange={(e) => setCaseDescription(e.target.value)}
                  style={styles.textarea}
                  placeholder="أدخل وصف القضية (اختياري)"
                  rows="3"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>ملف PDF *</label>
                <div style={styles.fileUploadArea}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files[0])}
                    style={{ display: "none" }}
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    style={styles.fileUploadLabel}
                  >
                    {pdfFile ? pdfFile.name : "اختر ملف PDF"}
                  </label>
                </div>
              </div>
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={pdfUploading || !pdfFile}
              >
                {pdfUploading ? "جاري الرفع..." : "📥 رفع ملف PDF"}
              </button>
            </form>
          </div>
        </div>
      )}

        {issues.length > 0 && (
          <div style={styles.filterRow}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔎 بحث برقم القضية أو الاسم"
              style={styles.searchInput}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="all">كل الحالات</option>
              <option value="pending">قيد المعالجة</option>
              <option value="in_progress">جاري التنفيذ</option>
              <option value="approved">مكتملة</option>
              <option value="rejected">مرفوضة</option>
            </select>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="all">كل حالات الصرف</option>
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {filteredIssues.length > 0 ? (
          <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, minWidth: "1200px" }}>
              <thead>
                <tr>
                  <th style={styles.th}>الاسم</th>
                  <th style={styles.th}>رقم القضية</th>
                  <th style={styles.th}>شهر تغيير الأساسي</th>
                  <th style={styles.th}>الأساسي بعد التغيير</th>
                  <th style={styles.th}>الإجمالي</th>
                  <th style={styles.th}>الصافي</th>
                  <th style={styles.th}>حالة الصرف</th>
                  <th style={styles.th}>تاريخ الصرف</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.slice(0, 300).map((issue) => {
                  const d = issue.excel_data || {};
                  return (
                    <tr key={issue.id} style={styles.tr}>
                      <td style={styles.td}>
                        {issue.case_title || "-"}
                      </td>
                      <td style={styles.td}>
                        {issue.case_number || "-"}
                      </td>
                      <td style={styles.td}>
                        {normalizeMonthValue(d["شهر تغير الاساسي"]) || "-"}
                      </td>
                      <td style={styles.td}>
                        {d["الاساسي بعد التغيير"] || "-"}
                      </td>
                      <td style={styles.td}>
                        {formatMoneyValue(d["الاجمالي"])}
                      </td>
                      <td style={styles.td}>
                        {formatMoneyValue(d["الصافي"])}
                      </td>
                      <td style={styles.td}>
                        {getPaymentBadge(issue.payment_status)}
                      </td>
                      <td style={styles.td}>
                        {issue.payment_date || "-"}
                      </td>
                      <td style={styles.td}>
                        {getStatusBadge(issue.status)}
                      </td>
                      <td style={styles.td}>
                        <div
                          style={{
                            display: "flex",
                            gap: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          {issue.file_url && (
                            <a
                              href={issue.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                ...styles.viewButton,
                                textDecoration: "none",
                              }}
                            >
                              👁️ عرض
                            </a>
                          )}
                          <button
                            style={{
                              ...styles.viewButton,
                              background: "#FEF3C7",
                              color: "#92400E",
                              borderColor: "#FDE68A",
                            }}
                            onClick={() => openDetailModal(issue)}
                            title="تفاصيل وملفات القضية"
                          >
                            📎 تفاصيل
                          </button>
                          <button
                            style={{
                              ...styles.viewButton,
                              background: "#ECFDF5",
                              color: "#047857",
                            }}
                            onClick={() => openEditModal(issue)}
                            title="تعديل البيانات"
                          >
                            ✏️ تعديل
                          </button>
                          <select
                            value={issue.status}
                            onChange={(e) =>
                              handleUpdateStatus(issue.id, e.target.value)
                            }
                            style={{
                              ...styles.statusSelect,
                              padding: "4px 6px",
                              fontSize: 11,
                            }}
                          >
                            <option value="pending">قيد المعالجة</option>
                            <option value="in_progress">
                              جاري التنفيذ
                            </option>
                            <option value="approved">مكتملة</option>
                            <option value="rejected">مرفوضة</option>
                          </select>
                          <button
                            style={{
                              ...styles.deleteButton,
                              padding: "4px 8px",
                              fontSize: "12px",
                            }}
                            onClick={() => handleDeleteIssue(issue.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredIssues.length > 300 && (
              <div style={styles.infoBox}>
                يتم عرض أول 300 سجل في الشاشة فقط.
              </div>
            )}
          </div>
        ) : !loading && issues.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⚖️</div>
            <h3>لا توجد قضايا حتى الآن</h3>
            <p>ابدأ برفع ملف Excel أو PDF لإضافة قضايا</p>
          </div>
        ) : null}

        {loading && (
          <div style={styles.infoBox}>جاري تحميل البيانات...</div>
        )}
      </div>

      {/* Modal تعديل البيانات */}
      {editingIssue && (
        <div
          style={styles.overlay}
          onClick={() => setEditingIssue(null)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(650px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setEditingIssue(null)}
            >
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>
              ✏️
            </div>
            <h3 style={styles.loginTitle}>تعديل بيانات القضية</h3>

            <form onSubmit={handleSaveEdit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
                className="issues-modal-grid"
              >
                <div>
                  <label style={styles.formLabel}>رقم القضية</label>
                  <input
                    type="text"
                    value={editForm.case_number ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        case_number: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>اسم صاحب القضية</label>
                  <input
                    type="text"
                    value={editForm.case_title ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        case_title: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>
                    شهر تغيير الأساسي
                  </label>
                  <select
                    value={normalizeMonthValue(
                      editForm["شهر تغير الاساسي"] ?? ""
                    )}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        "شهر تغير الاساسي": e.target.value,
                      }))
                    }
                    style={styles.input}
                  >
                    <option value="">— اختر الشهر —</option>
                    {(() => {
                      const storedMonth = normalizeMonthValue(
                        editForm["شهر تغير الاساسي"] ?? ""
                      );
                      if (storedMonth && !MONTHS_LIST.includes(storedMonth)) {
                        return (
                          <option key={storedMonth} value={storedMonth}>
                            {storedMonth}
                          </option>
                        );
                      }
                      return null;
                    })()}
                    {MONTHS_LIST.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.formLabel}>
                    الأساسي بعد التغيير
                  </label>
                  <input
                    type="text"
                    value={editForm["الاساسي بعد التغيير"] ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        "الاساسي بعد التغيير": e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>الإجمالي (ج.م)</label>
                  <input
                    type="text"
                    value={editForm["الاجمالي"] ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        الاجمالي: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>الصافي (ج.م)</label>
                  <input
                    type="text"
                    value={editForm["الصافي"] ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        الصافي: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>حالة الصرف</label>
                  <select
                    value={editForm.payment_status ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        payment_status: e.target.value,
                      }))
                    }
                    style={styles.input}
                  >
                    <option value="">— اختر —</option>
                    {PAYMENT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={styles.formLabel}>تاريخ الصرف</label>
                  <input
                    type="date"
                    value={editForm.payment_date ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        payment_date: e.target.value,
                      }))
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.formLabel}>الحالة</label>
                  <select
                    value={editForm.status ?? "pending"}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        status: e.target.value,
                      }))
                    }
                    style={styles.input}
                  >
                    <option value="pending">قيد المعالجة</option>
                    <option value="in_progress">جاري التنفيذ</option>
                    <option value="approved">مكتملة</option>
                    <option value="rejected">مرفوضة</option>
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={styles.formLabel}>وصف القضية</label>
                  <textarea
                    value={editForm.case_description ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        case_description: e.target.value,
                      }))
                    }
                    style={styles.textarea}
                    rows="2"
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setEditingIssue(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{
                    ...styles.primaryButton,
                    position: "relative",
                    zIndex: 10001,
                    pointerEvents: "auto",
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    handleSaveEdit(event);
                  }}
                >
                  💾 حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تفاصيل القضية + الملفات */}
      {detailModalIssue && (
        <div
          style={styles.overlay}
          onClick={() => setDetailModalIssue(null)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(750px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setDetailModalIssue(null)}
            >
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>
              📎
            </div>
            <h3 style={styles.loginTitle}>تفاصيل القضية والملفات</h3>

            <div
              style={{
                background: "#F8FAFC",
                padding: 15,
                borderRadius: 10,
                marginBottom: 20,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: 13,
              }}
              className="issues-detail-grid"
            >
              <div>
                <strong>رقم القضية:</strong>{" "}
                {detailModalIssue.case_number}
              </div>
              <div>
                <strong>الاسم:</strong> {detailModalIssue.case_title}
              </div>
              <div>
                <strong>حالة الصرف:</strong>{" "}
                {getPaymentBadge(detailModalIssue.payment_status)}
              </div>
              <div>
                <strong>التاريخ:</strong>{" "}
                {new Date(
                  detailModalIssue.created_at
                ).toLocaleDateString("ar-EG")}
              </div>
              {detailModalIssue.excel_data && (
                <>
                  {CASE_FIELD_ORDER.map((field) => {
                    const val = detailModalIssue.excel_data[field];
                    if (!val) return null;
                    let display = String(val);
                    if (field === "شهر تغير الاساسي")
                      display = normalizeMonthValue(val);
                    if (field === "الاجمالي" || field === "الصافي")
                      display = formatMoneyValue(val);
                    return (
                      <div key={field}>
                        <strong>{field}:</strong> {display}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* جميع مستندات القضية (الأساسي + الإضافية) */}
            <div
              style={{
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                padding: 15,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
                className="issues-pdf-header"
              >
                <h4 style={{ margin: 0, fontSize: 15 }}>
                  📄 مستندات القضية
                </h4>
                <label
                  style={{
                    ...styles.primaryButton,
                    padding: "6px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {mainPdfUploading ? "جاري الرفع..." : "➕ إضافة PDF"}
                  <input
                    type="file"
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file)
                        handleMainPdfUpload(
                          detailModalIssue.id,
                          file
                        );
                      e.target.value = "";
                    }}
                    disabled={mainPdfUploading}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <label
                  style={{
                    ...styles.excelButton,
                    padding: "7px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  📥 إضافة PDF للقضية
                  <input
                    type="file"
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) setAddDocFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {addDocFile && (
                  <>
                    <span style={{ fontSize: 12, color: "#475569" }}>
                      {addDocFile.name}
                    </span>
                    <button
                      style={{
                        ...styles.primaryButton,
                        padding: "5px 12px",
                        fontSize: 11,
                      }}
                      onClick={handleAdditionalPdfUpload}
                      disabled={addDocUploading}
                    >
                      {addDocUploading ? "جاري..." : "📥 رفع"}
                    </button>
                    <button
                      style={{
                        ...styles.deleteButton,
                        padding: "5px 10px",
                        fontSize: 11,
                      }}
                      onClick={() => setAddDocFile(null)}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>

              {detailModalIssue.file_url || additionalDocs.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {detailModalIssue.file_url && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "#F0FDF4",
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      className="issues-pdf-file"
                    >
                      <span>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {detailModalIssue.file_name || "PDF الأساسي"}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          الملف الأساسي
                        </div>
                      </div>
                      <a
                        href={detailModalIssue.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...styles.viewButton,
                          textDecoration: "none",
                        }}
                      >
                        👁️ معاينة
                      </a>
                      <a
                        href={detailModalIssue.file_url}
                        download
                        style={{
                          ...styles.viewButton,
                          textDecoration: "none",
                          background: "#FEF3C7",
                          color: "#92400E",
                        }}
                      >
                        ⬇️ تحميل
                      </a>
                    </div>
                  )}
                  {additionalDocs.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "#F8FAFC",
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <span>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {doc.file_name}
                        </div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          {new Date(doc.created_at).toLocaleDateString(
                            "ar-EG"
                          )}
                        </div>
                      </div>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          ...styles.viewButton,
                          textDecoration: "none",
                        }}
                      >
                        👁️
                      </a>
                      <a
                        href={doc.file_url}
                        download
                        style={{
                          ...styles.viewButton,
                          textDecoration: "none",
                          background: "#FEF3C7",
                          color: "#92400E",
                        }}
                      >
                        ⬇️
                      </a>
                      <button
                        style={{
                          ...styles.deleteButton,
                          padding: "4px 8px",
                        }}
                        onClick={() =>
                          handleDeleteAdditionalDoc(doc.id)
                        }
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: 10,
                    color: "#94A3B8",
                    fontSize: 13,
                  }}
                >
                  لا توجد مستندات مرفقة لهذه القضية
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setDetailModalIssue(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status) {
  const map = {
    pending: {
      bg: "#FEF3C7",
      color: "#92400E",
      text: "قيد المعالجة",
    },
    approved: {
      bg: "#D1FAE5",
      color: "#047857",
      text: "مكتملة",
    },
    rejected: {
      bg: "#FEE2E2",
      color: "#DC2626",
      text: "مرفوضة",
    },
    in_progress: {
      bg: "#DBEAFE",
      color: "#1D4ED8",
      text: "جاري التنفيذ",
    },
  };
  const s = map[status] || map.pending;
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: "3px 10px",
        borderRadius: "20px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {s.text}
    </span>
  );
}

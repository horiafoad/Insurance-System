import React, { useState, useEffect, useMemo } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";
import * as XLSX from "xlsx";

export default function IssuesManagementPage() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // حالة نموذج رفع Excel
  const [excelFile, setExcelFile] = useState(null);
  const [excelUploading, setExcelUploading] = useState(false);
  
  // حالة نموذج رفع PDF
  const [pdfFile, setPdfFile] = useState(null);
  const [caseNumber, setCaseNumber] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [pdfUploading, setPdfUploading] = useState(false);
  const [selectedIssueForPdf, setSelectedIssueForPdf] = useState(null);
  const [pdfUploadModal, setPdfUploadModal] = useState(false);
  const [individualPdfFile, setIndividualPdfFile] = useState(null);
  
  // البحث والتصفية
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // تحميل القضايا عند بدء الصفحة
  useEffect(() => {
    loadIssues();
  }, []);

  const loadIssues = async () => {
    try {
      setLoading(true);
      setError("");
      
      console.log("بدء تحميل القضايا...");
      
      const { data, error } = await supabase
        .from("issues")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      console.log("تم تحميل القضايا:", data);
      
      // لكل قضية، نحاول جلب بيانات Excel إذا كانت موجودة
      const issuesWithData = await Promise.all(
        (data || []).map(async (issue) => {
          console.log("معالجة القضية:", issue.id, issue.case_type);
          
          if (issue.case_type === "individual") {
            // محاولة جلب البيانات من issue_details بناءً على case_number
            const { data: details, error: detailsError } = await supabase
              .from("issue_details")
              .select("data")
              .eq("issue_id", issue.id)
              .limit(1);
            
            if (detailsError) {
              console.error("خطأ في جلب التفاصيل:", detailsError);
            }
            
            console.log("تفاصيل القضية:", details);
            
            return {
              ...issue,
              excel_data: details?.[0]?.data || null
            };
          }
          return issue;
        })
      );
      
      console.log("القضايا مع البيانات:", issuesWithData);
      setIssues(issuesWithData);
    } catch (err) {
      console.error("Error loading issues:", err);
      setError("فشل تحميل القضايا: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // التحقق من نوع الملف
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
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
      
      console.log("بدء رفع ملف Excel:", excelFile.name, excelFile.size);
      
      // قراءة ملف Excel
      const data = await excelFile.arrayBuffer();
      console.log("تم قراءة الملف، الحجم:", data.byteLength);
      
      const workbook = XLSX.read(data);
      console.log("تم قراءة Workbook، عدد الأوراق:", workbook.SheetNames.length);
      
      if (workbook.SheetNames.length === 0) {
        throw new Error("الملف لا يحتوي على أي أوراق");
      }
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      console.log("تم استخراج البيانات، عدد الصفوف:", jsonData.length);
      
      if (jsonData.length === 0) {
        throw new Error("الملف فارغ أو لا يحتوي على بيانات");
      }
      
      console.log("عينة من البيانات:", jsonData[0]);
      
      // رفع الملف إلى Supabase Storage مباشرة
      console.log("بدء رفع الملف إلى Storage...");
      
      // تنظيف اسم الملف: إزالة الأحرف العربية والرموز الخاصة
      const cleanFileName = excelFile.name
        .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // إزالة العربية
        .replace(/[^\w\s.-]/g, '') // إزالة الرموز الخاصة ما عدا النقطة والشرطة
        .replace(/\s+/g, '_') // استبدال المسافات بشرطات سفلية
        .replace(/_{2,}/g, '_') // إزالة الشرطات المكررة
        .trim();
      
      const fileName = `excel_${Date.now()}_${cleanFileName}`;
      console.log("اسم الملف المنظف:", fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, excelFile);
      
      if (uploadError) {
        console.error("خطأ في رفع الملف:", uploadError);
        throw new Error("فشل رفع الملف إلى Storage: " + uploadError.message);
      }
      
      console.log("تم رفع الملف بنجاح:", uploadData);
      
      // الحصول على URL العام
      const { data: { publicUrl } } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);
      
      console.log("URL العام:", publicUrl);
      
      // إنشاء سجل قضية رئيسي للملف
      console.log("إنشاء سجل قضية رئيسي للملف...");
      const { data: mainIssueData, error: mainIssueError } = await supabase
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
          status: "pending"
        })
        .select()
        .single();
      
      if (mainIssueError) {
        console.error("خطأ في إنشاء سجل القضية الرئيسي:", mainIssueError);
        throw new Error("فشل إنشاء سجل القضية الرئيسي: " + mainIssueError.message);
      }
      
      console.log("تم إنشاء سجل القضية الرئيسي:", mainIssueData);
      
      // إنشاء قضية منفصلة لكل صف في Excel
      console.log("إنشاء قضايا منفصلة لكل صف في Excel...");
      const individualIssues = [];
      
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const caseNumber = row['رقم القضية'] || row['Case Number'] || row['رقم'] || `CASE_${Date.now()}_${i + 1}`;
        const caseTitle = row['عنوان القضية'] || row['Case Title'] || row['العنوان'] || `قضية ${i + 1}`;
        const caseDescription = row['وصف'] || row['Description'] || row['الوصف'] || '';
        
        const { data: issueData, error: issueError } = await supabase
          .from("issues")
          .insert({
            case_number: caseNumber,
            case_title: caseTitle,
            case_description: caseDescription,
            case_type: "individual",
            file_type: "excel",
            file_url: publicUrl,
            file_name: excelFile.name,
            file_size: excelFile.size,
            status: "pending"
          })
          .select()
          .single();
        
        if (issueError) {
          console.error(`خطأ في إنشاء القضية ${i + 1}:`, issueError);
          continue;
        }
        
        // حفظ بيانات Excel في issue_details
        const { error: detailsError } = await supabase
          .from("issue_details")
          .insert({
            issue_id: issueData.id,
            row_number: i + 1,
            data: row,
            status: "pending"
          });
        
        if (detailsError) {
          console.error(`خطأ في حفظ بيانات القضية ${i + 1}:`, detailsError);
        }
        
        individualIssues.push(issueData);
        console.log(`تم إنشاء القضية ${i + 1}/${jsonData.length}`);
      }
      
      console.log(`تم إنشاء ${individualIssues.length} قضية منفصلة`);
      
      setSuccess(`تم رفع ملف Excel بنجاح! تم إنشاء ${individualIssues.length} قضية منفصلة. يمكنك الآن رفع ملف PDF لكل قضية.`);
      setExcelFile(null);
      loadIssues();
      
    } catch (err) {
      console.error("Error uploading Excel:", err);
      setError("فشل رفع ملف Excel: " + err.message);
      
      // رسائل تفصيلية للمشاكل الشائعة
      if (err.message.includes("Storage") || err.message.includes("bucket")) {
        setError(err.message + "\n\n💡 حل: نفذ ملف setup_storage_bucket.sql في Supabase SQL Editor");
      } else if (err.message.includes("row") || err.message.includes("duplicate")) {
        setError(err.message + "\n\n💡 حل: قد يكون هناك مشكلة في البيانات المكررة");
      } else if (err.message.includes("permission") || err.message.includes("authorization")) {
        setError(err.message + "\n\n💡 حل: تحقق من صلاحيات Storage وقاعدة البيانات");
      }
    } finally {
      setExcelUploading(false);
    }
  };

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.type !== "application/pdf") {
      setError("يرجى اختيار ملف PDF صالح");
      return;
    }
    
    setPdfFile(file);
    setError("");
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
      
      console.log("بدء رفع ملف PDF:", pdfFile.name, pdfFile.size);
      
      // رفع الملف إلى Supabase Storage مباشرة
      console.log("بدء رفع الملف إلى Storage...");
      
      // تنظيف اسم الملف: إزالة الأحرف العربية والرموز الخاصة
      const cleanFileName = pdfFile.name
        .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '') // إزالة العربية
        .replace(/[^\w\s.-]/g, '') // إزالة الرموز الخاصة ما عدا النقطة والشرطة
        .replace(/\s+/g, '_') // استبدال المسافات بشرطات سفلية
        .replace(/_{2,}/g, '_') // إزالة الشرطات المكررة
        .trim();
      
      const fileName = `pdf_${Date.now()}_${cleanFileName}`;
      console.log("اسم الملف المنظف:", fileName);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, pdfFile);
      
      if (uploadError) {
        console.error("خطأ في رفع الملف:", uploadError);
        throw new Error("فشل رفع الملف إلى Storage: " + uploadError.message);
      }
      
      console.log("تم رفع الملف بنجاح:", uploadData);
      
      // الحصول على URL العام
      const { data: { publicUrl } } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);
      
      console.log("URL العام:", publicUrl);
      
      // إنشاء سجل القضية
      console.log("إنشاء سجل القضية في قاعدة البيانات...");
      const { error: issueError } = await supabase
        .from("issues")
        .insert({
          case_number: caseNumber,
          case_title: caseTitle,
          case_description: caseDescription,
          case_type: "individual",
          file_type: "pdf",
          file_url: publicUrl,
          file_name: pdfFile.name,
          file_size: pdfFile.size,
          status: "pending"
        });
      
      if (issueError) {
        console.error("خطأ في إنشاء سجل القضية:", issueError);
        throw new Error("فشل إنشاء سجل القضية: " + issueError.message);
      }
      
      console.log("تم إنشاء سجل القضية بنجاح");
      
      setSuccess("تم رفع ملف القضية بنجاح!");
      setPdfFile(null);
      setCaseNumber("");
      setCaseTitle("");
      setCaseDescription("");
      loadIssues();
      
    } catch (err) {
      console.error("Error uploading PDF:", err);
      setError("فشل رفع ملف PDF: " + err.message);
      
      // رسائل تفصيلية للمشاكل الشائعة
      if (err.message.includes("Storage") || err.message.includes("bucket")) {
        setError(err.message + "\n\n💡 حل: نفذ ملف setup_storage_bucket.sql في Supabase SQL Editor");
      } else if (err.message.includes("permission") || err.message.includes("authorization")) {
        setError(err.message + "\n\n💡 حل: تحقق من صلاحيات Storage وقاعدة البيانات");
      }
    } finally {
      setPdfUploading(false);
    }
  };

  const handleIndividualPdfUpload = async (issueId) => {
    if (!individualPdfFile) {
      setError("يرجى اختيار ملف PDF أولاً");
      return;
    }
    
    try {
      setPdfUploading(true);
      setError("");
      setSuccess("");
      
      console.log("بدء رفع PDF للقضية:", issueId);
      
      // تنظيف اسم الملف
      const cleanFileName = individualPdfFile.name
        .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '')
        .replace(/[^\w\s.-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .trim();
      
      const fileName = `pdf_issue_${issueId}_${Date.now()}_${cleanFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("issues-files")
        .upload(fileName, individualPdfFile);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from("issues-files")
        .getPublicUrl(fileName);
      
      // تحديث القضية بإضافة رابط PDF
      const { error: updateError } = await supabase
        .from("issues")
        .update({
          file_type: "pdf",
          file_url: publicUrl,
          file_name: individualPdfFile.name,
          file_size: individualPdfFile.size
        })
        .eq("id", issueId);
      
      if (updateError) throw updateError;
      
      setSuccess("تم رفع ملف PDF للقضية بنجاح!");
      setIndividualPdfFile(null);
      setPdfUploadModal(false);
      loadIssues();
      
    } catch (err) {
      console.error("Error uploading individual PDF:", err);
      setError("فشل رفع ملف PDF: " + err.message);
    } finally {
      setPdfUploading(false);
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
      console.error("Error deleting issue:", err);
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
      
      setSuccess("تم تحديث حالة القضية بنجاح");
      loadIssues();
      
    } catch (err) {
      console.error("Error updating status:", err);
      setError("فشل تحديث الحالة: " + err.message);
    }
  };

  // تصفية القضايا
  const filteredIssues = issues.filter(issue => {
    const matchesSearch = 
      (issue.case_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (issue.case_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (issue.case_description || "").toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesType = typeFilter === "all" || issue.case_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  // استخراج الأعمدة من البيانات (مثل المطالبات)
  const columns = useMemo(() => {
    const result = [];
    
    console.log("استخراج الأعمدة من القضايا:", issues);
    
    issues.forEach(issue => {
      // إذا كانت القضية من Excel، نعرض بياناتها
      if (issue.case_type === "individual" && issue.excel_data) {
        console.log("بيانات Excel للقضية:", issue.excel_data);
        Object.keys(issue.excel_data).forEach(key => {
          if (!result.includes(key)) {
            result.push(key);
          }
        });
      }
    });
    
    console.log("الأعمدة المستخرجة:", result);
    return result;
  }, [issues]);

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: { bg: "#FEF3C7", color: "#92400E", text: "قيد المعالجة" },
      approved: { bg: "#D1FAE5", color: "#047857", text: "تمت الموافقة" },
      rejected: { bg: "#FEE2E2", color: "#DC2626", text: "مرفوض" },
      in_progress: { bg: "#DBEAFE", color: "#1D4ED8", text: "جاري التنفيذ" }
    };
    
    const style = statusStyles[status] || statusStyles.pending;
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: "4px 12px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600"
      }}>
        {style.text}
      </span>
    );
  };

  const getFileTypeBadge = (fileType) => {
    const typeStyles = {
      excel: { bg: "#E0F2FE", color: "#0369A1", text: "Excel" },
      pdf: { bg: "#FEE2E2", color: "#DC2626", text: "PDF" }
    };
    
    const style = typeStyles[fileType] || typeStyles.excel;
    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: "4px 12px",
        borderRadius: "20px",
        fontSize: "12px",
        fontWeight: "600"
      }}>
        {style.text}
      </span>
    );
  };

  const stats = {
    total: issues.length,
    pending: issues.filter(i => i.status === "pending").length,
    inProgress: issues.filter(i => i.status === "in_progress").length,
    completed: issues.filter(i => i.status === "approved").length,
    excel: issues.filter(i => i.file_type === "excel").length,
    pdf: issues.filter(i => i.file_type === "pdf").length
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.pageHeader}>
          <div>
            <h2 style={styles.cardTitle}>⚖️ إدارة القضايا</h2>
            <p style={styles.cardSub}>رفع وإدارة القضايا مع ملفات Excel و PDF</p>
          </div>
        </div>

        {error && (
          <div style={{...styles.errorBox, whiteSpace: "pre-line", lineHeight: 1.6}}>
            {error}
          </div>
        )}
        {success && <div style={styles.successBox}>{success}</div>}

        {/* إحصائيات */}
        <div style={styles.statsGrid}>
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
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📊</div>
            <div style={styles.statValue}>{stats.excel}</div>
            <div style={styles.statLabel}>ملفات Excel</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📄</div>
            <div style={styles.statValue}>{stats.pdf}</div>
            <div style={styles.statLabel}>ملفات PDF</div>
          </div>
        </div>

        {/* أقسام الرفع */}
        <div style={styles.uploadSections}>
          {/* قسم رفع Excel */}
          <div style={styles.uploadSection}>
            <h3 style={styles.uploadSectionTitle}>📊 رفع قائمة قضايا (Excel)</h3>
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
                  <label htmlFor="excel-upload" style={styles.fileUploadLabel}>
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

          {/* قسم رفع PDF */}
          <div style={styles.uploadSection}>
            <h3 style={styles.uploadSectionTitle}>📄 رفع قضية فردية (PDF)</h3>
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
                <label style={styles.formLabel}>عنوان القضية *</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  style={styles.input}
                  placeholder="أدخل عنوان القضية"
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
                    onChange={handlePdfUpload}
                    style={{ display: "none" }}
                    id="pdf-upload"
                  />
                  <label htmlFor="pdf-upload" style={styles.fileUploadLabel}>
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

        {/* البحث والتصفية */}
        {issues.length > 0 && (
          <div style={styles.filterRow}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔎 بحث برقم القضية أو العنوان"
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
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="all">كل الأنواع</option>
              <option value="individual">فردية</option>
              <option value="bulk">جماعية</option>
            </select>
          </div>
        )}

        {/* جدول القضايا */}
        {filteredIssues.length > 0 ? (
          <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, minWidth: "1200px" }}>
              <thead>
                <tr>
                  <th style={styles.th}>رقم القضية</th>
                  <th style={styles.th}>العنوان</th>
                  {columns.map((column) => (
                    <th key={column} style={styles.th}>
                      {column}
                    </th>
                  ))}
                  <th style={styles.th}>النوع</th>
                  <th style={styles.th}>نوع الملف</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>تاريخ الرفع</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.slice(0, 300).map((issue) => (
                  <tr key={issue.id} style={styles.tr}>
                    <td style={styles.td}>{issue.case_number}</td>
                    <td style={styles.td}>{issue.case_title}</td>
                    {columns.length > 0 ? (
                      columns.map((column) => (
                        <td key={column} style={styles.td}>
                          {issue.excel_data ? String(issue.excel_data[column] ?? "") : "-"}
                        </td>
                      ))
                    ) : (
                      <td style={styles.td} colSpan="5">
                        <div style={{ 
                          background: "#FEF3C7", 
                          color: "#92400E", 
                          padding: "8px", 
                          borderRadius: "6px", 
                          fontSize: "12px",
                          textAlign: "center"
                        }}>
                          لا توجد بيانات Excel محفوظة
                        </div>
                      </td>
                    )}
                    <td style={styles.td}>
                      {issue.case_type === "individual" ? "فردية" : "جماعية"}
                    </td>
                    <td style={styles.td}>{getFileTypeBadge(issue.file_type)}</td>
                    <td style={styles.td}>{getStatusBadge(issue.status)}</td>
                    <td style={styles.td}>
                      {new Date(issue.created_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {issue.file_url && (
                          <a
                            href={issue.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...styles.viewButton, textDecoration: "none" }}
                          >
                            👁️ عرض
                          </a>
                        )}
                        {issue.case_type === "individual" && issue.file_type === "excel" && (
                          <button
                            style={{ ...styles.primaryButton, padding: "4px 8px", fontSize: "12px" }}
                            onClick={() => {
                              setSelectedIssueForPdf(issue);
                              setPdfUploadModal(true);
                            }}
                          >
                            📄 رفع PDF
                          </button>
                        )}
                        <select
                          value={issue.status}
                          onChange={(e) => handleUpdateStatus(issue.id, e.target.value)}
                          style={{ ...styles.statusSelect, padding: "4px 8px", fontSize: "12px" }}
                        >
                          <option value="pending">قيد المعالجة</option>
                          <option value="in_progress">جاري التنفيذ</option>
                          <option value="approved">مكتملة</option>
                          <option value="rejected">مرفوضة</option>
                        </select>
                        <button
                          style={{ ...styles.deleteButton, padding: "4px 8px", fontSize: "12px" }}
                          onClick={() => handleDeleteIssue(issue.id)}
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Modal رفع PDF لقضية فردية */}
      {pdfUploadModal && selectedIssueForPdf && (
        <div
          style={styles.overlay}
          onClick={() => setPdfUploadModal(false)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(500px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setPdfUploadModal(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>📄</div>

            <h3 style={styles.loginTitle}>رفع ملف PDF للقضية</h3>
            
            <div style={{ marginBottom: "20px", textAlign: "right", background: "#F8FAFC", padding: "15px", borderRadius: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "5px" }}>
                رقم القضية: {selectedIssueForPdf.case_number}
              </div>
              <div style={{ fontSize: "14px", color: "#64748B" }}>
                {selectedIssueForPdf.case_title}
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleIndividualPdfUpload(selectedIssueForPdf.id); }}>
              <div style={{ marginBottom: "15px", textAlign: "right" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px", display: "block" }}>
                  ملف PDF
                </label>
                <div style={styles.fileUploadArea}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setIndividualPdfFile(e.target.files[0])}
                    style={{ display: "none" }}
                    id="individual-pdf-upload"
                  />
                  <label htmlFor="individual-pdf-upload" style={styles.fileUploadLabel}>
                    {individualPdfFile ? individualPdfFile.name : "اختر ملف PDF"}
                  </label>
                </div>
              </div>

              <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setPdfUploadModal(false)}
                >
                  إلغاء
                </button>
                <button 
                  type="submit" 
                  style={styles.primaryButton}
                  disabled={pdfUploading || !individualPdfFile}
                >
                  {pdfUploading ? "جاري الرفع..." : "📥 رفع PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

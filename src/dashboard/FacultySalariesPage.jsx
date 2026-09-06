import { useEffect, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";
import { supabase } from "../supabaseClient";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MONTH_NAMES = [
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

function SalaryPagePreview({ record }) {
  return (
    <div style={{ background: "#fff", minHeight: 780, display: "grid", placeItems: "center" }}>
      {record.page_image_url ? (
        <img
          src={record.page_image_url}
          alt={`مفرد مرتب صفحة ${record.page_number}`}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      ) : (
        <div style={{ padding: 24, color: "#B45309", textAlign: "center" }}>
          صورة الصفحة غير محفوظة لهذا السجل. ارفعي الملف مرة أخرى.
        </div>
      )}
    </div>
  );
}

export default function FacultySalariesPage() {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [fileName, setFileName] = useState("مفردات مرتب تدريس.pdf");
  const [processing, setProcessing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [filterFromYear, setFilterFromYear] = useState("");
  const [filterToYear, setFilterToYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");
  const [error, setError] = useState("");
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [currentProcessing, setCurrentProcessing] = useState(null);
  const [isProcessingPaused, setIsProcessingPaused] = useState(false);
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const yearMatch =
        (!filterFromYear || Number(record.period_year) >= Number(filterFromYear)) &&
        (!filterToYear || Number(record.period_year) <= Number(filterToYear));
      const monthMatch = filterMonth === "all" || String(record.period_month) === String(filterMonth);
      const searchMatch = !query || String(record.text_content || "").toLowerCase().includes(query);
      return yearMatch && monthMatch && searchMatch;
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
    }).sort((a, b) => {
      // ترتيب حسب السنة ثم الشهر ثم رقم الصفحة للعرض المتتابع
      if (a.period_year !== b.period_year) return a.period_year - b.period_year;
      if (a.period_month !== b.period_month) return a.period_month - b.period_month;
      return a.page_number - b.page_number;
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
    });
  }, [records, search, filterFromYear, filterToYear, filterMonth]);

  const handleSelectFiles = (event) => {
    const files = [...(event.target.files || [])];
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
    setPendingFiles(files.map((file) => ({
      file,
      year: new Date().getFullYear(),
      month: "",
    })));
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
    });
  }, [records, search, filterFromYear, filterToYear, filterMonth]);

  // حساب عدد الصفحات
  const totalPages = Math.ceil(results.length / itemsPerPage);
  
  // عرض النتائج الحالية فقط
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return results.slice(startIndex, startIndex + itemsPerPage);
  }, [results, currentPage, itemsPerPage]);

  const handleSelectFiles = (event) => {
    const files = [...(event.target.files || [])];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
    setPendingFiles(files.map((file) => {
      // محاولة استخراج السنة والشهر من اسم الملف إذا كان بالتنسيق المتوقع
      const nameWithoutExt = file.name.replace('.pdf', '').toLowerCase();
      let defaultYear = new Date().getFullYear();
      let defaultMonth = "";
      
      // محاولة البحث عن السنة في اسم الملف (مثال: "2024" أو "2024-05")
      const yearMatch = nameWithoutExt.match(/20(\d{2})/);
      if (yearMatch) {
        defaultYear = parseInt(yearMatch[0]);
      }
      
      // محاولة البحث عن الشهر في اسم الملف
      const monthMatch = nameWithoutExt.match(/(\d{1,2})[-_]?(\d{1,2})/);
      if (monthMatch && monthMatch.length >= 3) {
        // إذا كان التنسيق YYYY-MM أو MM-YYYY
        const num1 = parseInt(monthMatch[1]);
        const num2 = parseInt(monthMatch[2]);
        if (num1 >= 1 && num1 <= 12) {
          defaultMonth = num1;
        } else if (num2 >= 1 && num2 <= 12) {
          defaultMonth = num2;
        }
      }
      
      return {
        file,
        year: defaultYear,
        month: defaultMonth,
      };
    }));
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
    setError("");
    event.target.value = "";
  };

  const updatePendingFile = (index, field, value) => {
    setPendingFiles((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field]: value } : item
    ));
  };

  const uploadAllFiles = async () => {
    const invalidFile = pendingFiles.find((item) => !item.year || !item.month);
    if (invalidFile) {
      setError("اختاري السنة والشهر لكل ملف قبل بدء الرفع.");
      return;
    }

    setProcessing(true);
    setError("");
    try {
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
      const uploaded = [];
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      for (const item of pendingFiles) {
        setFileName(item.file.name);
        const safeFileName = item.file.name.replace(/[^\w.-]+/g, "_");
        const filePath = `faculty-salaries/${item.year}-${item.month}-${Date.now()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("faculty-salaries").upload(filePath, item.file);
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from("faculty-salaries").getPublicUrl(filePath);
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        await indexPdf(await item.file.arrayBuffer(), item.file.name, publicUrl.publicUrl, item.year, item.month);
      }
      setPendingFiles([]);
    } catch (uploadError) {
      console.error("تعذر رفع ملفات المرتبات:", uploadError);
      setError("تعذر رفع أحد الملفات: " + uploadError.message);
    } finally {
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        
        uploaded.push({
          ...item,
          filePath,
          fileUrl: publicUrl.publicUrl,
          status: "uploaded",
          progress: 0
        });
      }
      
      setUploadedFiles(uploaded);
      setProcessingQueue(uploaded);
      setPendingFiles([]);
      
      // بدء المعالجة التدريجية
      processQueueGradually();
    } catch (uploadError) {
      console.error("تعذر رفع ملفات المرتبات:", uploadError);
      setError("تعذر رفع أحد الملفات: " + uploadError.message);
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      setProcessing(false);
    }
  };

<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
  const loadRecords = async () => {
    const { data, error: loadError } = await supabase
      .from("faculty_salary_pages")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("page_number", { ascending: true });
    if (loadError) {
      setError("تعذر تحميل أرشيف المرتبات: " + loadError.message);
      return;
    }
    setRecords(data || []);
  };

  useEffect(() => {
    loadRecords();
  }, []);

<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
  const indexPdf = async (source, sourceName, fileUrl, periodYear, periodMonth) => {
    setProcessing(true);
    setError("");
    try {
      const pdf = await pdfjsLib.getDocument({ data: source }).promise;
      const indexed = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
  const loadRecords = async (page = 1, limit = itemsPerPage) => {
    try {
      // حساب الإزاحة للصفحة
      const offset = (page - 1) * limit;
      
      // جلب العدد الكلي أولاً
      const { count, error: countError } = await supabase
        .from("faculty_salary_pages")
        .select("*", { count: "exact", head: true });
      
      if (countError) throw countError;
      setTotalRecords(count || 0);
      
      // جلب البيانات مع pagination
      const { data, error: loadError } = await supabase
        .from("faculty_salary_pages")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .order("page_number", { ascending: true })
        .range(offset, offset + limit - 1);
      
      if (loadError) throw loadError;
      setRecords(data || []);
    } catch (loadError) {
      console.error("تعذر تحميل أرشيف المرتبات:", loadError);
      setError("تعذر تحميل أرشيف المرتبات: " + loadError.message);
    }
  };

  useEffect(() => {
    loadRecords(currentPage, itemsPerPage);
  }, [currentPage, itemsPerPage]);

<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
  const indexPdf = async (source, sourceName, fileUrl, periodYear, periodMonth, onProgress) => {
    try {
      const pdf = await pdfjsLib.getDocument({ data: source }).promise;
      const indexed = [];
      const totalPages = pdf.numPages;
      
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        // تحديث التقدم
        if (onProgress) {
          onProgress((pageNumber / totalPages) * 100);
        }
        
        // إعطاء المتصفح فرصة للتنفس بين الصفحات
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        await new Promise(resolve => setTimeout(resolve, 50));
        
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
        await new Promise(resolve => setTimeout(resolve, 100));
        
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
        await new Promise(resolve => setTimeout(resolve, 100));
        
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
        await new Promise(resolve => setTimeout(resolve, 100));
        
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
        await new Promise(resolve => setTimeout(resolve, 100));
        
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (pageText) {
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
          const viewport = page.getViewport({ scale: 1.5 });
=======
          // استخدام دقة أقل لتقليل استهلاك الذاكرة
          const viewport = page.getViewport({ scale: 1.0 });
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          // استخدام دقة أقل لتقليل استهلاك الذاكرة
          const viewport = page.getViewport({ scale: 1.0 });
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          // استخدام دقة أقل لتقليل استهلاك الذاكرة
          const viewport = page.getViewport({ scale: 1.0 });
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          // استخدام دقة أقل لتقليل استهلاك الذاكرة
          const viewport = page.getViewport({ scale: 1.0 });
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          // استخدام دقة أقل لتقليل استهلاك الذاكرة
          const viewport = page.getViewport({ scale: 1.0 });
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
          const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!imageBlob) throw new Error("تعذر تحويل صفحة المرتب إلى صورة.");
          const imagePath = `faculty-salaries/pages/${periodYear}-${periodMonth}-${Date.now()}-${pageNumber}.png`;
          const { error: imageUploadError } = await supabase.storage
            .from("faculty-salaries")
            .upload(imagePath, imageBlob, { contentType: "image/png", upsert: false });
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
          // استخدام JPEG بدلاً من PNG لتقليل حجم الملف
          const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (!imageBlob) throw new Error("تعذر تحويل صفحة المرتب إلى صورة.");
          const imagePath = `faculty-salaries/pages/${periodYear}-${periodMonth}-${Date.now()}-${pageNumber}.jpg`;
          const { error: imageUploadError } = await supabase.storage
            .from("faculty-salaries")
            .upload(imagePath, imageBlob, { contentType: "image/jpeg", upsert: false });
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
          if (imageUploadError) throw imageUploadError;
          const { data: imageUrl } = supabase.storage.from("faculty-salaries").getPublicUrl(imagePath);

          indexed.push({
            file_name: sourceName,
            file_url: fileUrl,
            period_year: Number(periodYear),
            period_month: Number(periodMonth),
            page_number: pageNumber,
            text_content: pageText,
            page_image_url: imageUrl.publicUrl,
          });
        }
      }
      if (indexed.length) {
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        const { error: saveError } = await supabase.from("faculty_salary_pages").insert(indexed);
        if (saveError) throw saveError;
      }
      await loadRecords();
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
    } catch (error) {
      console.error("تعذر فهرسة ملف المرتبات:", error);
      setError("تعذر قراءة أو حفظ ملف المرتبات: " + error.message);
    } finally {
      setProcessing(false);
    }
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        // تقسيم البيانات إلى مجموعات صغيرة لتجنب مشاكل الحجم
        const batchSize = 50;
        for (let i = 0; i < indexed.length; i += batchSize) {
          const batch = indexed.slice(i, i + batchSize);
          const { error: saveError } = await supabase.from("faculty_salary_pages").insert(batch);
          if (saveError) throw saveError;
          // إعطاء المتصفح فرصة للتنفس بين مجموعات الإدخال
          if (i + batchSize < indexed.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      await loadRecords();
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      return { success: true, indexedCount: indexed.length };
    } catch (error) {
      console.error("تعذر فهرسة ملف المرتبات:", error);
      return { success: false, error: error.message };
    }
  };

  const processQueueGradually = async () => {
    if (processingQueue.length === 0 || isProcessingPaused) {
      setProcessing(false);
      setCurrentProcessing(null);
      return;
    }

    const nextFile = processingQueue[0];
    setCurrentProcessing(nextFile);
    
    try {
      const fileData = await nextFile.file.arrayBuffer();
      const result = await indexPdf(
        fileData,
        nextFile.file.name,
        nextFile.fileUrl,
        nextFile.year,
        nextFile.month,
        (progress) => {
          setUploadedFiles(prev => prev.map(f => 
            f.filePath === nextFile.filePath 
              ? { ...f, progress, status: "processing" }
              : f
          ));
        }
      );

      if (result.success) {
        setUploadedFiles(prev => prev.map(f => 
          f.filePath === nextFile.filePath 
            ? { ...f, progress: 100, status: "completed" }
            : f
        ));
      } else {
        setUploadedFiles(prev => prev.map(f => 
          f.filePath === nextFile.filePath 
            ? { ...f, status: "failed", error: result.error }
            : f
        ));
      }
    } catch (error) {
      console.error("خطأ في معالجة الملف:", error);
      setUploadedFiles(prev => prev.map(f => 
        f.filePath === nextFile.filePath 
          ? { ...f, status: "failed", error: error.message }
          : f
      ));
    }

    // إزالة الملف من قائمة الانتظار والانتقال للتالي
    setProcessingQueue(prev => prev.slice(1));
    
    // إعطاء المتصفح فرصة للتنفس بين الملفات
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // معالجة الملف التالي
    setTimeout(() => processQueueGradually(), 100);
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // معالجة الملف التالي
    setTimeout(() => processQueueGradually(), 200);
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
  };

  return (
    <div style={styles.card}>
      <div style={styles.claimsHeader}>
        <div>
          <h2 style={styles.cardTitle}>👨‍🏫 مرتبات هيئة التدريس</h2>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية</p>
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية. يمكنك اختيار شهر معين لسنة معينة أو عدة سنوات لعرض الصور متتابعة. النظام الجديد يرفع الملفات أولاً ثم يعالجها تدريجياً دون تعليق المتصفح.</p>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        </div>
        <label style={styles.excelButton}>
          📥 اختيار ملفات PDF
          <input type="file" accept=".pdf" multiple onChange={handleSelectFiles} style={{ display: "none" }} />
        </label>
        {pendingFiles.length > 0 && (
          <button style={styles.primaryButton} onClick={uploadAllFiles} disabled={processing}>
            {processing ? "جاري رفع الملفات..." : `رفع كل الملفات (${pendingFiles.length})`}
          </button>
        )}
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        {uploadedFiles.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button 
              onClick={() => setIsProcessingPaused(!isProcessingPaused)}
              style={{ ...styles.primaryButton, background: isProcessingPaused ? "#10B981" : "#F59E0B" }}
            >
              {isProcessingPaused ? "▶️ استئناف المعالجة" : "⏸️ إيقاف مؤقت"}
            </button>
            <button 
              onClick={() => {
                setUploadedFiles([]);
                setProcessingQueue([]);
                setCurrentProcessing(null);
                setProcessing(false);
                loadRecords();
              }}
              style={{ ...styles.primaryButton, background: "#64748B" }}
            >
              🗑️ مسح القائمة
            </button>
          </div>
        )}
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      </div>

      {pendingFiles.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
          <div style={{ ...styles.infoBox, background: "#FEF3C7", color: "#92400E", padding: "12px 16px" }}>
            💡 نصيحة: يمكنك رفع ملفات متعددة دفعة واحدة (مثلاً: 13 سنة من الملفات). النظام سيحاول استخراج السنة والشهر من اسم الملف تلقائياً.
          </div>
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
          {pendingFiles.map((item, index) => (
            <div key={`${item.file.name}-${index}`} style={{ ...styles.infoBox, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ flex: 1, minWidth: 180 }}>{item.file.name}</strong>
              <input type="number" min="2000" value={item.year} onChange={(event) => updatePendingFile(index, "year", event.target.value)} style={{ ...styles.claimSelect, width: 130 }} placeholder="السنة" />
              <select value={item.month} onChange={(event) => updatePendingFile(index, "month", event.target.value)} style={{ ...styles.claimSelect, width: 150 }}>
                <option value="">اختاري الشهر</option>
                {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].map((name, monthIndex) => <option key={name} value={monthIndex + 1}>{name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
      <div style={styles.filterRow}>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        <input
          type="number"
          min="2000"
          value={filterFromYear}
          onChange={(event) => setFilterFromYear(event.target.value)}
          style={styles.claimSelect}
          placeholder="من سنة"
        />
        <input
          type="number"
          min="2000"
          value={filterToYear}
          onChange={(event) => setFilterToYear(event.target.value)}
          style={styles.claimSelect}
          placeholder="إلى سنة"
        />
        <select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} style={styles.claimSelect}>
          <option value="all">كل الشهور</option>
          {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      {uploadedFiles.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <div style={{ ...styles.infoBox, background: "#DBEAFE", color: "#1E40AF", padding: "12px 16px" }}>
            📊 حالة معالجة الملفات: {uploadedFiles.filter(f => f.status === "completed").length} من {uploadedFiles.length} مكتمل
          </div>
          {uploadedFiles.map((item, index) => (
            <div key={`${item.file.name}-${index}`} style={{ ...styles.infoBox, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ flex: 1, minWidth: 180 }}>{item.file.name}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                {item.status === "uploaded" && <span style={{ color: "#64748B" }}>⏳ في انتظار المعالجة</span>}
                {item.status === "processing" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <div style={{ flex: 1, height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#3B82F6", width: `${item.progress}%`, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ color: "#3B82F6", fontSize: 12, minWidth: 40 }}>{Math.round(item.progress)}%</span>
                  </div>
                )}
                {item.status === "completed" && <span style={{ color: "#10B981" }}>✅ مكتمل</span>}
                {item.status === "failed" && <span style={{ color: "#EF4444" }}>❌ فشل: {item.error}</span>}
              </div>
            </div>
          ))}
          {processingQueue.length > 0 && (
            <div style={{ ...styles.infoBox, background: "#F3F4F6", color: "#374151", padding: "12px 16px" }}>
              ⏳ جاري معالجة {processingQueue.length} ملف المتبقي... يمكنك إغلاق الصفحة والعودة لاحقاً
            </div>
          )}
        </div>
      )}

      <div style={styles.filterRow}>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#64748B" }}>السنة:</span>
          <input
            type="number"
            min="2000"
            value={filterFromYear}
            onChange={(event) => setFilterFromYear(event.target.value)}
            style={styles.claimSelect}
            placeholder="من"
          />
          <span style={{ fontSize: 14, color: "#64748B" }}>-</span>
          <input
            type="number"
            min="2000"
            value={filterToYear}
            onChange={(event) => setFilterToYear(event.target.value)}
            style={styles.claimSelect}
            placeholder="إلى"
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#64748B" }}>الشهر:</span>
          <select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} style={styles.claimSelect}>
            <option value="all">كل الشهور</option>
            {["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </div>
        <button 
          onClick={() => { setFilterFromYear(""); setFilterToYear(""); setFilterMonth("all"); }}
          style={{ ...styles.claimSelect, background: "#EF4444", color: "#fff", border: "none", cursor: "pointer" }}
        >
          مسح الفلاتر
        </button>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      </div>

      <div style={styles.claimStats}>
        <ClaimStat title="النتائج" value={results.length} icon="🔎" />
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        <ClaimStat title="الصفحات المفهرسة" value={records.length} icon="📄" />
=======
        <ClaimStat title="الصفحات المفهرسة" value={totalRecords} icon="📄" />
        <ClaimStat title="الصفحة الحالية" value={`${currentPage} من ${totalPages || 1}`} icon="�" />
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
      </div>

      <div style={styles.filterRow}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="🔎 اكتبي اسم عضو هيئة التدريس"
          style={styles.claimSearch}
        />
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {fileName && <div style={styles.infoBox}>{processing ? "جاري قراءة نص صفحات الملف وحفظها..." : `آخر ملف: ${fileName}`}</div>}
      {results.length && search.trim() ? (
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 22 }}>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
          {results.map((record) => (
            <div key={record.id} style={{ overflow: "hidden", border: "1px solid #DCE6F0", borderRadius: 14, background: "#fff", boxShadow: "0 6px 18px rgba(15,41,66,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <strong style={{ color: "#1E293B" }}>{MONTH_NAMES[Number(record.period_month) - 1] || record.period_month} {record.period_year}</strong>
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
          {results.map((record, index) => (
            <div key={record.id} style={{ overflow: "hidden", border: "1px solid #DCE6F0", borderRadius: 14, background: "#fff", boxShadow: "0 6px 18px rgba(15,41,66,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ background: "#3B82F6", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>
                    #{index + 1}
                  </span>
                  <strong style={{ color: "#1E293B" }}>{MONTH_NAMES[Number(record.period_month) - 1] || record.period_month} {record.period_year}</strong>
                </div>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
                <span style={{ color: "#64748B", fontSize: 12 }}>صفحة {record.page_number}</span>
              </div>
              <div style={{ padding: 16, background: "#E2E8F0", display: "flex", justifyContent: "center" }}>
                <SalaryPagePreview record={record} />
              </div>
            </div>
          ))}
=======
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        <div>
          <div style={{ marginBottom: 16, textAlign: "center", fontSize: 14, color: "#64748B" }}>
            📊 عدد النتائج: {results.length} - مرتبة حسب التاريخ (الأقدم أولاً)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 22 }}>
            {results.map((record, index) => (
              <div key={record.id} style={{ overflow: "hidden", border: "1px solid #DCE6F0", borderRadius: 14, background: "#fff", boxShadow: "0 6px 18px rgba(15,41,66,.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ background: "#3B82F6", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold" }}>
                      #{index + 1}
                    </span>
                    <strong style={{ color: "#1E293B" }}>{MONTH_NAMES[Number(record.period_month) - 1] || record.period_month} {record.period_year}</strong>
                  </div>
                  <span style={{ color: "#64748B", fontSize: 12 }}>صفحة {record.page_number}</span>
                </div>
                <div style={{ padding: 16, background: "#E2E8F0", display: "flex", justifyContent: "center" }}>
                  <SalaryPagePreview record={record} />
                </div>
              </div>
            ))}
          </div>
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
<<<<<<< C:/Users/DELL/Desktop/Insurance-System/src/dashboard/FacultySalariesPage.jsx
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
=======
>>>>>>> c:/Users/DELL/.windsurf/worktrees/Insurance-System/Insurance-System-ivory-hopper/src/dashboard/FacultySalariesPage.jsx
        </div>
      ) : (
        <EmptyState text={search ? "لا توجد نتائج مطابقة للاسم." : "اكتبي اسم عضو هيئة التدريس لعرض مفرداته."} />
      )}
    </div>
  );
}

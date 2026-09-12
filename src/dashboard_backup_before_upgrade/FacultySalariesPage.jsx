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
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [currentProcessing, setCurrentProcessing] = useState(null);
  const [isProcessingPaused, setIsProcessingPaused] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const yearMatch =
        (!filterFromYear || Number(record.period_year) >= Number(filterFromYear)) &&
        (!filterToYear || Number(record.period_year) <= Number(filterToYear));
      const monthMatch = filterMonth === "all" || String(record.period_month) === String(filterMonth);
      const searchMatch = !query || String(record.text_content || "").toLowerCase().includes(query);
      return yearMatch && monthMatch && searchMatch;
    }).sort((a, b) => {
      // ترتيب حسب السنة ثم الشهر ثم رقم الصفحة للعرض المتتابع
      if (a.period_year !== b.period_year) return a.period_year - b.period_year;
      if (a.period_month !== b.period_month) return a.period_month - b.period_month;
      return a.page_number - b.page_number;
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
      const uploaded = [];
      for (const item of pendingFiles) {
        setFileName(item.file.name);
        const safeFileName = item.file.name.replace(/[^\w.-]+/g, "_");
        const filePath = `faculty-salaries/${item.year}-${item.month}-${Date.now()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("faculty-salaries").upload(filePath, item.file);
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from("faculty-salaries").getPublicUrl(filePath);
        
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
      setProcessing(false);
    }
  };

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
        
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item) => item.str).join(" ");
        
        // تحويل الصفحة إلى صورة
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport }).promise;
        const imageData = canvas.toDataURL("image/jpeg", 0.8);
        
        // رفع صورة الصفحة
        const imageFileName = `${periodYear}-${periodMonth}-${pageNumber}-${Date.now()}.jpg`;
        const imagePath = `faculty-salaries-pages/${imageFileName}`;
        const imageBlob = await (await fetch(imageData)).blob();
        const { error: imageUploadError } = await supabase.storage
          .from("faculty-salaries")
          .upload(imagePath, imageBlob);
        
        if (imageUploadError) {
          console.error("خطأ في رفع صورة الصفحة:", imageUploadError);
        }
        
        const { data: imageUrl } = supabase.storage
          .from("faculty-salaries")
          .getPublicUrl(imagePath);
        
        indexed.push({
          period_year: periodYear,
          period_month: periodMonth,
          page_number: pageNumber,
          text_content: textItems,
          page_image_url: imageUrl.publicUrl,
          source_file_name: sourceName,
          source_file_url: fileUrl,
        });
      }
      
      // حفظ البيانات في قاعدة البيانات
      const { error: insertError } = await supabase
        .from("faculty_salary_pages")
        .insert(indexed);
      
      if (insertError) throw insertError;
      
      return indexed.length;
    } catch (error) {
      console.error("خطأ في فهرسة PDF:", error);
      throw error;
    }
  };

  const processQueueGradually = async () => {
    while (processingQueue.length > 0 && !isProcessingPaused) {
      const currentItem = processingQueue[0];
      setCurrentProcessing(currentItem);
      
      try {
        const arrayBuffer = await currentItem.file.arrayBuffer();
        const indexedCount = await indexPdf(
          arrayBuffer,
          currentItem.file.name,
          currentItem.fileUrl,
          currentItem.year,
          currentItem.month,
          (progress) => {
            setProcessingQueue(prev => 
              prev.map((item, index) => 
                index === 0 ? { ...item, progress } : item
              )
            );
          }
        );
        
        // تحديث حالة الملف
        setProcessingQueue(prev => {
          const newQueue = [...prev];
          newQueue[0] = { ...newQueue[0], status: "completed", progress: 100 };
          return newQueue;
        });
        
        // إزالة الملف من قائمة المعالجة بعد تأخير قصير
        setTimeout(() => {
          setProcessingQueue(prev => prev.slice(1));
        }, 500);
        
      } catch (error) {
        console.error("خطأ في معالجة الملف:", error);
        setProcessingQueue(prev => {
          const newQueue = [...prev];
          newQueue[0] = { ...newQueue[0], status: "failed", error: error.message };
          return newQueue;
        });
        
        setTimeout(() => {
          setProcessingQueue(prev => prev.slice(1));
        }, 500);
      }
    }
    
    if (processingQueue.length === 0) {
      setCurrentProcessing(null);
      setProcessing(false);
      // إعادة تحميل البيانات
      loadRecords(currentPage, itemsPerPage);
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // العودة للصفحة الأولى عند تغيير عدد العناصر
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.pageTitle}>مفردات مرتب أعضاء هيئة التدريس</h1>
        <div style={styles.headerActions}>
          <input
            type="file"
            id="salary-file-upload"
            accept=".pdf"
            multiple
            onChange={handleSelectFiles}
            style={{ display: "none" }}
          />
          <label
            htmlFor="salary-file-upload"
            style={{
              ...styles.primaryButton,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>📄</span>
            <span>رفع ملفات المرتبات</span>
          </label>
        </div>
      </header>

      {error && (
        <div style={{
          ...styles.alert,
          background: "#FEE2E2",
          border: "1px solid #FECACA",
          color: "#991B1B",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div style={{
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#1E40AF" }}>
            ملفات جاهزة للرفع ({pendingFiles.length})
          </h3>
          {pendingFiles.map((item, index) => (
            <div key={index} style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              padding: "8px",
              background: "#fff",
              borderRadius: "4px",
              marginBottom: "8px",
            }}>
              <span style={{ flex: 1, fontSize: "14px" }}>{item.file.name}</span>
              <select
                value={item.year}
                onChange={(e) => updatePendingFile(index, "year", e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #D1D5DB",
                  fontSize: "14px",
                }}
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <select
                value={item.month}
                onChange={(e) => updatePendingFile(index, "month", e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  border: "1px solid #D1D5DB",
                  fontSize: "14px",
                }}
              >
                <option value="">اختر الشهر</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
              <button
                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                style={{
                  padding: "6px 12px",
                  background: "#FEE2E2",
                  border: "1px solid #FECACA",
                  borderRadius: "4px",
                  color: "#991B1B",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                حذف
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
            <button
              onClick={uploadAllFiles}
              disabled={processing}
              style={{
                ...styles.primaryButton,
                opacity: processing ? 0.6 : 1,
                cursor: processing ? "not-allowed" : "pointer",
              }}
            >
              {processing ? "جاري الرفع..." : "رفع جميع الملفات"}
            </button>
            <button
              onClick={() => setPendingFiles([])}
              style={{
                padding: "10px 20px",
                background: "#F3F4F6",
                border: "1px solid #D1D5DB",
                borderRadius: "6px",
                color: "#374151",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {processingQueue.length > 0 && (
        <div style={{
          background: "#ECFDF5",
          border: "1px solid #A7F3D0",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#065F46" }}>
            جاري معالجة الملفات ({processingQueue.length})
          </h3>
          {processingQueue.map((item, index) => (
            <div key={index} style={{
              padding: "12px",
              background: "#fff",
              borderRadius: "4px",
              marginBottom: "8px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "500" }}>{item.file.name}</span>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>
                  {item.status === "completed" ? "✓ مكتمل" : 
                   item.status === "failed" ? "✗ فشل" : 
                   `${Math.round(item.progress)}%`}
                </span>
              </div>
              {item.status !== "completed" && item.status !== "failed" && (
                <div style={{
                  height: "4px",
                  background: "#E5E7EB",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    background: "#10B981",
                    width: `${item.progress}%`,
                    transition: "width 0.3s ease",
                  }} />
                </div>
              )}
              {item.status === "failed" && (
                <div style={{ fontSize: "12px", color: "#DC2626", marginTop: "4px" }}>
                  {item.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={styles.filters}>
        <input
          type="text"
          placeholder="بحث في النص..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...styles.input,
            flex: 1,
          }}
        />
        <select
          value={filterFromYear}
          onChange={(e) => setFilterFromYear(e.target.value)}
          style={styles.input}
        >
          <option value="">من سنة</option>
          {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          value={filterToYear}
          onChange={(e) => setFilterToYear(e.target.value)}
          style={styles.input}
        >
          <option value="">إلى سنة</option>
          {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          style={styles.input}
        >
          <option value="all">جميع الشهور</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={i} value={i + 1}>{name}</option>
          ))}
        </select>
      </div>

      <div style={styles.stats}>
        <ClaimStat label="إجمالي الصفحات" value={results.length} icon="📄" />
        <ClaimStat label="مجلدات فريدة" value={new Set(results.map(r => r.period_year + "-" + r.period_month)).size} icon="📁" />
      </div>

      {paginatedResults.length === 0 ? (
        <EmptyState message="لا توجد صفحات مرتبات محفوظة" />
      ) : (
        <>
          <div style={styles.grid}>
            {paginatedResults.map((record) => (
              <div
                key={record.id}
                style={{
                  ...styles.card,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedRecord(record)}
              >
                <div style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "#1F2937",
                }}>
                  {MONTH_NAMES[record.period_month - 1]} {record.period_year}
                </div>
                <div style={{
                  fontSize: "12px",
                  color: "#6B7280",
                  marginBottom: "12px",
                }}>
                  صفحة {record.page_number}
                </div>
                {record.page_image_url ? (
                  <img
                    src={record.page_image_url}
                    alt={`صفحة ${record.page_number}`}
                    style={{
                      width: "100%",
                      height: "150px",
                      objectFit: "cover",
                      borderRadius: "4px",
                    }}
                  />
                ) : (
                  <div style={{
                    height: "150px",
                    background: "#F3F4F6",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9CA3AF",
                    fontSize: "14px",
                  }}>
                    لا توجد صورة
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "24px",
              padding: "16px",
              background: "#fff",
              borderRadius: "8px",
              border: "1px solid #E5E7EB",
            }}>
              <div style={{ fontSize: "14px", color: "#6B7280" }}>
                عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, results.length)} من {results.length}
              </div>
              
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select
                  value={itemsPerPage}
                  onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "4px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                >
                  <option value="10">10 صفوف</option>
                  <option value="25">25 صفوف</option>
                  <option value="50">50 صفوف</option>
                  <option value="100">100 صفوف</option>
                </select>
                
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "4px",
                    border: "1px solid #D1D5DB",
                    background: currentPage === 1 ? "#F3F4F6" : "#fff",
                    color: currentPage === 1 ? "#9CA3AF" : "#374151",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  السابق
                </button>
                
                <span style={{ fontSize: "14px", color: "#374151" }}>
                  صفحة {currentPage} من {totalPages}
                </span>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "4px",
                    border: "1px solid #D1D5DB",
                    background: currentPage === totalPages ? "#F3F4F6" : "#fff",
                    color: currentPage === totalPages ? "#9CA3AF" : "#374151",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedRecord && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "8px",
            maxWidth: "90vw",
            maxHeight: "90vh",
            overflow: "auto",
            position: "relative",
          }}>
            <button
              onClick={() => setSelectedRecord(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "#F3F4F6",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                cursor: "pointer",
                fontSize: "18px",
                zIndex: 1,
              }}
            >
              ×
            </button>
            <SalaryPagePreview record={selectedRecord} />
          </div>
        </div>
      )}
    </div>
  );
}

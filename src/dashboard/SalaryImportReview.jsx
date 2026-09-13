import { useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { analyzeSalaryPDF, groupPagesIntoSalarySlips } from "../utils/salaryPDFParser";
import { EMPLOYEE_SALARY_CONFIG, FACULTY_SALARY_CONFIG } from "./salaryArchiveConfig";

const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function monthName(monthNum) {
  return MONTH_NAMES[Number(monthNum) - 1] || String(monthNum);
}

export default function SalaryImportReview({ currentUser, config }) {
  const cfg = config || EMPLOYEE_SALARY_CONFIG;
  const ARCHIVE_TABLE = cfg.table;
  const IMPORTS_TABLE = cfg.importsTable;
  const BUCKET = cfg.bucket;
  const STORAGE_ROOT = cfg.storageRoot;
  const IMPORT_TYPE = cfg.id === 'employee' ? 'employee' : 'faculty';

  const [importType, setImportType] = useState(IMPORT_TYPE);
  const [pdfFile, setPdfFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [selectedSlips, setSelectedSlips] = useState(new Set());
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setError("");
      setAnalysis(null);
    } else {
      setError("الرجاء اختيار ملف PDF صالح");
    }
  };

  const analyzePDF = async () => {
    if (!pdfFile) {
      setError("الرجاء اختيار ملف PDF أولاً");
      return;
    }

    setImporting(true);
    setProgress("جاري تحليل ملف PDF...");
    setError("");

    try {
      // تحليل PDF
      const pdfAnalysis = await analyzeSalaryPDF(pdfFile, (msg) => setProgress(msg));
      
      // تجميع الصفحات في مفردات
      const slips = groupPagesIntoSalarySlips(pdfAnalysis.pages);
      
      // تحديث تحليل PDF مع المفردات
      const enhancedAnalysis = {
        ...pdfAnalysis,
        slips,
        totalSlips: slips.length,
        verifiedSlips: slips.filter(s => !s.needsReview).length,
        needsReviewSlips: slips.filter(s => s.needsReview).length
      };

      setAnalysis(enhancedAnalysis);
      setProgress("تم التحليل بنجاح!");

    } catch (err) {
      console.error("PDF Analysis Error:", err);
      setError("خطأ في تحليل PDF: " + err.message);
      setProgress("");
    } finally {
      setImporting(false);
    }
  };

  const toggleSlipSelection = (slipIndex) => {
    const newSelection = new Set(selectedSlips);
    if (newSelection.has(slipIndex)) {
      newSelection.delete(slipIndex);
    } else {
      newSelection.add(slipIndex);
    }
    setSelectedSlips(newSelection);
  };

  const selectAllVerified = () => {
    const verifiedIndices = analysis.slips
      .map((slip, idx) => ({ slip, idx }))
      .filter(({ slip }) => !slip.needsReview)
      .map(({ idx }) => idx);
    
    setSelectedSlips(new Set(verifiedIndices));
  };

  const clearSelection = () => {
    setSelectedSlips(new Set());
  };

  const importSelectedSlips = async () => {
    if (selectedSlips.size === 0) {
      setError("الرجاء اختيار مفردة واحدة على الأقل");
      return;
    }

    setImporting(true);
    setProgress("جاري استيراد المفردات المختارة...");
    setError("");

    try {
      // رفع الملف الأصلي إلى Storage
      const timestamp = Date.now();
      const storagePath = `${STORAGE_ROOT}/imports/${timestamp}_${pdfFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, pdfFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      // إنشاء سجل في جدول ملفات الاستيراد
      const { data: importFile, error: importFileError } = await supabase
        .from('salary_import_files')
        .insert({
          original_filename: pdfFile.name,
          file_url: publicUrl,
          file_size: pdfFile.size,
          total_pages: analysis.totalPages,
          total_slips: analysis.totalSlips,
          verified_slips: analysis.verifiedSlips,
          needs_review_slips: analysis.needsReviewSlips,
          import_type: importType,
          uploaded_by: currentUser?.username || 'system',
          status: 'completed'
        })
        .select()
        .single();

      if (importFileError) throw importFileError;

      // استيراد المفردات المختارة
      let importedCount = 0;
      const selectedSlipsArray = Array.from(selectedSlips);

      for (const slipIndex of selectedSlipsArray) {
        const slip = analysis.slips[slipIndex];
        
        // التحقق من التكرار
        const { data: existing } = await supabase
          .from(ARCHIVE_TABLE)
          .select('id')
          .eq('computer_number', slip.computerNumber)
          .eq('year', slip.year)
          .eq('month', slip.month)
          .maybeSingle();

        if (existing) {
          console.log(`تكرار محتمل: ${slip.computerNumber} - ${slip.year}/${slip.month}`);
          continue; // تخطي التكرارات
        }

        // إدراج المفردة
        const { error: insertError } = await supabase
          .from(ARCHIVE_TABLE)
          .insert({
            employee_name: slip.employeeName || 'غير محدد',
            computer_number: slip.computerNumber,
            year: slip.year,
            month: slip.month,
            page_start: slip.pageStart,
            page_end: slip.pageEnd,
            pages_count: slip.pages.length,
            source_file_id: importFile.id,
            original_filename: pdfFile.name,
            file_url: publicUrl,
            status: slip.needsReview ? 'needs_review' : 'verified',
            import_notes: slip.needsReview ? 'تحتاج مراجعة يدوية' : null,
            created_by: currentUser?.username || 'system'
          });

        if (insertError) {
          console.error(`خطأ في استيراد مفردة ${slipIndex}:`, insertError);
        } else {
          importedCount++;
        }
      }

      setProgress(`تم استيراد ${importedCount} مفردة بنجاح!`);
      setSelectedSlips(new Set());

    } catch (err) {
      console.error("Import Error:", err);
      setError("خطأ في الاستيراد: " + err.message);
      setProgress("");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ padding: '20px', direction: 'rtl', fontFamily: 'Cairo, sans-serif' }}>
      <div style={{ 
        background: '#fff', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <h2>📥 استيراد مفردات مرتب من PDF</h2>
        <p style={{ color: '#666', marginBottom: '15px' }}>
          ارفع ملف PDF كبير يحتوي على مفردات مرتب متعددة وسيقوم النظام بتحليلها وتقسيمها تلقائياً.
        </p>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            نوع الاستيراد:
          </label>
          <select
            value={importType}
            onChange={(e) => setImportType(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              width: '200px',
              fontFamily: 'Cairo, sans-serif'
            }}
          >
            <option value="employee">الموظفين</option>
            <option value="faculty">هيئة التدريس</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={importing}
            style={{ marginBottom: '10px' }}
          />
          <br />
          <button
            onClick={analyzePDF}
            disabled={!pdfFile || importing}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.6 : 1,
              marginLeft: '10px'
            }}
          >
            {importing ? 'جاري التحليل...' : 'تحليل الملف'}
          </button>
        </div>

        {progress && (
          <div style={{ 
            background: '#e3f2fd', 
            color: '#1976d2', 
            padding: '10px', 
            borderRadius: '4px',
            marginBottom: '15px'
          }}>
            📊 {progress}
          </div>
        )}

        {error && (
          <div style={{ 
            background: '#fee', 
            color: '#c33', 
            padding: '10px', 
            borderRadius: '4px',
            marginBottom: '15px'
          }}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {analysis && (
        <div style={{ 
          background: '#fff', 
          padding: '20px', 
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px',
            paddingBottom: '15px',
            borderBottom: '1px solid #eee'
          }}>
            <h3>📋 نتائج التحليل</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={selectAllVerified}
                disabled={importing}
                style={{
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: importing ? 'not-allowed' : 'pointer'
                }}
              >
                ✓ اختيار الموثقة
              </button>
              <button
                onClick={clearSelection}
                disabled={importing}
                style={{
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: importing ? 'not-allowed' : 'pointer'
                }}
              >
                ✕ مسح الاختيار
              </button>
              <button
                onClick={importSelectedSlips}
                disabled={selectedSlips.size === 0 || importing}
                style={{
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: selectedSlips.size === 0 || importing ? 'not-allowed' : 'pointer',
                  opacity: selectedSlips.size === 0 || importing ? 0.6 : 1
                }}
              >
                📥 استيراد المختارة ({selectedSlips.size})
              </button>
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                {analysis.totalPages}
              </div>
              <div style={{ color: '#666' }}>إجمالي الصفحات</div>
            </div>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                {analysis.totalSlips}
              </div>
              <div style={{ color: '#666' }}>المفردات المكتشفة</div>
            </div>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                {analysis.verifiedSlips}
              </div>
              <div style={{ color: '#666' }}>موثقة</div>
            </div>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffc107' }}>
                {analysis.needsReviewSlips}
              </div>
              <div style={{ color: '#666' }}>تحتاج مراجعة</div>
            </div>
          </div>

          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
                <tr style={{ borderBottom: '2px solid #007bff' }}>
                  <th style={{ padding: '10px', textAlign: 'right' }}>اختيار</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>رقم العامل</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>الاسم</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>الشهر</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>السنة</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>الصفحات</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {analysis.slips.map((slip, idx) => (
                  <tr 
                    key={idx}
                    style={{ 
                      borderBottom: '1px solid #eee',
                      background: selectedSlips.has(idx) ? '#e3f2fd' : 'white',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleSlipSelection(idx)}
                  >
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedSlips.has(idx)}
                        onChange={() => toggleSlipSelection(idx)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                      {slip.computerNumber || '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {slip.employeeName || 'غير محدد'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {slip.month ? monthName(slip.month) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {slip.year || '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {slip.pageStart === slip.pageEnd 
                        ? `صفحة ${slip.pageStart}` 
                        : `صفحات ${slip.pageStart}-${slip.pageEnd}`}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {slip.needsReview ? (
                        <span style={{ 
                          background: '#ffc107', 
                          color: '#000', 
                          padding: '3px 8px', 
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}>
                          يحتاج مراجعة
                        </span>
                      ) : (
                        <span style={{ 
                          background: '#28a745', 
                          color: 'white', 
                          padding: '3px 8px', 
                          borderRadius: '12px',
                          fontSize: '12px'
                        }}>
                          موثق
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
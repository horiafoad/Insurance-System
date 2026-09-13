import { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const ANALYSIS_SCALE = 1.5;

function normalizeDigits(str) {
  return String(str)
    .replace(/[یك]/g, (c) => (c === "ی" ? "ي" : "ك"))
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
}

/* تحويل عناصر Text Layer إلى سطور منظمة مع الإحداثيات */
function textItemsToStructuredLines(items, viewport) {
  if (!Array.isArray(items) || items.length === 0) return [];
  
  const words = items
    .filter((it) => it && it.str && it.str.trim())
    .map((it) => {
      const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
      const fontSize = it.transform[0];
      return { 
        text: it.str.trim(), 
        x, 
        y,
        fontSize,
        width: it.width,
        height: it.height
      };
    });
  
  if (words.length === 0) return [];
  
  // ترتيب الكلمات حسب الموقع (من الأعلى للأسفل، ثم من اليمين لليسار RTL)
  words.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) < 5) return b.x - a.x; // نفس السطر - RTL
    return a.y - b.y; // سطر مختلف - من الأعلى
  });
  
  // تجميع الكلمات في سطور
  const tol = Math.max(3, viewport.height * 0.01);
  const lines = [];
  let cur = [];
  let curY = null;
  
  words.forEach((w) => {
    if (curY === null || Math.abs(w.y - curY) <= tol) {
      cur.push(w);
      curY = curY === null ? w.y : Math.min(curY, curY);
    } else {
      if (cur.length > 0) {
        // ترتيب الكلمات في السطر (RTL)
        cur.sort((a, b) => b.x - a.x);
        lines.push({ 
          y: cur[0].y, 
          words: cur,
          text: cur.map(w => w.text).join(' ')
        });
      }
      cur = [w];
      curY = w.y;
    }
  });
  
  if (cur.length > 0) {
    cur.sort((a, b) => b.x - a.x);
    lines.push({ 
      y: cur[0].y, 
      words: cur,
      text: cur.map(w => w.text).join(' ')
    });
  }
  
  return lines;
}

/* البحث عن نص مع الإحداثيات */
function findTextWithPosition(lines, searchText, caseSensitive = false) {
  const search = caseSensitive ? searchText : searchText.toLowerCase();
  
  for (const line of lines) {
    const text = caseSensitive ? line.text : line.text.toLowerCase();
    if (text.includes(search)) {
      // إرجاع أول تطابق مع معلومات الموقع
      const matchIndex = line.text.toLowerCase().indexOf(search.toLowerCase());
      const matchedWord = line.words.find(w => 
        w.text.toLowerCase().includes(search.toLowerCase())
      );
      
      return {
        text: line.text,
        x: matchedWord?.x || line.words[0]?.x,
        y: line.y,
        line: line
      };
    }
  }
  return null;
}

/* استخراج القيمة بجانب label معتمداً على الموقع */
function extractValueNearLabel(lines, labelText, maxDistance = 150) {
  const labelPos = findTextWithPosition(lines, labelText);
  if (!labelPos) return null;
  
  // البحث عن القيمة في نفس السطر أو السطر التالي
  for (const line of lines) {
    const yDiff = Math.abs(line.y - labelPos.y);
    
    // نفس السطر أو السطر التالي القريب
    if (yDiff <= maxDistance) {
      // إزالة الـ label من النص والبحث عن القيمة
      const textWithoutLabel = line.text.replace(new RegExp(labelText, 'i'), '').trim();
      
      // البحث عن رقم أو نص بعد الـ label
      const numberMatch = textWithoutLabel.match(/\d{4,}/);
      if (numberMatch) {
        return numberMatch[0];
      }
      
      // إذا لم يوجد رقم، أخذ أول نص معقول
      if (textWithoutLabel.length > 0) {
        return textWithoutLabel.split(/\s+/)[0];
      }
    }
  }
  
  return null;
}

export default function PDFAnalyzer() {
  const [pdfFile, setPdfFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const analyzePDF = async () => {
    if (!pdfFile) {
      setError("الرجاء اختيار ملف PDF");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      const pagesAnalysis = [];

      // تحليل أول 5 صفحات فقط للسرعة
      for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: ANALYSIS_SCALE });
        const textContent = await page.getTextContent();

        const structuredLines = textItemsToStructuredLines(textContent.items, viewport);
        const fullText = structuredLines.map(l => l.text).join('\n');

        // استخراج معلومات مهمة
        const computerNumberInfo = extractValueNearLabel(structuredLines, 'رقم العامل');
        const computerNumberInfo2 = extractValueNearLabel(structuredLines, 'رقم الكمبيوتر');
        
        // البحث عن أنماط مهمة
        const hasSalaryData = fullText.includes('بيانات مفردات') || 
                             fullText.includes('مفردات مرتب');
        const hasEmployeeData = fullText.includes('بيانات الموظف') ||
                               fullText.includes('الموظف');
        
        // استخراج الأرقام المحتملة
        const allNumbers = fullText.match(/\d{4,}/g) || [];
        const uniqueNumbers = [...new Set(allNumbers)].slice(0, 10);

        // استخراج الأشهر العربية
        const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                             'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const foundMonths = arabicMonths.filter(m => fullText.includes(m));

        // استخراج السنوات
        const years = fullText.match(/(?:19|20)\d{2}/g) || [];
        const uniqueYears = [...new Set(years)];

        pagesAnalysis.push({
          pageNumber: i,
          viewport: { width: viewport.width, height: viewport.height },
          textItemsCount: textContent.items.length,
          linesCount: structuredLines.length,
          fullText: fullText.substring(0, 500) + (fullText.length > 500 ? '...' : ''),
          computerNumber: computerNumberInfo || computerNumberInfo2,
          hasSalaryData,
          hasEmployeeData,
          potentialNumbers: uniqueNumbers,
          foundMonths,
          foundYears: uniqueYears,
          sampleLines: structuredLines.slice(0, 8).map(l => ({
            text: l.text,
            y: l.y.toFixed(1),
            wordCount: l.words.length
          }))
        });
      }

      setAnalysis({
        totalPages: pdf.numPages,
        analyzedPages: pagesAnalysis.length,
        pages: pagesAnalysis
      });

    } catch (err) {
      console.error("PDF Analysis Error:", err);
      setError("خطأ في تحليل PDF: " + err.message);
    } finally {
      setLoading(false);
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
        <h2>🔍 محلل PDF - مفردات المرتب</h2>
        <p style={{ color: '#666', marginBottom: '15px' }}>
          هذه الأداة تحلل ملفات PDF الحقيقية لفهم بنيتها قبل تطوير المحرك.
        </p>

        <div style={{ marginBottom: '15px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => setPdfFile(e.target.files[0])}
            style={{ marginBottom: '10px' }}
          />
          <br />
          <button
            onClick={analyzePDF}
            disabled={!pdfFile || loading}
            style={{
              background: '#007bff',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'جاري التحليل...' : 'تحليل الملف'}
          </button>
        </div>

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
          <h3>📊 نتائج التحليل</h3>
          <p><strong>إجمالي الصفحات:</strong> {analysis.totalPages}</p>
          <p><strong>الصفحات المحللة:</strong> {analysis.analyzedPages}</p>

          {analysis.pages.map((page, idx) => (
            <div key={idx} style={{ 
              background: '#f9f9f9', 
              padding: '15px', 
              marginBottom: '15px',
              borderRadius: '4px',
              borderRight: '4px solid #007bff'
            }}>
              <h4>صفحة {page.pageNumber}</h4>
              <p><strong>الحجم:</strong> {page.viewport.width.toFixed(0)} x {page.viewport.height.toFixed(0)}</p>
              <p><strong>عناصر النص:</strong> {page.textItemsCount}</p>
              <p><strong>عدد السطور:</strong> {page.linesCount}</p>
              
              {page.computerNumber && (
                <p style={{ color: '#28a745', fontWeight: 'bold' }}>
                  ✅ رقم العامل المكتشف: {page.computerNumber}
                </p>
              )}
              
              {page.hasSalaryData && <p>✅ يحتوي على بيانات مفردات</p>}
              {page.hasEmployeeData && <p>✅ يحتوي على بيانات موظف</p>}
              
              {page.potentialNumbers.length > 0 && (
                <p><strong>أرقام محتملة:</strong> {page.potentialNumbers.join(', ')}</p>
              )}
              
              {page.foundMonths.length > 0 && (
                <p><strong>أشهر موجودة:</strong> {page.foundMonths.join(', ')}</p>
              )}
              
              {page.foundYears.length > 0 && (
                <p><strong>سنوات موجودة:</strong> {page.foundYears.join(', ')}</p>
              )}
              
              <div style={{ marginTop: '10px' }}>
                <strong>نموذج السطور (أول 8):</strong>
                {page.sampleLines.map((line, lineIdx) => (
                  <div key={lineIdx} style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '12px',
                    padding: '3px 0',
                    borderBottom: '1px solid #eee'
                  }}>
                    {line.text} <span style={{ color: '#999' }}>(y: {line.y})</span>
                  </div>
                ))}
              </div>
              
              <div style={{ marginTop: '10px' }}>
                <strong>النص (أول 500 حرف):</strong>
                <p style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '11px',
                  background: '#fff',
                  padding: '8px',
                  borderRadius: '3px',
                  whiteSpace: 'pre-wrap'
                }}>
                  {page.fullText}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
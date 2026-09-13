import * as pdfjsLib from 'pdfjs-dist';
import fs from 'fs';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.min.mjs';

async function analyzePDF(pdfPath) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    
    console.log(`=== تحليل ملف PDF ===`);
    console.log(`عدد الصفحات: ${pdf.numPages}`);
    console.log(`\n=== تحليل كل صفحة ===`);
    
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });
      
      console.log(`\n--- صفحة ${i} ---`);
      console.log(`الحجم: ${viewport.width} x ${viewport.height}`);
      console.log(`عدد عناصر النص: ${textContent.items.length}`);
      
      // Extract text with positions
      const textItems = textContent.items.map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontSize: item.transform[0]
      }));
      
      // Show first few text items with positions
      console.log('أول 10 عناصر نصية:');
      textItems.slice(0, 10).forEach((item, idx) => {
        console.log(`  ${idx + 1}. "${item.text}" at (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
      });
      
      // Look for key patterns
      const fullText = textItems.map(item => item.str).join(' ');
      console.log('\nنص الصفحة (أول 200 حرف):');
      console.log(fullText.substring(0, 200) + '...');
      
      // Search for important patterns
      if (fullText.includes('رقم العامل')) {
        console.log('✅ وجد "رقم العامل"');
      }
      if (fullText.includes('بيانات مفردات')) {
        console.log('✅ وجد "بيانات مفردات"');
      }
      if (fullText.match(/\d{4,}/)) {
        const numbers = fullText.match(/\d{4,}/g);
        console.log(`✅ أرقام محتملة: ${numbers.slice(0, 5).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('خطأ في تحليل PDF:', error);
  }
}

// Run the analysis
const pdfPath = 'C:\\Users\\DELL\\Desktop\\Insurance-System\\src\\مفردات مرتب تدريس.pdf';
analyzePDF(pdfPath);
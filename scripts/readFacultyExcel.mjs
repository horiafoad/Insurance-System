// ============================================================================
// scripts/readFacultyExcel.mjs
// سكربت Node.js لقراءة ملف Excel هيئة التدريس
// ============================================================================

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "هيئه تدريس.xlsx");

async function readFacultyExcel() {
  try {
    // قراءة الملف
    const fileBuffer = fs.readFileSync(filePath);
    
    // قراءة Excel
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    
    const sheetNames = workbook.SheetNames;
    console.log("📊 أوراق العمل في الملف:", sheetNames);
    
    const result = [];
    
    sheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });
      
      console.log(`\n📄 ورقة "${sheetName}":`);
      console.log(`   عدد السجلات: ${jsonData.length}`);
      
      if (jsonData.length > 0) {
        console.log(`   الأعمدة: ${Object.keys(jsonData[0]).join(", ")}`);
        console.log(`   أول سجل (مثال):`, JSON.stringify(jsonData[0], null, 2));
      }
      
      result.push({
        sheetName,
        data: jsonData,
      });
    });
    
    // حفظ النتيجة كملف JSON
    const outputPath = path.join(__dirname, "faculty_data_output.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`\n✅ تم حفظ البيانات في: ${outputPath}`);
    
    return result;
  } catch (error) {
    console.error("❌ خطأ في قراءة ملف Excel:", error.message);
    process.exit(1);
  }
}

readFacultyExcel();

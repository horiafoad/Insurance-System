// ============================================================================
// readFacultyExcel.js
// سكربت لقراءة ملف Excel هيئة التدريس
// ============================================================================

import * as XLSX from "xlsx";

async function readFacultyExcelFile(filePath) {
  try {
    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
    
    const sheetNames = workbook.SheetNames;
    console.log("أوراق العمل:", sheetNames);
    
    const result = [];
    
    sheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });
      
      console.log(`ورقة ${sheetName}:`, jsonData.length, "سجل");
      
      result.push({
        sheetName,
        data: jsonData,
      });
    });
    
    return result;
  } catch (error) {
    console.error("خطأ في قراءة ملف Excel:", error);
    throw error;
  }
}

// تشغيل السكربت
readFacultyExcelFile("file:///c:/Users/DELL/Desktop/New folder (4)/هيئه تدريس.xlsx")
  .then((result) => {
    console.log("نتيجة قراءة Excel:", result);
  })
  .catch((error) => {
    console.error("فشل القراءة:", error);
  });

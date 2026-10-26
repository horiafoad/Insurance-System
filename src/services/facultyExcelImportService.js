// ============================================================================
// facultyExcelImportService.js
// ---------------------------------------------------------------------------
// خدمة استيراد بيانات هيئة التدريس من Excel
// وتخزينها في قاعدة البيانات لاستخدامها في التبليغات
// ============================================================================

import * as XLSX from "xlsx";

// حقول Excel
const EXCEL_COLUMNS = {
  JOB_TITLE: "الوظيفه",
  GRADE_DATE: "تاريخ الدرجه",
  GRADE: "الدرجه",
  SALARY_306: "مرتب 30 /6",
  NAME: "الاسم",
  MEMBER_CODE: "رقم الصرف",
  GROUP_NAME: "اسم المجموعه",
  M: "ﻡ",
};

/**
 * قراءة ملف Excel
 */
export async function readFacultyExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: false,
        });
        
        // تصفية السجل الفارغ (رأس العمود)
        const validData = jsonData.filter(
          (row) => row[EXCEL_COLUMNS.NAME] && row[EXCEL_COLUMNS.NAME].trim() !== ""
        );
        
        resolve({
          sheetName,
          data: validData,
          total: validData.length,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * تحويل صف Excel إلى تنسيق قاعدة البيانات
 */
export function mapExcelRowToMember(row) {
  // تنظيف وتطبيع رقم الصرف
  const memberCodeRaw = row[EXCEL_COLUMNS.MEMBER_CODE] || "";
  const memberCode = memberCodeRaw
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[-\s]/g, "")
    .trim();
  
  // تنظيف الاسم
  const name = (row[EXCEL_COLUMNS.NAME] || "").trim();
  
  // تنظيف المبلغ
  const salaryRaw = row[EXCEL_COLUMNS.SALARY_306] || "";
  const salary = salaryRaw
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[$,\s]/g, "")
    .trim();
  
  // تحويل التاريخ
  const gradeDateRaw = row[EXCEL_COLUMNS.GRADE_DATE] || "";
  let gradeDate = null;
  if (gradeDateRaw && gradeDateRaw !== "الدرة") {
    const parts = gradeDateRaw.split("/");
    if (parts.length === 3) {
      // DD/MM/YYYY
      gradeDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  
  return {
    name,
    memberCode,
    memberCodeRaw,
    jobTitle: row[EXCEL_COLUMNS.JOB_TITLE] || "",
    grade: row[EXCEL_COLUMNS.GRADE] || "",
    gradeDate,
    salary306: salary ? parseFloat(salary) : null,
    salary306Raw: salaryRaw,
    groupName: row[EXCEL_COLUMNS.GROUP_NAME] || "",
    m: row[EXCEL_COLUMNS.M] || "",
    // حفظ الصف الأصلي
    sourceRow: row,
  };
}

/**
 * تحليل بيانات Excel وإحصائيات
 */
export function analyzeFacultyExcel(data) {
  const analysis = {
    total: data.length,
    byJobTitle: {},
    byGrade: {},
    byGroupName: {},
    validMemberCodes: 0,
    invalidMemberCodes: 0,
    validNames: 0,
    invalidNames: 0,
  };
  
  data.forEach((row) => {
    const member = mapExcelRowToMember(row);
    
    // إحصائيات الوظيفة
    if (member.jobTitle) {
      analysis.byJobTitle[member.jobTitle] = (analysis.byJobTitle[member.jobTitle] || 0) + 1;
    }
    
    // إحصائيات الدرجة
    if (member.grade) {
      analysis.byGrade[member.grade] = (analysis.byGrade[member.grade] || 0) + 1;
    }
    
    // إحصائيات المجموعة
    if (member.groupName) {
      analysis.byGroupName[member.groupName] = (analysis.byGroupName[member.groupName] || 0) + 1;
    }
    
    // التحقق من رقم الصرف
    if (member.memberCode && member.memberCode.length > 0) {
      analysis.validMemberCodes++;
    } else {
      analysis.invalidMemberCodes++;
    }
    
    // التحقق من الاسم
    if (member.name && member.name.length > 0) {
      analysis.validNames++;
    } else {
      analysis.invalidNames++;
    }
  });
  
  return analysis;
}

/**
 * بحث في البيانات المستوردة
 */
export function searchImportedFacultyData(data, query) {
  if (!query || !query.trim()) return [];
  
  const lowerQuery = query.toLowerCase();
  
  return data.filter((row) => {
    const member = mapExcelRowToMember(row);
    return (
      member.name?.toLowerCase().includes(lowerQuery) ||
      member.memberCode?.toLowerCase().includes(lowerQuery) ||
      member.jobTitle?.toLowerCase().includes(lowerQuery)
    );
  });
}

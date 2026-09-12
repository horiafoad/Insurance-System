import * as XLSX from "xlsx";
import seedLeaves from "../data/studyLeavesSeed.json";

export const STUDY_LEAVES_STORAGE_KEY = "entitlements_study_leaves";

export const LEAVE_FIELDS = [
  { key: "serial", label: "م" },
  { key: "employeeCode", label: "كود الموظف" },
  { key: "name", label: "الاسم" },
  { key: "grade", label: "الدرجة" },
  { key: "leavePayType", label: "نوع الإجازة" },
  { key: "orderNumber", label: "رقم الأمر التنفيذي" },
  { key: "orderDate", label: "تاريخ الأمر التنفيذي" },
  { key: "leaveKind", label: "البيان" },
  { key: "startDate", label: "بداية الإجازة" },
  { key: "endDate", label: "نهاية الإجازة" },
  { key: "fiveYearEnd", label: "انتهاء 5 سنوات" },
  { key: "remainingDays", label: "الأيام المتبقية" },
  { key: "salaryStatus", label: "حالة المرتب" },
  { key: "returnedToWork", label: "عاد للعمل؟" },
  { key: "endReason", label: "سبب انتهاء الخدمة" },
  { key: "claimMade", label: "تم عمل مطالبة؟" },
  { key: "notes", label: "ملاحظات" },
];

export const SALARY_STATUSES = [
  "يصرف المرتب",
  "يوقف المرتب",
  "بدون مرتب",
];

export const LEAVE_KINDS = ["اجازة دراسية", "اجازه دراسيه", "مهمه علميه"];

export const LEAVE_PAY_TYPES = ["يصرف بمرتب", "بدون مرتب"];

const HEADER_ALIASES = {
  م: "serial",
  "كود الموظف": "employeeCode",
  الاسم: "name",
  الدرجة: "grade",
  "نوع الإجازة": "leavePayType",
  "نوع الاجازة": "leavePayType",
  "رقم الأمر التنفيذي": "orderNumber",
  "رقم الامر التنفيذي": "orderNumber",
  "تاريخ الأمر التنفيذي": "orderDate",
  "تاريخ الامر التنفيذي": "orderDate",
  "تاريخ الأمر التنفيذي2": "leaveKind",
  البيان: "leaveKind",
  "بداية الإجازة": "startDate",
  "بداية الاجازة": "startDate",
  "نهاية الإجازة": "endDate",
  "نهاية الاجازة": "endDate",
  "انتهاء 5 سنوات": "fiveYearEnd",
  "الأيام المتبقية": "remainingDays",
  "الايام المتبقية": "remainingDays",
  "حالة المرتب": "salaryStatus",
  "عاد للعمل؟": "returnedToWork",
  "عاد للعمل": "returnedToWork",
  "سبب انتهاء الخدمة": "endReason",
  "تم عمل مطالبة؟": "claimMade",
  "تم عمل مطالبة": "claimMade",
  ملاحظات: "notes",
};

export function createEmptyLeave() {
  return {
    id: "",
    serial: "",
    employeeCode: "",
    name: "",
    grade: "",
    leavePayType: "يصرف بمرتب",
    orderNumber: "",
    orderDate: "",
    leaveKind: "اجازة دراسية",
    startDate: "",
    endDate: "",
    fiveYearEnd: "",
    remainingDays: "",
    salaryStatus: "يصرف المرتب",
    returnedToWork: "",
    endReason: "",
    claimMade: "",
    notes: "",
  };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseFlexibleDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return startOfDay(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return startOfDay(
      new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    );
  }

  const us = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (us) {
    let year = Number(us[3]);
    if (year < 100) year += 2000;
    return startOfDay(new Date(year, Number(us[1]) - 1, Number(us[2])));
  }

  return null;
}

export function toIsoDate(value) {
  const date = parseFlexibleDate(value);
  if (!date) return value ? String(value).trim() : "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDisplayDate(value) {
  const iso = toIsoDate(value);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function daysUntil(value, today = new Date()) {
  const date = parseFlexibleDate(value);
  if (!date) return null;
  const diff = startOfDay(date) - startOfDay(today);
  return Math.round(diff / 86400000);
}

export function computeRemainingDays(leave, today = new Date()) {
  const fiveYearDays = daysUntil(leave.fiveYearEnd, today);
  if (fiveYearDays != null) return fiveYearDays;
  return daysUntil(leave.endDate, today);
}

export function isSalaryPaying(leave) {
  const status = String(leave.salaryStatus || "");
  return status.includes("يصرف") && !status.includes("يوقف");
}

export function isSalaryStopped(leave) {
  const status = String(leave.salaryStatus || "");
  return status.includes("يوقف") || status.includes("بدون");
}

export function enrichLeave(leave, today = new Date()) {
  const remaining = computeRemainingDays(leave, today);
  const daysToEnd = daysUntil(leave.endDate, today);
  const daysToFive = daysUntil(leave.fiveYearEnd, today);
  const fiveYearsEnded = daysToFive != null && daysToFive < 0;

  let alertLevel = "ok";
  let alertTitle = "المرتب مستمر";
  let alertMessage = "لا يوجد إجراء عاجل على المرتب.";

  if (isSalaryStopped(leave)) {
    alertLevel = "stopped";
    alertTitle = "المرتب موقوف";
    alertMessage = "تم تسجيل إيقاف المرتب. راجعي التنفيذ على شيت المرتبات.";
  } else if (isSalaryPaying(leave) && fiveYearsEnded) {
    alertLevel = "stop_now";
    alertTitle = "يجب إيقاف المرتب الآن";
    alertMessage = "تجاوزت بداية الإجازة خمس سنوات من تاريخ بداية الإجازة. المرتب يقف.";
  } else if (
    isSalaryPaying(leave) &&
    ((daysToFive != null && daysToFive <= 30) ||
      (remaining != null && remaining <= 30))
  ) {
    alertLevel = "soon";
    alertTitle = "إنذار: المرتب قرب يقف";
    alertMessage = `باقي ${Math.min(
      ...[daysToFive, remaining].filter((n) => n != null)
    )} يوم. جهّزي إيقاف المرتب.`;
  } else if (
    isSalaryPaying(leave) &&
    ((daysToFive != null && daysToFive <= 90) ||
      (remaining != null && remaining <= 90))
  ) {
    alertLevel = "watch";
    alertTitle = "تنبيه: اقترب موعد الإيقاف";
    alertMessage = `باقي أقل من 90 يومًا على نهاية الخمس سنوات.`;
  }

  return {
    ...leave,
    remainingDays: remaining == null ? leave.remainingDays || "" : String(remaining),
    daysToEnd,
    daysToFive,
    alertLevel,
    alertTitle,
    alertMessage,
  };
}

export function getLeaveStats(leaves, today = new Date()) {
  const enriched = leaves.map((leave) => enrichLeave(leave, today));
  return {
    total: enriched.length,
    paying: enriched.filter((leave) => isSalaryPaying(leave)).length,
    stopped: enriched.filter((leave) => isSalaryStopped(leave)).length,
    unpaid: enriched.filter((leave) =>
      String(leave.salaryStatus || "").includes("بدون")
    ).length,
    stopNow: enriched.filter((leave) => leave.alertLevel === "stop_now").length,
    soon: enriched.filter((leave) => leave.alertLevel === "soon").length,
    watch: enriched.filter((leave) => leave.alertLevel === "watch").length,
  };
}

export function getAlertLeaves(leaves, today = new Date()) {
  return leaves
    .map((leave) => enrichLeave(leave, today))
    .filter((leave) =>
      ["stop_now", "soon", "watch", "stopped"].includes(leave.alertLevel)
    )
    .sort((a, b) => {
      const order = { stop_now: 0, soon: 1, watch: 2, stopped: 3 };
      return order[a.alertLevel] - order[b.alertLevel];
    });
}

function normalizeImportedRow(row, index) {
  const leave = createEmptyLeave();
  leave.id = `leave-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
  leave.serial = String(index + 1);

  Object.entries(row).forEach(([rawKey, value]) => {
    const key = HEADER_ALIASES[String(rawKey).trim()] || "";
    if (!key) return;
    if (["orderDate", "startDate", "endDate", "fiveYearEnd"].includes(key)) {
      leave[key] = toIsoDate(value);
      return;
    }
    leave[key] = String(value ?? "").trim();
  });

  leave.employeeCode = String(leave.employeeCode || "").replace(/^\$/, "");
  if (!leave.leavePayType) leave.leavePayType = "يصرف بمرتب";
  if (!leave.salaryStatus) leave.salaryStatus = "يصرف المرتب";
  return leave;
}

export function parseStudyLeavesWorkbook(workbook) {
  const preferred =
    workbook.SheetNames.find((name) => name.includes("اجاز")) ||
    workbook.SheetNames.find((name) => name !== "Dashborad" && name !== "الاعدادات") ||
    workbook.SheetNames[0];

  const worksheet = workbook.Sheets[preferred];
  const aoa = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerIndex = aoa.findIndex((row) =>
    String(row[0]).trim() === "م" || String(row[2] || "").includes("الاسم")
  );

  if (headerIndex < 0) {
    const fallback = XLSX.utils.sheet_to_json(worksheet, {
      defval: "",
      raw: false,
    });
    return fallback
      .map((row, index) => normalizeImportedRow(row, index))
      .filter((leave) => leave.name || leave.employeeCode);
  }

  const headers = aoa[headerIndex].map((cell) => String(cell || "").trim());
  return aoa
    .slice(headerIndex + 1)
    .filter((row) => String(row[2] || "").trim() || String(row[1] || "").trim())
    .map((row, index) => {
      const record = {};
      headers.forEach((header, col) => {
        if (header) record[header] = row[col];
      });
      return normalizeImportedRow(record, index);
    });
}

export function exportStudyLeavesWorkbook(leaves, today = new Date()) {
  const stats = getLeaveStats(leaves, today);
  const dashboard = [
    ["لوحة متابعة الإجازات الدراسية", "اداره الاستحقاقات"],
    ["اخر تحديث", formatDisplayDate(today)],
    ["اجمالي الموظفين", stats.total],
    ["يصرف المرتب", stats.paying],
    ["يوقف المرتب", stats.stopped],
    ["بدون مرتب", stats.unpaid],
    ["يجب إيقاف المرتب الآن", stats.stopNow],
    ["باقي أقل من 30 يوم", stats.soon],
    ["باقي من 31 إلى 90 يوم", stats.watch],
  ];

  const header = LEAVE_FIELDS.map((field) => field.label);
  const rows = leaves.map((leave, index) => {
    const enriched = enrichLeave(leave, today);
    return LEAVE_FIELDS.map((field) => {
      if (field.key === "serial") return index + 1;
      if (["orderDate", "startDate", "endDate", "fiveYearEnd"].includes(field.key)) {
        return formatDisplayDate(enriched[field.key]);
      }
      return enriched[field.key] ?? "";
    });
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(dashboard),
    "Dashborad"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([header, ...rows]),
    "الاجازات الدراسيه"
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), "الاعدادات");
  XLSX.writeFile(workbook, "الاجازات الدراسيه.xlsx");
}

export function loadStudyLeaves() {
  try {
    const raw = localStorage.getItem(STUDY_LEAVES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const leaves = parsed.map((leave) => ({
          ...createEmptyLeave(),
          ...leave,
          employeeCode: String(leave.employeeCode || "").replace(/^\$/, ""),
        }));
        return autoUpdateSalaryStatus(leaves);
      }
    }
  } catch (error) {
    console.error(error);
  }

  return autoUpdateSalaryStatus(seedLeaves.map((leave) => ({
    ...createEmptyLeave(),
    ...leave,
  })));
}

export function autoUpdateSalaryStatus(leaves, today = new Date()) {
  let updated = false;
  const updatedLeaves = leaves.map((leave) => {
    const daysToFive = daysUntil(leave.fiveYearEnd, today);
    const fiveYearsEnded = daysToFive != null && daysToFive < 0;

    if (fiveYearsEnded && isSalaryPaying(leave)) {
      updated = true;
      return {
        ...leave,
        salaryStatus: "يوقف المرتب",
      };
    }
    return leave;
  });

  if (updated) {
    saveStudyLeaves(updatedLeaves);
  }

  return updatedLeaves;
}

export function saveStudyLeaves(leaves) {
  localStorage.setItem(STUDY_LEAVES_STORAGE_KEY, JSON.stringify(leaves));
}

export function getStudyLeavesCount() {
  return loadStudyLeaves().length;
}

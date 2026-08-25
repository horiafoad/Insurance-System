import fs from "fs";
import XLSX from "xlsx";

const source =
  "c:/Users/DELL/Downloads/الاجازات الدراسيه (1).xlsx";
const wb = XLSX.readFile(source, { cellDates: false, raw: false });
const ws = wb.Sheets["الاجازات الدراسيه"];
const aoa = XLSX.utils.sheet_to_json(ws, {
  header: 1,
  defval: "",
  raw: false,
});

function toIso(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!match) return text;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const month = String(Number(match[1])).padStart(2, "0");
  const day = String(Number(match[2])).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const headerIndex = aoa.findIndex((row) => String(row[0]).trim() === "م");
const rows = aoa
  .slice(headerIndex + 1)
  .filter((row) => String(row[2] || "").trim() || String(row[1] || "").trim());

const data = rows.map((row, index) => ({
  id: `seed-${index + 1}`,
  serial: String(row[0] || index + 1),
  employeeCode: String(row[1] || "")
    .replace(/^\$/, "")
    .trim(),
  name: String(row[2] || "").trim(),
  grade: String(row[3] || "").trim(),
  leavePayType: String(row[4] || "").trim() || "يصرف بمرتب",
  orderNumber: String(row[5] || "").trim(),
  orderDate: toIso(row[6]),
  leaveKind: String(row[7] || "").trim() || "اجازة دراسية",
  startDate: toIso(row[8]),
  endDate: toIso(row[9]),
  fiveYearEnd: toIso(row[10]),
  remainingDays: String(row[11] || "").trim(),
  leaveStatus: String(row[12] || "").trim(),
  salaryStatus: String(row[13] || "").trim() || "يصرف المرتب",
  returnedToWork: String(row[14] || "").trim(),
  endReason: String(row[15] || "").trim(),
  claimMade: String(row[16] || "").trim(),
  notes: "",
}));

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(
  "src/data/studyLeavesSeed.json",
  JSON.stringify(data, null, 2),
  "utf8"
);

fs.mkdirSync("public", { recursive: true });
fs.copyFileSync(source, "public/الاجازات-الدراسيه.xlsx");

console.log("seed", data.length);
console.log(data[0]);

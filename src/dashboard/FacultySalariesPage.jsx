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

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      const yearMatch =
        (!filterFromYear || Number(record.period_year) >= Number(filterFromYear)) &&
        (!filterToYear || Number(record.period_year) <= Number(filterToYear));
      const monthMatch = filterMonth === "all" || String(record.period_month) === String(filterMonth);
      const searchMatch = !query || String(record.text_content || "").toLowerCase().includes(query);
      return yearMatch && monthMatch && searchMatch;
    });
  }, [records, search, filterFromYear, filterToYear, filterMonth]);

  const handleSelectFiles = (event) => {
    const files = [...(event.target.files || [])];
    setPendingFiles(files.map((file) => ({
      file,
      year: new Date().getFullYear(),
      month: "",
    })));
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
      for (const item of pendingFiles) {
        setFileName(item.file.name);
        const safeFileName = item.file.name.replace(/[^\w.-]+/g, "_");
        const filePath = `faculty-salaries/${item.year}-${item.month}-${Date.now()}-${safeFileName}`;
        const { error: uploadError } = await supabase.storage.from("faculty-salaries").upload(filePath, item.file);
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from("faculty-salaries").getPublicUrl(filePath);
        await indexPdf(await item.file.arrayBuffer(), item.file.name, publicUrl.publicUrl, item.year, item.month);
      }
      setPendingFiles([]);
    } catch (uploadError) {
      console.error("تعذر رفع ملفات المرتبات:", uploadError);
      setError("تعذر رفع أحد الملفات: " + uploadError.message);
    } finally {
      setProcessing(false);
    }
  };

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

  const indexPdf = async (source, sourceName, fileUrl, periodYear, periodMonth) => {
    setProcessing(true);
    setError("");
    try {
      const pdf = await pdfjsLib.getDocument({ data: source }).promise;
      const indexed = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (pageText) {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
          const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!imageBlob) throw new Error("تعذر تحويل صفحة المرتب إلى صورة.");
          const imagePath = `faculty-salaries/pages/${periodYear}-${periodMonth}-${Date.now()}-${pageNumber}.png`;
          const { error: imageUploadError } = await supabase.storage
            .from("faculty-salaries")
            .upload(imagePath, imageBlob, { contentType: "image/png", upsert: false });
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
        const { error: saveError } = await supabase.from("faculty_salary_pages").insert(indexed);
        if (saveError) throw saveError;
      }
      await loadRecords();
    } catch (error) {
      console.error("تعذر فهرسة ملف المرتبات:", error);
      setError("تعذر قراءة أو حفظ ملف المرتبات: " + error.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.claimsHeader}>
        <div>
          <h2 style={styles.cardTitle}>👨‍🏫 مرتبات هيئة التدريس</h2>
          <p style={styles.cardSub}>ابحثي باسم عضو هيئة التدريس لعرض مفردات مرتبه للشهور المتتالية</p>
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
      </div>

      {pendingFiles.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
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

      <div style={styles.filterRow}>
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
      </div>

      <div style={styles.claimStats}>
        <ClaimStat title="النتائج" value={results.length} icon="🔎" />
        <ClaimStat title="الصفحات المفهرسة" value={records.length} icon="📄" />
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 22 }}>
          {results.map((record) => (
            <div key={record.id} style={{ overflow: "hidden", border: "1px solid #DCE6F0", borderRadius: 14, background: "#fff", boxShadow: "0 6px 18px rgba(15,41,66,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <strong style={{ color: "#1E293B" }}>{MONTH_NAMES[Number(record.period_month) - 1] || record.period_month} {record.period_year}</strong>
                <span style={{ color: "#64748B", fontSize: 12 }}>صفحة {record.page_number}</span>
              </div>
              <div style={{ padding: 16, background: "#E2E8F0", display: "flex", justifyContent: "center" }}>
                <SalaryPagePreview record={record} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={search ? "لا توجد نتائج مطابقة للاسم." : "اكتبي اسم عضو هيئة التدريس لعرض مفرداته."} />
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { EXECUTIVE_ORDERS_CONFIG } from "./executiveOrdersConfig";
import {
  normalizeArabicText,
  searchPersons,
} from "../utils/executiveOrderSearch";
import {
  fileToJpegBlob,
  fileToOrderPdfBlob,
  jpegBlobToPdfBytes,
  mergeOrderIntoArchive,
  pdfPageCount,
  renderPdfBytesToJpegs,
} from "../utils/executiveOrderPdf";

const CFG = EXECUTIVE_ORDERS_CONFIG;

const migrationHint = (err) => {
  const hints = [
    /could not find the table/i,
    /does not exist/i,
    /relation .* does not exist/i,
    /permission denied/i,
    /row-level security/i,
    /could not find the bucket/i,
    /storage object already exists/i,
    /new row violates row-level security/i,
  ];
  return hints.some((re) => re.test(err?.message || String(err)))
    ? `${err?.message || String(err)}\n\n\u{1F6A7} تأكدي من تنفيذ ملف "${CFG.migrationFile}" بالكامل في Supabase SQL Editor (ينشئ جدولي ${CFG.personsTable} و${CFG.ordersTable} وبكت ${CFG.bucket}).`
    : err?.message || String(err);
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadQueryUrl(fileUrl, downloadName) {
  const separator = fileUrl.includes("?") ? "&" : "?";
  return `${fileUrl}${separator}download=${encodeURIComponent(downloadName || "order.pdf")}`;
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      numberingSystem: "latn",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

/* --------------------------------------------------------------------------
   كاميرا حية: تفتح كاميرا الجهاز (الخلفية) عبر getUserMedia على HTTPS،
   وإذا فشلت (على موبايل/HTTP) تقع إلى الكاميرا الأصلية عبر <input capture>.
-------------------------------------------------------------------------- */
function CameraModal({ onCaptured, onUseDeviceCamera, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia غير مدعوم");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play?.();
        }
        setReady(true);
        setError("");
      } catch (err) {
        console.error("camera open error:", err);
        setError(
          "تعذر فتح الكاميرا مباشرة (يحتاج HTTPS، أو التصفح على موبايل). استخدم «الكاميرا الأصلية للجهاز»."
        );
      }
    })();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      alert("الكاميرا لم تصل للجاهزية بعد، انتظر قليلًا ثم حاول.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    canvas.toBlob(
      (b) => {
        if (b) onCaptured(new File([b], `order-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85
    );
  };

  return (
    <div style={styles.overlay}>
      <div
        style={{
          background: "#fff",
          borderRadius: 15,
          width: "min(560px, 100%)",
          padding: 20,
          boxSizing: "border-box",
        }}
      >
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>📷 تصوير الأمر التنفيذي</h2>
          <button style={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        {ready && (
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: "100%",
              maxHeight: "62vh",
              borderRadius: 12,
              background: "#0F172A",
              objectFit: "contain",
            }}
          />
        )}

        {!ready && !error && (
          <div style={styles.emptyClaims}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
            جاري فتح الكاميرا...
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            {error}
            <div style={{ marginTop: 10 }}>
              <button style={styles.primaryButton} onClick={onUseDeviceCamera}>
                📱 استخدام الكاميرا الأصلية للجهاز
              </button>
            </div>
          </div>
        )}

        {ready && (
          <div style={styles.modalActions}>
            <button style={styles.primaryButton} onClick={capture}>
              📸 التقاط
            </button>
            <button style={styles.secondaryButton} onClick={onClose}>
              إلغاء
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   الشاشة الرئيسية: «إضافة أمر تنفيذي» + «أرشيف الأوامر التنفيذية»
-------------------------------------------------------------------------- */
export default function ExecutiveOrdersPage({ currentUser, view = "add", onNavigate }) {
  const createdBy = currentUser?.full_name || currentUser?.username || null;

  const [persons, setPersons] = useState([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* ---- إضافة أمر تنفيذي ---- */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [asset, setAsset] = useState(null); // { file, preview, isPdf, name }
  const [orderNote, setOrderNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  /* ---- أرشيف ---- */
  const [archiveQuery, setArchiveQuery] = useState("");
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [filePerson, setFilePerson] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileImages, setFileImages] = useState([]);
  const [filePageIndex, setFilePageIndex] = useState(0);
  const [fileOrders, setFileOrders] = useState([]);
  const [fileError, setFileError] = useState("");

  /* ---- استيراد الأرشيف القديم ---- */
  const [pendingFiles, setPendingFiles] = useState([]);
  const [skipDup, setSkipDup] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState([]);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef(null);

  const loadPersons = async () => {
    setPersonsLoading(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from(CFG.personsTable)
        .select(
          "id, full_name, full_name_norm, file_path, file_url, page_count, order_count, updated_at"
        )
        .order("full_name");
      if (fetchErr) throw fetchErr;
      setPersons(data || []);
    } catch (err) {
      console.error("loadPersons:", err);
      setError(migrationHint(err));
    } finally {
      setPersonsLoading(false);
    }
  };

useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPersons();
  }, []);

  const searchResults = useMemo(
    () => (searchQuery.trim() ? searchPersons(persons, searchQuery) : []),
    [persons, searchQuery]
  );

  const archiveResults = useMemo(
    () =>
      archiveQuery.trim()
        ? searchPersons(persons, archiveQuery)
        : persons,
    [persons, archiveQuery]
  );

  /* ---------------- اختيار الملف المصدر (تصوير / رفع) ---------------- */

  const handleFileChosen = async (file) => {
    if (!file) return;
    setError("");
    setSuccess("");
    const type = String(file.type || "").toLowerCase();
    try {
      if (type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        const { images } = await renderPdfBytesToJpegs(buf, 0.6);
        setAsset({
          file,
          preview: images[0] || "",
          isPdf: true,
          name: file.name,
        });
      } else if (type.startsWith("image/") || !type) {
        const jpeg = await fileToJpegBlob(file);
        const preview = await blobToDataUrl(jpeg);
        setAsset({ file, preview, isPdf: false, name: file.name });
      } else {
        setError("نوع الملف غير مدعوم. ارفع صورة أو ملف PDF.");
      }
    } catch (err) {
      setError(err?.message || "تعذر قراءة الملف المختار.");
    }
  };

  const onCaptured = (file) => {
    setCameraOpen(false);
    handleFileChosen(file);
  };

  const clearAsset = () => {
    setAsset(null);
    setOrderNote("");
    setSelectedPerson(null);
  };

  /* ---------------- إنشاء شخص جديد ---------------- */

  const createPerson = async (name) => {
    const { data, error: insErr } = await supabase
      .from(CFG.personsTable)
      .insert({
        full_name: name,
        full_name_norm: normalizeArabicText(name),
        file_path: null,
        file_url: null,
        page_count: 0,
        order_count: 0,
        created_by: createdBy,
      })
      .select("id, full_name, full_name_norm, file_path, file_url, page_count, order_count")
      .single();
    if (insErr) throw insErr;
    return data;
  };

  const handleCreatePerson = async () => {
    const name = newPersonName.trim();
    if (!name) {
      alert("اكتب اسم الشخص أولًا.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const person = await createPerson(name);
      setPersons((prev) => [...prev, person]);
      setSelectedPerson(person);
      setNewPersonOpen(false);
      setNewPersonName("");
      setSearchQuery(name);
      if (asset) {
        setConfirmOpen(true);
      } else {
        setSuccess(`✅ تم إنشاء «${name}» في الأرشيف. الآن التقط/ارفع الأمر ثم اضغط «إضافة إلى الملف».`);
      }
    } catch (err) {
      console.error("createPerson:", err);
      setError(migrationHint(err));
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- حفظ الأمر في ملف الشخص ---------------- */

  const saveOrder = async (person, assetToAdd, note) => {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let additionBytes;
      if (assetToAdd.isPdf) {
        additionBytes = new Uint8Array(await assetToAdd.file.arrayBuffer());
      } else {
        const src = await fileToOrderPdfBlob(assetToAdd.file);
        additionBytes = await jpegBlobToPdfBytes(src);
      }

      let existingBytes = null;
      if (person.file_path) {
        const { data: blob, error: dlErr } = await supabase.storage
          .from(CFG.bucket)
          .download(person.file_path);
        if (!dlErr && blob) {
          existingBytes = new Uint8Array(await blob.arrayBuffer());
        } else if (
          dlErr &&
          !/no such object|404|Object not found/i.test(String(dlErr.message || dlErr))
        ) {
          throw dlErr;
        }
      }

      const { mergedBytes, oldCount, newCount } =
        await mergeOrderIntoArchive(existingBytes, additionBytes);

      const path = `${person.id}/archive.pdf`;
      const { error: upErr } = await supabase.storage
        .from(CFG.bucket)
        .upload(path, mergedBytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(CFG.bucket).getPublicUrl(path);
      const fileUrl = pub?.publicUrl;

      const { error: persErr } = await supabase
        .from(CFG.personsTable)
        .update({
          file_path: path,
          file_url: fileUrl,
          page_count: newCount,
          order_count: (person.order_count || 0) + 1,
          full_name_norm: normalizeArabicText(person.full_name),
          updated_at: new Date().toISOString(),
        })
        .eq("id", person.id);
      if (persErr) throw persErr;

      const { error: ordErr } = await supabase.from(CFG.ordersTable).insert({
        person_id: person.id,
        order_title: note || null,
        order_date: new Date().toISOString().slice(0, 10),
        source_mime: assetToAdd.file.type || null,
        original_filename: assetToAdd.file.name || null,
        page_start: oldCount + 1,
        page_end: newCount,
        created_by: createdBy,
      });
      if (ordErr) throw ordErr;

      setSuccess(
        `✅ تم إضافة الأمر التنفيذي بنجاح إلى ملف: ${person.full_name} — عدد الأوامر في الملف الآن: ${newCount}`
      );
      setAsset(null);
      setOrderNote("");
      setSelectedPerson(null);
      setConfirmOpen(false);
      setSearchQuery("");
      await loadPersons();
    } catch (err) {
      console.error("saveOrder:", err);
      setError(migrationHint(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedPerson || !asset) return;
    setConfirmOpen(true);
  };

  /* ---------------- استيراد الأرشيف القديم (PDFs) ---------------- */

  const insertPersonRow = async (name) => {
    const { data, error: insErr } = await supabase
      .from(CFG.personsTable)
      .insert({
        full_name: name,
        full_name_norm: normalizeArabicText(name),
        file_path: null,
        file_url: null,
        page_count: 0,
        order_count: 0,
        created_by: createdBy,
      })
      .select("id, full_name, full_name_norm, file_path, file_url, page_count, order_count, updated_at")
      .single();
    if (insErr) throw insErr;
    return data;
  };

  const handleImportFilesSelected = (fileList) => {
    if (!fileList || !fileList.length) return;
    const pdfs = Array.from(fileList).filter((f) =>
      /\.pdf$/i.test(f.name) || String(f.type || "").toLowerCase() === "application/pdf"
    );
    if (!pdfs.length) {
      setImportError("اختر ملفات PDF فقط.");
      return;
    }
    setImportError("");
    setPendingFiles(pdfs);
    setImportResults([]);
  };

  const clearPending = () => {
    setPendingFiles([]);
    setImportResults([]);
    setImportError("");
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const runImport = async () => {
    if (!pendingFiles.length || importing) return;
    setImporting(true);
    setImportError("");
    setImportResults([]);

    try {
      let personMap = new Map(persons.map((p) => [p.id, p]));

      const { data: allOrders } = await supabase
        .from(CFG.ordersTable)
        .select("person_id, original_filename");
      if (allOrders && !Array.isArray(allOrders)) throw allOrders;
      const seen = new Set(
        (allOrders || [])
          .filter((o) => o.person_id && o.original_filename)
          .map((o) => `${o.person_id}|${o.original_filename}`)
      );

      const results = [];
      for (let i = 0; i < pendingFiles.length; i += 1) {
        const file = pendingFiles[i];
        const rawName = file.name.replace(/\.pdf$/i, "").trim();
        const res = {
          name: rawName || file.name,
          fileName: file.name,
          pages: 0,
          status: "pending",
        };

        try {
          if (!rawName) {
            res.status = "error";
            res.error = "اسم الملف فارغ — اعد تسمية الملف باسم الشخص";
            results.push(res);
            setImportResults([...results]);
            continue;
          }

          const norm = normalizeArabicText(rawName);
          let person = [...personMap.values()].find(
            (p) => (p.full_name_norm || normalizeArabicText(p.full_name)) === norm
          );
          let isNew = false;

          if (person) {
            if (skipDup && seen.has(`${person.id}|${file.name}`)) {
              res.status = "skipped";
              res.error = "مكرر — هذا الملف مستورد من قبل";
              results.push(res);
              setImportResults([...results]);
              continue;
            }
          } else {
            person = await insertPersonRow(rawName);
            personMap.set(person.id, person);
            isNew = true;
          }

          const bytes = new Uint8Array(await file.arrayBuffer());
          const pageCount = await pdfPageCount(bytes.buffer);
          res.pages = pageCount || 1;

          let merged = bytes;
          let oldCount = 0;
          let newCount = pageCount;

          if (!isNew && person.file_path) {
            const { data: blob, error: dlErr } = await supabase.storage
              .from(CFG.bucket)
              .download(person.file_path);
            if (!dlErr && blob) {
              const existing = new Uint8Array(await blob.arrayBuffer());
              const mergedResult = await mergeOrderIntoArchive(existing, bytes);
              merged = mergedResult.mergedBytes;
              oldCount = mergedResult.oldCount;
              newCount = mergedResult.newCount;
              res.pages = newCount;
              res.pagesAdded = mergedResult.addedCount;
            }
          }

          const path = `${person.id}/archive.pdf`;
          const { error: upErr } = await supabase.storage
            .from(CFG.bucket)
            .upload(path, merged, { contentType: "application/pdf", upsert: true });
          if (upErr) throw upErr;

          const { data: pub } = supabase.storage.from(CFG.bucket).getPublicUrl(path);

          const { error: persErr } = await supabase
            .from(CFG.personsTable)
            .update({
              file_path: path,
              file_url: pub?.publicUrl,
              page_count: newCount,
              order_count: (person.order_count || 0) + 1,
              full_name_norm: norm,
              updated_at: new Date().toISOString(),
            })
            .eq("id", person.id);
          if (persErr) throw persErr;

          const { error: ordErr } = await supabase.from(CFG.ordersTable).insert({
            person_id: person.id,
            order_title: "ملف الأرشيف القديم",
            order_date: new Date().toISOString().slice(0, 10),
            source_mime: "application/pdf",
            original_filename: file.name,
            page_start: oldCount + 1,
            page_end: newCount,
            created_by: createdBy,
          });
          if (ordErr) throw ordErr;

          seen.add(`${person.id}|${file.name}`);
          res.status = "success";
          res.isNew = isNew;
        } catch (err) {
          console.error(`import ${file.name}:`, err);
          res.status = "error";
          res.error = migrationHint(err);
        }

        results.push(res);
        setImportResults([...results]);
      }
      setPendingFiles([]);
      if (importInputRef.current) importInputRef.current.value = "";
      await loadPersons();
    } catch (outerErr) {
      console.error("runImport:", outerErr);
      setImportError(migrationHint(outerErr));
    } finally {
      setImporting(false);
    }
  };

  /* ---------------- الأرشيف: فتح الملف الكامل ---------------- */

  const loadOrdersForPerson = async (personId) => {
    const { data, error: ordErr } = await supabase
      .from(CFG.ordersTable)
      .select("id, order_title, order_date, source_mime, original_filename, page_start, page_end")
      .eq("person_id", personId)
      .order("created_at");
    if (ordErr) throw ordErr;
    return data || [];
  };

  const openFileModal = async (person) => {
    setFilePerson(person);
    setFileLoading(true);
    setFileError("");
    setFileImages([]);
    setFilePageIndex(0);
    setFileOrders([]);
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(CFG.bucket)
        .download(`${person.id}/archive.pdf`);
      if (dlErr || !blob) {
        throw dlErr || new Error("الملف غير موجود في البكت.");
      }
      const { images } = await renderPdfBytesToJpegs(await blob.arrayBuffer());
      setFileImages(images);
      setFilePageIndex(0);
      const orders = await loadOrdersForPerson(person.id);
      setFileOrders(orders);
      setFileModalOpen(true);
    } catch (err) {
      setFileError(migrationHint(err));
    } finally {
      setFileLoading(false);
    }
  };

  const printFile = () => {
    if (!filePerson || !fileImages.length) return;
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      alert("من فضلك اسمحي بالنوافذ المنبثقة للطباعة.");
      return;
    }
    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>${filePerson.full_name} - أوامر تنفيذية</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; margin: 0; padding: 16px; }
            .head { text-align:center; margin-bottom: 14px; font-size: 16px; font-weight: 700; }
            .page { page-break-after: always; text-align:center; }
            .page img { max-width:100%; height:auto; }
          </style>
        </head>
        <body>
          <div class="head">${filePerson.full_name}<br/>الملف الكامل (${fileImages.length} صفحة)</div>
          ${fileImages
            .map(
              (src, i) =>
                `<div class="page"><img src="${src}" alt="صفحة ${i + 1}" /></div>`
            )
            .join("")}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  /* ---------------- عرض ---------------- */

  const header = (
    <div className="" style={styles.pageHeader}>
      <div>
        <div style={styles.breadcrumb}>الأرشيف التنفيذي</div>
        <h2 style={styles.sectionHeading}>
          {view === "archive"
            ? CFG.archiveTitle
            : view === "import"
              ? "📥 استيراد الأرشيف القديم"
              : CFG.addTitle}
        </h2>
        <p style={styles.pageSub}>
          {view === "import"
            ? "ارفع ملفات PDF — اسم الملف = اسم الشخص، ثم يُدمج في ملفه."
            : "كل شخص له ملف PDF واحد تُضاف إليه الأوامر التنفيذية الجديدة دون تغيير القديمة."}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => onNavigate("executive_orders_add")}
          style={{
            ...(view === "add" ? styles.primaryButton : styles.secondaryButton),
          }}
        >
          ➕ إضافة أمر تنفيذي
        </button>
        <button
          onClick={() => onNavigate("executive_orders_archive")}
          style={{
            ...(view === "archive" ? styles.primaryButton : styles.secondaryButton),
          }}
        >
          🗂️ الأرشيف
        </button>
        <button
          onClick={() => onNavigate("executive_orders_import")}
          style={{
            ...(view === "import" ? styles.primaryButton : styles.secondaryButton),
          }}
        >
          📥 استيراد الأرشيف القديم
        </button>
      </div>
    </div>
  );

  const personSearchBox = ({
    query,
    setQuery,
    resultsLabel,
  }) => (
    <div style={{ marginBottom: 14 }}>
      <input
        style={styles.searchInput}
        placeholder="🔎 ابحث بالاسم (يكفي جزء — مثال: شهاب)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <div style={styles.resultText}>
          {resultsLabel}
        </div>
      )}
    </div>
  );

  const personResultList = ({
    query,
    results,
    onPick,
  }) => {
    if (!query.trim()) {
      return (
        <div style={styles.empty}>
          اكتب أي جزء من الاسم لتبحث (لا يشترط الاسم الكامل).
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <div style={styles.card}>
          <div style={styles.errorBox}>لم يتم العثور على هذا الشخص</div>
          <button
            style={styles.manualClaimButton}
            onClick={() => {
              setNewPersonName(query.trim());
              setNewPersonOpen(true);
            }}
          >
            🆕 إنشاء ملف جديد
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((person) => (
          <button
            key={person.id}
            onClick={() => onPick(person)}
            style={{
              width: "100%",
              border: selectedPerson?.id === person.id
                ? "2px solid #2563EB"
                : "1px solid #E2E8F0",
              background: selectedPerson?.id === person.id ? "#EFF6FF" : "#fff",
              borderRadius: 10,
              padding: "12px 14px",
              cursor: "pointer",
              textAlign: "right",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 14,
            }}
          >
            <span style={styles.workIcon}>👤</span>
            <span style={styles.workInfo}>
              <b>{person.full_name}</b>
              <small style={{ color: "#64748B" }}>
                عدد الأوامر: {person.order_count || 0} • عدد الصفحات: {person.page_count || 0}
              </small>
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div dir="rtl">
      {header}

      {personsLoading && !persons.length && (
        <div style={styles.card}>
          <div style={styles.empty}>⏳ جاري تحميل الأرشيف...</div>
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}
      {success && <div style={styles.successBox}>{success}</div>}

      {view === "add" && (
        <>
          {/* ---------- 1) تصوير / رفع ---------- */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>📷 تصوير أو رفع الأمر التنفيذي</h2>
            <p style={styles.cardSub}>
              يمكنك التصوير مباشرة أو رفع صورة/PDF موجودة. اختيار صاحب الأمر يتم في الخطوة التالية.
            </p>

            <div style={styles.filterRow}>
              <button
                style={styles.primaryButton}
                onClick={() => {
                  setError("");
                  if (!navigator.mediaDevices?.getUserMedia) {
                    cameraInputRef.current?.click();
                    return;
                  }
                  setCameraOpen(true);
                }}
              >
                📷 تصوير أمر تنفيذي
              </button>
              <button
                style={styles.secondaryButton}
                onClick={() => uploadInputRef.current?.click()}
              >
                📄 رفع صورة أو PDF
              </button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) =>
                  handleFileChosen(e.target.files?.[0]).then(() => {
                    if (e.target) e.target.value = "";
                  })
                }
              />
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={(e) =>
                  handleFileChosen(e.target.files?.[0]).then(() => {
                    if (e.target) e.target.value = "";
                  })
                }
              />
            </div>

            {asset && (
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  background: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                {asset.preview && (
                  <img
                    src={asset.preview}
                    alt="معاينة"
                    style={{
                      width: 150,
                      maxHeight: 190,
                      objectFit: "contain",
                      borderRadius: 10,
                      border: "1px solid #E2E8F0",
                      background: "#fff",
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {asset.isPdf ? "📄 ملف PDF" : "🖼️ صورة"} — {asset.name}
                  </div>
                  <div style={{ color: "#64748B", fontSize: 13, margin: "6px 0 12px" }}>
                    {asset.isPdf
                      ? "سيُضاف كصفحة(ات) في نهاية ملف الشخص."
                      : "سيُحوّل إلى PDF ويُضاف كصفحة جديدة في نهاية ملف الشخص."}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.viewButton} onClick={() => uploadInputRef.current?.click()}>
                      استبدال
                    </button>
                    <button style={styles.deleteButton} onClick={clearAsset}>
                      إزالة
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ---------- 2) البحث عن صاحب الأمر ---------- */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>ابحث عن صاحب الأمر التنفيذي</h2>
            <p style={styles.cardSub}>
              {selectedPerson
                ? `سأضيف الأمر إلى: ${selectedPerson.full_name}`
                : "اكتب أي جزء من الاسم — النتائج تظهر أثناء الكتابة مباشرة."}
            </p>

            {personSearchBox({
              query: searchQuery,
              setQuery: setSearchQuery,
              resultsLabel: `${searchResults.length} نتيجة`,
            })}

            {personResultList({
              query: searchQuery,
              results: searchResults,
              onPick: (person) => {
                setSelectedPerson(person);
                setSearchQuery("");
              },
            })}
          </div>

          {/* ---------- 3) تأكيد الإضافة ---------- */}
          {selectedPerson && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>تأكيد الإضافة</h2>
              <div style={styles.infoBox}>
                {asset
                  ? `سيتم إضافة الأمر التنفيذي إلى ملف: ${selectedPerson.full_name}`
                  : `تم اختيار: ${selectedPerson.full_name} — لا يوجد أمر مرفوع بعد. التقط أو ارفع الأمر أولًا.`}
              </div>

              {asset && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>وصف الأمر (اختياري)</label>
                    <input
                      style={styles.input}
                      placeholder="مثال: قرار وقف/إعادة عمل، إعارة..."
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                    />
                  </div>
                  <div style={styles.modalActions}>
                    <button
                      style={styles.primaryButton}
                      disabled={saving}
                      onClick={() => handleConfirmAdd()}
                    >
                      {saving ? "⏳ جاري الحفظ..." : "🖇️ إضافة إلى الملف"}
                    </button>
                    <button
                      style={styles.secondaryButton}
                      disabled={saving}
                      onClick={() => setSelectedPerson(null)}
                    >
                      تغيير الشخص
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------- مودال تأكيد نهائي ---------- */}
          {confirmOpen && selectedPerson && asset && (
            <div style={styles.overlay}>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 15,
                  width: "min(560px, 100%)",
                  padding: 22,
                  boxSizing: "border-box",
                }}
              >
                <div style={styles.modalHeader}>
                  <h2 style={styles.modalTitle}>تأكيد الأمر</h2>
                  <button style={styles.closeButton} onClick={() => setConfirmOpen(false)}>
                    ✕
                  </button>
                </div>
                <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
                  <div style={{ fontSize: 40 }}>🗂️</div>
                  <p style={{ fontSize: 15, color: "#334155", margin: "12px 0" }}>
                    سيتم إضافة الأمر التنفيذي إلى نهاية ملف:
                  </p>
                  <div
                    style={{
                      background: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      color: "#1D4ED8",
                      borderRadius: 10,
                      padding: 13,
                      fontWeight: 900,
                      fontSize: 16,
                    }}
                  >
                    {selectedPerson.full_name}
                  </div>
                  <div style={{ color: "#64748B", fontSize: 13, marginTop: 10 }}>
                    عدد الأوامر الحالي: {selectedPerson.order_count || 0}
                    {asset.isPdf ? " — سيُضاف PDF" : " — سيُضاف صورته (صفحة PDF)"}
                  </div>
                </div>
                <div style={styles.modalActions}>
                  <button
                    style={styles.primaryButton}
                    disabled={saving}
                    onClick={() => saveOrder(selectedPerson, asset, orderNote)}
                  >
                    {saving ? "⏳ جاري الدمج والحفظ..." : "إضافة إلى الملف"}
                  </button>
                  <button
                    style={styles.secondaryButton}
                    disabled={saving}
                    onClick={() => setConfirmOpen(false)}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---------- مودال شخص جديد ---------- */}
          {newPersonOpen && (
            <div style={styles.overlay}>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 15,
                  width: "min(520px, 100%)",
                  padding: 22,
                  boxSizing: "border-box",
                }}
              >
                <div style={styles.modalHeader}>
                  <h2 style={styles.modalTitle}>🆕 إنشاء ملف جديد</h2>
                  <button style={styles.closeButton} onClick={() => setNewPersonOpen(false)}>
                    ✕
                  </button>
                </div>
                <p style={{ color: "#64748B", fontSize: 13, margin: "0 0 14px" }}>
                  لم يتم العثور على هذا الشخص في الأرشيف. اكتب اسمه كاملًا لإنشاء ملف PDF جديد له،
                  ثم سيُسجَّل في الأرشيف وستضاف إليه الأوامر القادمة بنفس الاسم.
                </p>
                <input
                  style={styles.input}
                  placeholder="الاسم كاملًا"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                />
                <div style={styles.modalActions}>
                  <button
                    style={styles.manualClaimButtonLarge}
                    disabled={saving}
                    onClick={handleCreatePerson}
                  >
                    {saving ? "⏳ جاري الإنشاء..." : "إنشاء الملف"}
                  </button>
                  <button
                    style={styles.secondaryButton}
                    disabled={saving}
                    onClick={() => setNewPersonOpen(false)}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {view === "archive" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🗂️ أرشيف الأوامر التنفيذية</h2>
          <p style={styles.cardSub}>
            ابحث بأي جزء من الاسم لفتح الملف الكامل لأي شخص.
          </p>

          <div style={{ marginBottom: 14 }}>
            <input
              style={styles.searchInput}
              placeholder="🔎 بحث بالحروف — مثال: شهاب"
              value={archiveQuery}
              onChange={(e) => setArchiveQuery(e.target.value)}
            />
          </div>

          {archiveResults.length === 0 ? (
            <div style={styles.empty}>
              {archiveQuery.trim()
                ? "لم يتم العثور على هذا الشخص في الأرشيف."
                : "لا توجد سجلات في الأرشيف بعد."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {archiveResults.map((person) => (
                <div
                  key={person.id}
                  style={{
                    border: "1px solid #E7EBF0",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    background: "#fff",
                  }}
                >
                  <span style={styles.workIcon}>👤</span>
                  <div style={styles.workInfo}>
                    <b>{person.full_name}</b>
                    <small style={{ color: "#64748B" }}>
                      {person.order_count || 0} أمر تنفيذي • {person.page_count || 0} صفحة
                      {person.updated_at ? ` • آخر تحديث: ${formatDate(person.updated_at)}` : ""}
                    </small>
                  </div>
                  <div style={{ marginRight: "auto", display: "flex", gap: 8 }}>
                    <button
                      style={styles.viewButton}
                      onClick={() => openFileModal(person)}
                    >
                      📂 فتح الملف الكامل
                    </button>
                    {person.file_url && (
                      <a
                        href={downloadQueryUrl(person.file_url, `${person.full_name}.pdf`)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          ...styles.viewButton,
                          textDecoration: "none",
                          background: "#EFF6FF",
                          color: "#1D4ED8",
                        }}
                      >
                        ⬇️ تحميل
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "import" && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>📥 استيراد الأرشيف القديم</h2>
          <p style={styles.cardSub}>
            اختر ملفات PDF القديمة دفعة واحدة — كل ملف يمثل شخصًا واحدًا واسم الملف هو اسم
            الشخص (مثال: <b>علي شهاب شمس الدين أبو اليزيد.pdf</b>). أي ملف باسم شخص موجود
            سيُدمج في ملفه، وأي شخص جديد يُسجَّل في الأرشيف ليستقبل الأوامر الجديدة لاحقًا.
          </p>

          <div style={styles.filterRow}>
            <button
              style={styles.primaryButton}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              📂 اختيار ملفات PDF
            </button>
            <input
              ref={importInputRef}
              type="file"
              multiple
              accept="application/pdf,.pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                handleImportFilesSelected(e.target.files);
                if (e.target) e.target.value = "";
              }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={skipDup}
              onChange={(e) => setSkipDup(e.target.checked)}
              disabled={importing}
            />
            تخطي الملفات المكررة (نفس اسم الملف المستورد من قبل لنفس الشخص)
          </label>

          {importError && <div style={styles.errorBox}>{importError}</div>}

          {pendingFiles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={styles.resultText}>
                سيتم استيراد {pendingFiles.length} ملف:
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} style={{ padding: "9px 12px", borderBottom: "1px solid #EEF2F6", fontSize: 13 }}>
                    📄 {f.name.replace(/\.pdf$/i, "")}
                  </div>
                ))}
              </div>
              <div style={styles.modalActions}>
                <button style={styles.excelButtonLarge} disabled={importing} onClick={runImport}>
                  {importing ? "⏳ جاري الاستيراد..." : `🚀 استيراد ${pendingFiles.length} ملف`}
                </button>
                <button style={styles.secondaryButton} disabled={importing} onClick={clearPending}>
                  تفريغ القائمة
                </button>
              </div>
            </div>
          )}

          {importResults.length > 0 && (
            <div>
              <div style={styles.resultText}>
                النتيجة: {importResults.filter((r) => r.status === "success").length} نجحت •
                {importResults.filter((r) => r.status === "skipped").length} مكرر •
                {importResults.filter((r) => r.status === "error").length} فشلت
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {importResults.map((r, i) => (
                  <div
                    key={`${r.fileName}-${i}`}
                    style={{
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      padding: "9px 12px",
                      fontSize: 13,
                      background:
                        r.status === "success"
                          ? "#F0FDF4"
                          : r.status === "skipped"
                            ? "#FFF7ED"
                            : "#FEF2F2",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌"}{" "}
                      {r.name}
                      {r.status === "success" && (
                        <span style={{ color: "#64748B", fontWeight: 600 }}>
                          {" "}— {r.isNew ? "شخص جديد" : "دُمج في ملفه"} • {r.pages} صفحة
                        </span>
                      )}
                    </div>
                    {r.error && (
                      <div style={{ color: r.status === "skipped" ? "#92400E" : "#B91C1C", marginTop: 3 }}>
                        {r.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- كاميرا ---------- */}
      {cameraOpen && (
        <CameraModal
          onCaptured={onCaptured}
          onUseDeviceCamera={() => {
            setCameraOpen(false);
            cameraInputRef.current?.click();
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* ---------- مودال الملف الكامل ---------- */}
      {fileModalOpen && filePerson && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "14px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "min(920px, 100%)",
              maxHeight: "94vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 16px",
                borderBottom: "1px solid #E5E7EB",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1E293B" }}>
                📂 {filePerson.full_name}
                <span style={{ color: "#64748B", fontWeight: 600 }}>
                  {" "}— الملف الكامل ({fileImages.length} صفحة / {fileOrders.length} أمر)
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...styles.viewButton, background: "#F1F5F9", color: "#334155" }} onClick={printFile}>
                  🖨️ طباعة
                </button>
                {filePerson.file_url && (
                  <a
                    href={downloadQueryUrl(filePerson.file_url, `${filePerson.full_name}.pdf`)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      ...styles.viewButton,
                      textDecoration: "none",
                      background: "#EFF6FF",
                      color: "#1D4ED8",
                    }}
                  >
                    ⬇️ تحميل
                  </a>
                )}
                <button style={styles.closeButton} onClick={() => setFileModalOpen(false)}>
                  ✕
                </button>
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: 14, textAlign: "center" }}>
              {fileLoading && <div style={styles.empty}>⏳ جاري تحميل الملف...</div>}
              {fileError && <div style={styles.errorBox}>{fileError}</div>}

              {fileImages.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>
                    صفحة {filePageIndex + 1} من {fileImages.length}
                  </div>
                  <img
                    src={fileImages[filePageIndex]}
                    alt={`صفحة ${filePageIndex + 1}`}
                    style={{ maxWidth: "100%", maxHeight: "62vh", borderRadius: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                    <button
                      style={{ ...styles.viewButton, background: "#F1F5F9", color: "#334155" }}
                      disabled={filePageIndex <= 0}
                      onClick={() => setFilePageIndex((i) => i - 1)}
                    >
                      السابق
                    </button>
                    <button
                      style={{ ...styles.viewButton, background: "#F1F5F9", color: "#334155" }}
                      disabled={filePageIndex >= fileImages.length - 1}
                      onClick={() => setFilePageIndex((i) => i + 1)}
                    >
                      التالي
                    </button>
                  </div>
                </>
              )}

              {fileOrders.length > 0 && (
                <div style={{ textAlign: "right", marginTop: 16 }}>
                  <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>
                    📑 الأوامر التنفيذية (بالتسلسل من الأقدم للأحدث)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {fileOrders.map((order, i) => (
                      <div
                        key={order.id}
                        style={{
                          background: "#F8FAFC",
                          borderRadius: 8,
                          padding: "9px 12px",
                          fontSize: 13,
                          border: "1px solid #E2E8F0",
                        }}
                      >
                        <b>الأمر {i + 1}</b>
                        {order.order_title ? ` — ${order.order_title}` : ""}
                        <span style={{ color: "#64748B" }}>
                          {" "}•{' '}
                          {order.order_date ? formatDate(order.order_date) : ""}
                          {" "}• الصفحات {order.page_start || "?"}-{order.page_end || "?"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
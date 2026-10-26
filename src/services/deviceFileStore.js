/* ------------------------------------------------------------------
   deviceFileStore.js — تخزين ملفات على جهاز المستخدم داخل المتصفح
   (IndexedDB) بدون أي رفع إلى Supabase Storage أو R2.

   لماذا IndexedDB؟
     • متاح في كل المتصفحات وعلى أندرويد، بلا أذونات ولا مجلدات.
     • يقبل Blob مباشرة (PDF حتى 20 ميجابايت بسهولة).
     • البيانات على القرص فعليًا (داخل مساحة المتصفح) وليست في السحابة.

   المفاتيح هنا نسبية بنفس شكل مسار البِكِت:
     "<bucket>/<object-path>"
   حتى تتطابق مع مراجع local:// المحفوظة في قاعدة البيانات.
------------------------------------------------------------------ */

const DB_NAME = "asu-device-files";
const DB_VERSION = 1;
const STORE = "files";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("التخزين المحلي غير متاح في هذا المتصفح."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("تعذر فتح مخزن الملفات المحلي."));
    request.onblocked = () =>
      reject(new Error("مخزن الملفات المحلي مشغول. أغلقي التبويبات الأخرى وحاولي."));
  });

  return dbPromise;
}

async function run(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let request;
    try {
      request = work(store);
    } catch (err) {
      reject(err);
      return;
    }

    let value;
    if (request && typeof request === "object" && "onsuccess" in request) {
      request.onsuccess = () => {
        value = request.result;
      };
    }

    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () =>
      reject(transaction.error || new Error("تعذر تنفيذ عملية الملف."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("أُلغيت عملية الملف."));
  });
}

/** هل التخزين المحلي في المتصفح متاح؟ */
export function isDeviceStoreAvailable() {
  return typeof indexedDB !== "undefined";
}

/** يطلب من المتصفح عدم حذف الملفات تلقائيًا عند ضيق المساحة. */
export async function requestPersistentStorage() {
  try {
    if (navigator?.storage?.persist) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* تجاهل — ليست حرجة */
  }
  return false;
}

/** حفظ ملف (Blob) بمسار نسبي. */
export async function deviceSaveFile(relPath, blob, contentType = "") {
  if (!relPath) throw new Error("مسار الملف غير محدد.");
  if (!blob) throw new Error("لا يوجد ملف للحفظ.");
  await requestPersistentStorage();

  const record = {
    blob,
    contentType: contentType || blob.type || "application/octet-stream",
    size: blob.size || 0,
    savedAt: new Date().toISOString(),
  };

  await run("readwrite", (store) => store.put(record, relPath));
  return { ok: true, relPath, size: record.size };
}

/** قراءة ملف محفوظ. */
export async function deviceReadFile(relPath) {
  if (!relPath) return null;
  const record = await run("readonly", (store) => store.get(relPath));
  return record && record.blob ? record : null;
}

/** حذف ملف. */
export async function deviceRemoveFile(relPath) {
  if (!relPath) return { ok: false };
  const existing = await deviceReadFile(relPath);
  if (!existing) return { ok: false, missing: true };
  await run("readwrite", (store) => store.delete(relPath));
  return { ok: true };
}

/** هل الملف موجود؟ */
export async function deviceFileExists(relPath) {
  if (!relPath) return false;
  const record = await run("readonly", (store) => store.get(relPath));
  return Boolean(record && record.blob);
}

/** كل مسارات الملفات المحفوظة (للعرض/الإدارة). */
export async function deviceListFiles() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const transaction = db.transaction(STORE, "readonly");
      const store = transaction.objectStore(STORE);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      transaction.oncomplete = () => {
        const keys = keysRequest.result || [];
        const values = valuesRequest.result || [];
        resolve(
          keys.map((key, index) => ({
            path: String(key),
            size: values[index]?.size || 0,
            savedAt: values[index]?.savedAt || null,
            contentType: values[index]?.contentType || "",
          }))
        );
      };
      transaction.onerror = () =>
        reject(transaction.error || new Error("تعذر قراءة قائمة الملفات."));
    } catch (err) {
      reject(err);
    }
  });
}

/** إجمالي المساحة المستخدمة والعدد. */
export async function deviceUsage() {
  try {
    const files = await deviceListFiles();
    const bytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    return { count: files.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** حذف كل الملفات المحفوظة على الجهاز. */
export async function deviceClearAll() {
  await run("readwrite", (store) => store.clear());
  return { ok: true };
}

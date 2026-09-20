/* =========================================================================
   تكامل MeshCentral — طبقة واحدة مركزية
   -------------------------------------------------------------------------
   أربط الدعم الفني في Insurance-System بخادم MeshCentral الموجود كـ
   Windows Service على جهاز الإدارة (لا يوجد Public URL افتراضيًا).

   القواعد:
   - لا تُخزَّن أي كلمة مرور MeshCentral في الواجهة أو في Git أو في .env.
     المسؤول يسجّل الدخول وهو يفتح اللوحة وهو مسؤول عن كلمة مروره.
   - يُضبط رابط الخادم وقاعدة رابط الجهاز من مكان واحد هنا
     (أو عبر VITE_MESH_CENTRAL_URL / VITE_MESH_CENTRAL_DEVICE_URL_TEMPLATE).
   - إذا لم يُضبط أي رابط، يُسجَّل بدء الدعم داخل النظام ولا يُفتح تبويب فارغ.
   ========================================================================= */

const readEnv = (key) => {
  try {
    return typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env[key]
      : "";
  } catch {
    return "";
  }
};

/* مفتاح الوصول لخادم MeshCentral — قابلة للتعديل من ملف .env فقط
   (متغيّر VITE_ مكشوف للواجهة، لذا نمنع وضع أي كلمة مرور هنا). */
const MESH_CENTRAL_CONFIG = {
  /* عنوان خادم MeshCentral: مثال "https://mesh.lan" أو "http://192.168.1.10:8080" */
  serverUrl: readEnv("VITE_MESH_CENTRAL_URL") || "",

  /* قالب اختياري لفتح جهاز محدد مباشرة.
     يُستبدل فيه {deviceId} و{deviceName} تلقائيًا.
     مثال:
       "https://mesh.lan/mydata?show={deviceId}"
     اتركه فارغًا للاعتماد على الفتح الافتراضي للوحة التحكم. */
  deviceUrlTemplate:
    readEnv("VITE_MESH_CENTRAL_DEVICE_URL_TEMPLATE") || "",
};

const trimSlash = (value) => String(value || "").replace(/\/+$/, "");

/* فتح لوحة تحكم MeshCentral العامة */
export function getMeshCentralAdminUrl() {
  return trimSlash(MESH_CENTRAL_CONFIG.serverUrl);
}

/* بناء رابط فتح الجهاز في MeshCentral:
   1) إن وُجد قالب رابط للجهاز، نستبدل المعرّف والاسم داخل القالب.
   2) وإلا نفتح لوحة التحكم الرئيسية (السلوك الآمن الافتراضي).
   تُرجع نصًا فارغًا إذا لم يُضبط عنوان الخادم إطلاقًا. */
export function buildMeshCentralDeviceUrl({ deviceId, deviceName }) {
  const base = trimSlash(MESH_CENTRAL_CONFIG.serverUrl);
  const did = deviceId || "";
  const dname = deviceName || "";

  const template = (MESH_CENTRAL_CONFIG.deviceUrlTemplate || "").trim();
  if (template) {
    return template
      .replaceAll("{deviceId}", encodeURIComponent(did))
      .replaceAll("{deviceName}", encodeURIComponent(dname));
  }

  return base;
}

/* رابط جلسة Remote Desktop يُفتح لاحقًا عند رفع مسؤول الدعم
   الـ mesh_device_id الصحيح للطلب — نفس الدالة أعلاه كافية. */
export function isMeshCentralConfigured() {
  return Boolean(getMeshCentralAdminUrl()) ||
    Boolean((MESH_CENTRAL_CONFIG.deviceUrlTemplate || "").trim());
}

export { MESH_CENTRAL_CONFIG };
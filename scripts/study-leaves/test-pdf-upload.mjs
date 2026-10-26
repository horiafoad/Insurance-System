// اختبار فعلي لمسار رفع/حذف PDF الإجازة عبر بوابة التخزين، على سجل مؤقت
// يُحذف في النهاية. لا يلمس أي بيانات إنتاجية ولا يبقي أي ملف.
import fs from "node:fs";
import crypto from "node:crypto";
import { createServer } from "vite";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const payload = b64url(
  JSON.stringify({
    sub: "pdf-test",
    username: "pdf-test",
    role: "super_admin",
    permissions: null,
    iat: now,
    exp: now + 600,
  })
);
const sig = crypto.createHmac("sha256", env.AUTH_SESSION_SECRET).update(`${header}.${payload}`).digest();
const token = `${header}.${payload}.${b64url(sig)}`;

// localStorage وهمي حتى تلتقط fileStorage توكن الجلسة كما يفعل المتصفح.
globalThis.localStorage = {
  getItem: (key) => (key === "auth_session_token" ? token : null),
  setItem: () => {},
  removeItem: () => {},
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const results = [];
const check = (label, passed, details = "") => {
  results.push({ label, passed, details });
  console.log(`${passed ? "PASS" : "FAIL"} — ${label}${details ? ` (${details})` : ""}`);
};

const { supabase } = await server.ssrLoadModule("/src/supabaseClient.js");
let row = null;
try {
  const service = await server.ssrLoadModule("/src/services/studyLeavesService.js");

  const { data: inserted, error: insErr } = await supabase
    .from("study_leaves")
    .insert({
      employee_code: "TEST-PDF-0001",
      name: "اختبار مؤقت — حذف تلقائي",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      salary_status: "بدون مرتب",
    })
    .select()
    .single();
  if (insErr) throw insErr;
  row = inserted;
  console.log("temp study leave id:", row.id);

  const bytes = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
  );
  const file = new File([bytes], "اجازة اختبار.pdf", { type: "application/pdf" });

  const updated = await service.attachStudyLeavePdf(
    { id: row.id, pdfUrl: "", pdfStorageKey: "" },
    file,
    { user: { full_name: "اختبار آلي" } }
  );

  console.log("saved ref:", updated.pdfUrl, "| provider:", updated.pdfStorageProvider);
  check("الرفع نجح عبر المزوّد asu", Boolean(updated.hasPdf) && updated.pdfStorageProvider === "asu", updated.pdfUrl);
  check("الرابط محفوظ في study_leaves", updated.hasPdf === true);
  check("اسم الملف محفوظ", updated.pdfFileName === "اجازة اختبار.pdf", updated.pdfFileName);

  const gateway = env.VITE_FILE_STORAGE_GATEWAY.replace(/\/+$/, "");
  const storageKey = updated.pdfStorageKey;
  console.log("storage key:", storageKey);
  const gatewayUrl = (pathOrUrl) =>
    /^https?:\/\//i.test(pathOrUrl)
      ? pathOrUrl
      : `${gateway}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  const existsRes = await fetch(`${gateway}/v1`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-token": token },
    body: JSON.stringify({ action: "exists", key: storageKey }),
  });
  const exists = await existsRes.json();
  check("الملف موجود على الخادم بعد الرفع", exists?.ok === true && exists?.exists === true, JSON.stringify(exists));

  const signedRes = await fetch(`${gateway}/v1`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-token": token },
    body: JSON.stringify({ action: "sign", key: storageKey, expiresIn: 600 }),
  });
  const signed = await signedRes.json();
  console.log("sign url:", signed?.url, "| expiresIn:", signed?.expiresIn);
  const signedUrl = signed?.url ? gatewayUrl(signed.url) : "";
  const dl = await fetch(signedUrl);
  const got = Buffer.from(await dl.arrayBuffer());
  check(
    "الملف يُقرأ برابط موقّع بنفس المحتوى",
    dl.status === 200 && got.equals(bytes),
    `sign=${signedRes.status} get=${dl.status} size=${got.length}`
  );

  const cleaned = await service.deleteStudyLeavePdf(updated);
  check("حذف المرفق يفرّغ الحقول", !cleaned.hasPdf && !cleaned.pdfUrl);

  const afterExistsRes = await fetch(`${gateway}/v1`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-session-token": token },
    body: JSON.stringify({ action: "exists", key: storageKey }),
  });
  const afterExists = await afterExistsRes.json();
  check("الملف حُذف من التخزين", afterExists?.ok === true && afterExists?.exists === false, JSON.stringify(afterExists));
} finally {
  if (row?.id) {
    await supabase.from("study_leaves").delete().eq("id", row.id);
    console.log("temp row deleted:", row.id);
  }
  const { count } = await supabase
    .from("study_leaves")
    .select("*", { count: "exact", head: true });
  console.log("study_leaves rows now:", count);
  await server.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

// اختبار فعلي لمسار رفع/حذف PDF المطالبة على سجل مؤقت يُحذف في النهاية.
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
  const docs = await server.ssrLoadModule("/src/services/claimDocumentsService.js");

  const { data: inserted, error: insErr } = await supabase
    .from("claims")
    .insert({
      sheet_name: "اختبار آلي",
      claimant_name: "اختبار مؤقت — حذف تلقائي",
      row_number: 999998,
      amount: 1,
      total_amount: 1,
      payment_status: "لم يسدد",
      data: { note: "temp pdf test" },
    })
    .select()
    .single();
  if (insErr) throw insErr;
  row = inserted;
  console.log("temp claim id:", row.id);

  const bytes = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
  );
  const file = new File([bytes], "مطالبة اختبار.pdf", { type: "application/pdf" });

  const updated = await docs.attachClaimPdf(row, file, { user: { full_name: "اختبار آلي" } });
  console.log("saved ref:", updated.pdf_url, "| provider:", updated.pdf_storage_provider);
  check("رفع PDF المطالبة نجح", Boolean(updated.pdf_url) && updated.pdf_storage_provider === "asu");
  check("اسم الملف محفوظ", updated.pdf_file_name === "مطالبة اختبار.pdf", updated.pdf_file_name);

  const gateway = env.VITE_FILE_STORAGE_GATEWAY.replace(/\/+$/, "");
  const storageKey = updated.pdf_storage_key;
  const call = async (body) => {
    const res = await fetch(`${gateway}/v1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-token": token },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const exists = await call({ action: "exists", key: storageKey });
  check("الملف موجود بعد الرفع", exists?.ok === true && exists?.exists === true, JSON.stringify(exists));

  const signed = await call({ action: "sign", key: storageKey, expiresIn: 600 });
  const signedUrl = /^https?:\/\//i.test(signed?.url || "")
    ? signed.url
    : `${gateway}${String(signed?.url || "").startsWith("/") ? "" : "/"}${signed?.url || ""}`;
  const dl = await fetch(signedUrl);
  const got = Buffer.from(await dl.arrayBuffer());
  check("القراءة بنفس المحتوى", dl.status === 200 && got.equals(bytes), `status=${dl.status}`);

  const cleaned = await docs.deleteClaimPdf(updated);
  check("حذف المرفق يفرّغ الحقول", !cleaned.pdf_url);

  const after = await call({ action: "exists", key: storageKey });
  check("الملف حُذف من التخزين", after?.ok === true && after?.exists === false, JSON.stringify(after));
} finally {
  if (row?.id) {
    await supabase.from("claims").delete().eq("id", row.id);
    console.log("temp claim deleted:", row.id);
  }
  const { count } = await supabase.from("claims").select("*", { count: "exact", head: true });
  console.log("claims rows now:", count);
  await server.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

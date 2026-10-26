// فحص أي «حاويات» التخزين يقبلها مزوّد الرفع فعليًا — بدون رفع أي ملف.
// يُصدر توكن جلسة محليًا بنفس سر الجلسة، ويطلب «تذكرة رفع» فقط.
import fs from "node:fs";
import crypto from "node:crypto";

const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function mintToken(secret, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + 600 }));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${b64url(sig)}`;
}

const token = mintToken(env.AUTH_SESSION_SECRET, {
  sub: "probe-script",
  username: "probe",
  role: "super_admin",
  permissions: null,
});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const GATEWAY = env.VITE_FILE_STORAGE_GATEWAY;

const buckets = [
  "study-leaves-files",
  "claims-files",
  "faculty-salary-archive",
  "executive-orders",
  "issues-files",
  "letter-images",
  "scanner-inbox",
  "employee-salary-archive",
  "faculty-salaries",
];

async function post(url, body, withSession = true) {
  const headers = { "content-type": "application/json" };
  if (withSession) headers["x-session-token"] = token;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const edgeUrl = `${SUPABASE_URL}/functions/v1/file-storage`;
const asuUrl = `${GATEWAY.replace(/\/+$/, "")}/v1`;

console.log("== R2 edge config ==");
console.log(await post(edgeUrl, { action: "config" }, false));

console.log("\n== R2 edge upload_ticket ==");
for (const bucket of buckets) {
  const r = await post(edgeUrl, {
    action: "upload_ticket",
    key: `${bucket}/_probe/test.pdf`,
    contentType: "application/pdf",
  });
  console.log(bucket.padEnd(24), r.status, JSON.stringify(r.body).slice(0, 160));
}

console.log("\n== asu gateway upload_ticket ==");
for (const bucket of buckets) {
  const r = await post(asuUrl, {
    action: "upload_ticket",
    key: `${bucket}/_probe/test.pdf`,
    contentType: "application/pdf",
  });
  console.log(bucket.padEnd(24), r.status, JSON.stringify(r.body).slice(0, 160));
}

/* تحديث خيارات «سبب الوقف» في أنواع التبليغات إلى الصيغة المطلوبة. */
import fs from "node:fs";

const REASONS = [
  "استقالة",
  "وفاة",
  "إعارة داخلية",
  "إعارة خارجية",
  "مهمة علمية بدون مرتب",
  "إجازة دراسية بدون مرتب",
  "رعاية طفل",
];

(async () => {
  const src = fs.readFileSync("src/supabaseClient.js", "utf8");
  const url = src.match(/FALLBACK_SUPABASE_URL = "([^"]+)"/)[1];
  const key = src.match(/FALLBACK_SUPABASE_ANON_KEY =\s*\n?\s*"([^"]+)"/)[1];
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const listRes = await fetch(
    `${url}/rest/v1/notification_types?code=eq.salary_stop&select=id,section,code,name,extra_fields`,
    { headers }
  );
  const rows = await listRes.json();
  console.log("found:", rows.map((r) => r.section).join(", ") || "none");

  for (const row of rows) {
    const fields = Array.isArray(row.extra_fields) ? row.extra_fields : [];
    const next = fields.map((field) =>
      field && field.key === "reason" ? { ...field, options: REASONS } : field
    );
    const res = await fetch(
      `${url}/rest/v1/notification_types?id=eq.${row.id}`,
      { method: "PATCH", headers, body: JSON.stringify({ extra_fields: next }) }
    );
    const text = await res.text();
    console.log(row.section, "=>", res.status, text.slice(0, 120));
  }
})();

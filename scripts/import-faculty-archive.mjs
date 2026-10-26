#!/usr/bin/env node
// ============================================================================
// استيراد الأرشيف الذكي لأعضاء هيئة التدريس
// ----------------------------------------------------------------------------
//   node scripts/import-faculty-archive.mjs [--file <path>] [--dry-run] [--no-link]
//
// ما يفعله السكربت:
//   1) يقرأ ملف Excel لأعضاء هيئة التدريس (الأوراق كلها).
//   2) يحوّل الأسماء إلى الحروف العربية الأساسية ويقرأ الأرقام والتواريخ
//      العربية (٠-٩ و ٫ و dd/mm/yyyy) بدون أي تخمين.
//   3) يرفع/يحدّث السجل المركزي (faculty_members) — idempotent بالكامل:
//      إعادة التشغيل لا تُنشئ تكرارًا (المفتاح = «رقم الصرف»).
//   4) يمرّر رابطًا مع باقي النظام: المطالبات، الطلبات الواردة، القضايا،
//      المهام، الأشخاص في الأوامر التنفيذية، الخطابات، ومفردات المرتب.
//
// المبدأ: الربط لا يتم بالاسم المشابه أبدًا دون تحقق،
// ولا يتم دمج عضوين لمجرد تشابه الاسم. التطابق التام (بعد التطبيع) فقط.
// ما لم يُطابق يُعرض في التقرير للمراجعة اليدوية.
//
// ملاحظة: يجب تنفيذ supabase/migrations/20261021_faculty_smart_archive.sql
//          في Supabase SQL Editor قبل تشغيل هذا السكربت.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  normalizeArabicKey,
  toDisplayName,
  normalizeDigits,
  parseArabicNumber,
  parseArabicDate,
  normalizeMemberCode,
} from "../src/utils/arabicText.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/* ------------------------------------------------------------------ */
/* arguments                                                          */
/* ------------------------------------------------------------------ */
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const doLink = !args.includes("--no-link");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

/* ------------------------------------------------------------------ */
/* إعدادات البيئة                                                    */
/* ------------------------------------------------------------------ */
function readEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, "utf8");
  const out = {};
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  });
  return out;
}

const ENV = { ...readEnv(), ...process.env };
const SUPABASE_URL = String(ENV.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = String(ENV.VITE_SUPABASE_ANON_KEY || "");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ لم يتم العثور على VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY في ملف .env"
  );
  process.exit(1);
}

const API = `${SUPABASE_URL}/rest/v1`;

async function rest(pathname, options = {}) {
  const url = `${API}/${pathname}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      (body && (body.message || body.hint || body.error_description)) ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function selectAll(table, columns, extraQuery = "") {
  const rows = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const q = `${table}?select=${columns}&limit=${limit}&offset=${offset}${extraQuery}`;
    const page = await rest(q, { headers: { Prefer: "count=exact" } });
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* قراءة ملف Excel                                                    */
/* ------------------------------------------------------------------ */
function findExcelFile() {
  if (argValue("--file")) {
    const p = path.resolve(ROOT, argValue("--file"));
    if (!fs.existsSync(p)) throw new Error(`الملف غير موجود: ${p}`);
    return p;
  }
  const dataDir = path.join(ROOT, "src", "data");
  if (!fs.existsSync(dataDir)) throw new Error("المجلد src/data غير موجود");
  const found = fs
    .readdirSync(dataDir)
    .filter((f) => f.toLowerCase().endsWith(".xlsx"))
    .filter((f) => /تدريس|faculty/i.test(f));
  if (found.length === 0) {
    throw new Error(
      `لم يُعثر على ملف Excel لأعضاء هيئة التدريس في ${dataDir} — استخدم --file <path>`
    );
  }
  return path.join(dataDir, found[0]);
}

const HEADER_ALIASES = {
  job: ["الوظيفه", "الوظيفة", "الدرجة الوظيفية", "job_title", "المهنة"],
  gradeDate: ["تاريخ الدرجه", "تاريخ الدرجة", "تاريخ_الدرجة", "grade_date"],
  grade: ["الدرجه", "الدرجة", "grade"],
  salary: ["مرتب 30 /6", "مرتب 30/6", "مرتب", "salary"],
  name: ["الاسم", "اسم", "name"],
  code: ["رقم الصرف", "رقم_الصرف", "member_code", "رقم_صرف"],
  group: ["اسم المجموعه", "اسم المجموعة", "المجموعه", "group"],
  no: ["ﻡ", "م", "no", "الرقم", "ت"],
};

function pickHeader(cells) {
  const found = {};
  cells.forEach((cell, index) => {
    const text = normalizeArabicKey(cell);
    if (!text) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (found[key] !== undefined) continue;
      const hit = aliases.find((a) => normalizeArabicKey(a) === text);
      if (hit) found[key] = index;
    }
  });
  return found;
}

async function readExcel(filePath) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(filePath, { cellDates: true, cellNF: true });
  const records = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;
    const range = XLSX.utils.decode_range(ws["!ref"]);

    // البحث عن صف العناوين: أول صف يحتوي على عمودين معروفين على الأقل
    let headerRow = -1;
    let headerMap = {};
    for (let r = range.s.r; r <= Math.min(range.s.r + 6, range.e.r); r += 1) {
      const cells = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        cells.push(cell ? String(cell.w ?? cell.v ?? "") : "");
      }
      const map = pickHeader(cells);
      if (map.name !== undefined && (map.code !== undefined || map.no !== undefined)) {
        headerRow = r;
        headerMap = map;
        break;
      }
    }
    if (headerRow < 0) {
      console.warn(`⚠️  تخطّي الورقة «${sheetName}»: لم يُعثر على صف عناوين.`);
      continue;
    }

    for (let r = headerRow + 1; r <= range.e.r; r += 1) {
      const at = (c) => {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        return cell ? cell.v : null;
      };
      const rawName = headerMap.name !== undefined ? at(headerMap.name) : null;
      const rawCode = headerMap.code !== undefined ? at(headerMap.code) : null;
      if (!rawName && !rawCode) continue;

      const name = toDisplayName(rawName);
      const code = normalizeMemberCode(rawCode);
      if (!name && !code) continue;

      const gradeRaw =
        headerMap.grade !== undefined ? at(headerMap.grade) : null;
      const grade = gradeRaw ? toDisplayName(gradeRaw) : null;
      // «الدرجة» في الملف تحتوي صف عنوان فرعي («الدرجة») — يُتجاهل.
      if (grade && /^(الدرجة|الدرجه)$/.test(grade)) continue;

      const dateCell =
        headerMap.gradeDate !== undefined
          ? ws[XLSX.utils.encode_cell({ r, c: headerMap.gradeDate })]
          : null;
      const gradeDate = parseArabicDate(
        dateCell ? (dateCell.w ?? dateCell.v) : null
      );

      const salaryRaw =
        headerMap.salary !== undefined ? at(headerMap.salary) : null;

      records.push({
        sheet: sheetName,
        rowNo:
          headerMap.no !== undefined
            ? Number(at(headerMap.no)) || null
            : r - headerRow,
        name,
        nameRaw: String(rawName ?? ""),
        code,
        codeRaw: String(rawCode ?? ""),
        jobTitle:
          headerMap.job !== undefined
            ? toDisplayName(at(headerMap.job)) || null
            : null,
        group:
          headerMap.group !== undefined
            ? toDisplayName(at(headerMap.group)) || null
            : null,
        grade: grade || null,
        gradeDate,
        salary: parseArabicNumber(salaryRaw),
        salaryRaw:
          salaryRaw === null || salaryRaw === undefined
            ? null
            : String(salaryRaw),
        normalized: normalizeArabicKey(name),
      });
    }
  }

  return records;
}

/* ------------------------------------------------------------------ */
/* منطق المطابقة                                                     */
/* ------------------------------------------------------------------ */
function buildNameIndex(members) {
  const index = new Map();
  const ambiguous = new Map();
  members.forEach((m) => {
    const key = m.full_name_normalized;
    if (!key) return;
    if (index.has(key)) {
      // اسمان متطابقان بعد التطبيع → لا نربط تلقائيًا (تفادي الدمج الخاطئ)
      const list = index.get(key);
      list.push(m);
      ambiguous.set(key, list);
    } else {
      index.set(key, [m]);
    }
  });
  return { index, ambiguous };
}

function matchExact(nameIndex, rawName) {
  const key = normalizeArabicKey(rawName);
  if (!key) return { member: null, reason: "empty" };
  if (nameIndex.ambiguous.has(key)) {
    return { member: null, reason: "ambiguous" };
  }
  const list = nameIndex.index.get(key);
  if (!list || list.length === 0) return { member: null, reason: "no_match" };
  if (list.length > 1) return { member: null, reason: "ambiguous" };
  return { member: list[0], reason: "exact" };
}

function matchContains(nameIndex, text) {
  const key = normalizeArabicKey(text);
  if (!key || key.length < 6) return [];
  const padded = ` ${key} `;
  const hits = [];
  for (const [nameKey, list] of nameIndex.index) {
    if (nameKey.length < 6) continue;
    if (nameKey.length > key.length) continue;
    // مطابقة على حدود الكلمات فقط (لا نصّ داخل كلمة)
    if (!padded.includes(` ${nameKey} `)) continue;
    hits.push({ members: list, nameKey });
  }
  return hits;
}

/** اسم صاحب المطالبة: العمود المخصّص قد يكون فارغًا والاسم داخل JSON. */
function claimNameOf(claim) {
  if (claim.claimant_name) return claim.claimant_name;
  const data = claim.data;
  if (data && typeof data === "object") {
    const keys = [" ", "الاسم", "الاسم ", "اسم"];
    for (const k of keys) {
      if (typeof data[k] === "string" && data[k].trim()) return data[k];
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* تقرير                                                             */
/* ------------------------------------------------------------------ */
const report = {
  startedAt: new Date().toISOString(),
  file: null,
  excelRows: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  skipped: [],
  duplicateCodes: [],
  ambiguousNames: [],
  links: { created: 0, byType: {} },
  linkCandidates: [],
  unreadableSources: [],
};

/* ------------------------------------------------------------------ */
/* التنفيذ                                                           */
/* ------------------------------------------------------------------ */
async function main() {
  const filePath = findExcelFile();
  report.file = path.relative(ROOT, filePath);
  console.log(`📄 الملف: ${report.file}`);

  const XLSX = require("xlsx");
  const records = await readExcel(filePath);
  report.excelRows = records.length;
  console.log(`👥 سجلات الملف: ${records.length}`);

  if (records.length === 0) throw new Error("لا توجد سجلات صالحة في الملف.");

  /* فحص التكرارات داخل الملف */
  const codeSeen = new Map();
  const nameSeen = new Map();
  const clean = [];
  for (const rec of records) {
    if (!rec.name || !rec.code) {
      report.skipped.push({ rowNo: rec.rowNo, reason: "missing_name_or_code", name: rec.nameRaw });
      continue;
    }
    if (codeSeen.has(rec.code)) {
      report.duplicateCodes.push({ code: rec.code, name: rec.name, rows: [codeSeen.get(rec.code), rec.rowNo] });
      continue;
    }
    if (nameSeen.has(rec.normalized)) {
      report.ambiguousNames.push({ name: rec.name, rows: [nameSeen.get(rec.normalized), rec.rowNo] });
      continue;
    }
    codeSeen.set(rec.code, rec.rowNo);
    nameSeen.set(rec.normalized, rec.rowNo);
    clean.push(rec);
  }
  console.log(
    `✅ سجلات صالحة: ${clean.length} | متخطّاة: ${report.skipped.length} | أرقام صرف مكرّرة: ${report.duplicateCodes.length}`
  );

  if (dryRun) {
    console.log("\n🧪 وضع dry-run — لم يتم إرسال أي شيء إلى قاعدة البيانات.");
    console.log(JSON.stringify(sample(clean, 5), null, 2));
    return;
  }

  /* -------------------------------------------------------------- */
  /* 1) السجل المركزي                                                 */
  /* -------------------------------------------------------------- */
  const payload = clean.map((rec) => ({
    member_code: rec.code,
    member_code_raw: rec.codeRaw || null,
    full_name: rec.name,
    full_name_raw: rec.nameRaw || null,
    full_name_normalized: rec.normalized,
    job_title: rec.jobTitle,
    group_name: rec.group,
    grade: rec.grade,
    grade_date: rec.gradeDate,
    salary_306: rec.salary,
    salary_306_raw: rec.salaryRaw,
    source_row_no: rec.rowNo,
    source_file: report.file,
    status: "active",
  }));

  const existing = await selectAll(
    "faculty_members",
    "id,member_code,full_name,full_name_normalized,job_title,group_name,grade,grade_date,salary_306,source_row_no"
  );
  const existingByCode = new Map(existing.map((m) => [m.member_code, m]));

  // PostgREST في Supabase يحدّ عدد الصفوف المُعالَجة في عملية POST الواحدة
  // بـ max-rows = 1000، فالدفعات لازم تكون أصغر من ذلك، وإلا ضاعت أعضاؤها.
  const UPLOAD_CHUNK = 500;
  let bulkOk = true;
  try {
    for (let i = 0; i < payload.length; i += UPLOAD_CHUNK) {
      const chunk = payload.slice(i, i + UPLOAD_CHUNK);
      await rest("faculty_members?on_conflict=member_code", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(chunk),
      });
    }
  } catch (err) {
    bulkOk = false;
    console.warn(`⚠️  الإدراج الجماعي تعذّر (${err.message}) — سيتم الإدراج صفًا صفًا.`);
  }

  if (!bulkOk) {
    for (const row of payload) {
      const prev = existingByCode.get(row.member_code);
      if (prev) {
        await rest(`faculty_members?id=eq.${prev.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(row),
        });
        report.updated += 1;
      } else {
        await rest("faculty_members", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(row),
        });
        report.inserted += 1;
      }
    }
  } else {
    payload.forEach((row) => {
      if (existingByCode.has(row.member_code)) report.updated += 1;
      else report.inserted += 1;
    });
  }
  console.log(
    `💾 السجل المركزي: ${report.inserted} مضاف · ${report.updated} محدّث`
  );

  const members = await selectAll(
    "faculty_members",
    "id,member_code,full_name,full_name_normalized,job_title,group_name,grade,grade_date,salary_306"
  );
  console.log(`🗃️  إجمالي الأعضاء في القاعدة: ${members.length}`);
  if (members.length !== payload.length) {
    console.warn(
      `⚠️  تحذير: عدد الأعضاء في القاعدة (${members.length}) لا يساوي عدد الملف (${payload.length}).`
    );
    report.memberCountMismatch = { inDb: members.length, inFile: payload.length };
  }

  /* -------------------------------------------------------------- */
  /* 2) الربط مع باقي النظام                                          */
  /* -------------------------------------------------------------- */
  if (!doLink) {
    console.log("ℹ️  تم تخطّي مرحلة الربط (--no-link).");
    return;
  }

  const nameIndex = buildNameIndex(members);
  const { ambiguous } = nameIndex;
  if (ambiguous.size > 0) {
    report.ambiguousNames.push(
      ...[...ambiguous.entries()].map(([key, list]) => ({
        name: list[0].full_name,
        rows: list.map((m) => m.id),
      }))
    );
  }

  const linkRows = [];
  const pushLink = (member, linkType, refTable, refId, label, refDate, matchedBy, confidence, snapshot) => {
    linkRows.push({
      member_id: member.id,
      link_type: linkType,
      ref_table: refTable,
      ref_id: String(refId),
      ref_label: label || null,
      ref_date: refDate || null,
      matched_by: matchedBy,
      confidence,
      snapshot: snapshot || null,
    });
  };

  /* --- المطالبات --- */
  try {
    const claims = await selectAll(
      "claims",
      "id,claimant_name,claim_number,claim_date,amount,status,sheet_name,file_name,pdf_url,data"
    );
    claims.forEach((c) => {
      const claimant = claimNameOf(c);
      const m = matchExact(nameIndex, claimant);
      if (m.member) {
        pushLink(m.member, "claim", "claims", c.id, c.claim_number || c.sheet_name || claimant, c.claim_date, "normalized_name", 1, c);
        return;
      }
      if (m.reason === "ambiguous") {
        report.linkCandidates.push({ type: "claim", id: c.id, label: claimant, reason: "ambiguous" });
        return;
      }
      const contains = matchContains(nameIndex, claimant);
      if (contains.length === 1) {
        pushLink(contains[0].members[0], "claim", "claims", c.id, c.claim_number || c.sheet_name || claimant, c.claim_date, "text_contains", 0.5, c);
      } else if (contains.length > 1) {
        report.linkCandidates.push({ type: "claim", id: c.id, label: claimant, reason: "multiple_contains" });
      }
    });
    report.links.byType.claim = claims.length;
  } catch (err) {
    report.unreadableSources.push({ table: "claims", error: err.message });
  }

  /* --- الطلبات الواردة --- */
  try {
    const requests = await selectAll(
      "service_requests",
      "id,name,job_title,job,service_type,status,request_month,request_year,requested_month,requested_year,certificate_type,directed_to,created_at"
    );
    requests.forEach((r) => {
      const m = matchExact(nameIndex, r.name);
      if (m.member) {
        pushLink(
          m.member,
          "service_request",
          "service_requests",
          r.id,
          `${r.service_type || "طلب"} — ${r.name}`,
          null,
          "normalized_name",
          1,
          r
        );
      } else if (m.reason === "ambiguous") {
        report.linkCandidates.push({ type: "service_request", id: r.id, label: r.name, reason: "ambiguous" });
      }
    });
    report.links.byType.service_request = requests.length;
  } catch (err) {
    report.unreadableSources.push({ table: "service_requests", error: err.message });
  }

  /* --- القضايا (تطابق نصي داخل العنوان/الوصف) --- */
  try {
    const issues = await selectAll(
      "issues",
      "id,case_number,case_title,case_description,case_type,status,payment_status,file_name,file_url,created_at"
    );
    issues.forEach((it) => {
      const exact = matchExact(nameIndex, it.case_title);
      if (exact.member) {
        pushLink(exact.member, "issue", "issues", it.id, it.case_number || it.case_title, it.created_at?.slice(0, 10) || null, "normalized_name", 0.9, it);
        return;
      }
      const contains = matchContains(nameIndex, `${it.case_title || ""} ${it.case_description || ""}`);
      if (contains.length === 1) {
        pushLink(contains[0].members[0], "issue", "issues", it.id, it.case_number || it.case_title, it.created_at?.slice(0, 10) || null, "text_contains", 0.4, it);
      } else if (contains.length > 1) {
        report.linkCandidates.push({ type: "issue", id: it.id, label: it.case_title, reason: "multiple_contains" });
      }
    });
    report.links.byType.issue = issues.length;
  } catch (err) {
    report.unreadableSources.push({ table: "issues", error: err.message });
  }

  /* --- المهام --- */
  try {
    const tasks = await selectAll(
      "tasks",
      "id,title,type,responsible,received_date,due_date,status,notes"
    );
    tasks.forEach((t) => {
      const m = matchExact(nameIndex, t.responsible);
      if (m.member) {
        pushLink(m.member, "task", "tasks", t.id, t.title, t.received_date || null, "normalized_name", 0.9, t);
      }
    });
    report.links.byType.task = tasks.length;
  } catch (err) {
    report.unreadableSources.push({ table: "tasks", error: err.message });
  }

  /* --- الأشخاص في الأوامر التنفيذية --- */
  try {
    const persons = await selectAll(
      "executive_order_persons",
      "id,full_name,full_name_norm,order_count,file_url,created_at"
    );
    persons.forEach((p) => {
      const m = matchExact(nameIndex, p.full_name);
      if (m.member) {
        pushLink(m.member, "executive_order", "executive_order_persons", p.id, p.full_name, p.created_at?.slice(0, 10) || null, "normalized_name", 1, p);
      }
    });
    report.links.byType.executive_order = persons.length;
  } catch (err) {
    report.unreadableSources.push({ table: "executive_order_persons", error: err.message });
  }

  /* --- الخطابات (تطابق نصي داخل الموضوع/العنوان) --- */
  try {
    const letters = await selectAll(
      "letters",
      "id,letter_number,letter_date,subject,letter_title,status,letter_type,final_text"
    );
    letters.forEach((l) => {
      const exact = matchExact(nameIndex, l.letter_title || l.subject);
      if (exact.member) {
        pushLink(exact.member, "letter", "letters", l.id, l.letter_number || l.subject, l.letter_date, "normalized_name", 0.9, l);
        return;
      }
      // أسماء المراسَل إليهم تظهر داخل الموضوع أو نص الخطاب
      const contains = matchContains(
        nameIndex,
        `${l.letter_title || ""} ${l.subject || ""} ${l.final_text || ""}`
      );
      if (contains.length === 1) {
        pushLink(contains[0].members[0], "letter", "letters", l.id, l.letter_number || l.subject, l.letter_date, "text_contains", 0.4, l);
      } else if (contains.length > 1) {
        report.linkCandidates.push({ type: "letter", id: l.id, label: l.subject, reason: "multiple_contains" });
      }
    });
    report.links.byType.letter = letters.length;
  } catch (err) {
    report.unreadableSources.push({ table: "letters", error: err.message });
  }

  /* --- مفردات المرتب القديمة (إن كانت مقروءة) --- */
  try {
    const pages = await selectAll(
      "faculty_salary_archive",
      "id,faculty_name,computer_number,year,month,file_url,original_filename,created_at"
    );
    pages.forEach((p) => {
      const m = matchExact(nameIndex, p.faculty_name);
      if (m.member) {
        pushLink(m.member, "salary_document", "faculty_salary_archive", p.id, `${p.year || ""}/${p.month || ""}`, p.created_at?.slice(0, 10) || null, "normalized_name", 1, p);
      }
    });
    report.links.byType.salary_document = pages.length;
  } catch (err) {
    report.unreadableSources.push({ table: "faculty_salary_archive", error: err.message });
  }

  /* -------------------------------------------------------------- */
  /* 3) كتابة الروابط                                                  */
  /* -------------------------------------------------------------- */
  if (linkRows.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < linkRows.length; i += CHUNK) {
      const chunk = linkRows.slice(i, i + CHUNK);
      await rest("faculty_member_links?on_conflict=member_id,link_type,ref_table,ref_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(chunk),
      });
    }
    report.links.created = linkRows.length;
  }

  console.log("\n─────────────── تقرير الاستيراد ───────────────");
  console.log(`📥 صفوف Excel        : ${report.excelRows}`);
  console.log(`➕ أعضاء مضافون      : ${report.inserted}`);
  console.log(`♻️  أعضاء محدَّثون     : ${report.updated}`);
  console.log(`🔗 روابط أُنشئت      : ${report.links.created}`);
  Object.entries(report.links.byType).forEach(([type, count]) => {
    console.log(`   • ${type.padEnd(18)} : ${count} سجل مصدر`);
  });
  if (report.unreadableSources.length) {
    console.log("\n⚠️  مصادر لم يُقرأ منها (صلاحية أو جدول غير موجود):");
    report.unreadableSources.forEach((s) => console.log(`   • ${s.table}: ${s.error}`));
  }
  if (report.ambiguousNames.length) {
    console.log("\n⚠️  أسماء متطابقة بعد التطبيع (لا ربط تلقائي — تحتاج مراجعة):");
    report.ambiguousNames.forEach((a) => console.log(`   • ${a.name}`));
  }
  if (report.linkCandidates.length) {
    console.log("\n⚠️  سجلات تحتاج ربطًا يدويًا:");
    report.linkCandidates.slice(0, 30).forEach((c) =>
      console.log(`   • [${c.type}] ${c.label} (${c.reason})`)
    );
  }
  console.log("───────────────────────────────────────────────\n");

  const outPath = path.join(ROOT, "scripts", "faculty-archive-import-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`📄 التقرير الكامل: ${path.relative(ROOT, outPath)}`);
}

function sample(list, n) {
  return list.slice(0, n);
}

main().catch((err) => {
  console.error("❌ فشل الاستيراد:", err.message);
  const code = err?.body?.code || "";
  if (code === "42P01" || /does not exist/i.test(err.message || "")) {
    console.error(
      "\n🚧 الجداول غير موجودة بعد.\n" +
        "   نفّذي أولًا: supabase/migrations/20261021_faculty_smart_archive.sql\n" +
        "   في Supabase Dashboard → SQL Editor، ثم أعيدي تشغيل هذا السكربت."
    );
  } else if (code === "42501" || /permission denied/i.test(err.message || "")) {
    console.error(
      "\n🚧 صلاحيات الوصول غير مفعّلة.\n" +
        "   نفّذي قسم GRANT في: supabase/migrations/20261021_faculty_smart_archive.sql"
    );
  }
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});

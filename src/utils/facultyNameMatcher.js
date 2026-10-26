// ============================================================================
// facultyNameMatcher.js
// ---------------------------------------------------------------------------
// مطابقة أسماء عربية بين سجلات النظام (مطالبات / قضايا / إجازات دراسية) وبين
// السجل المركزي لأعضاء هيئة التدريس في «الأرشيف الذكي».
//
// مبادئ أساسية:
//   • الدقة قبل التغطية: لا نربط اسمًا مشابهًا إلا إذا كان التشابه قويًا
//     وفريدًا. الأسماء المتشابهة غير الحاسمة تُعاد كـ«تحتاج مراجعة» فقط.
//   • لا دمج ولا تخمين عند تكرار الاسم: عضوان بنفس الاسم = غموض دائم.
//   • كل الدوال نقية (pure) بلا أي اتصال بقاعدة البيانات؛ الاختبار ممكن في Node.
// ============================================================================

import { normalizeArabicKey } from "./arabicText.js";

/** ألقاب ومسمّيات لا تُعد جزءًا من الاسم عند المقارنة (تُحذف من البداية فقط). */
const HONORIFIC_TOKENS = new Set([
  "د",
  "دكتور",
  "دكتوره",
  "دكتورة",
  "الدكتور",
  "الدكتورة",
  "استاذ",
  "استاذه",
  "الاستاذ",
  "الاستاذه",
  "استاذة",
  "ا",
  "م",
  "مهندس",
  "المهندس",
  "مهندسه",
  "مهندسة",
  "الطبيب",
  "طبيب",
  "الباحث",
  "باحث",
  "المعيد",
  "معيد",
  "ا.د",
  "أ.د",
  "د.",
]);

/**
 * كلمات وظيفية قد تظهر ملتصقة بالاسم في بداية النص.
 * ملاحظة: لا نحذف «السيد/السيدة» لأنهما اسمان شخصيان شائعان في مصر،
 * وحذفهما يفسد أسماء حقيقية مثل «السيد محمد أحمد».
 */
const LEADING_NOISE =
  /^(?:ال)?(?:دكتور|دكتوره|دكتورة|استاذ|استاذه|استاذة|مهندس|مهندسه|مهندسة|طبيب|باحث|معيد)[\s./:-]+/;

/**
 * يحوّل اسمًا إلى مصفوفة كلمات موحّدة بعد حذف الألقاب من البداية فقط.
 * مثال: «أ.د/ محمد  عبد الله» → ["محمد", "عبد", "الله"]
 *
 * سبب حذف الألقاب من البداية فقط: «سيد» و«السيد» قد تكون أسماء شخصية،
 * وحذفهما من منتصف الاسم أو نهايته كان سيخلط بين أشخاص مختلفين.
 */
export function nameTokens(value) {
  let text = String(value ?? "").trim();
  // حذف الألقاب المتكررة في البداية («د. د. محمد»).
  for (let i = 0; i < 3; i += 1) {
    const next = text
      .replace(LEADING_NOISE, "")
      .replace(/^(?:أ|ا|د|م)\s*[./\\-]\s*/u, "");
    if (next === text) break;
    text = next;
  }
  const tokens = normalizeArabicKey(text)
    .split(" ")
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

  // إزالة الألقاب من البداية فقط، مع الإبقاء على كلمتين على الأقل.
  while (tokens.length > 2 && HONORIFIC_TOKENS.has(tokens[0])) {
    tokens.shift();
  }
  return tokens;
}

/** مفتاح موحّد للاسم (كلمات مفصولة بمسافة واحدة). */
export function normalizePersonName(value) {
  return nameTokens(value).join(" ");
}

/** مسافة ليفنشتاين (عدد الحروف المختلفة) — لحساب نسبة التشابه. */
export function levenshtein(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }
  return previous[right.length];
}

/** نسبة تشابه بين نصين (0..1). */
export function similarity(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left && !right) return 1;
  const max = Math.max(left.length, right.length);
  if (!max) return 1;
  return 1 - levenshtein(left, right) / max;
}

/**
 * هل الكلمتان نفس الاسم مع اختلاف «ال» التعريف فقط؟
 * «المغاوري» = «مغاوري» ، «عبدالحافظ» بعد التطبيع كلمتان منفصلتان.
 */
function stripAl(token) {
  return token.startsWith("ال") && token.length > 3 ? token.slice(2) : token;
}

function sameToken(a, b) {
  if (a === b) return true;
  return stripAl(a) === stripAl(b);
}

/**
 * هل المصفوفتان متطابقتان كلمة بكلمة مع فروق «ال» فقط؟
 * يعيد عدد الفروق أو null إذا اختلفتا في أي كلمة اختلافًا حقيقيًا.
 */
function alefLamAlignment(tokensA, tokensB) {
  if (tokensA.length !== tokensB.length || tokensA.length < 3) return null;
  let diffs = 0;
  for (let i = 0; i < tokensA.length; i += 1) {
    if (tokensA[i] === tokensB[i]) continue;
    if (stripAl(tokensA[i]) !== stripAl(tokensB[i])) return null;
    diffs += 1;
  }
  return diffs > 0 ? diffs : null;
}

/**
 * هل إحدى المصفوفتين بادئة للأخرى بنفس الاسم الأول؟
 * «اسامه حمدي عبد الواحد» بادئة لـ«اسامة حمدي عبد الواحد محمد».
 */
function prefixMatch(tokensA, tokensB) {
  let shorter = tokensA;
  let longer = tokensB;
  if (shorter.length > longer.length) {
    shorter = tokensB;
    longer = tokensA;
  }
  if (shorter.length < 3 || longer.length - shorter.length > 2) return null;
  if (!sameToken(shorter[0], longer[0])) return null;
  for (let i = 0; i < shorter.length; i += 1) {
    if (!sameToken(shorter[i], longer[i])) return null;
  }
  const diff = longer.length - shorter.length;
  return { diff, score: Math.max(0.88, 0.95 - diff * 0.02) };
}

/**
 * يبني فهرس البحث من السجل المركزي والأسماء البديلة.
 * @returns {{entries: Array, byKey: Map, byAlias: Map, byCode: Map}}
 */
export function buildMemberIndex(members = [], aliases = []) {
  const entries = [];
  const byId = new Map();
  const byKey = new Map();
  const byCode = new Map();

  members.forEach((member) => {
    if (!member?.full_name) return;
    const key = normalizePersonName(member.full_name);
    if (!key) return;
    const entry = {
      member,
      key,
      tokens: nameTokens(member.full_name),
      joined: key.replace(/ /g, ""),
    };
    entries.push(entry);
    byId.set(String(member.id), entry);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(entry);
    if (member.member_code) {
      byCode.set(String(member.member_code).trim(), entry);
    }
  });

  const byAlias = new Map();
  aliases.forEach((alias) => {
    const entry = byId.get(String(alias.member_id));
    if (!entry || !alias.alias) return;
    const key = normalizePersonName(alias.alias);
    if (!key) return;
    if (!byAlias.has(key)) byAlias.set(key, []);
    byAlias.get(key).push(entry);
  });

  return { entries, byKey, byAlias, byCode };
}

/** يبني نتيجة «تحتاج مراجعة» من قائمة مرشحين مرتبة. */
function reviewResult(reason, scored) {
  return {
    member: null,
    matchedBy: null,
    confidence: 0,
    reason,
    candidates: scored.slice(0, 5).map((item) => ({
      memberId: item.entry.member.id,
      name: item.entry.member.full_name,
      code: item.entry.member.member_code || null,
      score: Number(item.score.toFixed(3)),
      matchedBy: item.kind,
    })),
  };
}

function matchResult(item, matchedBy, confidence, reason) {
  return {
    member: item.entry.member,
    matchedBy,
    confidence,
    reason,
    candidates: [],
  };
}

const NO_MATCH = {
  member: null,
  matchedBy: null,
  confidence: 0,
  reason: "no_match",
  candidates: [],
};

/**
 * يطابق اسمًا واحدًا مع السجل المركزي.
 *
 * الحالات التي تُربط تلقائيًا:
 *   • تطابق تام بعد التطبيع (normalized_name, 1.0)
 *   • اسم بديل مسجّل (alias, 0.97)
 *   • اختصار بادئي مطابق للأول (partial_name) مثل نقص اللقب الأخير
 *   • تشابه حرفي ≥ 95% مع تطابق أول كلمة وآخر كلمة (similar_name)
 *
 * غير ذلك: reason = "needs_review" مع أفضل المرشحين، بلا ربط.
 */
export function matchMemberName(rawName, index) {
  const key = normalizePersonName(rawName);
  if (!key) return { ...NO_MATCH, reason: "empty" };

  const exact = index.byKey.get(key) || [];
  if (exact.length === 1) {
    return matchResult({ entry: exact[0], score: 1 }, "normalized_name", 1, "exact");
  }
  if (exact.length > 1) {
    return reviewResult(
      "ambiguous",
      exact.map((entry) => ({ entry, score: 1, kind: "exact" }))
    );
  }

  const alias = index.byAlias.get(key) || [];
  if (alias.length === 1) {
    return matchResult({ entry: alias[0], score: 0.97 }, "alias", 0.97, "alias");
  }
  if (alias.length > 1) {
    return reviewResult(
      "ambiguous",
      alias.map((entry) => ({ entry, score: 0.97, kind: "alias" }))
    );
  }

  const taken = nameTokens(rawName);
  if (taken.length < 2) return { ...NO_MATCH, reason: "too_short" };
  const takenJoined = taken.join("");

  const scored = [];
  index.entries.forEach((entry) => {
    const spaced = similarity(key, entry.key);
    const joined = similarity(takenJoined, entry.joined);
    let score = Math.max(spaced, joined);
    let kind = "fuzzy";

    const prefix = prefixMatch(taken, entry.tokens);
    if (prefix) {
      score = Math.max(score, prefix.score);
      kind = "partial";
    }

    const aligned = alefLamAlignment(taken, entry.tokens);
    if (aligned) {
      score = Math.max(score, 0.95);
      kind = "similar";
    }

    if (score >= 0.82) scored.push({ entry, score, kind });
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return NO_MATCH;

  const second = scored[1];
  const gap = second ? top.score - second.score : 1;
  const firstMatches = sameToken(taken[0], top.entry.tokens[0]);
  const lastMatches = sameToken(
    taken[taken.length - 1],
    top.entry.tokens[top.entry.tokens.length - 1]
  );
  const joinedStrong = similarity(takenJoined, top.entry.joined) >= 0.97;
  const unique = gap >= 0.04;

  if (unique && firstMatches) {
    if (top.kind === "partial" && top.entry.tokens.length >= 3) {
      return matchResult(
        top,
        "partial_name",
        Number(Math.min(0.94, top.score).toFixed(2)),
        "partial"
      );
    }
    if (top.score >= 0.95 && (lastMatches || joinedStrong)) {
      return matchResult(
        top,
        "similar_name",
        Number(Math.min(0.95, top.score).toFixed(2)),
        "similar"
      );
    }
  }

  return reviewResult("needs_review", scored);
}

/**
 * يبحث عن أسماء أعضاء هيئة التدريس داخل نص حر (عنوان/وصف قضية مثلًا).
 * لا يُطابق الأسماء القصيرة (أقل من 3 كلمات) لتفادي الالتباس.
 * يعيد أفضل المرشحين فقط، والقرار النهائي للمُستدعي.
 */
export function findMemberMentions(text, index, { minTokens = 3 } = {}) {
  const hay = ` ${normalizeArabicKey(text)} `;
  if (hay.trim().length < 6) return [];
  const hits = [];
  const seen = new Set();

  index.entries.forEach((entry) => {
    if (entry.tokens.length < minTokens) return;
    if (!hay.includes(` ${entry.key} `)) return;
    const memberId = String(entry.member.id);
    if (seen.has(memberId)) return;
    seen.add(memberId);
    hits.push({
      entry,
      score: Number(
        Math.min(
          0.9,
          0.6 + (entry.tokens.length / Math.max(3, nameTokens(text).length)) * 0.3
        ).toFixed(3)
      ),
      kind: "text_contains",
    });
  });

  hits.sort(
    (a, b) =>
      b.entry.tokens.length - a.entry.tokens.length || b.score - a.score
  );
  return hits;
}

/** يبني رابطًا مقترحًا لسجل بعد نجاح المطابقة. */
export function buildMatchedLink({
  member,
  linkType,
  refTable,
  refId,
  refLabel = null,
  refDate = null,
  snapshot = null,
  matchedBy = "normalized_name",
  confidence = 1,
}) {
  return {
    member_id: member.id,
    link_type: linkType,
    ref_table: refTable,
    ref_id: String(refId),
    ref_label: refLabel || null,
    ref_date: refDate || null,
    matched_by: matchedBy,
    confidence,
    snapshot: snapshot || null,
  };
}

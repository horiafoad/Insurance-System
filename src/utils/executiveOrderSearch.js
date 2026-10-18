// executiveOrderSearch.js
//
// بحث عربي ذكي ومرن بأسماء الأشخاص في أرشيف الأوامر التنفيذية:
//   - تطبيع النص العربي للمقارنة (أ/إ/آ/ا ، ة/ه ، ي/ى ، تشكيل ، مسافات زائدة).
//   - البحث substring (أي جزء من الاسم) بدون اشتراط كتابة الاسم كاملًا.
//   - كل كلمة بحث يُشترط وجودها معًا (AND) — مثال "علي ش" يطابق أي اسم فيه
//     "علي" وكلمة تبدأ بـ "ش".
//   - لا يتم تعديل الاسم الأصلي المخزن أبدًا؛ التطبيع للبحث فقط.
//   - النتائج تُرتب حسب القرب: تطابق تام > يبدأ بـ > يحتوي على الجملة كاملة > التوكينات.

export function normalizeArabicText(value) {
  return String(value || "")
    .replace(/[\u064B-\u0652\u0640]/g, "") // تشكيل + تطويل (ـ)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىيئ]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function searchTokens(rawQuery) {
  return normalizeArabicText(rawQuery)
    .split(" ")
    .filter(Boolean)
    .slice(0, 5);
}

function personNorm(person) {
  return person.full_name_norm || normalizeArabicText(person.full_name);
}

export function searchPersons(persons, rawQuery) {
  const tokens = searchTokens(rawQuery);
  if (tokens.length === 0) return [];

  const full = normalizeArabicText(rawQuery);
  const scored = [];

  for (const person of persons || []) {
    const norm = personNorm(person);
    if (!norm) continue;
    if (!tokens.every((t) => norm.includes(t))) continue;

    let score = tokens.length * 10;
    if (norm === full) score += 100;
    if (norm.startsWith(full)) score += 50;
    if (full.length >= 2 && norm.includes(full)) score += 25;
    scored.push({ person, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.person);
}
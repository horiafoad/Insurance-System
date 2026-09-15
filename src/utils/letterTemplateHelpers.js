export const LETTER_NUMBER_PREFIX = "خطاب ";

export const TEMPLATE_PLACEHOLDER_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

// يستخرج كل المفاتيح الموجودة داخل {{ }} في النص الثابت.
// يدعم أسماء المفاتيح العربية والإنجليزية مع المسافات والنقط والشرطات.
export function extractTemplateKeys(fixedText = "") {
  const keys = [];
  const regex = new RegExp(TEMPLATE_PLACEHOLDER_REGEX.source, "g");
  let match;
  while ((match = regex.exec(String(fixedText || ""))) !== null) {
    const key = String(match[1]).trim();
    if (key) {
      keys.push(key);
      // تجنّب حلقة لا نهائية إذا احتوى المفتاح على تطابق فارغ
      if (match.index === regex.lastIndex) regex.lastIndex += 1;
    }
  }
  return [...new Set(keys)];
}

// الدالة الموحّدة لاستبدال المتغيرات داخل النص الثابت بالقيَم المُدخلة.
// أي متغير بلا قيمة أو بقيمة فارغة يُستبدل بنص فارغ (لا يُكتب undefined أو null).
export function replaceTemplateVariables(fixedText = "", variableValues = {}) {
  return String(fixedText || "").replace(TEMPLATE_PLACEHOLDER_REGEX, (match, key) => {
    const value = variableValues[String(key).trim()];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
    return "";
  });
}

export function buildFinalText(template, variableValues = {}) {
  const source = (template && template.fixed_text) || "";
  return replaceTemplateVariables(source, variableValues);
}

export function getNextLetterNumberRpc(supabase) {
  return supabase
    .rpc("get_next_letter_number")
    .then(({ data, error }) => {
      if (error) return null;
      return data ? String(data) : null;
    })
    .catch(() => null);
}

export async function fallbackNextLetterNumber(supabase) {
  const { data, error } = await supabase
    .from("letters")
    .select("letter_number")
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw error;
  let max = 0;
  for (const row of data || []) {
    const digits = String(row.letter_number || "").match(/[0-9]+/);
    if (digits) {
      const num = parseInt(digits[0], 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return LETTER_NUMBER_PREFIX + String(max + 1).padStart(4, "0");
}

export async function resolveNextLetterNumber(supabase) {
  const rpcValue = await getNextLetterNumberRpc(supabase);
  if (rpcValue) return rpcValue;
  return fallbackNextLetterNumber(supabase);
}
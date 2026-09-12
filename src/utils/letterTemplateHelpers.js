export const LETTER_NUMBER_PREFIX = "خطاب ";

export const TEMPLATE_PLACEHOLDER_REGEX = /\{\{\s*([\w\u0600-\u06FF-]+)\s*\}\}/g;

export function extractTemplateKeys(fixedText = "") {
  const keys = [];
  let match;
  const regex = new RegExp(TEMPLATE_PLACEHOLDER_REGEX.source, "g");
  while ((match = regex.exec(fixedText)) !== null) {
    keys.push(match[1]);
  }
  return [...new Set(keys)];
}

export function buildFinalText(template, variableValues = {}) {
  const source = (template && template.fixed_text) || "";
  return source.replace(TEMPLATE_PLACEHOLDER_REGEX, (match, key) => {
    const value = variableValues[key];
    return value !== undefined && value !== null ? String(value).trim() : "";
  });
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
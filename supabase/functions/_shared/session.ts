// supabase/functions/_shared/session.ts
// جلسات موقّعة HMAC-SHA256 للتحقق من هوية المتصل في دوال الحافة.
// تُوقّع وتُتحقق من الخادم فقط عبر AUTH_SESSION_SECRET — لا تعتمد على RLS
// ولا على Supabase Auth، ليبقى التطبيق الحالي يعمل دون تغيير في الجداول.

const SECRET = Deno.env.get("AUTH_SESSION_SECRET") || "";
const TTL_HOURS = Number(Deno.env.get("AUTH_SESSION_TTL_HOURS") || 12);

export interface SessionClaims {
  sub: string; // معرف المستخدم
  username: string;
  role: string;
  permissions: string[] | null;
  iat: number;
  exp: number;
}

// سر مفعّل (الحد الأدنى حماية من الأخطاء)
export function sessionEnabled(): boolean {
  return SECRET.length >= 16;
}

function b64urlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(input: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(input))) as T;
  } catch {
    return null;
  }
}

async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// توقيع توكن جلسة جديد
export async function signSession(
  claims: Omit<SessionClaims, "iat" | "exp">
): Promise<string | null> {
  if (!sessionEnabled()) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionClaims = {
    ...claims,
    iat: now,
    exp: now + Math.max(1, TTL_HOURS) * 3600,
  };
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncode(JSON.stringify(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${body}`)
  );
  return `${header}.${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

// التحقق من التوكن وإرجاع المطالبات إن كان سليمًا وغير منتهٍ
export async function verifySession(
  token: string | null | undefined
): Promise<SessionClaims | null> {
  if (!token || !sessionEnabled()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!ok) return null;
  } catch {
    return null;
  }
  const payload = decodeJson<SessionClaims>(body);
  if (!payload || !payload.sub || !payload.role) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// قراءة التوكن من رأس الطلب — الأولوية لرأس x-session-token
export function tokenFromRequest(req: Request): string | null {
  const headerToken = req.headers.get("x-session-token");
  if (headerToken && headerToken.length > 8) return headerToken;
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t && t.length > 8) return t;
  }
  return null;
}

// هل الحامل يملك صلاحية "إدارة المستخدمين"؟
// ملاحظة أمنية: لا تُعامل permissions == null كإدارة. القيمة NULL تعني
// "حساب قديم بوصول كامل" (انظر src/utils/permissions.js) وليست تفويضًا
// بإدارة المستخدمين؛ الاعتماد عليها كان يتيح لأي حساب بلا صلاحيات
// محدّدة إنشاء حسابات بصلاحية super_admin.
export function isAdminClaims(claims: SessionClaims | null): boolean {
  if (!claims) return false;
  if (claims.role === "super_admin" || claims.role === "admin") return true;
  return Array.isArray(claims.permissions)
    ? claims.permissions.includes("user_management")
    : false;
}
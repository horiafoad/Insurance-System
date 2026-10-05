// Edge Function: auth-login
// التحقق من كلمة المرور وإدارة المستخدمين من الخادم فقط — لا تُرسل كلمة المرور
// ولا الحاش إلى المتصفح.
//
// متغيرات البيئة (Supabase Dashboard -> Edge Functions):
//   AUTH_SESSION_SECRET     سري (إلزامي) — يوقّع توكنات الجلسة HMAC.
//   AUTH_SESSION_TTL_HOURS  (اختياري) فترة صلاحية التوكن بالأسابيع، الافتراضي 12.
//
// التوافق العكسي: يتعامل مع كلمات المرور النصية القديمة (plaintext) والجديدة
// (bcrypt). عند أول نجاح لكلمة مرور نصية تُرقّى إلى bcrypt (lazy upgrade) —
// فلا حاجة لأي سكربت SQL قبل التشغيل.

import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import {
  type SessionClaims,
  sessionEnabled,
  signSession,
  verifySession,
  tokenFromRequest,
  isAdminClaims,
} from "../_shared/session.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// الحقول الآمنة للعرض في الواجهة (بدون password نهائيًا)
const SAFE_FIELDS =
  "id, username, full_name, role, department_id, sector_id, permissions, created_at, updated_at";

// يتضمن password للقراءة داخل الخادم فقط (لا تُعرض أبدًا)
const AUTH_LOOKUP_FIELDS = SAFE_FIELDS + ", password";

function toSafeUser(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    department_id: row.department_id ?? null,
    sector_id: row.sector_id ?? null,
    permissions: row.permissions ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// التحقق من كلمة المرور (bcrypt أو نصية قديمة)
async function checkPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("$2")) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }
  return plain === stored;
}

async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 10);
}

// التوافق مع القيم الفارغة في الحقول الرقمية
function optionalId(value: unknown): number | null {
  if (value == null) return null;
  if (value === "") return null;
  if (value === "null") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// تضييق الحالة قبل نطاقها لتبقى ردود الأخطاء عامة فلا تُساعِد المتطفلين
const GENERIC_LOGIN_ERROR = { ok: false as const, error: "Invalid credentials" };
const UNAUTHORIZED = { ok: false as const, error: "Unauthorized" };
const FORBIDDEN = { ok: false as const, error: "Forbidden" };

async function handleLogin(body: Record<string, unknown>) {
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return { ...GENERIC_LOGIN_ERROR };
  if (!sessionEnabled())
    return { ok: false, error: "Server not configured (AUTH_SESSION_SECRET)" };

  const { data: user, error } = await supabase
    .from("users")
    .select(AUTH_LOOKUP_FIELDS)
    .eq("username", username)
    .maybeSingle();
  if (error || !user) return { ...GENERIC_LOGIN_ERROR };

  const ok = await checkPassword(password, user.password || "");
  if (!ok) return { ...GENERIC_LOGIN_ERROR };

  // ترقية بريس الحثني: نصية -> bcrypt عند أول نجاح
  if (!(user.password || "").startsWith("$2")) {
    const hash = await hashPassword(password);
    await supabase
      .from("users")
      .update({ password: hash, updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const safe = toSafeUser(user);
  const token = await signSession({
    sub: safe.id,
    username: safe.username,
    role: safe.role,
    permissions: safe.permissions,
  });

  return { ok: true, token, user: safe };
}

// إعادة التحقق من الجلسة (عند إقلاع التطبيق) مع تحديث الدور/الصلاحيات من DB
async function handleVerify(req: Request) {
  const claims = await verifySession(tokenFromRequest(req));
  if (!claims) return { ...UNAUTHORIZED };

  const { data: user, error } = await supabase
    .from("users")
    .select(SAFE_FIELDS)
    .eq("id", claims.sub)
    .maybeSingle();
  if (error || !user) return { ...UNAUTHORIZED };

  const fresh = toSafeUser(user);
  const token = await signSession({
    sub: fresh.id,
    username: fresh.username,
    role: fresh.role,
    permissions: fresh.permissions,
  });

  return { ok: true, token, user: fresh };
}

async function requireAdmin(
  req: Request
): Promise<{ ok: boolean; claims?: SessionClaims }> {
  const claims = await verifySession(tokenFromRequest(req));
  if (!claims || !isAdminClaims(claims)) return { ok: false };
  return { ok: true, claims };
}

async function handleCreateUser(req: Request, body: Record<string, unknown>) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return { ...FORBIDDEN };

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const fullName = String(body?.fullName || "").trim();
  if (!username || !password || !fullName)
    return { ok: false, error: "Missing required fields" };

  const payload: Record<string, unknown> = {
    username,
    password: await hashPassword(password),
    full_name: fullName,
    role: String(body?.role || "user"),
    department_id: optionalId(body?.departmentId),
    sector_id: optionalId(body?.sectorId),
  };
  if (Array.isArray(body?.permissions)) payload.permissions = body.permissions;

  const { data, error } = await supabase
    .from("users")
    .insert(payload)
    .select(SAFE_FIELDS)
    .single();
  if (error)
    return { ok: false, error: "create failed: " + error.message };
  return { ok: true, user: toSafeUser(data) };
}

async function handleUpdateUser(req: Request, body: Record<string, unknown>) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return { ...FORBIDDEN };

  const id = String(body?.id || "");
  if (!id) return { ok: false, error: "Missing user id" };

  const payload: Record<string, unknown> = {};
  if (body?.username !== undefined)
    payload.username = String(body.username).trim();
  if (body?.fullName !== undefined)
    payload.full_name = String(body.fullName).trim();
  if (body?.role !== undefined) payload.role = String(body.role);
  if (body?.departmentId !== undefined)
    payload.department_id = optionalId(body.departmentId);
  if (body?.sectorId !== undefined) payload.sector_id = optionalId(body.sectorId);
  if (Array.isArray(body?.permissions)) payload.permissions = body.permissions;
  const newPassword = String(body?.password || "");
  if (newPassword) payload.password = await hashPassword(newPassword);

  if (Object.keys(payload).length === 0)
    return { ok: false, error: "Nothing to update" };
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update(payload)
    .eq("id", id)
    .select(SAFE_FIELDS)
    .single();
  if (error)
    return { ok: false, error: "update failed: " + error.message };
  return { ok: true, user: toSafeUser(data) };
}

async function handleDeleteUser(req: Request, body: Record<string, unknown>) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return { ...FORBIDDEN };

  const id = String(body?.id || "");
  if (!id) return { ok: false, error: "Missing user id" };
  if (id === admin.claims!.sub) return { ...FORBIDDEN };

  const { data: target, error: readError } = await supabase
    .from("users")
    .select("id, username, role")
    .eq("id", id)
    .maybeSingle();
  if (readError || !target) return { ok: false, error: "user not found" };

  // حماية الحسابات الحساسة (كما كانت الواجهة تمنعها سابقًا)
  if (
    target.username === "horia" ||
    target.role === "super_admin" ||
    target.role === "creator"
  )
    return { ...FORBIDDEN };

  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return { ok: false, error: "delete failed: " + error.message };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body?.action;

    let result: Record<string, unknown>;
    switch (action) {
      case "login":
        result = await handleLogin(body);
        break;
      case "verify":
        result = await handleVerify(req);
        break;
      case "create_user":
        result = await handleCreateUser(req, body);
        break;
      case "update_user":
        result = await handleUpdateUser(req, body);
        break;
      case "delete_user":
        result = await handleDeleteUser(req, body);
        break;
      default:
        return json({ ok: false, error: "Unknown action" }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("auth-login error:", err);
    return json({ ok: false, error: "server error" }, 500);
  }
});
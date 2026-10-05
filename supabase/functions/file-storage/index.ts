// Edge Function: file-storage
// The only component allowed to touch Cloudflare R2. The browser never sees
// R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY — it only ever
// receives short-lived presigned URLs, which are the same idea as Supabase's
// createSignedUrl().
//
// required secrets (Supabase Dashboard -> Edge Functions -> Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//   AUTH_SESSION_SECRET  (already used by auth-login / push-notifications)
//
// optional:
//   STORAGE_ALLOWED_ORIGINS  comma separated CORS allowlist. When empty it
//                            falls back to "*" so the Electron and Android
//                            builds (file:// / capacitor://) keep working.
//
// Object key layout inside the bucket:  <logical-bucket>/<original path>
// Keeping the Supabase bucket name as a prefix means the migration is 1:1,
// resumable, and a key can always be traced back to its source.

import {
  type SessionClaims,
  verifySession,
  tokenFromRequest,
  isAdminClaims,
} from "../_shared/session.ts";
import {
  r2Config,
  r2PresignGet,
  r2PresignPut,
  r2Head,
  r2Get,
  r2Delete,
} from "../_shared/r2.ts";

/* ------------------------------------------------------------------ CORS */

const allowedOrigins = (Deno.env.get("STORAGE_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin =
    allowedOrigins.length === 0
      ? "*"
      : allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------- key sanitation */

// Only these logical buckets may be addressed. Prevents a signed session from
// being used to read or overwrite anything else in the bucket.
const LOGICAL_BUCKETS = [
  "issues-files",
  "letter-images",
  "faculty-salaries",
  "faculty-salary-archive",
  "employee-salary-archive",
  "executive-orders",
  "scanner-inbox",
] as const;

// Mirrors MENU_PERMISSION in src/utils/permissions.js so the R2 path enforces
// exactly the same authorization the UI already does. No new permission model.
const BUCKET_PERMISSION: Record<string, string> = {
  "issues-files": "entitlements",
  "letter-images": "letters",
  "faculty-salaries": "entitlements",
  "faculty-salary-archive": "entitlements",
  "employee-salary-archive": "entitlements",
  "executive-orders": "entitlements",
  "scanner-inbox": "entitlements",
};

const GENERIC_DENIED = { ok: false as const, error: "Forbidden" };
const UNAUTHORIZED = { ok: false as const, error: "Unauthorized" };

function splitKey(rawKey: unknown): { bucket: string; path: string } | null {
  const key = String(rawKey || "").trim();
  if (!key) return null;
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  const bucket = key.slice(0, slash);
  const path = key.slice(slash + 1);
  if (!path) return null;
  if (!(LOGICAL_BUCKETS as readonly string[]).includes(bucket)) return null;
  if (path.includes("..")) return null;
  return { bucket, path };
}

function canUseBucket(claims: SessionClaims | null, bucket: string): boolean {
  if (!claims) return false;
  // accounts without an explicit permission list keep full access (backward
  // compatible with the existing behaviour in src/utils/permissions.js)
  if (isAdminClaims(claims)) return true;
  if (claims.permissions == null) return true;
  if (!Array.isArray(claims.permissions)) return false;
  const needed = BUCKET_PERMISSION[bucket];
  if (!needed) return false;
  return claims.permissions.includes(needed);
}

function ttl(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/* ------------------------------------------------------------- handlers */

async function handleConfig() {
  const cfg = r2Config();
  // only the *names* of the missing variables are returned, never any value
  return { ok: true, enabled: cfg.enabled, bucket: cfg.bucket || null, missing: cfg.missing };
}

async function handleSign(claims: SessionClaims, body: Record<string, unknown>) {
  const parsed = splitKey(body.key);
  if (!parsed) return { ok: false, error: "Invalid key" };
  if (!canUseBucket(claims, parsed.bucket)) return { ...GENERIC_DENIED };
  const expires = ttl(body.expiresIn, 600, 3600);
  const url = await r2PresignGet(`${parsed.bucket}/${parsed.path}`, expires);
  return { ok: true, url, expiresIn: expires, key: `${parsed.bucket}/${parsed.path}` };
}

async function handleUploadTicket(claims: SessionClaims, body: Record<string, unknown>) {
  const parsed = splitKey(body.key);
  if (!parsed) return { ok: false, error: "Invalid key" };
  if (!canUseBucket(claims, parsed.bucket)) return { ...GENERIC_DENIED };
  const key = `${parsed.bucket}/${parsed.path}`;
  const url = await r2PresignPut(key, ttl(body.expiresIn, 900, 3600));
  return { ok: true, url, key, method: "PUT" };
}

async function handleExists(claims: SessionClaims, body: Record<string, unknown>) {
  const parsed = splitKey(body.key);
  if (!parsed) return { ok: false, error: "Invalid key" };
  if (!canUseBucket(claims, parsed.bucket)) return { ...GENERIC_DENIED };
  const head = await r2Head(`${parsed.bucket}/${parsed.path}`);
  return { ok: true, exists: Boolean(head), size: head?.size ?? 0 };
}

async function handleProxy(
  req: Request,
  claims: SessionClaims,
  body: Record<string, unknown>
) {
  const parsed = splitKey(body.key);
  if (!parsed) return json(req, { ok: false, error: "Invalid key" }, 400);
  if (!canUseBucket(claims, parsed.bucket)) return json(req, GENERIC_DENIED, 403);
  const bytes = await r2Get(`${parsed.bucket}/${parsed.path}`);
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": String(body.contentType || "application/octet-stream"),
      "Cache-Control": "private, no-store",
    },
  });
}

async function handleDelete(claims: SessionClaims, body: Record<string, unknown>) {
  const parsed = splitKey(body.key);
  if (!parsed) return { ok: false, error: "Invalid key" };
  if (!canUseBucket(claims, parsed.bucket)) return { ...GENERIC_DENIED };
  await r2Delete(`${parsed.bucket}/${parsed.path}`);
  return { ok: true, deleted: true };
}

/* ---------------------------------------------------------------- serve */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } else {
      const url = new URL(req.url);
      body = Object.fromEntries(url.searchParams.entries());
    }
  } catch {
    return json(req, { ok: false, error: "Bad request" }, 400);
  }

  const action = String(body.action || "");

  // config is needed by the UI to decide whether R2 is usable at all
  if (action === "config") return json(req, await handleConfig());

  const cfg = r2Config();
  if (!cfg.enabled) {
    return json(req, { ok: false, error: "R2 not configured", missing: cfg.missing }, 503);
  }

  const claims = await verifySession(tokenFromRequest(req));
  if (!claims) return json(req, UNAUTHORIZED, 401);

  try {
    switch (action) {
      case "sign":
        return json(req, await handleSign(claims, body));
      case "upload_ticket":
        return json(req, await handleUploadTicket(claims, body));
      case "exists":
        return json(req, await handleExists(claims, body));
      case "proxy":
        return handleProxy(req, claims, body);
      case "delete":
        return json(req, await handleDelete(claims, body));
      default:
        return json(req, { ok: false, error: "Unknown action" }, 400);
    }
  } catch (err) {
    // the error text may contain the presigned url, so it is never returned
    console.error("file-storage action failed:", action, err?.message ?? err);
    return json(req, { ok: false, error: "storage operation failed" }, 500);
  }
});

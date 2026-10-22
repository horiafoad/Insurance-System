// supabase/functions/_shared/r2.ts
// talks to Cloudflare R2 through its S3-compatible API with SigV4 signing.
// runs server-side only (Deno Edge Function) — the R2 keys are never sent to the browser.
//
// required environment variables (Supabase Dashboard -> Edge Functions -> Secrets):
//   R2_ACCOUNT_ID        Cloudflare account id
//   R2_ACCESS_KEY_ID     R2 API token key id
//   R2_SECRET_ACCESS_KEY R2 API token secret
//   R2_BUCKET_NAME       the private bucket that holds the files
//
// no other service is used. R2 is reached over https only.

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "";
const ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
const SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
const BUCKET = Deno.env.get("R2_BUCKET_NAME") || "";
const REGION = "auto"; // R2 uses the fixed region "auto"

export interface R2Config {
  enabled: boolean;
  bucket: string;
  missing: string[];
}

export function r2Config(): R2Config {
  const missing: string[] = [];
  if (!ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!BUCKET) missing.push("R2_BUCKET_NAME");
  return { enabled: missing.length === 0, bucket: BUCKET, missing };
}

export function r2Bucket(): string {
  return BUCKET;
}

const ENDPOINT = () => `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

/* ------------------------------ helpers ------------------------------ */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  // cloudflare workers / deno both provide SubtleCrypto
  return toHex(await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

/** RFC3986 encoding — S3 requires !'()* to be escaped as well. */
function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/** Each path segment encoded separately so "/" stays a separator. */
function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((segment) => uriEncode(segment))
    .join("/");
}

function amzDate(date: Date): { amz: string; stamp: string } {
  const amz = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, stamp: amz.slice(0, 8) };
}

interface SignInput {
  method: string;
  key: string;
  query?: Record<string, string>;
  body?: Uint8Array;
  extraHeaders?: Record<string, string>;
  expiresInSeconds?: number;
  /**
   * When true the payload is not signed (standard presigned-upload behaviour) so
   * the browser can stream an arbitrarily large body with the url we hand it.
   */
  unsignedPayload?: boolean;
}

interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
}

/** Builds a SigV4-signed request for the R2 S3 API. */
async function sign(input: SignInput): Promise<SignedRequest> {
  const { method, key, query = {}, body, extraHeaders = {} } = input;
  const now = new Date();
  const { amz, stamp } = amzDate(now);
  const payloadHash = input.unsignedPayload
    ? "UNSIGNED-PAYLOAD"
    : await sha256Hex(body ?? new Uint8Array(0));
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const canonicalUri = `/${BUCKET}/${encodeKeyPath(key)}`;

  // canonical query string — sorted by name, then by value
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(query[name])}`)
    .join("&");

  // short-lived presigned url: X-Amz-Algorithm/Credential/Date/Expires/SignedHeaders
  const scope = `${stamp}/${REGION}/s3/aws4_request`;
  const credential = `${ACCESS_KEY_ID}/${scope}`;
  const expires = Math.max(1, Math.min(input.expiresInSeconds ?? 900, 604800));

  // an unsigned payload means only the host participates in the signature
  const signedHeaderNames = input.unsignedPayload
    ? ["host"]
    : ["host", "x-amz-content-sha256", "x-amz-date"];
  const canonicalHeaders = [`host:${host}`]
    .concat(
      input.unsignedPayload ? [] : [
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${amz}`,
      ]
    )
    .join("\n") + "\n";
  const signedHeaders = signedHeaderNames.join(";");

  const presignQuery: Record<string, string> = {
    ...query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const finalQuery = Object.keys(presignQuery)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(presignQuery[name])}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    finalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const dateKey = await hmac(
    new TextEncoder().encode("AWS4" + SECRET_ACCESS_KEY),
    stamp
  );
  const regionKey = await hmac(dateKey, REGION);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = toHex(await hmac(signingKey, stringToSign));

  // X-Amz-Signature must be appended last (it is not part of the canonical query)
  const url = `${ENDPOINT()}${canonicalUri}?${finalQuery}&X-Amz-Signature=${signature}`;

  return {
    url,
    method,
    headers: {
      ...extraHeaders,
      host,
      ...(input.unsignedPayload
        ? {}
        : { "x-amz-content-sha256": payloadHash, "x-amz-date": amz }),
    },
    body,
  };
}

/* ------------------------------ operations ------------------------------ */

/** Uploads an object. upsert replaces an existing key. */
export async function r2Put(
  key: string,
  body: Uint8Array,
  contentType?: string
): Promise<void> {
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  const req = await sign({ method: "PUT", key, body, extraHeaders: headers });
  const res = await fetch(req.url, {
    method: "PUT",
    headers: req.headers,
    body: req.body as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed (${res.status}): ${await res.text()}`);
  }
}

export async function r2Get(key: string): Promise<ArrayBuffer> {
  const req = await sign({ method: "GET", key });
  const res = await fetch(req.url, { method: "GET", headers: req.headers });
  if (!res.ok) {
    throw new Error(`R2 GET ${key} failed (${res.status}): ${await res.text()}`);
  }
  return await res.arrayBuffer();
}

export async function r2Head(key: string): Promise<{ size: number } | null> {
  const req = await sign({ method: "HEAD", key });
  const res = await fetch(req.url, { method: "HEAD", headers: req.headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key} failed (${res.status})`);
  return { size: Number(res.headers.get("content-length") || 0) };
}

export async function r2Delete(key: string): Promise<void> {
  const req = await sign({ method: "DELETE", key });
  const res = await fetch(req.url, { method: "DELETE", headers: req.headers });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Short-lived presigned url for direct browser access (<img src>, <a href>).
 * Returned url is a capability — anyone holding it can read the object until it
 * expires, so keep the ttl small and never log it.
 */
export async function r2PresignGet(
  key: string,
  expiresInSeconds = 900
): Promise<string> {
  const req = await sign({ method: "GET", key, expiresInSeconds });
  return req.url;
}

/**
 * Short-lived presigned PUT url so the browser streams the file straight to R2.
 * Keeps large PDFs off the Edge Function body limit and never exposes the keys.
 * The payload is deliberately unsigned, so any content-type the browser sends is
 * accepted and the upload is not limited by the function's body size cap.
 */
export async function r2PresignPut(
  key: string,
  expiresInSeconds = 900
): Promise<string> {
  const req = await sign({ method: "PUT", key, expiresInSeconds, unsignedPayload: true });
  return req.url;
}

// src/app/api/validate-key/route.js
// ==============================================================================
// ANCHORISM — Secure Key Validation API Route (Database-backed, v2)
//
// SECURITY DESIGN:
// Instead of validating key format with regex alone, this performs an exact-match
// lookup against the `authorized_keys` Supabase table using the server-side
// service role client (bypasses RLS, never sent to the browser). A key is
// accepted only if it exists in the table, is active, and its key_type matches
// a known protected route.
//
// Responsibilities:
//   1. IP-based brute-force rate limiting (5 failures -> 2-minute block)
//   2. Exact key lookup in authorized_keys via Supabase service role client
//   3. Sign an anchorism_session HttpOnly cookie on success
//   4. Generic error masking on all failure paths, with a machine-readable
//      `code` field so the real cause is identifiable without leaking detail:
//        E_DB          -> Supabase returned a query error
//        E_ENV         -> Supabase env vars missing / client build failed
//        E_SECRET      -> SUPABASE_SECRET_KEY not set
//        E_UNEXPECTED  -> anything else (usually hexToBytes on a bad secret)
// ==============================================================================

import { createClient } from "@supabase/supabase-js";

// This route must never be statically evaluated at build time.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// In-memory brute-force tracker
// Shape: Map<string, { failures: number, blockedUntil: number | null }>
//
// NOTE: This is per-instance state. On a single long-lived Node process it
// behaves exactly as written. For multi-instance or serverless deployments,
// replace with a Redis / Upstash atomic counter.
// ---------------------------------------------------------------------------
const ipLedger = new Map();
const MAX_FAILURES = 5;
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Build a JSON Response with a consistent shape.
 *
 * @param {Record<string, unknown>} body
 * @param {number} status
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Response}
 */
function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * Standard masked server error. The human-readable string is intentionally
 * identical on every path so an attacker learns nothing; `code` is for you.
 *
 * @param {"E_DB" | "E_ENV" | "E_SECRET" | "E_UNEXPECTED"} code
 * @returns {Response}
 */
function serverError(code) {
  return jsonResponse(
    {
      success: false,
      error: "Server error. Please contact support.",
      code,
    },
    500
  );
}

// ---------------------------------------------------------------------------
// Supabase server-side client (service role — never sent to the browser)
// ---------------------------------------------------------------------------

/**
 * Build a Supabase client using the service role key from the server
 * environment. This client bypasses all Row Level Security and is only ever
 * instantiated inside this API route, on the server.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
function buildServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase environment variables are not configured " +
        `(url: ${supabaseUrl ? "set" : "MISSING"}, ` +
        `serviceRoleKey: ${serviceRoleKey ? "set" : "MISSING"}).`
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Web Crypto helpers (Edge-compatible)
// ---------------------------------------------------------------------------

/**
 * Convert a hex string to a Uint8Array.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string.");

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    // parseInt returns NaN for non-hex, which coerces to 0x00 and would
    // silently weaken the signing key. Fail loudly instead.
    if (Number.isNaN(byte)) throw new Error("Invalid hex string.");
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Import a raw hex string as an HMAC-SHA-256 CryptoKey for signing.
 *
 * @param {string} hexSecret
 * @returns {Promise<CryptoKey>}
 */
async function importSigningKey(hexSecret) {
  const raw = hexToBytes(hexSecret);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * Encode a Uint8Array to a base64url string (no padding).
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Encode a plain string to base64url (no padding), UTF-8 safe.
 *
 * @param {string} str
 * @returns {string}
 */
function strToBase64url(str) {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64url(bytes);
}

/**
 * Build and sign a session token: <payloadB64>.<signatureB64>.
 * Payload shape must match the verifier in src/middleware.js:
 *   { keyType: string, issuedAt: number }
 *
 * @param {{ keyType: string, issuedAt: number }} payload
 * @param {string} hexSecret
 * @returns {Promise<string>}
 */
async function signSessionToken(payload, hexSecret) {
  const payloadB64 = strToBase64url(JSON.stringify(payload));
  const key = await importSigningKey(hexSecret);
  const payloadBytes = new TextEncoder().encode(payloadB64);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const sigB64 = bytesToBase64url(new Uint8Array(sigBuffer));
  return `${payloadB64}.${sigB64}`;
}

// ---------------------------------------------------------------------------
// Brute-force helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} ip
 * @returns {{ failures: number, blockedUntil: number | null }}
 */
function getLedgerEntry(ip) {
  if (!ipLedger.has(ip)) {
    ipLedger.set(ip, { failures: 0, blockedUntil: null });
  }
  return ipLedger.get(ip);
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isBlocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return false;
  if (Date.now() < entry.blockedUntil) return true;

  // Block expired — reset.
  entry.failures = 0;
  entry.blockedUntil = null;
  return false;
}

/** @param {string} ip */
function recordFailure(ip) {
  const entry = getLedgerEntry(ip);
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
}

/** @param {string} ip */
function recordSuccess(ip) {
  ipLedger.delete(ip);
}

/**
 * @param {string} ip
 * @returns {number}
 */
function msUntilUnblocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return 0;
  return Math.max(0, entry.blockedUntil - Date.now());
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @returns {string}
 */
function getClientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} keyType
 * @returns {string}
 */
function keyTypeToRoute(keyType) {
  switch (keyType) {
    case "demo":
      return "/demo";
    case "product":
      return "/dashboard";
    case "admin":
      return "/root";
    default:
      return "/login";
  }
}

/**
 * @param {string} token
 * @returns {string}
 */
function buildSetCookieHeader(token) {
  const SESSION_TTL_SECONDS = 24 * 60 * 60;
  const isProduction = process.env.NODE_ENV === "production";
  const securePart = isProduction ? "; Secure" : "";

  return (
    `anchorism_session=${token}` +
    `; HttpOnly` +
    securePart +
    `; SameSite=Strict` +
    `; Path=/` +
    `; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

/**
 * POST /api/validate-key
 * Body: { key: string }
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function POST(request) {
  const ip = getClientIp(request);

  try {
    // ── 1. Rate-limit check ─────────────────────────────────────────────
    if (isBlocked(ip)) {
      const retryAfterSec = Math.ceil(msUntilUnblocked(ip) / 1000);
      return jsonResponse(
        {
          success: false,
          error: "Too many failed attempts. Please try again later.",
        },
        429,
        { "Retry-After": String(retryAfterSec) }
      );
    }

    // ── 2. Parse request body ───────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid request." }, 400);
    }

    const submittedKey =
      typeof body?.key === "string" ? body.key.trim() : null;

    if (!submittedKey) {
      return jsonResponse({ success: false, error: "Invalid request." }, 400);
    }

    // ── 3. Database lookup ──────────────────────────────────────────────
    // Exact match on key_value; only active keys. The service role client
    // bypasses RLS — the key is never exposed to the browser.
    let dbRecord = null;

    try {
      const supabase = buildServiceClient();

      const { data, error } = await supabase
        .from("authorized_keys")
        .select("key_type")
        .eq("key_value", submittedKey)
        .eq("active", true)
        .maybeSingle(); // returns null (not error) when no row is found

      if (error) {
        console.error(
          "[anchorism] DB lookup error:",
          error.code,
          error.message,
          error.details,
          error.hint
        );
        return serverError("E_DB");
      }

      dbRecord = data; // null if not found
    } catch (clientErr) {
      console.error("[anchorism] Failed to build Supabase client:", clientErr);
      return serverError("E_ENV");
    }

    // ── 4. Validate result ──────────────────────────────────────────────
    const VALID_KEY_TYPES = ["demo", "product", "admin"];

    if (dbRecord === null || !VALID_KEY_TYPES.includes(dbRecord.key_type)) {
      recordFailure(ip);

      if (isBlocked(ip)) {
        return jsonResponse(
          {
            success: false,
            error: "Too many failed attempts. Please try again in 2 minutes.",
          },
          429,
          { "Retry-After": String(Math.ceil(BLOCK_DURATION_MS / 1000)) }
        );
      }

      const entry = getLedgerEntry(ip);
      const remaining = Math.max(0, MAX_FAILURES - entry.failures);

      return jsonResponse(
        {
          success: false,
          error: `Invalid key. ${remaining} attempt${
            remaining === 1 ? "" : "s"
          } remaining before lockout.`,
        },
        401
      );
    }

    // ── 5. Sign session token ───────────────────────────────────────────
    const secret = process.env.SUPABASE_SECRET_KEY;

    if (!secret) {
      console.error("[anchorism] SUPABASE_SECRET_KEY is not set.");
      return serverError("E_SECRET");
    }

    const payload = { keyType: dbRecord.key_type, issuedAt: Date.now() };
    const token = await signSessionToken(payload, secret);

    recordSuccess(ip);

    return jsonResponse(
      { success: true, redirect: keyTypeToRoute(dbRecord.key_type) },
      200,
      { "Set-Cookie": buildSetCookieHeader(token) }
    );
  } catch (err) {
    console.error("[anchorism] Unhandled error in /api/validate-key:", err);
    return serverError("E_UNEXPECTED");
  }
}

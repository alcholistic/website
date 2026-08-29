// src/app/api/validate-key/route.js
// ==============================================================================
// ANCHORISM — Secure Key Validation API Route (Database-backed, v2)
//
// SECURITY UPGRADE from v1:
//   Instead of validating key format with regex alone, this version performs
//   an exact-match lookup against the `authorized_keys` Supabase table using
//   the server-side service role client (bypasses RLS, never sent to the browser).
//   A key is accepted only if it exists in the table, is active, and its
//   key_type matches a known protected route.
//
// Responsibilities:
//   1. IP-based brute-force rate limiting (5 failures → 2-minute block)
//   2. Exact key lookup in authorized_keys via Supabase service role client
//   3. Sign an anchorism_session HttpOnly cookie on success
//   4. Generic error masking on all failure paths
// ==============================================================================

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// In-memory brute-force tracker
// Shape: Map<ip, { failures: number, blockedUntil: number | null }>
//
// NOTE: This is per-instance state. For multi-region deployments replace with
// a Redis or Upstash atomic counter. Correct and sufficient for single-instance
// or low-traffic deployments.
// ---------------------------------------------------------------------------
const ipLedger = new Map();

const MAX_FAILURES      = 5;
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// Supabase server-side client (service role — never sent to the browser)
// ---------------------------------------------------------------------------

/**
 * Build a Supabase client using the service role key from the server environment.
 * This client bypasses all Row Level Security and is only ever instantiated
 * inside this API route on the server.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
function buildServiceClient() {
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken:  false,
      persistSession:    false,
      detectSessionInUrl: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Web Crypto helpers (Edge-compatible)
// ---------------------------------------------------------------------------

/**
 * Import a raw hex string as an HMAC-SHA-256 CryptoKey for signing.
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
 * Convert a hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string.");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to a base64url string (no padding).
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
 * Encode a plain string to base64url (no padding).
 * @param {string} str
 * @returns {string}
 */
function strToBase64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Build and sign a session token: <base64url(payload)>.<base64url(HMAC-SHA-256)>
 * Payload shape must match the verifier in src/middleware.js:
 *   { keyType: string, issuedAt: number }
 *
 * @param {{ keyType: string, issuedAt: number }} payload
 * @param {string} hexSecret
 * @returns {Promise<string>}
 */
async function signSessionToken(payload, hexSecret) {
  const payloadB64  = strToBase64url(JSON.stringify(payload));
  const key         = await importSigningKey(hexSecret);
  const payloadBytes = new TextEncoder().encode(payloadB64);
  const sigBuffer   = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const sigB64      = bytesToBase64url(new Uint8Array(sigBuffer));
  return `${payloadB64}.${sigB64}`;
}

// ---------------------------------------------------------------------------
// Brute-force helpers
// ---------------------------------------------------------------------------

function getLedgerEntry(ip) {
  if (!ipLedger.has(ip)) {
    ipLedger.set(ip, { failures: 0, blockedUntil: null });
  }
  return ipLedger.get(ip);
}

function isBlocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return false;
  if (Date.now() < entry.blockedUntil) return true;
  // Block expired — reset
  entry.failures    = 0;
  entry.blockedUntil = null;
  return false;
}

function recordFailure(ip) {
  const entry = getLedgerEntry(ip);
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
}

function recordSuccess(ip) {
  ipLedger.delete(ip);
}

function msUntilUnblocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return 0;
  return Math.max(0, entry.blockedUntil - Date.now());
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

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

function keyTypeToRoute(keyType) {
  switch (keyType) {
    case "demo":    return "/demo";
    case "product": return "/dashboard";
    case "admin":   return "/root";
    default:        return "/login";
  }
}

function buildSetCookieHeader(token) {
  const SESSION_TTL_SECONDS = 24 * 60 * 60;
  const isProduction        = process.env.NODE_ENV === "production";
  const securePart          = isProduction ? "; Secure" : "";
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

export async function POST(request) {
  const ip = getClientIp(request);

  try {
    // ── 1. Rate-limit check ───────────────────────────────────────────────
    if (isBlocked(ip)) {
      const retryAfterSec = Math.ceil(msUntilUnblocked(ip) / 1000);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Too many failed attempts. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSec),
          },
        }
      );
    }

    // ── 2. Parse request body ─────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const submittedKey =
      typeof body?.key === "string" ? body.key.trim() : null;

    if (!submittedKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 3. Database lookup ────────────────────────────────────────────────
    // Exact match on key_value; only return active keys.
    // The service role client bypasses RLS — the key is never exposed to
    // the browser or embedded in client-side code.
    let dbRecord = null;
    try {
      const supabase = buildServiceClient();
      const { data, error } = await supabase
        .from("authorized_keys")
        .select("key_type")
        .eq("key_value", submittedKey)
        .eq("active", true)
        .maybeSingle();         // returns null (not error) when no row found

      if (error) {
        // Database error — log server-side, return generic message to client
        console.error("[anchorism] DB lookup error:", error.message);
        return new Response(
          JSON.stringify({ success: false, error: "Server error. Please contact support." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      dbRecord = data; // null if not found
    } catch (clientErr) {
      console.error("[anchorism] Failed to build Supabase client:", clientErr);
      return new Response(
        JSON.stringify({ success: false, error: "Server error. Please contact support." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 4. Validate result ────────────────────────────────────────────────
    const VALID_KEY_TYPES = ["demo", "product", "admin"];

    if (
      dbRecord === null ||
      !VALID_KEY_TYPES.includes(dbRecord.key_type)
    ) {
      recordFailure(ip);

      const entry        = getLedgerEntry(ip);
      const isNowBlocked = isBlocked(ip);

      if (isNowBlocked) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Too many failed attempts. Please try again in 2 minutes.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(BLOCK_DURATION_MS / 1000)),
            },
          }
        );
      }

      const remaining = MAX_FAILURES - entry.failures;
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid key. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.`,
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 5. Sign session token ─────────────────────────────────────────────
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) {
      console.error("[anchorism] SUPABASE_SECRET_KEY is not set.");
      return new Response(
        JSON.stringify({ success: false, error: "Server error. Please contact support." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = { keyType: dbRecord.key_type, issuedAt: Date.now() };
    const token   = await signSessionToken(payload, secret);

    recordSuccess(ip);

    return new Response(
      JSON.stringify({ success: true, redirect: keyTypeToRoute(dbRecord.key_type) }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildSetCookieHeader(token),
        },
      }
    );
  } catch (err) {
    console.error("[anchorism] Unhandled error in /api/validate-key:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error. Please contact support." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

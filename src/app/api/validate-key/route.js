// src/app/api/validate-key/route.js
// ==============================================================================
// ANCHORISM — Secure Key Validation API Route
//
// Responsibilities:
//   1. Accept a POST request with { key: string } in the JSON body
//   2. Validate the key format against known key-type regex patterns
//   3. Enforce IP-based brute-force rate limiting (5 failures → 2-minute block)
//   4. On success: create a cryptographically signed session cookie and return
//      the destination route to redirect to
//   5. On failure: return a generic error message — never leak internal detail
//   6. All crypto uses the Web Crypto API (Edge-compatible, no Node.js imports)
// ==============================================================================

// ---------------------------------------------------------------------------
// In-memory brute-force tracker
//
// Shape: Map<ip: string, { failures: number, blockedUntil: number | null }>
//
// NOTE: This map lives in the module scope of a single serverless instance.
// In a multi-instance / multi-region deployment this state is NOT shared across
// instances. For production at scale, replace this with a Redis-backed or
// Supabase-backed atomic counter. For a single-instance or low-traffic
// deployment this is correct and sufficient.
// ---------------------------------------------------------------------------
const ipLedger = new Map();

/** Maximum failed attempts before an IP is blocked. */
const MAX_FAILURES = 5;

/** How long a blocked IP must wait before trying again (milliseconds). */
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// Key-type definitions
//
// Each entry defines:
//   - regex : exact pattern the submitted key must match in full
//   - type  : the keyType string embedded in the session payload
// ---------------------------------------------------------------------------
const KEY_DEFINITIONS = [
  {
    // DEMO-XXXXXXXXXX  (prefix + exactly 10 alphanumeric characters)
    regex: /^DEMO-[A-Z0-9]{10}$/,
    type: "demo",
  },
  {
    // PRODUCT-KEY-XXXXXXXXXXXXXXXXXXXXXX  (prefix + exactly 22 alphanumeric characters)
    regex: /^PRODUCT-KEY-[A-Z0-9]{22}$/,
    type: "product",
  },
  {
    // ROOT-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    // (prefix + exactly 62 alphanumeric characters)
    regex: /^ROOT-[A-Z0-9]{62}$/,
    type: "admin",
  },
];

// ---------------------------------------------------------------------------
// Web Crypto helpers (Edge-compatible — no `import crypto from "crypto"`)
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
 * Encode a Uint8Array to a base64url string (URL-safe, no padding).
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
 * Encode a plain string to base64url (URL-safe, no padding).
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
 * Build and cryptographically sign a session token.
 *
 * Token format (matches the verifier in src/middleware.js):
 *   <base64url(JSON payload)>.<base64url(HMAC-SHA-256 signature)>
 *
 * Payload shape: { keyType: string, issuedAt: number (unix ms) }
 *
 * @param {{ keyType: string, issuedAt: number }} payload
 * @param {string} hexSecret  The SUPABASE_SECRET_KEY env variable (hex string)
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
 * Retrieve or initialise the ledger entry for an IP.
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
 * Check whether an IP is currently blocked.
 * Automatically lifts expired blocks to keep the map lean.
 * @param {string} ip
 * @returns {boolean}
 */
function isBlocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return false;
  if (Date.now() < entry.blockedUntil) return true;
  // Block has expired — reset the entry so they start fresh
  entry.failures = 0;
  entry.blockedUntil = null;
  return false;
}

/**
 * Record a failed validation attempt for an IP.
 * Promotes to blocked status if the failure threshold is reached.
 * @param {string} ip
 */
function recordFailure(ip) {
  const entry = getLedgerEntry(ip);
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION_MS;
  }
}

/**
 * Clear the failure record for an IP on successful validation.
 * @param {string} ip
 */
function recordSuccess(ip) {
  ipLedger.delete(ip);
}

/**
 * How many milliseconds remain on an IP's block (0 if not blocked).
 * @param {string} ip
 * @returns {number}
 */
function msUntilUnblocked(ip) {
  const entry = getLedgerEntry(ip);
  if (entry.blockedUntil === null) return 0;
  return Math.max(0, entry.blockedUntil - Date.now());
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the best available client IP from the request headers.
 * Next.js Edge / Node runtimes expose the forwarded headers automatically.
 * Falls back to a safe sentinel value so logic never throws on a missing IP.
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
// Route: destination helper
// ---------------------------------------------------------------------------

/**
 * Map a validated key type to its protected route path.
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

// ---------------------------------------------------------------------------
// Cookie builder
// ---------------------------------------------------------------------------

/**
 * Build the Set-Cookie header string for the signed session cookie.
 *
 * Attributes chosen for security:
 *   - HttpOnly   : JavaScript cannot read this cookie (XSS mitigation)
 *   - Secure     : Only sent over HTTPS (omitted in development automatically
 *                  by checking NODE_ENV so localhost still works)
 *   - SameSite=Strict : CSRF mitigation
 *   - Path=/     : Available to all routes
 *   - Max-Age    : 24-hour session lifetime (matches middleware TTL check)
 *
 * @param {string} token   Signed session token value
 * @returns {string}
 */
function buildSetCookieHeader(token) {
  const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
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
// POST handler — the only exported method
// ---------------------------------------------------------------------------

/**
 * POST /api/validate-key
 *
 * Request body (JSON): { key: string }
 *
 * Success response (200):
 *   { success: true, redirect: "/demo" | "/dashboard" | "/root" }
 *   Sets-Cookie: anchorism_session=<signed token>; HttpOnly; ...
 *
 * Failure responses:
 *   429 — IP is currently blocked
 *   401 — Key is invalid (generic message only)
 *   400 — Malformed request body
 *   405 — Wrong HTTP method (implicitly, Next.js returns 405 for non-exported methods)
 *   500 — Internal server error (generic message only)
 */
export async function POST(request) {
  const ip = getClientIp(request);

  try {
    // ── 1. Check if this IP is currently rate-limited ──────────────────────
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

    // ── 2. Parse and validate request body ────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      // Malformed JSON — do NOT count as a brute-force attempt
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const submittedKey =
      typeof body?.key === "string" ? body.key.trim() : null;

    if (!submittedKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid request." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ── 3. Match key against known patterns ───────────────────────────────
    let matchedType = null;
    for (const def of KEY_DEFINITIONS) {
      if (def.regex.test(submittedKey)) {
        matchedType = def.type;
        break;
      }
    }

    if (matchedType === null) {
      // Invalid key — record the failure for rate-limiting
      recordFailure(ip);

      // Determine whether to include remaining-attempts hint (stops at block threshold)
      const entry = getLedgerEntry(ip);
      const isNowBlocked = isBlocked(ip);

      if (isNowBlocked) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Too many failed attempts. Please try again in 2 minutes.",
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
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ── 4. Key is valid — ensure signing secret is available ──────────────
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) {
      // Server misconfiguration — fail closed, no detail to client
      console.error(
        "[anchorism] SUPABASE_SECRET_KEY is not set. Cannot issue session."
      );
      return new Response(
        JSON.stringify({ success: false, error: "Server error. Please contact support." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // ── 5. Build and sign the session token ───────────────────────────────
    const payload = {
      keyType: matchedType,
      issuedAt: Date.now(),
    };

    const token = await signSessionToken(payload, secret);

    // ── 6. Clear this IP's failure record on success ──────────────────────
    recordSuccess(ip);

    // ── 7. Respond with the signed cookie and redirect destination ─────────
    const redirectTo = keyTypeToRoute(matchedType);

    return new Response(
      JSON.stringify({ success: true, redirect: redirectTo }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": buildSetCookieHeader(token),
        },
      }
    );
  } catch (err) {
    // ── Global catch — never surface raw errors to the client ──────────────
    // Log internally for debugging; return only a generic message.
    console.error("[anchorism] Unhandled error in /api/validate-key:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Server error. Please contact support." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

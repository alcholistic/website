// src/middleware.js
// ==============================================================================
// ANCHORISM — Secure Route Protection Middleware
//
// Runs at the Edge before every matched request.
// Responsibilities:
//   1. Read the signed session cookie set by /api/validate-key
//   2. Cryptographically verify its HMAC-SHA-256 signature using SUPABASE_SECRET_KEY
//   3. Decode the payload and confirm the key type grants access to the requested route
//   4. Redirect unauthenticated or unauthorised requests to /login
//   5. Redirect already-authenticated users away from /login back to their route
// ==============================================================================

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the HttpOnly session cookie written by the validation API. */
const SESSION_COOKIE = "anchorism_session";

/**
 * Route → required key type mapping.
 * Any route not listed here is considered public (/, /login, /api/*).
 */
const PROTECTED_ROUTES = {
  "/demo": "demo",
  "/dashboard": "product",
  "/root": "admin",
};

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto API — Edge-compatible, no Node.js crypto import)
// ---------------------------------------------------------------------------

/**
 * Import the HMAC-SHA-256 signing key from a raw hex secret string.
 * @param {string} hexSecret
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(hexSecret) {
  const raw = hexToBytes(hexSecret);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Convert a hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string length.");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a base64url string to a Uint8Array.
 * @param {string} b64url
 * @returns {Uint8Array}
 */
function base64urlToBytes(b64url) {
  // Convert base64url → base64 → binary
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a signed session token of the form `<base64url-payload>.<base64url-sig>`.
 *
 * The payload is a base64url-encoded JSON string containing at minimum:
 *   { keyType: "demo" | "product" | "admin", issuedAt: <unix ms> }
 *
 * Returns the decoded payload object if valid, or null if tampered / expired.
 *
 * @param {string} token   Raw cookie value
 * @param {string} secret  Hex-encoded HMAC secret (SUPABASE_SECRET_KEY)
 * @returns {Promise<{keyType: string, issuedAt: number} | null>}
 */
async function verifySessionToken(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;

    // Re-derive the expected signature over the raw payload bytes
    const key = await importHmacKey(secret);
    const payloadBytes = new TextEncoder().encode(payloadB64);
    const sigBytes = base64urlToBytes(sigB64);

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
    if (!valid) return null;

    // Decode payload
    const jsonStr = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(jsonStr);

    // Basic structure check
    if (
      typeof payload !== "object" ||
      typeof payload.keyType !== "string" ||
      typeof payload.issuedAt !== "number"
    ) {
      return null;
    }

    // Optional: enforce a session TTL of 24 hours
    const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - payload.issuedAt > SESSION_TTL_MS) return null;

    return payload;
  } catch {
    // Any parse / crypto error → treat as invalid
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // ── Determine if this is a protected route ────────────────────────────────
  // Match exact path or sub-paths (e.g. /dashboard/settings still requires "product")
  let requiredKeyType = null;
  for (const [route, keyType] of Object.entries(PROTECTED_ROUTES)) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      requiredKeyType = keyType;
      break;
    }
  }

  const secret = process.env.SUPABASE_SECRET_KEY;

  // ── Guard: secret must be configured in production ────────────────────────
  if (!secret && requiredKeyType !== null) {
    // Misconfigured environment — fail closed, never expose the reason to clients
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "server_misconfiguration");
    return NextResponse.redirect(loginUrl);
  }

  // ── Read and verify session cookie ────────────────────────────────────────
  const rawCookie = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  let session = null;

  if (rawCookie && secret) {
    session = await verifySessionToken(rawCookie, secret);
  }

  // ── Route: /login — redirect authenticated users to their dashboard ────────
  if (pathname === "/login") {
    if (session) {
      const dest = keyTypeToDashboard(session.keyType);
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // ── Route: protected — enforce authentication and authorisation ───────────
  if (requiredKeyType !== null) {
    if (!session) {
      // Not authenticated at all
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    if (session.keyType !== requiredKeyType) {
      // Authenticated but wrong key type (e.g. demo key trying to reach /root)
      const correctDest = keyTypeToDashboard(session.keyType);
      return NextResponse.redirect(new URL(correctDest, request.url));
    }

    // Authenticated and authorised — attach key type as a request header
    // so downstream server components can read it without re-verifying
    const response = NextResponse.next();
    response.headers.set("x-anchorism-key-type", session.keyType);
    return response;
  }

  // ── Public route — pass through ───────────────────────────────────────────
  return NextResponse.next();
}

// ---------------------------------------------------------------------------
// Helper: map key type to its canonical dashboard path
// ---------------------------------------------------------------------------

/**
 * @param {string} keyType
 * @returns {string}
 */
function keyTypeToDashboard(keyType) {
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
// Matcher config — only run middleware on relevant paths, skip static assets
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *   - _next/static  (Next.js static build assets)
     *   - _next/image   (Next.js image optimisation)
     *   - favicon.ico
     *   - /videos/*     (video files served from /public/videos/)
     *   - Any file with a known static extension
     */
    "/((?!_next/static|_next/image|favicon\\.ico|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js\\.map)$).*)",
  ],
};

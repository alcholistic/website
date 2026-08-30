// src/app/api/health/route.js
// =============================================================================
// ANCHORISM — Gated environment diagnostics
//
// TEMPORARY DEBUG ENDPOINT.
//
// Returns 404 unless BOTH are true:
//   1. DIAG_TOKEN is set in the environment (min 16 chars)
//   2. The ?token= query parameter matches it exactly
//
// It never returns a secret value — only presence, length, format flags and
// non-sensitive prefixes. Safe to paste the JSON output into a chat.
//
// To switch it off: delete the DIAG_TOKEN env var, or delete this file.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

// Never cache a diagnostic response, and never try to prerender it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

/** Indistinguishable from a route that does not exist. */
function notFound() {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

/**
 * Length-checked, constant-time-ish comparison so we don't leak the token
 * byte-by-byte through early exits.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Describe a raw secret (the HMAC key) without revealing it.
 *
 * @param {string | undefined} value
 * @returns {Record<string, unknown>}
 */
function describeSecret(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { present: false };
  }

  return {
    present: true,
    length: value.length,
    evenLength: value.length % 2 === 0,
    isPureHex: /^[0-9a-fA-F]+$/.test(value),
    hasWhitespace: /\s/.test(value),
    hasSurroundingQuotes: /^["']|["']$/.test(value),
  };
}

/**
 * Identify what KIND of Supabase credential was pasted, without leaking it.
 * Catches the classic mistake of swapping the anon key and the service role key.
 *
 * @param {string | undefined} value
 * @returns {Record<string, unknown>}
 */
function describeSupabaseKey(value) {
  if (typeof value !== "string" || value.length === 0) {
    return { present: false };
  }

  let kind = "unrecognised";
  let role = null;

  if (value.startsWith("eyJ")) {
    kind = "legacy JWT";
    // The middle segment is base64url-encoded JSON; the `role` claim is public
    // information in any Supabase key and is not a secret on its own.
    try {
      const payload = value.split(".")[1];
      if (payload) {
        const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalised.padEnd(
          normalised.length + ((4 - (normalised.length % 4)) % 4),
          "="
        );
        const decoded = JSON.parse(atob(padded));
        if (typeof decoded?.role === "string") role = decoded.role;
      }
    } catch {
      role = "unparseable";
    }
  } else if (value.startsWith("sb_secret_")) {
    kind = "new-style secret key";
    role = "secret";
  } else if (value.startsWith("sb_publishable_")) {
    kind = "new-style publishable key";
    role = "publishable";
  }

  return {
    present: true,
    length: value.length,
    kind,
    role,
    hasWhitespace: /\s/.test(value),
    hasSurroundingQuotes: /^["']|["']$/.test(value),
  };
}

/**
 * Reproduce exactly what /api/validate-key does when it signs the session
 * cookie, so we can see whether hexToBytes() or importKey() is what throws.
 *
 * @param {string | undefined} hexSecret
 * @returns {Promise<Record<string, unknown>>}
 */
async function probeSigning(hexSecret) {
  if (typeof hexSecret !== "string" || hexSecret.length === 0) {
    return { ok: false, reason: "SUPABASE_SECRET_KEY is not set" };
  }

  try {
    if (hexSecret.length % 2 !== 0) {
      throw new Error(
        `Odd length (${hexSecret.length}) — hexToBytes() throws "Invalid hex string."`
      );
    }

    const bytes = new Uint8Array(hexSecret.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      const byte = parseInt(hexSecret.slice(i * 2, i * 2 + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error(
          `Non-hex characters at offset ${i * 2} — parseInt returns NaN, which ` +
            "coerces to 0x00 and silently weakens the signing key."
        );
      }
      bytes[i] = byte;
    }

    await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    return {
      ok: true,
      keyBytes: bytes.length,
      strongEnough: bytes.length >= 32,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run the same lookup /api/validate-key runs and surface the REAL Supabase
 * error instead of the generic masked one.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
async function probeDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      stage: "client",
      reason:
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY is missing " +
        "from the running function's environment",
    };
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error, count } = await supabase
      .from("authorized_keys")
      .select("key_type", { count: "exact" })
      .eq("active", true)
      .limit(5);

    if (error) {
      return {
        ok: false,
        stage: "query",
        code: error.code ?? null,
        message: error.message,
        details: error.details ?? null,
        hint: error.hint ?? null,
      };
    }

    const rows = Array.isArray(data) ? data : [];

    return {
      ok: true,
      // Key TYPES only. The key_value column is never selected.
      activeKeyCount: typeof count === "number" ? count : rows.length,
      keyTypesFound: [...new Set(rows.map((row) => row.key_type))].sort(),
    };
  } catch (err) {
    return {
      ok: false,
      stage: "exception",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * GET /api/health?token=<DIAG_TOKEN>
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function GET(request) {
  const diagToken = process.env.DIAG_TOKEN;

  // Disabled by default. A short token is treated as no token at all.
  if (typeof diagToken !== "string" || diagToken.length < 16) {
    return notFound();
  }

  let supplied = null;
  try {
    supplied = new URL(request.url).searchParams.get("token");
  } catch {
    return notFound();
  }

  if (!safeEqual(supplied ?? "", diagToken)) {
    return notFound();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let urlHost = null;
  let urlParses = false;
  let urlHasTrailingSlash = false;

  if (typeof supabaseUrl === "string" && supabaseUrl.length > 0) {
    urlHasTrailingSlash = supabaseUrl.endsWith("/");
    try {
      urlHost = new URL(supabaseUrl).host;
      urlParses = true;
    } catch {
      urlParses = false;
    }
  }

  const [signing, database] = await Promise.all([
    probeSigning(process.env.SUPABASE_SECRET_KEY),
    probeDatabase(),
  ]);

  const report = {
    checkedAt: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? null,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: {
        present: Boolean(supabaseUrl),
        parsesAsUrl: urlParses,
        host: urlHost,
        hasTrailingSlash: urlHasTrailingSlash,
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: describeSupabaseKey(
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
      SUPABASE_SERVICE_ROLE_KEY: describeSupabaseKey(
        process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
      SUPABASE_SECRET_KEY: describeSecret(process.env.SUPABASE_SECRET_KEY),
      DATABASE_PASSWORD: {
        present: Boolean(process.env.DATABASE_PASSWORD),
      },
    },
    signing,
    database,
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

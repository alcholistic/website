// src/app/login/page.js
// ==============================================================================
// ANCHORISM — Secure Key Terminal
//
// Public route: /login
// Accepts a key, POSTs to /api/validate-key, redirects on success.
// Displays clean, human-readable error states (remaining attempts, lockout timer).
// No raw system errors are ever displayed.
// ==============================================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Endpoint wired up in Step 2. */
const VALIDATE_ENDPOINT = "/api/validate-key";

/** How often (ms) the lockout countdown ticks. */
const COUNTDOWN_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();

  // Form state
  const [key, setKey]           = useState("");
  const [loading, setLoading]   = useState(false);

  // Error / feedback state
  const [errorMsg, setErrorMsg]       = useState(null);  // string | null
  const [lockedUntil, setLockedUntil] = useState(null);  // Date | null
  const [countdown, setCountdown]     = useState(0);     // seconds remaining

  const inputRef = useRef(null);

  // ── Focus the input on mount ─────────────────────────────────────────────
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Countdown ticker for lockout state ───────────────────────────────────
  useEffect(() => {
    if (lockedUntil === null) return;

    const tick = () => {
      const remaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 1_000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setCountdown(0);
        setErrorMsg(null);
      } else {
        setCountdown(remaining);
      }
    };

    tick(); // run immediately
    const id = setInterval(tick, COUNTDOWN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lockedUntil]);

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      const trimmedKey = key.trim();
      if (!trimmedKey) {
        setErrorMsg("Please enter your key.");
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch(VALIDATE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmedKey }),
        });

        // Attempt to parse JSON regardless of status code
        let data = null;
        try {
          data = await res.json();
        } catch {
          // Non-JSON response (e.g. unexpected 500 from infra)
          setErrorMsg("An unexpected error occurred. Please try again.");
          setLoading(false);
          return;
        }

        if (res.status === 429) {
          // Locked out — parse Retry-After header if present
          const retryAfter = res.headers.get("Retry-After");
          const seconds = retryAfter ? parseInt(retryAfter, 10) : 120;
          setLockedUntil(new Date(Date.now() + seconds * 1_000));
          setErrorMsg(null); // countdown UI takes over
          setLoading(false);
          return;
        }

        if (!res.ok || !data?.success) {
          // Show the server's generic message as-is; it never contains raw traces
          setErrorMsg(data?.error ?? "Invalid key. Please try again.");
          setLoading(false);
          return;
        }

        // ── Success — redirect to the designated route ──────────────────────
        const destination = data.redirect;
        if (!destination || typeof destination !== "string") {
          setErrorMsg("An unexpected error occurred. Please try again.");
          setLoading(false);
          return;
        }

        // router.push triggers a client-side navigation; the middleware will
        // verify the cookie and allow access to the protected route.
        router.push(destination);
        // Keep loading=true so the button stays disabled during navigation
      } catch (networkErr) {
        // Fetch itself failed (no connectivity, DNS error, etc.)
        setErrorMsg("Could not reach the server. Check your connection and try again.");
        setLoading(false);
      }
    },
    [key, router]
  );

  // ── Derived UI helpers ────────────────────────────────────────────────────
  const isLocked        = lockedUntil !== null && countdown > 0;
  const submitDisabled  = loading || isLocked || key.trim().length === 0;

  const formatCountdown = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen bg-white flex flex-col items-center justify-center px-6"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            Anchorism
          </h1>
          <p className="text-sm text-gray-500">Enter your access key to continue.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

          {/* Key input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="access-key"
              className="text-xs font-medium text-gray-600 uppercase tracking-widest"
            >
              Key
            </label>
            <input
              ref={inputRef}
              id="access-key"
              type="password"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={key}
              disabled={loading || isLocked}
              onChange={(e) => {
                setKey(e.target.value);
                // Clear inline error as the user types
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="XXXX-XXXXXXXXXXXX"
              className={[
                "w-full rounded border bg-white px-3 py-2.5 text-sm font-mono",
                "text-gray-900 placeholder-gray-300",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                "transition-colors",
                isLocked || loading
                  ? "border-gray-200 text-gray-400 cursor-not-allowed"
                  : "border-gray-300",
              ].join(" ")}
            />
          </div>

          {/* Error / lockout feedback */}
          {isLocked ? (
            <div
              role="alert"
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5"
            >
              <p className="text-xs text-amber-800 leading-relaxed">
                Too many failed attempts.{" "}
                <span className="font-semibold tabular-nums">
                  {formatCountdown(countdown)}
                </span>{" "}
                remaining before you can try again.
              </p>
            </div>
          ) : errorMsg ? (
            <div
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2.5"
            >
              <p className="text-xs text-red-800 leading-relaxed">{errorMsg}</p>
            </div>
          ) : null}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitDisabled}
            className={[
              "w-full rounded border px-4 py-2.5 text-sm font-medium",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              "transition-colors",
              submitDisabled
                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
            ].join(" ")}
          >
            {loading ? "Validating…" : isLocked ? "Locked" : "Submit Key"}
          </button>

        </form>

        {/* Back link */}
        <a
          href="/"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
        >
          ← Back
        </a>

      </div>
    </main>
  );
}

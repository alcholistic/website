// src/app/dashboard/page.js
// ==============================================================================
// ANCHORISM — Product User Console
//
// Protected route: /dashboard
// Accessible only via a valid Product Key (enforced by middleware).
//
// BOOKMARKLET CUSTOMISATION INSTRUCTIONS:
// ─────────────────────────────────────────────────────────────────────────────
// Each bookmarklet is a plain HTML <a> tag whose `href` contains a
// `javascript:` URI. When a user drags the link to their browser bookmarks bar
// and later clicks it, the browser executes the JavaScript inline.
//
// To swap the Axiom bookmarklet script for your own tool:
//   1. Write your self-executing JavaScript function:
//        (function(){ /* your tool code here */ })();
//   2. Minify it (remove whitespace / newlines) so it fits in a single URI.
//   3. URI-encode any special characters using encodeURIComponent() if needed,
//      though most modern browsers handle unencoded bookmarklet JS correctly.
//   4. Replace the string inside the href below that currently reads:
//        javascript:(function(){alert('Axiom Loaded');})();
//      with:
//        javascript:(function(){ /* your minified tool code */ })();
//   5. Update the description text next to the link to reflect the new action.
// ─────────────────────────────────────────────────────────────────────────────
// ==============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/** Dedicated sign-out endpoint (defined in src/app/api/sign-out/route.js). */
const SIGNOUT_ENDPOINT = "/api/sign-out";

// ---------------------------------------------------------------------------
// Bookmarklet data
//
// Each entry renders as one utility row in the console.
// Status: "active" renders a draggable bookmarklet link.
// Status: "pending" renders a plain status string.
// ---------------------------------------------------------------------------
const BOOKMARKLETS = [
  {
    id: "axiom",
    label: "Axiom",
    status: "active",
    // ↓ REPLACE this javascript: URI with your own minified bookmarklet script.
    //   See the customisation instructions at the top of this file.
    href: "javascript:(function(){alert('Axiom Loaded');})();",
    actionLabel: "Add to Bookmarks Bar",
    description: "Drag the link to your browser bookmarks bar, then click it on any page.",
  },
  {
    id: "pumpfun",
    label: "Pump.fun",
    status: "pending",
    message: "In development, will deliver soon.",
  },
  {
    id: "polymarket",
    label: "Polymarket",
    status: "pending",
    message: "In development, will deliver soon.",
  },
];

// ---------------------------------------------------------------------------
// Sub-component: single bookmarklet row
// ---------------------------------------------------------------------------

function BookmarkletRow({ item }) {
  return (
    <div className="flex flex-col gap-2 py-5 border-b border-gray-100 last:border-b-0">
      {/* Row header */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-800">{item.label}</span>

        {item.status === "active" ? (
          /*
           * BOOKMARKLET ANCHOR
           * Drag this link to the browser bookmarks bar.
           * Clicking it on any page will execute the javascript: URI.
           *
           * Note: onClick={e => e.preventDefault()} is intentionally NOT set —
           * the link must be draggable to the bookmarks bar. When clicked
           * directly in this dashboard it will also execute, which is expected.
           */
          <a
            href={item.href}
            // eslint-disable-next-line react/no-danger -- href is a controlled javascript: URI, not user input
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors select-none"
            title={`Drag to bookmarks bar: ${item.label}`}
            aria-label={`${item.label} bookmarklet — drag to your bookmarks bar`}
          >
            {/* Drag handle icon (pure CSS, no external icon library) */}
            <span aria-hidden="true" className="text-gray-400">⠿</span>
            {item.actionLabel}
          </a>
        ) : (
          <span className="text-xs text-gray-400 italic">{item.message}</span>
        )}
      </div>

      {/* Description (active bookmarklets only) */}
      {item.status === "active" && item.description && (
        <p className="text-xs text-gray-400 leading-relaxed">{item.description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router      = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch(SIGNOUT_ENDPOINT, { method: "POST" });
    } catch {
      // Proceed with redirect even if the network call fails.
      // The middleware will reject the expired/cleared cookie on the next visit.
    }
    router.push("/login");
  }, [router]);

  return (
    <main
      className="min-h-screen bg-white px-6 py-12"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-10">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Anchorism
            </h1>
            <p className="text-sm text-gray-500">Dashboard · Bookmarklet console.</p>
          </div>

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className={[
              "rounded border px-3 py-1.5 text-xs font-medium",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
              "transition-colors",
              signingOut
                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <hr className="border-gray-100" />

        {/* ── Bookmarklet console ──────────────────────────────────────── */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 mb-2">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-widest">
              Utilities
            </h2>
            <p className="text-xs text-gray-400">
              Drag any active bookmarklet to your browser bookmarks bar.
            </p>
          </div>

          {/* Column headers */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
              Tool
            </span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">
              Action
            </span>
          </div>

          {/* Rows */}
          {BOOKMARKLETS.map((item) => (
            <BookmarkletRow key={item.id} item={item} />
          ))}
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-300">Anchorism · Product session</p>
        </footer>

      </div>
    </main>
  );
}

// src/app/page.js
// ==============================================================================
// ANCHORISM — Main Landing Page
//
// Public route: /
// A minimal, text-first entry point. No decorative elements.
// ==============================================================================

import Link from "next/link";

export const metadata = {
  title: "Anchorism",
  description: "Secure access portal.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col gap-10">

        {/* Wordmark */}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
            Anchorism
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Restricted access. Present your key to continue.
          </p>
        </div>

        {/* Entry action */}
        <Link
          href="/login"
          className="inline-flex items-center justify-center w-full rounded border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          Login to Anchorism
        </Link>

      </div>
    </main>
  );
}

// src/app/demo/page.js
// ==============================================================================
// ANCHORISM — Demo User Portal
//
// Protected route: /demo
// Accessible only via a valid Demo Key (enforced by middleware).
//
// VIDEO ASSET INSTRUCTIONS FOR DEVELOPERS:
// ─────────────────────────────────────────────────────────────────────────────
// The <video> element below references the placeholder path `/videos/software-demo.mp4`.
//
// To replace it with your real video:
//   1. Place your .mp4 file inside the `/public/videos/` directory at the root
//      of your Next.js project. Create the `videos/` folder if it does not exist.
//      Example: /public/videos/software-demo.mp4
//
//   2. Next.js automatically serves everything inside `/public/` at the root URL,
//      so `/public/videos/software-demo.mp4` becomes accessible at the URL
//      `/videos/software-demo.mp4` — which is exactly what the <source> tag below uses.
//
//   3. If you want to use a different filename, update the `src` attribute on the
//      <source> tag below (search for: src="/videos/software-demo.mp4").
//
//   4. If you host the video on an external CDN (e.g. Cloudflare R2, AWS S3),
//      replace the relative path with the full absolute URL of your video file.
//      Example: src="https://cdn.yourdomain.com/videos/software-demo.mp4"
//
//   5. The `type="video/mp4"` attribute should remain unchanged for .mp4 files.
//      If you switch to a different container format (e.g. .webm), update it to
//      type="video/webm" accordingly.
// ─────────────────────────────────────────────────────────────────────────────
// ==============================================================================

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Sign-out handler
//
// Clears the anchorism_session cookie by calling the dedicated sign-out
// API route, then redirects the user back to /login.
// ---------------------------------------------------------------------------

/** Dedicated sign-out endpoint defined in Step 4b below. */
const SIGNOUT_ENDPOINT = "/api/sign-out";

export default function DemoPage() {
  const router   = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch(SIGNOUT_ENDPOINT, { method: "POST" });
    } catch {
      // Even if the network call fails, proceed with the redirect.
      // The cookie's Max-Age will expire it naturally; the middleware
      // will reject it on the next protected-route visit regardless.
    }
    router.push("/login");
  }, [router]);

  return (
    <main
      className="min-h-screen bg-white px-6 py-12"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-12">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Anchorism
            </h1>
            <p className="text-sm text-gray-500">Demo access.</p>
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

        {/* ── Video section ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-widest">
              Product Demo
            </h2>
            <p className="text-xs text-gray-400">
              Watch the walkthrough below to get started.
            </p>
          </div>

          {/*
           * VIDEO ELEMENT
           * ─────────────────────────────────────────────────────────────
           * Replace the `src` on the <source> tag with your own video path or URL.
           * See the full instructions at the top of this file.
           * ─────────────────────────────────────────────────────────────
           */}
          <div className="w-full rounded border border-gray-200 overflow-hidden bg-gray-50">
            <video
              controls
              playsInline
              preload="metadata"
              className="w-full block"
              aria-label="Software product demonstration video"
            >
              {/* ↓ REPLACE THIS PATH with your real video file. See instructions above. */}
              <source src="/videos/software-demo.mp4" type="video/mp4" />
              Your browser does not support the HTML5 video element.
              Please update your browser or{" "}
              <a
                href="/videos/software-demo.mp4"
                className="underline text-gray-600"
              >
                download the video
              </a>{" "}
              directly.
            </video>
          </div>
        </section>

        {/* ── Divider ──────────────────────────────────────────────────── */}
        <hr className="border-gray-100" />

        {/* ── Text content section (Lorem Ipsum) ───────────────────────── */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-widest">
              About This Release
            </h2>
          </div>

          <div className="flex flex-col gap-3 text-sm text-gray-600 leading-relaxed">
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
              ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
              aliquip ex ea commodo consequat.
            </p>
            <p>
              Duis aute irure dolor in reprehenderit in voluptate velit esse
              cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
              cupidatat non proident, sunt in culpa qui officia deserunt mollit
              anim id est laborum.
            </p>
            <p>
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem
              accusantium doloremque laudantium, totam rem aperiam, eaque ipsa
              quae ab illo inventore veritatis et quasi architecto beatae vitae
              dicta sunt explicabo.
            </p>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-300">Anchorism · Demo session</p>
        </footer>

      </div>
    </main>
  );
}

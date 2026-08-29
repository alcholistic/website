// src/app/api/sign-out/route.js
// ==============================================================================
// ANCHORISM — Sign-Out API Route
//
// Clears the anchorism_session cookie by overwriting it with an expired value.
// Called by the Sign Out button on /demo and any other authenticated route.
// Returns 200 on success. Intentionally simple — no auth check needed because
// the only action taken is cookie deletion, which is harmless to call unauthenticated.
// ==============================================================================

export async function POST() {
  try {
    // Overwrite the cookie with an empty value and Max-Age=0 to instruct the
    // browser to delete it immediately. All other attributes must match the
    // original Set-Cookie header (Path, SameSite, Secure) for the browser to
    // correctly identify and delete the right cookie.
    const isProduction = process.env.NODE_ENV === "production";
    const securePart   = isProduction ? "; Secure" : "";

    const expiredCookie =
      `anchorism_session=` +
      `; HttpOnly` +
      securePart +
      `; SameSite=Strict` +
      `; Path=/` +
      `; Max-Age=0`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": expiredCookie,
      },
    });
  } catch (err) {
    console.error("[anchorism] Error in /api/sign-out:", err);
    return new Response(JSON.stringify({ success: false, error: "Server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

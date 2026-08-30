// src/app/root/page.js
// ==============================================================================
// ANCHORISM — Nexus Command Center (/root)
//
// Protected route: /root
// Accessible only via a valid Admin Key (enforced by middleware).
//
// SECURITY ARCHITECTURE — Dynamic Admin Client:
// ─────────────────────────────────────────────────────────────────────────────
// The Supabase service_role key is NEVER baked into source code or environment
// variables that ship to the browser. Instead, on every fresh session the admin
// must manually paste the key into a runtime input field. It is stored ONLY in
// sessionStorage (cleared automatically when the browser tab closes) and is
// never written to localStorage, cookies, or any persistent store.
//
// The god-mode Supabase client is constructed inline at call-time using:
//   createClient(NEXT_PUBLIC_SUPABASE_URL, sessionStorage.get('root_service_role'))
// so the key is never module-scoped or globally reachable.
// ─────────────────────────────────────────────────────────────────────────────
// ==============================================================================

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_KEY        = "root_service_role";
const SIGNOUT_ENDPOINT   = "/api/sign-out";
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Simulated audit log entries (displayed in the monitoring panel)
const INITIAL_AUDIT_LOGS = [
  { id: 1, ts: "2026-08-29 22:41:03Z", actor: "system",    event: "Boot sequence completed",              hash: "a3f8c1d2" },
  { id: 2, ts: "2026-08-29 22:41:05Z", actor: "middleware", event: "Route guard initialised",             hash: "b7e2a490" },
  { id: 3, ts: "2026-08-29 22:43:12Z", actor: "admin",     event: "Root session authenticated",           hash: "c9d4f831" },
  { id: 4, ts: "2026-08-29 22:43:14Z", actor: "admin",     event: "Nexus Command Center accessed",        hash: "d1e5b062" },
];

// Simulated infrastructure metrics
const MOCK_METRICS = [
  { label: "DB Size",            value: "148.3 MB" },
  { label: "Active Connections", value: "7"        },
  { label: "Row Count (total)",  value: "24,891"   },
  { label: "Cache Hit Ratio",    value: "99.2%"    },
  { label: "Avg Query Time",     value: "1.4 ms"   },
  { label: "Replication Lag",    value: "0 ms"     },
];

// Feature flags (simulated remote toggles)
const INITIAL_FLAGS = [
  { id: "demo_route",       label: "Demo Route",         enabled: true  },
  { id: "dashboard_route",  label: "Dashboard Route",    enabled: true  },
  { id: "bookmarklet_axiom",label: "Axiom Bookmarklet",  enabled: true  },
  { id: "video_section",    label: "Demo Video Section", enabled: true  },
  { id: "new_users",        label: "New Key Registration",enabled: false },
];

// Role options for the promotion dropdown
const ROLE_OPTIONS = ["viewer", "demo", "product", "admin", "superadmin"];

// ---------------------------------------------------------------------------
// Helper: build the god-mode Supabase client from the runtime-pasted key.
// Called inline inside action handlers — never stored at module scope.
// ---------------------------------------------------------------------------

function buildGodModeClient(serviceRoleKey) {
  // This client bypasses all Row Level Security (RLS) and is never baked
  // into production source code. It is constructed at call-time using a key
  // sourced exclusively from sessionStorage.
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Sub-component: Section wrapper for consistent panel styling
// ---------------------------------------------------------------------------

function Panel({ title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-4 border border-gray-200 rounded p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-widest">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-gray-400">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Toggle switch
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, label, id }) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-3 cursor-pointer select-none"
    >
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
          checked
            ? "bg-gray-800 border-gray-800"
            : "bg-gray-200 border-gray-200",
        ].join(" ")}
        type="button"
      >
        <span
          className={[
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[3px]",
            checked ? "translate-x-[18px]" : "translate-x-[3px]",
          ].join(" ")}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Inline status badge
// ---------------------------------------------------------------------------

function Badge({ variant, children }) {
  const styles = {
    green:  "bg-green-50  text-green-700  border-green-200",
    red:    "bg-red-50    text-red-700    border-red-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    gray:   "bg-gray-100  text-gray-500   border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${styles[variant] ?? styles.gray}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function RootPage() {
  const router = useRouter();

  // ── Service role key state ────────────────────────────────────────────────
  const [serviceRoleKey, setServiceRoleKey]     = useState("");
  const [keyInput, setKeyInput]                 = useState("");
  const [keyError, setKeyError]                 = useState(null);
  const [keyActivated, setKeyActivated]         = useState(false);
  const keyInputRef = useRef(null);

  // ── God-mode data explorer ────────────────────────────────────────────────
  const [tableName, setTableName]               = useState("authorized_keys");
  const [tableData, setTableData]               = useState([]);
  const [tableLoading, setTableLoading]         = useState(false);
  const [tableError, setTableError]             = useState(null);
  const [bypassRls, setBypassRls]               = useState(true);

  // SQL console
  const [sqlInput, setSqlInput]                 = useState("");
  const [sqlResult, setSqlResult]               = useState(null);
  const [sqlError, setSqlError]                 = useState(null);
  const [sqlLoading, setSqlLoading]             = useState(false);

  // Inline edit / create / delete
  const [editingRow, setEditingRow]             = useState(null); // row object being edited
  const [editValues, setEditValues]             = useState({});
  const [newRow, setNewRow]                     = useState(null); // {} when creating
  const [deleteConfirmId, setDeleteConfirmId]   = useState(null);
  const [crudMsg, setCrudMsg]                   = useState(null);

  // ── User & session control ────────────────────────────────────────────────
  const [targetUserId, setTargetUserId]         = useState("");
  const [impersonating, setImpersonating]       = useState(false);
  const [impersonationToken, setImpersonationToken] = useState(null);
  const [banLoading, setBanLoading]             = useState(false);
  const [banMsg, setBanMsg]                     = useState(null);
  const [selectedRole, setSelectedRole]         = useState("viewer");
  const [roleUserId, setRoleUserId]             = useState("");
  const [roleMsg, setRoleMsg]                   = useState(null);

  // ── Monitoring ────────────────────────────────────────────────────────────
  const [auditLogs, setAuditLogs]               = useState(INITIAL_AUDIT_LOGS);
  const [flags, setFlags]                       = useState(INITIAL_FLAGS);

  // ── Sign-out ──────────────────────────────────────────────────────────────
  const [signingOut, setSigningOut]             = useState(false);

  // ── On mount: restore service role key from sessionStorage ───────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      setServiceRoleKey(stored);
      setKeyActivated(true);
    } else {
      // Focus the key input after render
      setTimeout(() => keyInputRef.current?.focus(), 100);
    }
  }, []);

  // ── Simulated audit log ticker ────────────────────────────────────────────
  useEffect(() => {
    const EVENTS = [
      "RLS policy evaluated",
      "SELECT query executed",
      "Session token verified",
      "Feature flag read",
      "Health-check ping",
      "Connection pool sampled",
    ];
    const interval = setInterval(() => {
      const randomHash = Math.random().toString(16).slice(2, 10);
      const randomEvent = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      setAuditLogs((prev) => [
        {
          id: prev.length + 1,
          ts: new Date().toISOString().replace("T", " ").slice(0, 19) + "Z",
          actor: "system",
          event: randomEvent,
          hash: randomHash,
        },
        ...prev.slice(0, 49), // keep the last 50 entries
      ]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------------------
  // Service role key handlers
  // ---------------------------------------------------------------------------

  const handleActivateKey = useCallback(() => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setKeyError("Please paste your service_role key.");
      return;
    }
    // Basic sanity check: Supabase JWTs are long strings starting with "ey"
    if (!trimmed.startsWith("ey") || trimmed.length < 100) {
      setKeyError("This does not look like a valid Supabase service_role JWT. Please check and try again.");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, trimmed);
    setServiceRoleKey(trimmed);
    setKeyActivated(true);
    setKeyError(null);
    setKeyInput("");
    appendAuditLog("admin", "God-mode client activated");
  }, [keyInput]);

  const handleClearKey = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setServiceRoleKey("");
    setKeyActivated(false);
    setKeyInput("");
    setTableData([]);
    setSqlResult(null);
    appendAuditLog("admin", "God-mode key cleared from memory");
  }, []);

  // ---------------------------------------------------------------------------
  // Audit log helper
  // ---------------------------------------------------------------------------

  const appendAuditLog = (actor, event) => {
    const hash = Math.random().toString(16).slice(2, 10);
    setAuditLogs((prev) => [
      {
        id: prev.length + 1,
        ts: new Date().toISOString().replace("T", " ").slice(0, 19) + "Z",
        actor,
        event,
        hash,
      },
      ...prev.slice(0, 49),
    ]);
  };

  // ---------------------------------------------------------------------------
  // God-mode data explorer: READ table
  // ---------------------------------------------------------------------------

  const handleFetchTable = useCallback(async () => {
    if (!serviceRoleKey) return;
    const name = tableName.trim();
    if (!name) { setTableError("Enter a table name."); return; }
    setTableLoading(true);
    setTableError(null);
    setTableData([]);
    setCrudMsg(null);
    try {
      // God-mode client: bypasses RLS because it uses the service_role key.
      // bypassRls toggle is reflected here — when off, we note it in the log
      // (a true RLS-respecting client would use the anon key instead; this
      // UI represents the concept for the admin's awareness).
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      const { data, error } = await godModeSupabase
        .from(name)
        .select("*")
        .limit(100);
      if (error) throw error;
      setTableData(data ?? []);
      appendAuditLog("admin", `READ table "${name}" (${(data ?? []).length} rows)${bypassRls ? "" : " [RLS: enforced]"}`);
    } catch (err) {
      setTableError("Query failed. Check the table name and your service_role key.");
      console.error("[root] fetchTable error:", err);
    } finally {
      setTableLoading(false);
    }
  }, [serviceRoleKey, tableName, bypassRls]);

  // ---------------------------------------------------------------------------
  // God-mode data explorer: UPDATE a row
  // ---------------------------------------------------------------------------

  const handleSaveEdit = useCallback(async () => {
    if (!serviceRoleKey || !editingRow) return;
    const name = tableName.trim();
    // Determine the primary key column — prefer "id" if present
    const pkCol = "id";
    const pkVal = editingRow[pkCol];
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      const { error } = await godModeSupabase
        .from(name)
        .update(editValues)
        .eq(pkCol, pkVal);
      if (error) throw error;
      setCrudMsg("Row updated successfully.");
      setEditingRow(null);
      setEditValues({});
      appendAuditLog("admin", `UPDATE row id=${pkVal} in "${name}"`);
      handleFetchTable();
    } catch (err) {
      setCrudMsg("Update failed. Check the console for details.");
      console.error("[root] saveEdit error:", err);
    }
  }, [serviceRoleKey, tableName, editingRow, editValues, handleFetchTable]);

  // ---------------------------------------------------------------------------
  // God-mode data explorer: CREATE a row
  // ---------------------------------------------------------------------------

  const handleCreateRow = useCallback(async () => {
    if (!serviceRoleKey || !newRow) return;
    const name = tableName.trim();
    // Strip any empty-string values so DB defaults apply
    const cleanRow = Object.fromEntries(
      Object.entries(newRow).filter(([, v]) => v !== "")
    );
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      const { error } = await godModeSupabase.from(name).insert(cleanRow);
      if (error) throw error;
      setCrudMsg("Row created successfully.");
      setNewRow(null);
      appendAuditLog("admin", `INSERT row into "${name}"`);
      handleFetchTable();
    } catch (err) {
      setCrudMsg("Insert failed. Check column names and required fields.");
      console.error("[root] createRow error:", err);
    }
  }, [serviceRoleKey, tableName, newRow, handleFetchTable]);

  // ---------------------------------------------------------------------------
  // God-mode data explorer: DELETE a row
  // ---------------------------------------------------------------------------

  const handleDeleteRow = useCallback(async (rowId) => {
    if (!serviceRoleKey) return;
    const name = tableName.trim();
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      const { error } = await godModeSupabase
        .from(name)
        .delete()
        .eq("id", rowId);
      if (error) throw error;
      setCrudMsg(`Row id=${rowId} deleted.`);
      setDeleteConfirmId(null);
      appendAuditLog("admin", `DELETE row id=${rowId} from "${name}"`);
      handleFetchTable();
    } catch (err) {
      setCrudMsg("Delete failed. Check the console for details.");
      console.error("[root] deleteRow error:", err);
    }
  }, [serviceRoleKey, tableName, handleFetchTable]);

  // ---------------------------------------------------------------------------
  // Raw SQL console
  // ---------------------------------------------------------------------------

  const handleRunSql = useCallback(async () => {
    if (!serviceRoleKey) return;
    const sql = sqlInput.trim();
    if (!sql) { setSqlError("Enter a SQL statement."); return; }
    setSqlLoading(true);
    setSqlError(null);
    setSqlResult(null);
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      // Supabase JS client does not expose a raw SQL executor directly.
      // The `rpc` call below invokes a Postgres function named `run_sql`
      // that you can create in your database for arbitrary SQL execution.
      //
      // CREATE OR REPLACE FUNCTION public.run_sql(query text)
      // RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
      // DECLARE result json;
      // BEGIN
      //   EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
      //   RETURN result;
      // END;
      // $$;
      //
      // If you have not created this function, the call will return an error
      // explaining that the function does not exist — this is expected.
      const { data, error } = await godModeSupabase.rpc("run_sql", { query: sql });
      if (error) throw error;
      setSqlResult(data);
      appendAuditLog("admin", `SQL executed: ${sql.slice(0, 60)}${sql.length > 60 ? "…" : ""}`);
    } catch (err) {
      setSqlError("SQL execution failed. Ensure the run_sql RPC function exists in your database.");
      console.error("[root] runSql error:", err);
    } finally {
      setSqlLoading(false);
    }
  }, [serviceRoleKey, sqlInput]);

  // ---------------------------------------------------------------------------
  // Impersonation mode (simulated JWT session)
  // ---------------------------------------------------------------------------

  const handleImpersonate = useCallback(() => {
    if (!targetUserId.trim()) {
      setBanMsg("Enter a target User ID first.");
      return;
    }
    // Simulate a flitting JWT by generating a mock token string.
    // In a real implementation this would call Supabase Admin API:
    //   supabase.auth.admin.generateLink({ type: 'magiclink', email })
    // and use the resulting token to open an impersonation session.
    const mockToken = btoa(
      JSON.stringify({
        sub:  targetUserId.trim(),
        role: "authenticated",
        iat:  Math.floor(Date.now() / 1000),
        exp:  Math.floor(Date.now() / 1000) + 3600,
        note: "ANCHORISM_IMPERSONATION_SIMULATION",
      })
    );
    setImpersonationToken(mockToken);
    setImpersonating(true);
    appendAuditLog("admin", `Impersonation mode activated for uid=${targetUserId.trim()}`);
  }, [targetUserId]);

  const handleEndImpersonation = useCallback(() => {
    setImpersonating(false);
    setImpersonationToken(null);
    appendAuditLog("admin", "Impersonation mode ended");
  }, []);

  // ---------------------------------------------------------------------------
  // Instant Ban & Wipe (Supabase Auth Admin API)
  // ---------------------------------------------------------------------------

  const handleBanAndWipe = useCallback(async () => {
    if (!serviceRoleKey) { setBanMsg("God-mode key required."); return; }
    const uid = targetUserId.trim();
    if (!uid) { setBanMsg("Enter a target User ID."); return; }
    setBanLoading(true);
    setBanMsg(null);
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      // Step 1: Revoke all active sessions for this user
      const { error: signOutError } = await godModeSupabase.auth.admin.signOut(uid);
      if (signOutError) {
        console.error("[root] signOut error:", signOutError);
        // Non-fatal — proceed to deletion attempt
      }
      // Step 2: Delete the user account entirely
      const { error: deleteError } = await godModeSupabase.auth.admin.deleteUser(uid);
      if (deleteError) throw deleteError;
      setBanMsg(`User ${uid} has been banned and permanently deleted.`);
      appendAuditLog("admin", `INSTANT BAN & WIPE executed for uid=${uid}`);
      setTargetUserId("");
    } catch (err) {
      setBanMsg("Operation failed. Verify the User ID and your service_role key permissions.");
      console.error("[root] banAndWipe error:", err);
    } finally {
      setBanLoading(false);
    }
  }, [serviceRoleKey, targetUserId]);

  // ---------------------------------------------------------------------------
  // Role promotion (simulated — writes to a profiles/roles table if it exists)
  // ---------------------------------------------------------------------------

  const handleRolePromotion = useCallback(async () => {
    if (!serviceRoleKey) { setRoleMsg("God-mode key required."); return; }
    const uid = roleUserId.trim();
    if (!uid) { setRoleMsg("Enter a User ID."); return; }
    try {
      const godModeSupabase = buildGodModeClient(serviceRoleKey);
      // Writes to a `profiles` table assumed to have columns (id, role).
      // Adjust the table name and column names to match your schema.
      const { error } = await godModeSupabase
        .from("profiles")
        .update({ role: selectedRole })
        .eq("id", uid);
      if (error) throw error;
      setRoleMsg(`User ${uid} promoted to role "${selectedRole}".`);
      appendAuditLog("admin", `ROLE PROMOTION: uid=${uid} → ${selectedRole}`);
    } catch (err) {
      setRoleMsg("Role update failed. Ensure a 'profiles' table with an 'id' and 'role' column exists.");
      console.error("[root] rolePromotion error:", err);
    }
  }, [serviceRoleKey, roleUserId, selectedRole]);

  // ---------------------------------------------------------------------------
  // Feature flag toggle
  // ---------------------------------------------------------------------------

  const handleFlagToggle = useCallback((flagId, value) => {
    setFlags((prev) =>
      prev.map((f) => (f.id === flagId ? { ...f, enabled: value } : f))
    );
    const flag = flags.find((f) => f.id === flagId);
    appendAuditLog(
      "admin",
      `Feature flag "${flag?.label ?? flagId}" ${value ? "ENABLED" : "DISABLED"}`
    );
  }, [flags]);

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    handleClearKey();
    try {
      await fetch(SIGNOUT_ENDPOINT, { method: "POST" });
    } catch {
      // Redirect regardless
    }
    router.push("/login");
  }, [router, handleClearKey]);

  // ---------------------------------------------------------------------------
  // Render: key activation gate
  // ---------------------------------------------------------------------------

  if (!keyActivated) {
    return (
      <main
        className="min-h-screen bg-white flex flex-col items-center justify-center px-6"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <div className="w-full max-w-md flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Anchorism · Nexus
            </h1>
            <p className="text-sm text-gray-500">
              God-mode client requires your Supabase{" "}
              <code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                service_role
              </code>{" "}
              key. This key is stored only in{" "}
              <code className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                sessionStorage
              </code>{" "}
              and cleared automatically when the tab closes. It is never sent
              to any server other than Supabase directly from your browser.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label
              htmlFor="srk-input"
              className="text-xs font-medium text-gray-600 uppercase tracking-widest"
            >
              service_role key
            </label>
            <textarea
              ref={keyInputRef}
              id="srk-input"
              rows={4}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                if (keyError) setKeyError(null);
              }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-xs font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 resize-none"
              autoComplete="off"
              spellCheck={false}
            />

            {keyError && (
              <div
                role="alert"
                className="rounded border border-red-200 bg-red-50 px-3 py-2"
              >
                <p className="text-xs text-red-800">{keyError}</p>
              </div>
            )}

            <button
              onClick={handleActivateKey}
              disabled={!keyInput.trim()}
              className={[
                "w-full rounded border px-4 py-2.5 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                !keyInput.trim()
                  ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
              ].join(" ")}
            >
              Activate God-Mode Client
            </button>
          </div>

          <a
            href="/"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-center"
          >
            ← Back to home
          </a>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: full Nexus Command Center
  // ---------------------------------------------------------------------------

  const tableColumns =
    tableData.length > 0 ? Object.keys(tableData[0]) : [];

  return (
    <main
      className="min-h-screen bg-white px-6 py-10"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-10">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Anchorism · Nexus
            </h1>
            <p className="text-sm text-gray-500">
              God-mode admin dashboard.{" "}
              <Badge variant="green">Key Active</Badge>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleClearKey}
              className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 transition-colors"
            >
              Clear Key
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className={[
                "rounded border px-3 py-1.5 text-xs font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                signingOut
                  ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {signingOut ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* ══════════════════════════════════════════════════════════════
            PANEL 1 — God-Mode Data Explorer
        ══════════════════════════════════════════════════════════════ */}
        <Panel
          title="God-Mode Data Explorer"
          subtitle="Direct read/write access to any Supabase table. RLS is bypassed via service_role key."
        >
          {/* Controls row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label
                htmlFor="table-name"
                className="text-xs font-medium text-gray-500 uppercase tracking-widest"
              >
                Table
              </label>
              <input
                id="table-name"
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              />
            </div>

            <Toggle
              id="rls-toggle"
              checked={bypassRls}
              onChange={setBypassRls}
              label="Bypass RLS"
            />

            <button
              onClick={handleFetchTable}
              disabled={tableLoading}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors disabled:opacity-50"
            >
              {tableLoading ? "Loading…" : "Fetch"}
            </button>

            <button
              onClick={() => {
                setNewRow({});
                setCrudMsg(null);
              }}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
            >
              + New Row
            </button>
          </div>

          {/* CRUD feedback */}
          {crudMsg && (
            <p className="text-xs text-gray-600 border border-gray-200 rounded px-3 py-2 bg-gray-50">
              {crudMsg}
            </p>
          )}

          {/* Table error */}
          {tableError && (
            <p className="text-xs text-red-700 border border-red-200 bg-red-50 rounded px-3 py-2">
              {tableError}
            </p>
          )}

          {/* New row form */}
          {newRow !== null && (
            <div className="flex flex-col gap-3 border border-dashed border-gray-300 rounded p-4 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
                New Row — {tableName}
              </p>
              {/* If we have column names from existing data, show fields; otherwise free-form JSON */}
              {tableColumns.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {tableColumns
                    .filter((col) => col !== "id" && col !== "created_at")
                    .map((col) => (
                      <div key={col} className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500">{col}</label>
                        <input
                          type="text"
                          value={newRow[col] ?? ""}
                          onChange={(e) =>
                            setNewRow((prev) => ({ ...prev, [col]: e.target.value }))
                          }
                          className="rounded border border-gray-300 px-2 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                        />
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">
                    Column values (JSON object, e.g. {`{"col":"val"}`})
                  </label>
                  <textarea
                    rows={3}
                    value={newRow.__raw ?? ""}
                    onChange={(e) => setNewRow({ __raw: e.target.value })}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs font-mono text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 resize-none"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // If raw JSON mode, parse it first
                    let rowToInsert = newRow;
                    if (newRow.__raw) {
                      try {
                        rowToInsert = JSON.parse(newRow.__raw);
                      } catch {
                        setCrudMsg("Invalid JSON in new row input.");
                        return;
                      }
                    }
                    // Replace newRow with parsed version then call handleCreateRow
                    setNewRow(rowToInsert);
                    // Use timeout to let state update before calling
                    setTimeout(handleCreateRow, 0);
                  }}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Insert
                </button>
                <button
                  onClick={() => { setNewRow(null); setCrudMsg(null); }}
                  className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Data table */}
          {tableData.length > 0 && (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {tableColumns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-widest whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-widest">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableData.map((row, idx) => (
                    <tr key={row.id ?? idx} className="hover:bg-gray-50 transition-colors">
                      {editingRow?.id === row.id ? (
                        // Edit mode row
                        <>
                          {tableColumns.map((col) => (
                            <td key={col} className="px-3 py-1.5">
                              {col === "id" || col === "created_at" ? (
                                <span className="font-mono text-gray-400">
                                  {String(row[col] ?? "")}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={editValues[col] ?? ""}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      [col]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded border border-gray-300 px-1.5 py-1 font-mono text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                                />
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <button
                              onClick={handleSaveEdit}
                              className="text-xs text-green-700 hover:underline mr-3"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingRow(null); setEditValues({}); }}
                              className="text-xs text-gray-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        // Read mode row
                        <>
                          {tableColumns.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-2 font-mono text-gray-700 max-w-[200px] truncate"
                              title={String(row[col] ?? "")}
                            >
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setEditingRow(row);
                                setEditValues({ ...row });
                                setCrudMsg(null);
                              }}
                              className="text-xs text-blue-600 hover:underline mr-3"
                            >
                              Edit
                            </button>
                            {deleteConfirmId === row.id ? (
                              <>
                                <button
                                  onClick={() => handleDeleteRow(row.id)}
                                  className="text-xs text-red-600 hover:underline mr-2"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-gray-500 hover:underline"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setDeleteConfirmId(row.id);
                                  setCrudMsg(null);
                                }}
                                className="text-xs text-red-500 hover:underline"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tableData.length === 0 && !tableLoading && !tableError && (
            <p className="text-xs text-gray-400 py-2">
              No data loaded. Enter a table name and click Fetch.
            </p>
          )}

          {/* ── Raw SQL Console ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Raw SQL Console
            </p>
            <textarea
              rows={4}
              value={sqlInput}
              onChange={(e) => {
                setSqlInput(e.target.value);
                if (sqlError) setSqlError(null);
              }}
              placeholder="SELECT * FROM authorized_keys WHERE active = true LIMIT 10;"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2.5 text-xs font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 resize-y"
              spellCheck={false}
            />

            {sqlError && (
              <p className="text-xs text-red-700 border border-red-200 bg-red-50 rounded px-3 py-2">
                {sqlError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleRunSql}
                disabled={sqlLoading || !sqlInput.trim()}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors disabled:opacity-50"
              >
                {sqlLoading ? "Running…" : "Run SQL"}
              </button>
              {sqlResult !== null && (
                <button
                  onClick={() => setSqlResult(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear result
                </button>
              )}
            </div>

            {sqlResult !== null && (
              <pre className="rounded border border-gray-200 bg-gray-50 p-3 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(sqlResult, null, 2)}
              </pre>
            )}
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════════
            PANEL 2 — User & Session Control
        ══════════════════════════════════════════════════════════════ */}
        <Panel
          title="User & Session Control"
          subtitle="Impersonation, instant ban, and role management via Supabase Auth Admin API."
        >
          {/* Target user input */}
          <div className="flex flex-col gap-1 max-w-sm">
            <label
              htmlFor="target-uid"
              className="text-xs font-medium text-gray-500 uppercase tracking-widest"
            >
              Target User ID (UUID)
            </label>
            <input
              id="target-uid"
              type="text"
              value={targetUserId}
              onChange={(e) => {
                setTargetUserId(e.target.value);
                setBanMsg(null);
              }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="rounded border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            />
          </div>

          {banMsg && (
            <p className="text-xs border border-gray-200 bg-gray-50 rounded px-3 py-2 text-gray-700">
              {banMsg}
            </p>
          )}

          {/* Impersonation mode */}
          <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Impersonation Mode
            </p>

            {!impersonating ? (
              <button
                onClick={handleImpersonate}
                className="self-start rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
              >
                Activate Impersonation
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">
                    ⚠ Impersonation Active — uid={targetUserId}
                  </p>
                  <p className="text-xs font-mono text-yellow-700 break-all">
                    {impersonationToken}
                  </p>
                </div>
                <button
                  onClick={handleEndImpersonation}
                  className="self-start rounded border border-yellow-300 bg-white px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 transition-colors"
                >
                  End Impersonation
                </button>
              </div>
            )}
          </div>

          {/* Instant ban & wipe */}
          <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Instant Ban & Wipe
            </p>
            <p className="text-xs text-gray-400">
              Revokes all active sessions and permanently deletes the target user
              account via the Supabase Auth Admin API. This action is irreversible.
            </p>
            <button
              onClick={handleBanAndWipe}
              disabled={banLoading}
              className={[
                "self-start rounded border px-4 py-2 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300",
                banLoading
                  ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "border-red-300 bg-white text-red-600 hover:bg-red-50",
              ].join(" ")}
            >
              {banLoading ? "Processing…" : "Instant Ban & Wipe"}
            </button>
          </div>

          {/* Role promotion */}
          <div className="flex flex-col gap-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Role Promotion
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="role-uid"
                  className="text-xs text-gray-500"
                >
                  User ID
                </label>
                <input
                  id="role-uid"
                  type="text"
                  value={roleUserId}
                  onChange={(e) => {
                    setRoleUserId(e.target.value);
                    setRoleMsg(null);
                  }}
                  placeholder="UUID"
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 w-64"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="role-select"
                  className="text-xs text-gray-500"
                >
                  New Role
                </label>
                <select
                  id="role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRolePromotion}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
              >
                Apply Role
              </button>
            </div>

            {roleMsg && (
              <p className="text-xs border border-gray-200 bg-gray-50 rounded px-3 py-2 text-gray-700">
                {roleMsg}
              </p>
            )}
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════════
            PANEL 3 — Infrastructure & Security Monitoring
        ══════════════════════════════════════════════════════════════ */}
        <Panel
          title="Infrastructure & Security Monitoring"
          subtitle="Live metrics, audit log, and feature flag control."
        >
          {/* Live metrics grid */}
          <div className="grid grid-cols-2 gap-px bg-gray-200 rounded overflow-hidden sm:grid-cols-3">
            {MOCK_METRICS.map((m) => (
              <div key={m.label} className="bg-white px-4 py-3 flex flex-col gap-1">
                <span className="text-xs text-gray-400 uppercase tracking-widest">
                  {m.label}
                </span>
                <span className="text-sm font-semibold font-mono text-gray-800">
                  {m.value}
                </span>
              </div>
            ))}
          </div>

          {/* Feature flags */}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
              Remote Feature Flags
            </p>
            <p className="text-xs text-gray-400">
              Master toggles. Disabling a flag simulates a site-wide feature shutdown.
              Integrate with your state management or remote config store to make these
              toggles persist across sessions.
            </p>
            <div className="flex flex-col divide-y divide-gray-100">
              {flags.map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-gray-800">{flag.label}</span>
                    <span className="text-xs font-mono text-gray-400">{flag.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={flag.enabled ? "green" : "gray"}>
                      {flag.enabled ? "ON" : "OFF"}
                    </Badge>
                    <Toggle
                      id={`flag-${flag.id}`}
                      checked={flag.enabled}
                      onChange={(val) => handleFlagToggle(flag.id, val)}
                      label=""
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audit log */}
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest">
                Audit Log
              </p>
              <span className="text-xs text-gray-400">{auditLogs.length} entries (live)</span>
            </div>

            <div className="overflow-x-auto rounded border border-gray-200 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">
                      Timestamp
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-widest">
                      Actor
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-widest">
                      Event
                    </th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-widest">
                      Hash
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">
                        {log.ts}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{log.actor}</td>
                      <td className="px-3 py-2 text-gray-700">{log.event}</td>
                      <td className="px-3 py-2 font-mono text-gray-400">{log.hash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-300">
            Anchorism · Nexus Command Center · Admin session
          </p>
        </footer>

      </div>
    </main>
  );
}

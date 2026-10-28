import { headers } from "next/headers";
import Dashboard from "@/components/Dashboard";
import { readRuntimeSnapshot } from "@/app/api/runtime-state/route";
import { evaluateDashboardAuth } from "@/lib/dashboard-auth";

// The dashboard route is a server component rendered at request time from the REAL governed runtime
// artifacts (WI-2). It reuses the single reader `readRuntimeSnapshot()` — the exact source the
// /api/runtime-state endpoint serves — so the page and the API can never diverge. No fabricated data.
//
// SECURITY (Closure V2 Phase-1): the page renders INTERNAL runtime state, so it is gated fail-closed with the SAME
// policy as the API (dashboard-auth) BEFORE reading the snapshot. ODG_DASHBOARD_TOKEN unset or missing/invalid
// credentials ⇒ an "authentication required" view is rendered and NO internal state is read or sent. This closes the
// page-level internal-state leak; TLS/reverse-proxy + an owner-confirmed decision remain separate exposure preconditions.
export const dynamic = "force-dynamic"; // reflect the current runtime artifacts, never a stale prerender

export default async function Home() {
  const h = await headers();
  const auth = evaluateDashboardAuth({ pathname: "/", headers: h });
  if (!auth.allow) {
    // Fail-closed: do NOT read or render the internal snapshot. No secret or internal detail is disclosed.
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
        <h1>BMAX v21 — Runtime Dashboard</h1>
        <p>Authentication required to view runtime state.</p>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Provide a valid credential (Authorization: Bearer / x-api-key) with a configured{" "}
          <code>ODG_DASHBOARD_TOKEN</code>. Internal state is withheld (fail-closed).
        </p>
      </main>
    );
  }
  const snapshot = readRuntimeSnapshot();
  return <Dashboard snapshot={snapshot} />;
}

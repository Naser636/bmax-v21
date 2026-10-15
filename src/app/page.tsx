import Dashboard from "@/components/Dashboard";
import { readRuntimeSnapshot } from "@/app/api/runtime-state/route";

// The dashboard route is a server component rendered at request time from the REAL governed runtime
// artifacts (WI-2). It reuses the single reader `readRuntimeSnapshot()` — the exact source the
// /api/runtime-state endpoint serves — so the page and the API can never diverge. No fabricated data.
export const dynamic = "force-dynamic"; // reflect the current runtime artifacts, never a stale prerender

export default function Home() {
  const snapshot = readRuntimeSnapshot();
  return <Dashboard snapshot={snapshot} />;
}

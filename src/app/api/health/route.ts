/*
 * GET /api/health — READ-ONLY HTTP health / readiness endpoint for an external probe (load balancer,
 * orchestrator, uptime monitor) — the HTTP counterpart of the CLI `odg health` / `odg client launch`.
 *
 * Readiness here means ONLY: this instance can serve and persist client intake, i.e. the persistent
 * store (`ODG_CLIENT_STORE`) is configured, present and readable. It is deliberately NARROW:
 *   - 200 { status:"ready", storage:"READY" }  only when the store resolves to a readable directory.
 *   - 503 otherwise (NOT_CONFIGURED / MISSING / BLOCKED / UNKNOWN), fail-closed.
 * It does NOT prove live autonomy, provider availability, external reachability, or production
 * availability — a 200 means "this process can accept intake", nothing more.
 *
 * STRICTLY READ-ONLY: it never writes the filesystem (no writability probe — that would mutate the
 * store; true write-readiness is enforced at the /api/intake boundary which fail-closes at request
 * time), spawns no process, opens no network, and exposes no secrets, tokens, internal paths or
 * payloads — the response is a fixed minimal shape.
 *
 * Mirrors the production store precedence of runtime/core/client-intake.js (env ODG_CLIENT_STORE), but
 * read-only by design. Node.js runtime, request-time (never cached/prerendered).
 *
 * Next 16 Route Handler — see node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { statSync, accessSync, readFileSync, constants as fsConstants } from "node:fs";
import { resolve as resolvePath, join as joinPath } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; reflect current env/fs, never cached

type StorageState = "READY" | "NOT_CONFIGURED" | "MISSING" | "BLOCKED" | "UNKNOWN";

/*
 * Deployed BUILD_ID exposure (CM-2, deploy-hygiene observability). Returns the build identity THIS running
 * process was deployed with, so an external check can compare served-vs-on-disk and fail closed on drift
 * (e.g. a replacing `next build` left the live process on a deleted standalone). Resolution order:
 *   1) ODG_DEPLOYED_BUILD_ID — an explicit deploy-time env is the RELIABLE marker: it is stamped at restart
 *      and is immune to later on-disk rebuilds (the correct long-term wiring).
 *   2) else read the standalone's own .next/BUILD_ID ONCE and memoize it — captured at the first request
 *      (normally the post-deploy health probe, before any replacing build), fixed for the process lifetime.
 * Fail-closed to null (an unreadable id never breaks the endpoint and is reported as null, never guessed).
 * No secret, no path, no payload is exposed — only the opaque build hash.
 */
let _buildId: string | null | undefined; // undefined = not yet resolved
function deployedBuildId(): string | null {
  if (_buildId !== undefined) return _buildId;
  const env = process.env.ODG_DEPLOYED_BUILD_ID;
  if (typeof env === "string" && env.trim() !== "") { _buildId = env.trim(); return _buildId; }
  for (const p of [joinPath(process.cwd(), ".next", "BUILD_ID"), resolvePath(".next/BUILD_ID")]) {
    try { const v = readFileSync(p, "utf8").trim(); if (v) { _buildId = v; return _buildId; } } catch { /* try next candidate */ }
  }
  _buildId = null;
  return _buildId;
}

/** Read-only resolution of persistent-store readiness from ODG_CLIENT_STORE. Never writes. */
export function assessStorage(): StorageState {
  const raw = process.env.ODG_CLIENT_STORE;
  if (typeof raw !== "string" || raw.trim() === "") return "NOT_CONFIGURED";
  let base: string;
  try {
    base = resolvePath(raw);
  } catch {
    return "UNKNOWN";
  }
  try {
    const st = statSync(base);
    if (!st.isDirectory()) return "BLOCKED";
    accessSync(base, fsConstants.R_OK); // read-only access check — no write probe
    return "READY";
  } catch (e: unknown) {
    const code = (e as { code?: string } | null)?.code;
    return code === "ENOENT" ? "MISSING" : "BLOCKED";
  }
}

export async function GET(): Promise<Response> {
  let storage: StorageState;
  try {
    storage = assessStorage();
  } catch {
    storage = "UNKNOWN"; // fail-closed on any unexpected error
  }
  const ready = storage === "READY";
  const body = JSON.stringify({
    status: ready ? "ready" : "not_ready",
    storage,
    buildId: deployedBuildId(), // CM-2: deployed build identity (null if unresolved) — for served-vs-disk drift checks
    checkedAt: new Date().toISOString(),
  });
  return new Response(body, {
    status: ready ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

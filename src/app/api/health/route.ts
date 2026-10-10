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
import { statSync, accessSync, constants as fsConstants } from "node:fs";
import { resolve as resolvePath } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; reflect current env/fs, never cached

type StorageState = "READY" | "NOT_CONFIGURED" | "MISSING" | "BLOCKED" | "UNKNOWN";

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
    checkedAt: new Date().toISOString(),
  });
  return new Response(body, {
    status: ready ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

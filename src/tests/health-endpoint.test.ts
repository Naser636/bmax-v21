/*
 * Validation harness — GET /api/health (read-only HTTP readiness endpoint).
 *
 * Drives the real route handler with isolated tmp dirs + env (same discipline as
 * runtime/core/deployment-readiness.test.js): healthy, not-configured, missing, blocked; response
 * codes/shape; no-secret / no-path leak; and the READ-ONLY invariant (the probe writes nothing — in
 * particular it must NOT create client-intake's `.intake-probe`). No network, no provider, no fs writes.
 *
 * Run: npx tsx src/tests/health-endpoint.test.ts
 */
import { GET } from "@/app/api/health/route";
import { mkdtempSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

let passed = 0;
function ok(name: string, cond: boolean): void {
  assert.ok(cond, name);
  console.log("  ok -", name);
  passed += 1;
}
const tmp = (): string => mkdtempSync(join(tmpdir(), "odg-health-"));
const save = { ODG_CLIENT_STORE: process.env.ODG_CLIENT_STORE };
function restore(): void {
  if (save.ODG_CLIENT_STORE === undefined) delete process.env.ODG_CLIENT_STORE; else process.env.ODG_CLIENT_STORE = save.ODG_CLIENT_STORE;
}
async function call(): Promise<{ status: number; body: Record<string, unknown>; cache: string | null; ctype: string | null }> {
  const res = await GET();
  return { status: res.status, body: JSON.parse(await res.text()), cache: res.headers.get("cache-control"), ctype: res.headers.get("content-type") };
}

(async () => {
  // 1 — READY: configured + present directory ⇒ 200 ready
  const store = tmp();
  process.env.ODG_CLIENT_STORE = store;
  const r1 = await call();
  ok("1 configured readable store ⇒ 200", r1.status === 200);
  ok("1b status=ready, storage=READY", r1.body.status === "ready" && r1.body.storage === "READY");

  // 2 — NOT_CONFIGURED: store env unset ⇒ 503 (health keys purely on ODG_CLIENT_STORE)
  delete process.env.ODG_CLIENT_STORE;
  const r2 = await call();
  ok("2 unconfigured ⇒ 503", r2.status === 503);
  ok("2b storage=NOT_CONFIGURED (fail-closed)", r2.body.status === "not_ready" && r2.body.storage === "NOT_CONFIGURED");

  // 3 — MISSING: configured path does not exist ⇒ 503
  process.env.ODG_CLIENT_STORE = join(store, "does", "not", "exist");
  const r3 = await call();
  ok("3 missing store path ⇒ 503 MISSING", r3.status === 503 && r3.body.storage === "MISSING");

  // 4 — BLOCKED: path is a file, not a directory ⇒ 503
  const f = join(store, "a-file");
  writeFileSync(f, "x");
  process.env.ODG_CLIENT_STORE = f;
  const r4 = await call();
  ok("4 non-directory store ⇒ 503 BLOCKED", r4.status === 503 && r4.body.storage === "BLOCKED");

  // 5 — response shape minimal + no secret / no path leak
  process.env.ODG_CLIENT_STORE = store;
  const r5 = await call();
  const keys = Object.keys(r5.body).sort().join(",");
  ok("5 response shape = checkedAt,status,storage only", keys === "checkedAt,status,storage");
  const blob = JSON.stringify(r5.body);
  ok("5b no store path leaked in body", !blob.includes(store));
  ok("5c no secret-ish token leaked", !/sk-|api[_-]?key|token|secret|credential/i.test(blob));
  ok("5d headers: json + no-store", r5.ctype === "application/json" && r5.cache === "no-store");

  // 6 — READ-ONLY invariant: a readiness check writes NOTHING into the store (no .intake-probe, no new files)
  const store2 = tmp();
  mkdirSync(join(store2, "requests"), { recursive: true });
  const before = readdirSync(store2).sort().join(",");
  process.env.ODG_CLIENT_STORE = store2;
  await call();
  await call();
  const after = readdirSync(store2).sort().join(",");
  ok("6 health check mutated nothing in the store (read-only)", before === after);
  ok("6b no .intake-probe created by health", !readdirSync(store2).includes(".intake-probe"));

  restore();
  console.log(`\nALL PASS — GET /api/health (${passed} assertions)`);
  process.exit(0);
})().catch((e) => { restore(); console.error(e); process.exit(1); });

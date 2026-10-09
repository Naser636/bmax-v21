/*
 * /api/intake Route Handler — server-side integration test (offline). Drives the REAL exported POST with
 * Web Request/Response, in an isolated temp cwd. No network, no deployment.
 */
import { POST } from "../app/api/intake/route";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";

let passed = 0;
function ok(name: string, cond: boolean): void { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

async function post(body: string, cwd: string, contentType = "application/json"): Promise<{ status: number; json: Record<string, unknown> }> {
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const res = await POST(new Request("http://local/api/intake", { method: "POST", headers: { "content-type": contentType }, body }));
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text); } catch { /* non-json */ }
    return { status: res.status, json };
  } finally {
    process.chdir(prev);
  }
}

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "route-")); }
const COMPLETE = { client: "Acme", problem: "convert csv", scope: "one script", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true };

(async () => {
  // 1 — website POST → server endpoint → persisted intake (success only after persistence).
  {
    const cwd = tmp();
    const r = await post(JSON.stringify(COMPLETE), cwd);
    ok("1 valid POST ⇒ 201 + persisted requestId", r.status === 201 && r.json.ok === true && r.json.requestId === "CLIENT-001");
    ok("1 record durably persisted on disk", fs.existsSync(path.join(cwd, "runtime/generated/clients/requests/CLIENT-001.json")));
  }
  // 2 — invalid (incomplete) ⇒ 202 HELD; oversized ⇒ 413; wrong content-type ⇒ 415; malformed ⇒ 400.
  {
    const cwd = tmp();
    ok("2 incomplete ⇒ 202 HELD", (await post(JSON.stringify({ client: "x", consent: true }), cwd)).status === 202);
    ok("2 oversized ⇒ 413", (await post("x".repeat(20000), cwd)).status === 413);
    ok("2 wrong content-type ⇒ 415", (await post("{}", cwd, "text/plain")).status === 415);
    ok("2 malformed JSON ⇒ 400", (await post("{bad", cwd)).status === 400);
  }
  // 3 — client-provided consent string is NOT trusted (consent must be boolean true ⇒ else HELD).
  {
    const cwd = tmp();
    const r = await post(JSON.stringify({ ...COMPLETE, consent: "true" }), cwd);
    ok("3 untrusted consent ⇒ HELD (not auto-accepted)", r.json.status === "HELD");
  }
  console.log(`\nINTAKE ROUTE (/api/intake) — ${passed} assertions passed.`);
})().catch((e) => { console.error("ROUTE TEST ERROR:", e && (e as Error).stack); process.exit(1); });

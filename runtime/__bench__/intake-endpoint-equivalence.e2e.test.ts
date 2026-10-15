#!/usr/bin/env node
/*
 * LOT intake-endpoint — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/intake-endpoint.ts →
 * runtime/dist/core/intake-endpoint.js; build-dist-closure co-locates its dep (client-intake.js) in
 * dist/core so the compiled handler resolves require("./client-intake"). Both the JS and TS handlers
 * delegate to the SAME historical client-intake, so only the handler differs. Each stateful case uses a
 * FRESH temp cwd (non-production ⇒ store READY, writable), so responses are BYTE-IDENTICAL.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/intake-endpoint-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "intake-endpoint.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "intake-endpoint.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT intake-endpoint — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/intake-endpoint.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/intake-endpoint.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "client-intake.js")), "prerequisite: dep client-intake.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.handleIntakeRequest === "function" && typeof ts.handleIntakeRequest === "function", "both export handleIntakeRequest");
check(js.MAX_BODY_BYTES === ts.MAX_BODY_BYTES && js.MAX_BODY_BYTES === 16 * 1024, "MAX_BODY_BYTES identical (16KiB)");

const JSONH = { "content-type": "application/json" };
const COMPLETE = { client: "Acme", problem: "convert csv", scope: "one script", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true };
const temps: string[] = [];
function cwd(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "endpoint-"));
  temps.push(d);
  return d;
}
// Compare both handlers on the same request, each in its OWN fresh cwd (independent CLIENT-001).
function same(label: string, req: any): void {
  const rJ = js.handleIntakeRequest(req, { cwd: cwd() });
  const rT = ts.handleIntakeRequest(req, { cwd: cwd() });
  check(EQ(rJ, rT), `${label} BYTE-IDENTICAL (status ${rJ.status})`);
}

try {
  // Pure validation branches (no store needed, but a cwd keeps the store READY path consistent).
  same("non-object req ⇒ 400", undefined);
  same("GET ⇒ 405", { method: "GET", headers: JSONH, body: "" });
  same("non-json ctype ⇒ 415", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  same("oversize ⇒ 413", { method: "POST", headers: JSONH, body: "x".repeat(js.MAX_BODY_BYTES + 1) });
  same("malformed JSON ⇒ 400", { method: "POST", headers: JSONH, body: "{bad" });
  same("JSON non-object ⇒ 400", { method: "POST", headers: JSONH, body: "[1,2]" });
  // Persistence branches (store READY via fresh cwd).
  same("complete POST ⇒ 201 NEW", { method: "POST", headers: JSONH, body: JSON.stringify(COMPLETE) });
  same("incomplete ⇒ 202 HELD", { method: "POST", headers: JSONH, body: JSON.stringify({ client: "x", problem: "y", consent: true }) });
  same("consent!=true ⇒ 202 HELD (not auto-consented)", { method: "POST", headers: JSONH, body: JSON.stringify({ ...COMPLETE, consent: "yes" }) });

  // Spot-check the 201 body shape is right (not just equal).
  const r = js.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify(COMPLETE) }, { cwd: cwd() });
  const b = JSON.parse(r.body);
  check(r.status === 201 && b.ok === true && b.requestId === "CLIENT-001" && b.status === "NEW", "201 body: {ok:true, CLIENT-001, NEW}");
} finally {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT intake-endpoint EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
/*
 * LOT fleet-envelope — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/fleet-envelope.ts →
 * runtime/dist/core/fleet-envelope.js (LEAF, deps=0). CWD-relative dirs ⇒ a seeded temp cwd makes
 * readJsonSafe/writeJson/makeRequestId fully deterministic ⇒ BYTE-IDENTICAL. buildRequest carries a
 * real new Date().toISOString() createdAt (genuinely non-deterministic env value, NOT a behavioural
 * diff): compared with ONLY createdAt normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/fleet-envelope-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "fleet-envelope.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "fleet-envelope.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT fleet-envelope — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/fleet-envelope.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/fleet-envelope.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const EXPORTS = ["REQUESTS_DIR", "RESPONSES_DIR", "STATUS", "readJsonSafe", "writeJson", "requestPath", "responsePath", "makeRequestId", "buildRequest", "validateRequest", "validateResponse"];
for (const x of EXPORTS) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.STATUS, ts.STATUS) && js.REQUESTS_DIR === ts.REQUESTS_DIR && js.RESPONSES_DIR === ts.RESPONSES_DIR, "constants (STATUS/dirs) byte-identical");
check(js.requestPath("m-001") === ts.requestPath("m-001") && js.responsePath("m-001") === ts.responsePath("m-001"), "requestPath/responsePath identical");

// validate* over a matrix of shapes (pure).
const REQ_CASES = [undefined, {}, { requestId: 1, agent: "a", status: "PENDING", mission: "M" }, { requestId: 1, agent: "a" }];
for (const [i, c] of REQ_CASES.entries()) check(EQ(js.validateRequest(c), ts.validateRequest(c)), `validateRequest[${i}] BYTE-IDENTICAL`);
const RESP_CASES = [undefined, {}, { requestId: 1, agent: "a", proposal: { mission: "M", summary: "s", actions: [] } }, { requestId: 1, agent: "a", proposal: { mission: "M" } }, { requestId: 1, agent: "a", proposal: { mission: "M", summary: "s", actions: "nope" } }];
for (const [i, c] of RESP_CASES.entries()) check(EQ(js.validateResponse(c), ts.validateResponse(c)), `validateResponse[${i}] BYTE-IDENTICAL`);

const origCwd = process.cwd();
const temps: string[] = [];
const normReq = (r: any) => ({ ...r, createdAt: "<ts>" });
try {
  // makeRequestId + writeJson/readJsonSafe over a seeded cwd.
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "fenvJ-")); temps.push(d1); process.chdir(d1);
  check(js.makeRequestId("ALPHA") === "ALPHA-001" && ts.makeRequestId("ALPHA") === "ALPHA-001", "makeRequestId empty dir ⇒ <mission>-001");
  // seed two existing requests and confirm max+1 padded.
  fs.mkdirSync(js.REQUESTS_DIR, { recursive: true });
  fs.writeFileSync(js.requestPath("ALPHA-001"), "{}");
  fs.writeFileSync(js.requestPath("ALPHA-007"), "{}");
  check(js.makeRequestId("ALPHA") === "ALPHA-008" && ts.makeRequestId("ALPHA") === "ALPHA-008", "makeRequestId ⇒ max(existing)+1 padded (008)");

  // writeJson → readJsonSafe round-trip; corrupt + missing ⇒ null.
  const f = js.requestPath("RT-001");
  js.writeJson(f, { a: 1, b: [2, 3] });
  check(EQ(js.readJsonSafe(f), { a: 1, b: [2, 3] }) && EQ(ts.readJsonSafe(f), { a: 1, b: [2, 3] }), "writeJson→readJsonSafe round-trip (both read same file)");
  check(js.readJsonSafe(js.requestPath("NOPE")) === null && ts.readJsonSafe(ts.requestPath("NOPE")) === null, "readJsonSafe(missing) ⇒ null (both)");
  fs.writeFileSync(js.requestPath("BAD"), "{nope");
  check(js.readJsonSafe(js.requestPath("BAD")) === null && ts.readJsonSafe(ts.requestPath("BAD")) === null, "readJsonSafe(corrupt) ⇒ null (both)");

  // buildRequest in separate clean cwds (createdAt normalised).
  const dJ = fs.mkdtempSync(path.join(os.tmpdir(), "fbJ-")); temps.push(dJ); process.chdir(dJ);
  const bJ = js.buildRequest({ mission: "M", agent: "claude" });
  const dT = fs.mkdtempSync(path.join(os.tmpdir(), "fbT-")); temps.push(dT); process.chdir(dT);
  const bT = ts.buildRequest({ mission: "M", agent: "claude" });
  check(EQ(normReq(bJ), normReq(bT)), "buildRequest BYTE-IDENTICAL (createdAt normalised)");
  check(bJ.requestId === "M-001" && bJ.status === "PENDING" && bJ.attempt === 1 && EQ(bJ.brief, { mission: "M" }) && bJ.instruction === "", "buildRequest defaults: id/status/attempt/brief/instruction");
  const bJ2 = js.buildRequest({ mission: "M", agent: "a", brief: { x: 1 }, instruction: "do" });
  const bT2 = ts.buildRequest({ mission: "M", agent: "a", brief: { x: 1 }, instruction: "do" });
  check(EQ(normReq(bJ2), normReq(bT2)) && EQ(bJ2.brief, { x: 1 }) && bJ2.instruction === "do", "buildRequest honours provided brief/instruction (both)");
} finally {
  process.chdir(origCwd);
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT fleet-envelope EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

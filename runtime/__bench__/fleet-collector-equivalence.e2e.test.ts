#!/usr/bin/env node
/*
 * LOT fleet-collector — EQUIVALENCE (historical .js vs compiled .ts). The module's ONLY impure points —
 * two child-process calls, the clock, the governance gate, the ledger write — are INJECTED seams (opts.spawn,
 * opts.nowIso, opts.authorize, opts.record), so this bench drives the whole collect() flow with NO real
 * subprocess / clock / governance read / ledger write. It seeds a THROWAWAY cwd with fleet-envelope
 * request+response files, runs collect() on BOTH modules with identical inputs, and compares the return value
 * AND the mutated request envelope BYTE-IDENTICAL across every branch (correlation, validation, parser/
 * analyzer rejection, governance refusal, and the VALIDATED path). Production defaults are untouched.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/fleet-collector-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "fleet-collector.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "fleet-collector.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT fleet-collector — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
check(typeof js.collect === "function" && typeof ts.collect === "function", "both export collect");

const NOW = "2026-01-01T00:00:00.000Z";
// spawn seam: response-parser (args[0] ends response-parser.js) and proposal-analyzer each return a status.
const mkSpawn = (parserStatus: number, analyzerStatus: number) => (cmd: any, args: any) => {
  const target = Array.isArray(args) ? String(args[0] || "") : "";
  if (target.includes("response-parser")) return { status: parserStatus, stdout: "", stderr: "" };
  if (target.includes("proposal-analyzer")) return { status: analyzerStatus, stdout: "", stderr: "" };
  return { status: 0, stdout: "", stderr: "" };
};
const okSpawn = mkSpawn(0, 0);
const authorized = () => ({ authorized: true });
const refused = () => ({ authorized: false });

// Seed a throwaway cwd with the given request/response envelopes; run collect(id, opts) there; return the
// collect() result AND the request-file content after the call. Repo + host untouched (temp cwd only).
function runIn(mod: any, seed: { request?: any; response?: any }, requestId: string, opts: any): any {
  const cwd0 = process.cwd();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "flc-"));
  const reqDir = path.join(d, "runtime", "generated", "fleet", "requests");
  const resDir = path.join(d, "runtime", "generated", "fleet", "responses");
  fs.mkdirSync(reqDir, { recursive: true }); fs.mkdirSync(resDir, { recursive: true });
  if (seed.request !== undefined) fs.writeFileSync(path.join(reqDir, requestId + ".json"), JSON.stringify(seed.request));
  if (seed.response !== undefined) fs.writeFileSync(path.join(resDir, requestId + ".json"), JSON.stringify(seed.response));
  let result: any, reqAfter: any = null, threw: any = null;
  try {
    process.chdir(d);
    result = mod.collect(requestId, opts);
    try { reqAfter = JSON.parse(fs.readFileSync(path.join(reqDir, requestId + ".json"), "utf8")); } catch { reqAfter = null; }
  } catch (e: any) { threw = String(e && e.message || e); }
  finally { process.chdir(cwd0); try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
  return { result, reqAfter, threw };
}
// Drive BOTH modules identically; compare return + mutated request envelope byte-identical.
function both(seed: any, requestId: string, opts: any): { eq: boolean; js: any } {
  const j = runIn(js, seed, requestId, opts); const t = runIn(ts, seed, requestId, opts);
  return { eq: EQ(j.result, t.result) && EQ(j.reqAfter, t.reqAfter) && EQ(j.threw, t.threw), js: j };
}

const req = (mission = "M", requestId = "M-001") => ({ requestId, agent: "a", status: "PENDING", mission });
const res = (requestId = "M-001") => ({ requestId, agent: "a", proposal: { mission: "M", summary: "s", actions: [{ x: 1 }, { x: 2 }] } });
const seamsOK = { spawn: okSpawn, nowIso: NOW, authorize: authorized, record: null };

// (0) missing requestId ⇒ throws (both)
check(both({}, "", seamsOK).eq && both({}, "", seamsOK).js.threw && /Missing requestId/.test(both({}, "", seamsOK).js.threw), "missing requestId ⇒ throws byte-identical");

// (1) no correlated request ⇒ FAILED
{ const r = both({ response: res() }, "M-001", seamsOK); check(r.eq && r.js.result.status === "FAILED" && r.js.result.reason === "No correlated request", "no request ⇒ FAILED 'No correlated request' byte-identical"); }

// (2) no response ⇒ FAILED (request marked FAILED with injected nowIso)
{ const r = both({ request: req() }, "M-001", seamsOK); check(r.eq && r.js.result.reason === "No response found" && r.js.reqAfter.status === "FAILED" && r.js.reqAfter.failedAt === NOW, "no response ⇒ FAILED + request.failedAt=injected now byte-identical"); }

// (3) requestId mismatch ⇒ FAILED
{ const r = both({ request: req(), response: res("OTHER") }, "M-001", seamsOK); check(r.eq && r.js.result.reason === "RequestId mismatch", "requestId mismatch ⇒ FAILED byte-identical"); }

// (4) invalid response (missing proposal fields) ⇒ FAILED
{ const r = both({ request: req(), response: { requestId: "M-001", agent: "a", proposal: {} } }, "M-001", seamsOK); check(r.eq && /Invalid response/.test(r.js.result.reason), "invalid response ⇒ FAILED 'Invalid response' byte-identical"); }

// (5) response-parser rejects (spawn status 1) ⇒ FAILED
{ const r = both({ request: req(), response: res() }, "M-001", { ...seamsOK, spawn: mkSpawn(1, 0) }); check(r.eq && r.js.result.reason === "response-parser rejected proposal", "parser reject ⇒ FAILED byte-identical"); }

// (6) proposal-analyzer fails (parser ok, analyzer 1) ⇒ FAILED
{ const r = both({ request: req(), response: res() }, "M-001", { ...seamsOK, spawn: mkSpawn(0, 1) }); check(r.eq && r.js.result.reason === "proposal-analyzer failed", "analyzer fail ⇒ FAILED byte-identical"); }

// (7) governance refused ⇒ FAILED
{ const r = both({ request: req(), response: res() }, "M-001", { ...seamsOK, authorize: refused }); check(r.eq && r.js.result.reason === "Governance refused", "governance refused ⇒ FAILED byte-identical"); }

// (8) VALIDATED path ⇒ status VALIDATED, request.validatedAt=injected now, actions counted
{ const r = both({ request: req(), response: res() }, "M-001", seamsOK);
  check(r.eq && r.js.result.status === "VALIDATED" && r.js.result.actions === 2 && r.js.result.mission === "M", "VALIDATED ⇒ status/mission/actions byte-identical");
  check(r.js.reqAfter.status === "VALIDATED" && r.js.reqAfter.validatedAt === NOW, "VALIDATED ⇒ request.validatedAt=injected now byte-identical"); }

console.log(failures === 0 ? "ALL PASS — LOT fleet-collector EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

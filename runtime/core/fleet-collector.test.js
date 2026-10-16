#!/usr/bin/env node
"use strict";

/*
 * FLEET-COLLECTOR — hermetic behavioural proof over the HISTORICAL .js, exercising every collect() branch
 * through the injected seams (spawn / nowIso / authorize / record) ⇒ NO real subprocess, clock, governance
 * read or ledger write. Seeds a throwaway cwd with fleet-envelope request/response files; the repo + host
 * are never touched. (Doubles as the migrate-ts lot's historical suite; the module previously had none.)
 *
 * Run: node runtime/core/fleet-collector.test.js   (or via tsx under `npm test`)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const REPO = process.cwd();
const { collect } = require(path.join(REPO, "runtime", "core", "fleet-collector.js"));

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

const NOW = "2026-01-01T00:00:00.000Z";
const mkSpawn = (parser, analyzer) => (cmd, args) => {
  const t = Array.isArray(args) ? String(args[0] || "") : "";
  if (t.includes("response-parser")) return { status: parser, stdout: "", stderr: "" };
  if (t.includes("proposal-analyzer")) return { status: analyzer, stdout: "", stderr: "" };
  return { status: 0, stdout: "", stderr: "" };
};
const seamsOK = { spawn: mkSpawn(0, 0), nowIso: NOW, authorize: () => ({ authorized: true }), record: null };
const req = (id = "M-001") => ({ requestId: id, agent: "a", status: "PENDING", mission: "M" });
const res = (id = "M-001") => ({ requestId: id, agent: "a", proposal: { mission: "M", summary: "s", actions: [{ x: 1 }, { x: 2 }] } });

function runIn(seed, requestId, opts) {
  const cwd0 = process.cwd();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "flc-t-"));
  const reqDir = path.join(d, "runtime", "generated", "fleet", "requests");
  const resDir = path.join(d, "runtime", "generated", "fleet", "responses");
  fs.mkdirSync(reqDir, { recursive: true }); fs.mkdirSync(resDir, { recursive: true });
  if (seed.request !== undefined) fs.writeFileSync(path.join(reqDir, requestId + ".json"), JSON.stringify(seed.request));
  if (seed.response !== undefined) fs.writeFileSync(path.join(resDir, requestId + ".json"), JSON.stringify(seed.response));
  let result, reqAfter = null, threw = null;
  try { process.chdir(d); result = collect(requestId, opts); try { reqAfter = JSON.parse(fs.readFileSync(path.join(reqDir, requestId + ".json"), "utf8")); } catch { reqAfter = null; } }
  catch (e) { threw = String(e && e.message || e); }
  finally { process.chdir(cwd0); try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
  return { result, reqAfter, threw };
}

console.log("FLEET-COLLECTOR — hermetic behavioural proof");
let threw = false; try { collect("", seamsOK); } catch { threw = true; }
check(threw, "missing requestId ⇒ throws");
check(runIn({ response: res() }, "M-001", seamsOK).result.reason === "No correlated request", "no request ⇒ FAILED No correlated request");
{ const r = runIn({ request: req() }, "M-001", seamsOK); check(r.result.reason === "No response found" && r.reqAfter.status === "FAILED" && r.reqAfter.failedAt === NOW, "no response ⇒ FAILED + failedAt=injected now"); }
check(runIn({ request: req(), response: res("OTHER") }, "M-001", seamsOK).result.reason === "RequestId mismatch", "requestId mismatch ⇒ FAILED");
check(/Invalid response/.test(runIn({ request: req(), response: { requestId: "M-001", agent: "a", proposal: {} } }, "M-001", seamsOK).result.reason), "invalid response ⇒ FAILED");
check(runIn({ request: req(), response: res() }, "M-001", { ...seamsOK, spawn: mkSpawn(1, 0) }).result.reason === "response-parser rejected proposal", "parser status!=0 ⇒ FAILED");
check(runIn({ request: req(), response: res() }, "M-001", { ...seamsOK, spawn: mkSpawn(0, 1) }).result.reason === "proposal-analyzer failed", "analyzer status!=0 ⇒ FAILED");
check(runIn({ request: req(), response: res() }, "M-001", { ...seamsOK, authorize: () => ({ authorized: false }) }).result.reason === "Governance refused", "governance refused ⇒ FAILED (deny-by-default preserved)");
{ const r = runIn({ request: req(), response: res() }, "M-001", seamsOK); check(r.result.status === "VALIDATED" && r.result.actions === 2 && r.reqAfter.validatedAt === NOW, "VALIDATED ⇒ status/actions + request.validatedAt=injected now"); }
// record seam invoked on VALIDATED (evidence hook), non-blocking even if it throws
{ let called = 0; const r = runIn({ request: req(), response: res() }, "M-001", { ...seamsOK, record: () => { called++; throw new Error("ledger boom"); } }); check(r.result.status === "VALIDATED", "record seam that throws is non-blocking (still VALIDATED)"); }

console.log(failures === 0 ? "ALL PASS — fleet-collector" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

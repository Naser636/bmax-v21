#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Runs the REAL scenario-E sandbox runs (tmp git repos, real node test subprocesses, a real
// SIGKILLed child) and asserts every case outcome + its evidence; plus the fail-before lock for the repair-workflow
// stale-snapshot defect found by case 6.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const S = require("./odg-scenario-e-self-healing.ts");
const RW = require("../core/repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (0) DEFECT LOCK (fail-before): a snapshot left by an interrupted run must NOT be overwritten — before the fix,
// runRepairWorkflow deleted it, re-snapshotted the half-applied workspace and returned NO_REPAIR_NEEDED (ok:true).
{
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "odg-stale-"));
  const ws = path.join(base, "ws"); const snap = ws + ".snapshot-ws";
  fs.mkdirSync(path.join(ws, "src"), { recursive: true }); fs.writeFileSync(path.join(ws, "src", "m.js"), "HALF_APPLIED\n");
  fs.mkdirSync(path.join(snap, "src"), { recursive: true }); fs.writeFileSync(path.join(snap, "src", "m.js"), "CLEAN\n");
  const res = RW.runRepairWorkflow({ workspaceDir: ws, acceptance: { command: ["node", "--test"] }, writeSet: ["src/"], change: { source: "edits", edits: [{ path: "src/m.js", content: "X\n" }] } },
    { runner: () => ({ exitCode: 0 }) });
  ok("stale snapshot ⇒ BLOCKED INTERRUPTED_PRIOR_RUN (not ok)", res.status === "BLOCKED" && res.code === "INTERRUPTED_PRIOR_RUN" && res.ok === false);
  ok("clean snapshot preserved byte-for-byte", fs.readFileSync(path.join(snap, "src", "m.js"), "utf8") === "CLEAN\n");
  ok("workspace not touched by the refused run", fs.readFileSync(path.join(ws, "src", "m.js"), "utf8") === "HALF_APPLIED\n");
  fs.rmSync(base, { recursive: true, force: true });
}

const res = S.runScenarioE();
const c = Object.fromEntries(res.cases.map((x) => [x.id, x]));
const stepOf = (k, name) => c[k].steps.find((s) => s.step === name);
ok("8 cases ran, each as expected", res.cases.length === 8 && res.allAsExpected === true);
for (const x of res.cases) {
  ok(`case ${x.id}: detect+diagnose on real failing test (root cause ROOT_CAUSE, file src/calc.js)`, stepOf(x.id, "detect").detected === true && stepOf(x.id, "diagnose").file === "src/calc.js" && stepOf(x.id, "diagnose").rootCause.layer === "ROOT_CAUSE");
  ok(`case ${x.id}: generate step attributed to PROVIDER, never ODG`, stepOf(x.id, "generate").attribution === "PROVIDER" && x.steps.filter((s) => s.attribution === "PROVIDER").length === 1);
  ok(`case ${x.id}: duration recorded`, Number.isFinite(x.durationMs) && x.durationMs > 0);
}
// 1 success
ok("1: ACCEPTED — runRepairWorkflow ACCEPTED, independent target+regression PASS, fdir RECOVERED, only src/calc.js changed",
  c[1].outcome === "ACCEPTED" && c[1].repairWorkflow.status === "ACCEPTED" && c[1].independent.target === "PASS" && c[1].independent.regression === "PASS" && c[1].fdir === "RECOVERED" && JSON.stringify(c[1].rollback.changedVsCheckpoint) === '["src/calc.js"]' && c[1].checkpointFinal === "COMPLETE");
// 2 ineffective
ok("2: ineffective ⇒ runRepairWorkflow ABSTAINED + rolled back, tree byte-identical", c[2].outcome === "REJECTED_ROLLED_BACK" && c[2].repairWorkflow.status === "ABSTAINED" && c[2].repairWorkflow.rolledBack === true && c[2].rollback.identical === true && c[2].checkpointFinal === "FAILED");
// 3 regression break
ok("3: target PASS but regression FAIL ⇒ fdir UNVERIFIED ⇒ VERIFIED_ROLLBACK, tree byte-identical",
  c[3].outcome === "REJECTED_ROLLED_BACK" && c[3].repairWorkflow.status === "ACCEPTED" && c[3].independent.target === "PASS" && c[3].independent.regression === "FAIL" && c[3].fdir === "UNVERIFIED" && stepOf(3, "rollback").fdirStatus === "RECOVERED" && c[3].rollback.identical === true);
// 4 generation error
ok("4: seam error ⇒ REJECTED_GENERATION_ERROR, nothing applied, tree identical", c[4].outcome === "REJECTED_GENERATION_ERROR" && stepOf(4, "generate").kind === "GENERATION_ERROR" && !stepOf(4, "apply+targeted-test") && c[4].rollback.identical === true);
// 5 timeout (bounded)
ok("5: hanging seam killed ⇒ REJECTED_TIMEOUT, bounded (< 10s), tree identical", c[5].outcome === "REJECTED_TIMEOUT" && stepOf(5, "generate").kind === "TIMEOUT" && c[5].durationMs < 10000 && c[5].rollback.identical === true);
// 6 interruption
ok("6: SIGKILL between apply and verify left a half-applied change + stale snapshot", c[6].crash.childSignal === "SIGKILL" && JSON.stringify(c[6].crash.halfAppliedFiles) === '["src/calc.js"]' && stepOf(6, "apply(crash)").staleSnapshotLeft === true);
ok("6: restart ⇒ checkpoint resumes at 'apply', repair-workflow refuses (INTERRUPTED_PRIOR_RUN), fdir restores; byte-identical; no half-applied change survives",
  c[6].outcome === "INTERRUPTED_RESTORED" && c[6].crash.resumeStage === "apply" && c[6].crash.retryCode === "INTERRUPTED_PRIOR_RUN" && c[6].rollback.identical === true && c[6].rollback.staleSnapshotRemoved === true);
// 7 permission refused
ok("7: change to test/ (outside write-set) ⇒ planner WRITE_SET_VIOLATION, direct repair-workflow REJECTED, tree identical",
  c[7].outcome === "REFUSED_WRITE_SET" && stepOf(7, "authorize").verdict === "WRITE_SET_VIOLATION" && c[7].directRepairWorkflow.code === "WRITE_SET_VIOLATION" && c[7].rollback.identical === true);
// 8 rollback by hash + non-vacuous control
ok("8: rejected repair restored byte-identical (whole tree incl. .git) and a 1-byte tamper IS detected",
  c[8].outcome === "REJECTED_ROLLED_BACK" && c[8].rollback.identical === true && c[8].tamperControl.detected === true && JSON.stringify(c[8].tamperControl.differing) === '["src/calc.js"]');

console.log(`\nodg-scenario-e-self-healing: ${pass} assertions passed`);

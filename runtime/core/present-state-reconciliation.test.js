#!/usr/bin/env node
"use strict";
/*
 * PRESENT-STATE RECONCILIATION tests (CTO §2) — positive + exhaustive NEGATIVE cases proving that missing,
 * absent-test, failing, incomplete, or unrelated evidence CANNOT cause false acceptance. Hermetic: an
 * isolated temp repoRoot with fixture contracts + a fake source tree + an INJECTED test runner (no real
 * child processes), a deterministic clock, and no mutation of the real runtime.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("./present-state-reconciliation.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const now = () => "2026-10-18T00:00:00.000Z";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "psr-")); }
function writeContract(root, mission, contract) {
  fs.mkdirSync(path.join(root, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "missions", `${mission}.json`), JSON.stringify(contract));
}
function writeFile(root, rel, body) {
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body == null ? "x" : body);
}
// Injected runner: exit code is driven by a map {testPath: exit}. Default (unlisted) ⇒ exit 0.
function runnerFrom(map) {
  return (testPath) => ({ exit: Object.prototype.hasOwnProperty.call(map, testPath) ? map[testPath] : 0, output: "out:" + testPath });
}

// 1 — POSITIVE: complete probe + all sources exist + all tests exit 0 ⇒ PROVEN.
{
  const root = tmp();
  writeContract(root, "M_OK", { mission: "M_OK", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/a.test.js"] } });
  writeFile(root, "src/a.js"); writeFile(root, "t/a.test.js");
  const r = R.reconcile("M_OK", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("POSITIVE: complete probe + sources present + tests pass ⇒ PROVEN", r.proven === true && r.verdict === "PROVEN");
  ok("POSITIVE: provenance is present-state-reconciliation (distinct from pipeline)", r.provenance === "present-state-reconciliation");
  ok("POSITIVE: records sha256 evidence for each source", r.evidence.sources[0].sha256 && r.evidence.sources[0].exists === true);
  ok("POSITIVE: records exit code evidence for each test", r.evidence.tests[0].exit === 0);
}
// 2 — NEGATIVE: NO presentStateAcceptance block ⇒ NOT_RECONCILABLE (never an implicit pass).
{
  const root = tmp();
  writeContract(root, "M_NONE", { mission: "M_NONE" });
  const r = R.reconcile("M_NONE", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: no probe ⇒ proven:false NOT_RECONCILABLE", r.proven === false && r.verdict === "NOT_RECONCILABLE");
}
// 3 — NEGATIVE: incomplete probe (no tests) ⇒ INCOMPLETE_PROBE (code-exists is never enough).
{
  const root = tmp();
  writeContract(root, "M_INC", { mission: "M_INC", presentStateAcceptance: { sources: ["src/a.js"], tests: [] } });
  writeFile(root, "src/a.js");
  const r = R.reconcile("M_INC", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: probe with 0 tests ⇒ proven:false INCOMPLETE_PROBE", r.proven === false && r.verdict === "INCOMPLETE_PROBE");
}
// 4 — NEGATIVE: incomplete probe (no sources) ⇒ INCOMPLETE_PROBE.
{
  const root = tmp();
  writeContract(root, "M_INC2", { mission: "M_INC2", presentStateAcceptance: { sources: [], tests: ["t/a.test.js"] } });
  writeFile(root, "t/a.test.js");
  const r = R.reconcile("M_INC2", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: probe with 0 sources ⇒ proven:false INCOMPLETE_PROBE", r.proven === false && r.verdict === "INCOMPLETE_PROBE");
}
// 5 — NEGATIVE: a declared source is MISSING on disk ⇒ NOT_PROVEN (even though tests pass).
{
  const root = tmp();
  writeContract(root, "M_MISS", { mission: "M_MISS", presentStateAcceptance: { sources: ["src/present.js", "src/absent.js"], tests: ["t/a.test.js"] } });
  writeFile(root, "src/present.js"); writeFile(root, "t/a.test.js"); // src/absent.js intentionally missing
  const r = R.reconcile("M_MISS", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: missing declared source ⇒ proven:false NOT_PROVEN", r.proven === false && r.verdict === "NOT_PROVEN" && /absent\.js/.test(r.reason));
}
// 6 — NEGATIVE: a declared acceptance test FAILS (exit!=0) ⇒ NOT_PROVEN (suite-passing elsewhere is irrelevant).
{
  const root = tmp();
  writeContract(root, "M_FAIL", { mission: "M_FAIL", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/fail.test.js"] } });
  writeFile(root, "src/a.js"); writeFile(root, "t/fail.test.js");
  const r = R.reconcile("M_FAIL", { repoRoot: root, now, runTest: runnerFrom({ "t/fail.test.js": 1 }) });
  ok("NEGATIVE: failing acceptance test ⇒ proven:false NOT_PROVEN", r.proven === false && r.verdict === "NOT_PROVEN" && /fail\.test\.js/.test(r.reason));
}
// 7 — NEGATIVE: a declared acceptance test is ABSENT on disk ⇒ NOT_PROVEN (absent ≠ pass).
{
  const root = tmp();
  writeContract(root, "M_NOTEST", { mission: "M_NOTEST", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/ghost.test.js"] } });
  writeFile(root, "src/a.js"); // t/ghost.test.js intentionally absent
  const r = R.reconcile("M_NOTEST", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: absent acceptance test ⇒ proven:false NOT_PROVEN", r.proven === false && r.verdict === "NOT_PROVEN" && /ghost\.test\.js/.test(r.reason));
}
// 8 — NEGATIVE (unrelated evidence): the probe names THIS mission's own tests; a different mission's passing
//     test cannot prove this one, because reconcile reads ONLY the named mission's declared probe.
{
  const root = tmp();
  writeContract(root, "M_SELF", { mission: "M_SELF", presentStateAcceptance: { sources: ["src/self.js"], tests: ["t/self.test.js"] } });
  // Only an UNRELATED file/test exist; the declared ones do not.
  writeFile(root, "src/other.js"); writeFile(root, "t/other.test.js");
  const r = R.reconcile("M_SELF", { repoRoot: root, now, runTest: runnerFrom({}) });
  ok("NEGATIVE: unrelated files cannot satisfy a mission's own declared probe ⇒ NOT_PROVEN", r.proven === false);
}
// 9 — non-.js declared test is NOT silently passed by the default runner (fail-closed).
{
  const root = tmp();
  writeContract(root, "M_TS", { mission: "M_TS", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/a.e2e.test.ts"] } });
  writeFile(root, "src/a.js"); writeFile(root, "t/a.e2e.test.ts");
  const r = R.reconcile("M_TS", { repoRoot: root, now }); // default runner, no injection
  ok("NEGATIVE: non-.js test not executable by reconciler ⇒ exit null ⇒ NOT_PROVEN (no silent pass)", r.proven === false && r.evidence.tests[0].exit === null);
}
// 10 — PERSIST + DISTINCT STORE + reconciledProvenMissions reflects proven only.
{
  const root = tmp();
  writeContract(root, "M_P", { mission: "M_P", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/a.test.js"] } });
  writeFile(root, "src/a.js"); writeFile(root, "t/a.test.js");
  writeContract(root, "M_Q", { mission: "M_Q", presentStateAcceptance: { sources: ["src/b.js"], tests: ["t/b.test.js"] } });
  writeFile(root, "src/b.js"); // t/b.test.js absent ⇒ NOT_PROVEN
  R.reconcileAndRecord("M_P", { repoRoot: root, now, runTest: runnerFrom({}) });
  R.reconcileAndRecord("M_Q", { repoRoot: root, now, runTest: runnerFrom({}) });
  const store = JSON.parse(fs.readFileSync(path.join(root, R.RECON_FILE), "utf8"));
  ok("PERSIST: store carries provenance present-state-reconciliation", store.provenance === "present-state-reconciliation");
  ok("PERSIST: both results recorded (proven and not-proven; failure not hidden)", store.reconciled.length === 2);
  const proven = R.reconciledProvenMissions(root);
  ok("PERSIST: reconciledProvenMissions lists ONLY the proven mission", proven.includes("M_P") && !proven.includes("M_Q"));
}
// 11 — IDEMPOTENT per mission: re-recording replaces (no duplicate), and a later regression flips it honestly.
{
  const root = tmp();
  writeContract(root, "M_R", { mission: "M_R", presentStateAcceptance: { sources: ["src/a.js"], tests: ["t/a.test.js"] } });
  writeFile(root, "src/a.js"); writeFile(root, "t/a.test.js");
  R.reconcileAndRecord("M_R", { repoRoot: root, now, runTest: runnerFrom({}) }); // PROVEN
  R.reconcileAndRecord("M_R", { repoRoot: root, now, runTest: runnerFrom({ "t/a.test.js": 1 }) }); // regressed ⇒ NOT_PROVEN
  const store = JSON.parse(fs.readFileSync(path.join(root, R.RECON_FILE), "utf8"));
  ok("IDEMPOTENT: one entry per mission (replace, not duplicate)", store.reconciled.filter((r) => r.mission === "M_R").length === 1);
  ok("IDEMPOTENT: regression flips the record to NOT proven (not stale PROVEN)", R.reconciledProvenMissions(root).includes("M_R") === false);
}

console.log(`\npresent-state-reconciliation — ${passed} assertions passed.`);

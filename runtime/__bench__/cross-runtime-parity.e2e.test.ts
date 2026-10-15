// @ts-nocheck
/*
 * CROSS-RUNTIME PARITY HARNESS — self-test (η3-B133, Lot 1).
 *
 * Proves the harness's PASS / FAIL / BLOCKED decision logic deterministically, WITHOUT depending on a
 * real cross-runtime divergence (which must not exist when parity holds). It unit-tests the pure core
 * exported by scripts/cross-runtime-parity.ts: normalizeArtifact, compareArtifact, verdict. The full
 * end-to-end run is exercised separately by `npm run parity:runtimes` (Phase C of the mission).
 *
 * Exit 0 = all self-test assertions pass; non-zero = a harness-logic defect.
 */
"use strict";
const assert = require("assert");
const path = require("path");
const core = require(path.join(process.cwd(), "scripts", "cross-runtime-parity.ts"));
const { normalizeArtifact, compareArtifact, verdict } = core;

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok - " + name); passed += 1; }

console.log("CROSS-RUNTIME PARITY SELF-TEST");

// --- normalization: ISO timestamps only; counts tracked ---
{
  const a = normalizeArtifact('{"recordedAt":"2026-10-14T01:02:03.456Z","x":1}');
  ok("ISO timestamp normalized to <TS>", a.text === '{"recordedAt":"<TS>","x":1}');
  ok("timestamp count tracked", a.tsCount === 1);
  const b = normalizeArtifact('{"status":"SUCCESS","validated":true}');
  ok("no timestamp ⇒ unchanged, count 0", b.text === '{"status":"SUCCESS","validated":true}' && b.tsCount === 0);
}

// --- compareArtifact: PASS (identical, incl. differing timestamps that normalize away) ---
{
  const js = { present: true, raw: '{"recordedAt":"2026-10-14T00:00:01Z","mission":"M","status":"SUCCESS"}' };
  const ts = { present: true, raw: '{"recordedAt":"2026-10-14T09:59:59Z","mission":"M","status":"SUCCESS"}' };
  const r = compareArtifact("mission-ledger.json", js, ts);
  ok("identical after timestamp normalization ⇒ identical=true", r.identical === true);
}
// --- compareArtifact: FAIL on a BUSINESS difference (not a timestamp) ---
{
  const js = { present: true, raw: '{"mission":"M","status":"SUCCESS"}' };
  const ts = { present: true, raw: '{"mission":"M","status":"BLOCKED"}' };
  const r = compareArtifact("mission-report.json", js, ts);
  ok("business divergence ⇒ identical=false", r.identical === false);
  ok("divergence reason points at business diff", /BUSINESS DIVERGENCE/.test(r.reason));
}
// --- compareArtifact: FAIL on presence mismatch (missing artifact in one runtime) ---
{
  const r = compareArtifact("patch-execution.json", { present: true, raw: "{}" }, { present: false, raw: null });
  ok("presence mismatch ⇒ identical=false", r.identical === false && /presence mismatch/.test(r.reason));
}
// --- compareArtifact: FAIL on timestamp-count asymmetry (a hidden extra timestamp is a divergence) ---
{
  const js = { present: true, raw: '{"a":"2026-10-14T00:00:00Z"}' };
  const ts = { present: true, raw: '{"a":"2026-10-14T00:00:00Z","b":"2026-10-14T00:00:00Z"}' };
  const r = compareArtifact("mission-ledger.json", js, ts);
  ok("timestamp-count asymmetry ⇒ identical=false", r.identical === false && /asymmetry/.test(r.reason));
}

// --- verdict: PASS when all three required classes covered + identical + touch ok ---
{
  const ident = core.ARTIFACTS.map((n) => ({ name: n, identical: true, reason: "ok" }));
  const scenarios = [
    { class: "READ_ONLY", exitJs: 0, exitTs: 0, artifacts: ident },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true, detail: "" } },
    { class: "ECONOMIC_TOUCH", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true, detail: "" } },
  ];
  const v = verdict(scenarios);
  ok("all classes identical ⇒ PASS exit 0", v.verdict === "PASS" && v.exitCode === 0);
}
// --- verdict: FAIL (exit 1) on a real artifact divergence ---
{
  const div = core.ARTIFACTS.map((n, i) => ({ name: n, identical: i !== 0, reason: i === 0 ? "BUSINESS DIVERGENCE" : "ok" }));
  const scenarios = [
    { class: "READ_ONLY", exitJs: 0, exitTs: 0, artifacts: div },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: core.ARTIFACTS.map((n) => ({ name: n, identical: true })), touchProof: { ok: true } },
    { class: "ECONOMIC_TOUCH", exitJs: 0, exitTs: 0, artifacts: core.ARTIFACTS.map((n) => ({ name: n, identical: true })), touchProof: { ok: true } },
  ];
  const v = verdict(scenarios);
  ok("real divergence ⇒ FAIL exit 1 (non-zero)", v.verdict === "FAIL" && v.exitCode === 1);
}
// --- verdict: FAIL (exit 1) on exit-code mismatch across runtimes ---
{
  const ident = core.ARTIFACTS.map((n) => ({ name: n, identical: true }));
  const v = verdict([
    { class: "READ_ONLY", exitJs: 0, exitTs: 1, artifacts: ident },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true } },
    { class: "ECONOMIC_TOUCH", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true } },
  ]);
  ok("exit-code mismatch ⇒ FAIL exit 1", v.verdict === "FAIL" && v.exitCode === 1);
}
// --- verdict: BLOCKED (exit 2) when a required class cannot be established — NEVER a PASS ---
{
  const ident = core.ARTIFACTS.map((n) => ({ name: n, identical: true }));
  const v = verdict([
    { class: "READ_ONLY", exitJs: 0, exitTs: 0, artifacts: ident },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true } },
    { class: "ECONOMIC_TOUCH", blocked: "no safe offline economic mission" },
  ]);
  ok("a blocked required class ⇒ BLOCKED exit 2 (not PASS)", v.verdict === "BLOCKED" && v.exitCode === 2);
}
// --- verdict: divergence OUTWEIGHS a block ⇒ FAIL (a real defect is never downgraded to BLOCKED) ---
{
  const div = core.ARTIFACTS.map((n, i) => ({ name: n, identical: i !== 0 }));
  const v = verdict([
    { class: "READ_ONLY", exitJs: 0, exitTs: 0, artifacts: div },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: core.ARTIFACTS.map((n) => ({ name: n, identical: true })), touchProof: { ok: true } },
    { class: "ECONOMIC_TOUCH", blocked: "x" },
  ]);
  ok("divergence + block ⇒ FAIL (defect dominates)", v.verdict === "FAIL" && v.exitCode === 1);
}
// --- verdict: failed touch-proof ⇒ FAIL (a class that didn't really exercise its path is not a pass) ---
{
  const ident = core.ARTIFACTS.map((n) => ({ name: n, identical: true }));
  const v = verdict([
    { class: "READ_ONLY", exitJs: 0, exitTs: 0, artifacts: ident },
    { class: "ENGINEERING_WRITE", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: false, detail: "deliverable not written" } },
    { class: "ECONOMIC_TOUCH", exitJs: 0, exitTs: 0, artifacts: ident, touchProof: { ok: true } },
  ]);
  ok("failed touch-proof ⇒ FAIL exit 1", v.verdict === "FAIL" && v.exitCode === 1);
}

console.log(`\nCROSS-RUNTIME PARITY SELF-TEST — ${passed} assertions passed.`);

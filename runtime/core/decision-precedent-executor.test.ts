#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx; migration-debt pragma (not strict typing).
"use strict";

/*
 * DECISION PRECEDENT CONSULTATION executor — G9↔G10 live-integration proof.
 *
 * Exercises the NEW read-only capability executor ("Decision Precedent Consultation", prefix
 * PRECEDENT_CONSULT_) that wires decision-precedent into the live capability-executor architecture. Each test
 * runs in an isolated temp cwd (the executor's evidence + store paths are cwd-relative) so NOTHING touches the
 * live runtime/generated. Covers the mandated cases: registry conformance, resolve, HIT (real reuse + full
 * provenance), MISS (no precedent), stale/inapplicable precedent (signature mismatch ⇒ not applied), absent
 * store, corrupt store (failure recovery ⇒ graceful MISS, never throws), re-run reuse accounting, the
 * no-file-patch / no-target-mutation invariant, and TS/JS dual-port parity.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dp = require("./decision-precedent.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const STORE_REL = path.join("runtime", "generated", "autonomy", "decision-precedent.json");
const EV_REL = path.join("runtime", "generated", "precedent-consultation.json");

// Run fn() inside a fresh temp cwd; always restore. Returns fn()'s result.
function inTemp(fn) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-exec-"));
  try { process.chdir(dir); return fn(dir); }
  finally { process.chdir(prev); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
}
function seedStore(goal, over) {
  const store = dp.emptyStore();
  dp.recordPrecedent(store, {
    task: { goal }, decision: { classification: "EXPECTED_STEADY_STATE" },
    sourceMission: "FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA",
    sourceEvidence: { commit: "18768c1", verdict: "ACCEPTED" }, capturedAt: "2026-10-21T21:41:06Z",
    applicability: "canary IDLE triage", limitations: "n/a once a non-proven mission is allowlisted",
    authoredBy: "ODG_CAPABILITY", ...(over || {}),
  });
  fs.mkdirSync(path.dirname(STORE_REL), { recursive: true });
  fs.writeFileSync(STORE_REL, JSON.stringify(store, null, 2));
}
function execOf(ce) { return ce.EXECUTORS.find((e) => e.capability === "Decision Precedent Consultation"); }
function readEv() { return JSON.parse(fs.readFileSync(EV_REL, "utf8")); }

function runSuite(portName, ce) {
  console.log(`\n== port: ${portName} ==`);
  // registry conformance — the new executor has a 1:1 governed contract (no dangling/orphan).
  ok(`${portName}: contract conformance clean (new executor governed 1:1)`, ce.contractConformance(ce.EXECUTORS, ce.CAPABILITY_EFFECT).length === 0);
  ok(`${portName}: contract is observational + read-only control`, ce.CAPABILITY_EFFECT["Decision Precedent Consultation"].effect === "observational");
  // resolve matches the prefix (and only the prefix).
  ok(`${portName}: resolve() matches PRECEDENT_CONSULT_ prefix`, !!execOf(ce) && execOf(ce).matches({ objectiveId: "PRECEDENT_CONSULT_1" }) === true && execOf(ce).matches({ objectiveId: "CLEAN_WORKSPACE_1" }) === false);

  // HIT — real reuse with full provenance; decision applied to a COPY; evidence EXECUTED-worthy.
  inTemp(() => {
    seedStore("classify scheduler IDLE outcome");
    const res = execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: "classify scheduler IDLE outcome" });
    const ev = readEv();
    ok(`${portName}: HIT applies decision + records reuseCount 0→1`, res.summary.hit === true && ev.hit === true && ev.reuseCount === 1 && ev.applied && ev.applied.decision.classification === "EXPECTED_STEADY_STATE");
    ok(`${portName}: HIT carries full source provenance (traceable; distinct from writeEvidence stamp)`, ev.precedentProvenance && ev.precedentProvenance.sourceMission === "FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA" && ev.precedentProvenance.sourceEvidence.commit === "18768c1" && ev.precedentProvenance.capturedAt === "2026-10-21T21:41:06Z" && !!ev.provenance && typeof ev.provenance === "object");
    ok(`${portName}: reuse persisted to the runtime-owned store (0→1)`, JSON.parse(fs.readFileSync(STORE_REL, "utf8")).entries[dp.signature({ goal: "classify scheduler IDLE outcome" })].reuseCount === 1);
    // NO-FILE-PATCH / NO-TARGET-MUTATION invariant: evidence carries no `edits`/patch; only runtime/generated written.
    ok(`${portName}: evidence has NO edits/patch (read-only; decision only)`, !("edits" in ev) && !("patch" in ev) && ev.applied.resolvedBy === "PRECEDENT");
  });

  // MISS — store present but a DIFFERENT (stale/inapplicable) signature ⇒ not applied, graceful, still evidenced.
  inTemp(() => {
    seedStore("some other accepted decision");
    const res = execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_9", goal: "an unrelated objective with no precedent" });
    const ev = readEv();
    ok(`${portName}: stale/inapplicable precedent ⇒ MISS (not applied), no throw`, res.summary.hit === false && ev.hit === false && ev.applied === null && ev.reuseCount === 0);
  });

  // ABSENT store ⇒ graceful MISS (no file at all).
  inTemp(() => {
    const res = execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: "classify scheduler IDLE outcome" });
    ok(`${portName}: absent store ⇒ graceful MISS + evidence written`, res.summary.hit === false && fs.existsSync(EV_REL));
  });

  // CORRUPT store ⇒ failure recovery: graceful MISS, never throws.
  inTemp(() => {
    fs.mkdirSync(path.dirname(STORE_REL), { recursive: true });
    fs.writeFileSync(STORE_REL, "{ not json ::::");
    let threw = false; let res;
    try { res = execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: "x" }); } catch { threw = true; }
    ok(`${portName}: corrupt store ⇒ recovered as MISS (no throw)`, threw === false && res.summary.hit === false);
  });

  // RE-RUN reuse accounting is honest (increments; not a fabricated flat no-op).
  inTemp(() => {
    seedStore("classify scheduler IDLE outcome");
    const g = "classify scheduler IDLE outcome";
    execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: g });
    const second = execOf(ce).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: g });
    ok(`${portName}: re-run increments reuseCount honestly (1→2)`, second.summary.reuseCount === 2);
  });
}

console.log("decision-precedent-executor — G9↔G10 live-integration proof");
const ceJs = require("./capability-executors.js");
const ceTs = require("./capability-executors.ts");
runSuite("js", ceJs);
runSuite("ts", ceTs);

// DUAL-PORT PARITY — identical HIT evidence shape across ports.
inTemp(() => {
  seedStore("parity goal");
  const a = execOf(ceJs).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: "parity goal" }); const ea = readEv();
  seedStore("parity goal"); // reset reuseCount for a fair compare
  const b = execOf(ceTs).run({ objectiveId: "PRECEDENT_CONSULT_1", goal: "parity goal" }); const eb = readEv();
  ok("parity: js vs ts HIT evidence identical (hit/applied/precedentProvenance/reuseCount)", JSON.stringify({ h: ea.hit, a: ea.applied, p: ea.precedentProvenance, r: ea.reuseCount }) === JSON.stringify({ h: eb.hit, a: eb.applied, p: eb.precedentProvenance, r: eb.reuseCount }));
});

console.log(`\ndecision-precedent-executor — ${passed} assertions passed. (read-only live executor; NO file patch, NO target mutation.)`);

#!/usr/bin/env node
"use strict";
/* Tests for odg-native-execution-provenance (V324 §5/§12 native-execution→provenance connector). PROVES the chain
 * real ODG-native execution → honest evidence → REAL actor-provenance resolver → actor=ODG, and that a non-native /
 * escalated / mixed-forged cycle NEVER resolves to ODG. Uses the production modules end-to-end (no mocks). */
const NE = require("./odg-native-engineering.js");
const L = require("./odg-native-engineering-loop.js");
const P = require("./odg-native-execution-provenance.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // ── GENUINE native repair cycle (seeded fault → native mechanical repair) resolves to ODG through the REAL resolver ──
  const cyc = NE.runNativeCycle({ id: "NEP-1", spec: { fnName: "addMinor", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [0, 0], expect: 0 }] }, injectFault: true });
  check("precondition: runNativeCycle is a genuine native repair", cyc.nativeCycle === true && cyc.verdict === "NATIVE_REPAIRED_GREEN");
  const a = P.attributeNativeCycle(cyc, "NEP-1");
  check("native cycle ⇒ executed[] holds the 10 ODG_NATIVE steps", a.evidence.executed.length === 10 && a.evidence.executed.every((e: any) => e.authoredBy === "ODG_CAPABILITY" && e.appliedBy === "ODG_EXECUTOR"));
  check("native cycle ⇒ real-repo write EXCLUDED from executed[], declared as owner-gated follow-up", a.evidence.ownerGatedFollowups.length === 1 && a.evidence.ownerGatedFollowups[0].gate === "OWNER_GATED" && a.evidence.nonNativeSteps.length === 0);
  check("native cycle ⇒ attributable, and the REAL resolver returns actor=ODG", a.evidence.attributable === true && a.provenance.actor === "ODG" && a.provenance.reason === "unique recognized actor");

  // green (no-fault) cycle also resolves ODG (one fewer step: no propose_correction)
  const green = NE.runNativeCycle({ id: "NEP-G", spec: { fnName: "m", kind: "max", examples: [{ args: [2, 3], expect: 3 }] } });
  check("green native cycle ⇒ actor=ODG (9 executed steps, no correction)", green.verdict === "NATIVE_GREEN" && P.fromNativeCycle(green, "NEP-G").executed.length === 9 && P.attributeNativeCycle(green, "NEP-G").provenance.actor === "ODG");

  // ── ESCALATED (out-of-catalog) cycle: NO native execution ⇒ NO attribution (honest, not fabricated) ──
  const esc = NE.runNativeCycle({ id: "NEP-E", spec: { fnName: "x", kind: "novel-kind-not-in-catalog", examples: [] } });
  const ea = P.attributeNativeCycle(esc, "NEP-E");
  check("escalated cycle (nativeCycle false) ⇒ empty executed[], not attributable, actor null", esc.nativeCycle === false && ea.evidence.executed.length === 0 && ea.evidence.attributable === false && ea.provenance.actor === null);

  // ── CONTAMINATION GUARD: a cycle carrying a provider step must NEVER resolve to pure ODG ──
  const forged = { missionId: "NEP-F", nativeCycle: true, verdict: "NATIVE_GREEN", executorSummary: { ODG_NATIVE_EXECUTION: 1 }, steps: [{ step: "gen", executor: "ODG_NATIVE_EXECUTION", detail: "d" }, { step: "novel", executor: "CLAUDE_CODE_EXECUTION", detail: "needs provider" }] };
  const fa = P.attributeNativeCycle(forged, "NEP-F");
  check("mixed cycle (ODG+CLAUDE) ⇒ nonNative surfaced, attributable false, actor null (contaminated ⇒ not attributable)", fa.evidence.nonNativeSteps.length === 1 && fa.evidence.attributable === false && fa.provenance.actor === null);

  // F3: a malformed (non-string executor) step is CONTAMINATING, never silently dropped (fail-closed, not fail-open)
  const mal = P.fromNativeCycle({ missionId: "NEP-M", nativeCycle: true, verdict: "NATIVE_GREEN", executorSummary: { ODG_NATIVE_EXECUTION: 1 }, steps: [{ step: "g", executor: "ODG_NATIVE_EXECUTION" }, { step: "x", executor: { o: "PROVIDER" } }] }, "NEP-M");
  check("malformed non-string-executor step ⇒ contaminating (nonNative), attributable false, actor null", mal.nonNativeSteps.length === 1 && mal.attributable === false && P.resolveActor(mal).actor === null);

  // F1 corroboration: a forged PURE-native object missing the engine's self-report is rejected (raises the forgery bar)
  check("forged pure-native cycle WITHOUT executorSummary ⇒ not corroborated ⇒ actor null", P.attributeNativeCycle({ missionId: "NEP-NC", nativeCycle: true, verdict: "NATIVE_GREEN", steps: [{ step: "g", executor: "ODG_NATIVE_EXECUTION" }] }, "NEP-NC").provenance.actor === null);
  // F1 TRUST BOUNDARY (honest documented limit): a fully-corroborated hand-forged object DOES stamp ODG — this is a pure
  // mapper that trusts a genuine engine result at its input boundary; it is NOT an absolute no-laundering guarantee.
  check("TRUST BOUNDARY: a fully-corroborated hand-forged object stamps ODG (honest limit of a pure mapper — asserted, not hidden)", P.attributeNativeCycle({ missionId: "NEP-TB", nativeCycle: true, verdict: "NATIVE_GREEN", executorSummary: { ODG_NATIVE_EXECUTION: 1 }, steps: [{ step: "g", executor: "ODG_NATIVE_EXECUTION" }] }, "NEP-TB").provenance.actor === "ODG");

  // ── ACTUAL REPOSITORY INPUT: drive the native loop over a REAL on-disk file source (read-only; proposes only) ──
  const fs = require("fs");
  const crypto = require("crypto");
  const realPath = "runtime/core/odg-closed-executor.ts";
  const beforeHash = crypto.createHash("sha256").update(fs.readFileSync(realPath)).digest("hex");
  const row = L.driveSource({ filePath: realPath, source: fs.readFileSync(realPath, "utf8") }, { writeSet: [realPath] });
  const afterHash = crypto.createHash("sha256").update(fs.readFileSync(realPath)).digest("hex");
  check("real repo file driven natively (ALREADY_CLEAN or NATIVE_REPAIRED), nativelyExecuted, file UNCHANGED on disk (sha256 identical)", (row.disposition === "ALREADY_CLEAN" || row.disposition === "NATIVE_REPAIRED") && row.nativelyExecuted === true && beforeHash === afterHash);
  const le = P.fromLoopResult(row, "REAL-FILE-1");
  const lp = P.resolveActor(le);
  check("real-file native execution ⇒ actor=ODG via the REAL resolver (actual repository input)", le.executed.length === 1 && le.attributable === true && lp.actor === "ODG");

  // loop batch: natively-executed rows attributed ODG; deferred/refused/failed surfaced, never stamped
  const batch = L.demonstrate().result;
  const be = P.fromLoopResult(batch, "BATCH-1");
  check("loop batch ⇒ native rows mapped to ODG; deferred + refused surfaced separately, never stamped ODG", be.executed.length === batch.nativelyExecuted && be.deferredToProvider.length === batch.deferredToProvider && be.refusedOutOfScope.length === batch.refusedOutOfScope && P.resolveActor(be).actor === "ODG");
  // F4: a FAILED-native row is surfaced in failed[] (not buried), excluded from executed[], never stamped ODG
  const withFailed = P.fromLoopResult({ rows: [{ disposition: "NATIVE_REPAIRED", nativelyExecuted: true, id: "a" }, { disposition: "FAILED", nativelyExecuted: true, id: "c", reason: "boom" }] }, "BATCH-F");
  check("loop FAILED-native row surfaced in failed[], excluded from executed[], repaired row still actor ODG", withFailed.executed.length === 1 && withFailed.failed.length === 1 && withFailed.failed[0].id === "c" && P.resolveActor(withFailed).actor === "ODG");

  // ── FAIL-CLOSED ──
  check("fail-closed: non-object cycle ⇒ BAD_CYCLE; missing mission ⇒ BAD_MISSION; non-object loop ⇒ BAD_LOOP_RESULT", P.fromNativeCycle(null, "M").code === "BAD_CYCLE" && P.fromNativeCycle({ nativeCycle: true, steps: [] }, "").code === "BAD_MISSION" && P.fromLoopResult(42, "M").code === "BAD_LOOP_RESULT");
  check("resolveActor on a failed/invalid evidence ⇒ actor null", P.resolveActor({ ok: false }).actor === null && P.resolveActor(null).actor === null);

  // ── honesty + determinism + frozen + contract ──
  check("never fabricates: a non-native cycle yields no ODG executed entry", P.fromNativeCycle({ nativeCycle: false, steps: [{ step: "s", executor: "ODG_NATIVE_EXECUTION" }] }, "M").executed.length === 0);
  check("deterministic", JSON.stringify(P.attributeNativeCycle(cyc, "NEP-1")) === JSON.stringify(P.attributeNativeCycle(cyc, "NEP-1")));
  check("frozen (evidence + executed + provenance)", Object.isFrozen(a.evidence) && Object.isFrozen(a.evidence.executed) && Object.isFrozen(a.provenance));
  check("contract: reuses real resolver; never fabricates; owner-gated write excluded; honest TRUST BOUNDARY stated",
    P.NATIVE_EXECUTION_PROVENANCE_CONTRACT.invariants.some((s: string) => /never fabricates native provenance/.test(s)) &&
    P.NATIVE_EXECUTION_PROVENANCE_CONTRACT.invariants.some((s: string) => /OWNER_GATED/.test(s)) &&
    P.NATIVE_EXECUTION_PROVENANCE_CONTRACT.invariants.some((s: string) => /TRUST BOUNDARY/.test(s)) &&
    P.NATIVE_EXECUTION_PROVENANCE_CONTRACT.invariants.some((s: string) => /NOT an absolute no-laundering guarantee/.test(s)) &&
    P.NATIVE_EXECUTION_PROVENANCE_CONTRACT.reuses.some((s: string) => /actor-provenance/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-execution-provenance (V324 §5/§12: the missing native-execution→provenance connector; genuine native cycle → honest evidence → REAL actor-provenance resolver ⇒ actor=ODG; owner-gated real-repo write EXCLUDED+declared; escalated/non-native ⇒ no attribution; mixed/malformed ⇒ contaminated/not-attributable; corroboration rejects trivial forgeries; fully-corroborated forgery is an ASSERTED honest trust-boundary limit; ACTUAL repo-file native execution ⇒ ODG; FAILED rows surfaced; fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

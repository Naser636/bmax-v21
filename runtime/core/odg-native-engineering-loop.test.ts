#!/usr/bin/env node
"use strict";
/* V250 §3 — native engineering loop (decide→drive). Proves: it REALLY executes deterministic repairs natively via
 * odg-transform-catalog (no model/provider); enforces the write-set (out-of-scope REFUSED before any action); honestly
 * DEFERS novel/judgment tasks to a provider mandate (never faked native); PROPOSES acceptance but never self-accepts;
 * measures real dependency reduction; reuses existing engines (no 2nd engine); deterministic + frozen. */
const L = require("./odg-native-engineering-loop.js");
const T = require("./odg-transform-catalog.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // REAL native execution of a known deterministic transform (seed→repair→verify via the catalog).
  const classId = T.TRANSFORM_IDS[0];
  const one = L.driveTask({ classId }, { writeSet: [] });
  check("deterministic task EXECUTED NATIVELY (verified repair, no model/provider) ⇒ NATIVE_REPAIRED, nativelyExecuted", one.disposition === "NATIVE_REPAIRED" && one.nativelyExecuted === true && one.verified === true);
  check("the loop PROPOSES acceptance but NEVER self-accepts (accepted=false)", one.proposedAcceptance === true && one.accepted === false);

  // write-set: a filePath outside the write-set is REFUSED before any action (deny-by-default).
  const oos = L.driveTask({ classId, filePath: "etc/passwd.ts", source: "x" }, { writeSet: ["runtime/core/ok.ts"] });
  check("out-of-scope filePath ⇒ REFUSED_OUT_OF_SCOPE, nothing executed", oos.disposition === "REFUSED_OUT_OF_SCOPE" && oos.nativelyExecuted === false);
  const inScope = L.driveTask({ classId, filePath: "runtime/core/ok.ts" }, { writeSet: ["runtime/core/ok.ts"] });
  check("in-scope filePath ⇒ executed natively", inScope.disposition === "NATIVE_REPAIRED" && inScope.nativelyExecuted === true);

  // novel/judgment ⇒ honest DEFER to a provider mandate (never faked as native).
  const novel = L.driveTask({ classId: "invent-a-new-feature@1", filePath: "runtime/core/x.ts" }, { writeSet: ["runtime/core/x.ts"] });
  check("novel task (no deterministic transform) ⇒ DEFERRED_TO_PROVIDER, not native, with a provider mandate", novel.disposition === "DEFERRED_TO_PROVIDER" && novel.nativelyExecuted === false && !!novel.providerMandate);

  // already-compliant source (catalog NATIVE_GREEN) ⇒ ALREADY_CLEAN, not FAILED (no false repair, no mislabel).
  const alreadyClean = L.driveTask({ classId: "ensure-dual-export@1", source: '"use strict";\nmodule.exports={x:1};\nexport {};\n' }, { writeSet: [] });
  check("already-compliant source ⇒ ALREADY_CLEAN (nativelyExecuted, not changed, not a false repair/FAILED)", alreadyClean.disposition === "ALREADY_CLEAN" && alreadyClean.nativelyExecuted === true && alreadyClean.changed === false);

  // full batch run + honest dependency-reduction measure.
  const d = L.demonstrate();
  check("REAL batch: all 5 deterministic transform classes repaired NATIVELY (not simulated)", d.result.nativeRepaired === 5 && d.result.nativelyExecuted === 5 && d.nativeExecutionProven === true);
  check("scope enforced (1 out-of-scope refused) + honest defer (1 novel ⇒ provider)", d.scopeEnforced === true && d.honestDefer === true);
  check("measured dependency reduction: native share reported honestly (deterministic done natively, novel deferred)", d.result.dependencyReduction.tasksDoneNativelyNoProvider === 5 && d.result.dependencyReduction.tasksDeferredToProvider === 1 && /no Claude Code, no Ollama/.test(d.result.dependencyReduction.note) && /never self-accepts/.test(d.result.dependencyReduction.note));

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(L.demonstrate()) === JSON.stringify(d) && Object.isFrozen(d) && Object.isFrozen(d.result.rows));
  check("contract: reuses transform-catalog + delegate-isolation, native-exec vs honest-defer, no self-accept, no 2nd engine", L.NATIVE_ENGINEERING_LOOP_CONTRACT.invariants.some((i: string) => /REUSES odg-transform-catalog/.test(i)) && L.NATIVE_ENGINEERING_LOOP_CONTRACT.invariants.some((i: string) => /honestly DEFERRED/.test(i)) && L.NATIVE_ENGINEERING_LOOP_CONTRACT.invariants.some((i: string) => /NEVER self-accepts/.test(i)));

  // ---- V251 §3: driveSource — composed native repair over a REAL multi-defect file source ----
  const compoundSrc = 'function g(a, b) { return a == b; }\nmodule.exports = { g };\n';   // missing use-strict + dual-export + loose ==
  const dv = L.driveSource({ filePath: "runtime/core/ok.ts", source: compoundSrc }, { writeSet: ["runtime/core/ok.ts"] });
  check("driveSource COMPOSES ≥3 transforms on a real multi-defect source ⇒ NATIVE_REPAIRED, native, verified, never writes disk", dv.disposition === "NATIVE_REPAIRED" && dv.nativelyExecuted === true && dv.composedTransforms >= 3 && dv.verified === true && dv.wroteToDisk === false && dv.realRepoWrite === "OWNER_GATED");
  check("driveSource PROPOSES acceptance but NEVER self-accepts (accepted=false)", dv.proposedAcceptance === true && dv.accepted === false);
  const dvOos = L.driveSource({ filePath: "etc/passwd.ts", source: compoundSrc }, { writeSet: ["runtime/core/ok.ts"] });
  check("driveSource out-of-scope filePath ⇒ REFUSED_OUT_OF_SCOPE before any action (deny-by-default)", dvOos.disposition === "REFUSED_OUT_OF_SCOPE" && dvOos.nativelyExecuted === false);
  const dvClean = L.driveSource({ filePath: "runtime/core/ok.ts", source: '"use strict";\nmodule.exports = { x: 1 };\nexport {};\n' }, { writeSet: ["runtime/core/ok.ts"] });
  check("driveSource already-clean source ⇒ ALREADY_CLEAN (not a false repair)", dvClean.disposition === "ALREADY_CLEAN" && dvClean.changed === false);
  const rr = L.demonstrateRealReach();
  check("demonstrateRealReach: compound file repaired natively (composed), clean recognised, scope enforced, never self-accepts", rr.composedNativeProven === true && rr.cleanRecognised === true && rr.scopeEnforced === true && rr.neverSelfAccepts === true);
  check("driveSource deterministic + frozen + fail-closed on missing source", JSON.stringify(L.demonstrateRealReach()) === JSON.stringify(rr) && Object.isFrozen(dv) && L.driveSource({ filePath: "runtime/core/ok.ts" }, { writeSet: ["runtime/core/ok.ts"] }).disposition === "FAILED");
  check("contract invariant records V251 driveSource composed real-file repair (write-set, OWNER_GATED, no self-accept)", L.NATIVE_ENGINEERING_LOOP_CONTRACT.invariants.some((i: string) => /driveSource/.test(i) && /COMPOSED/.test(i) && /OWNER_GATED/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — native-engineering-loop (V250 §3: the decide→drive loop REALLY executes deterministic repairs natively via odg-transform-catalog [no model/provider] — 5/5 transform classes repaired+verified, write-set enforced [out-of-scope refused], novel honestly deferred to provider, proposes-but-never-self-accepts; first measured dependency reduction; no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

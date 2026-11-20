#!/usr/bin/env node
"use strict";
/* Tests for odg-local-model-execution-policy (V327 §3). Encodes the MEASURED model-size/repair-depth findings into a
 * calibrated resource policy: cheap-reliable stays cheap; medium-hard gets repair depth; low-P gets the large model +
 * repair + ESCALATE flag; no calibrated evidence ⇒ cheap probe. Deterministic (synthetic histories). */
const M = require("./odg-local-model-execution-policy.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const h = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: "t", verified: true })), ...Array(f).fill(0).map(() => ({ missionType: "t", verified: false }))];

function main(): void {
  // CALIBRATED HIGH ⇒ cheap/fast (measured-sufficient)
  const hi = M.chooseExecutionPolicy("t", h(18, 2)); // p=0.9
  check("CALIBRATED high P ⇒ NATIVE_CHEAP (3b, maxRepair 1)", hi.tier === "NATIVE_CHEAP" && hi.model === "qwen2.5-coder:3b" && hi.maxRepair === 1 && hi.escalateIfStillFails === false);

  // CALIBRATED MEDIUM ⇒ repair depth (the measured lever for infix/lru)
  const mid = M.chooseExecutionPolicy("t", h(10, 10)); // p=0.5
  check("CALIBRATED medium P ⇒ NATIVE_REPAIR (3b, maxRepair 3) — the measured repair-depth lever", mid.tier === "NATIVE_REPAIR" && mid.model === "qwen2.5-coder:3b" && mid.maxRepair === 3);

  // CALIBRATED LOW ⇒ large model + repair + escalate flag (measured: some low-P types unsolved by local compute)
  const lo = M.chooseExecutionPolicy("t", h(4, 16)); // p=0.2
  check("CALIBRATED low P ⇒ NATIVE_MAX_THEN_ESCALATE (7b, maxRepair 3, escalate flagged)", lo.tier === "NATIVE_MAX_THEN_ESCALATE" && lo.model === "qwen2.5-coder:7b" && lo.maxRepair === 3 && lo.escalateIfStillFails === true);

  // NOT CALIBRATED ⇒ cheap probe (never spend the large model on a hunch)
  const thin = M.chooseExecutionPolicy("t", h(2, 1));
  check("thin (DEGRADED) ⇒ PROBE (3b, maxRepair 1) — gather data, never over-commit", thin.tier === "PROBE" && thin.model === "qwen2.5-coder:3b" && thin.maxRepair === 1 && thin.escalateIfStillFails === false);
  const biased = M.chooseExecutionPolicy("t", h(12, 0));
  check("survivorship BIASED ⇒ PROBE (never escalate resource on a flattering/biased rate)", biased.quality === "BIASED" && biased.tier === "PROBE" && biased.maxRepair === 1);
  const empty = M.chooseExecutionPolicy("t", []);
  check("empty (UNKNOWN) ⇒ PROBE", empty.tier === "PROBE" && empty.model === "qwen2.5-coder:3b");

  // resource is monotonic in difficulty: maxRepair/model never DECREASE as P drops across calibrated bands
  check("resource monotonic: high⇒{3b,1} ≤ medium⇒{3b,3} ≤ low⇒{7b,3}", hi.maxRepair <= mid.maxRepair && mid.maxRepair <= lo.maxRepair && lo.model === "qwen2.5-coder:7b");

  // honesty: authorizes nothing; promises no fix (escalate flag on low-P)
  check("policy authorizes nothing", hi.authorizes === false && lo.authorizes === false);
  check("fail-closed: non-array history tolerated ⇒ PROBE (UNKNOWN)", M.chooseExecutionPolicy("t", "x").tier === "PROBE");

  // frozen + determinism + contract
  check("frozen + deterministic", Object.isFrozen(hi) && JSON.stringify(M.chooseExecutionPolicy("t", h(10, 10))) === JSON.stringify(M.chooseExecutionPolicy("t", h(10, 10))));
  check("contract: reuses calibrated-P, encodes measured evidence, escalates only on calibrated need, promises no fix",
    M.EXECUTION_POLICY_CONTRACT.reuses.some((s: string) => /derivePsuccess/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.reuses.some((s: string) => /MODEL_CHOICE,REPAIR_DEPTH/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.invariants.some((s: string) => /never spend the large model on a hunch/.test(s)) &&
    M.EXECUTION_POLICY_CONTRACT.invariants.some((s: string) => /promises NO fix/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-local-model-execution-policy (V327 §3: MEASURED findings → calibrated resource policy; CALIBRATED high⇒3b/1 cheap, medium⇒3b/3 repair-depth, low⇒7b/3+ESCALATE; not-calibrated⇒cheap PROBE [never over-commit on a hunch/biased rate]; resource monotonic in difficulty; promises no fix [low-P escalate-flagged]; authorizes nothing; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

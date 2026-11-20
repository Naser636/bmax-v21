#!/usr/bin/env node
"use strict";
/* Tests for odg-intelligent-native-cycle (V327 §5/§7). Proves the single REAL consumer composes the previously-orphan
 * built intelligence — routing (select), policy (resources), policy-seam, native-engineering-cycle, decomposition,
 * escalation — in the honest order. Deterministic (injected generator + buildProject; no live model). */
const IC = require("./odg-intelligent-native-cycle.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const h = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ missionType: "t", verified: true })), ...Array(f).fill(0).map(() => ({ missionType: "t", verified: false }))];
const genFor = () => () => ({ ok: true, content: "module.exports=()=>1" });
const mission = { id: "X", type: "t", spec: { name: "X", architecture: [{ path: "f.js", role: "r", contract: "c" }], independentTest: () => true } };

async function main(): Promise<void> {
  // ACCEPTED (calibrated-high ⇒ cheap 3b/1; independent verifier accepts ⇒ no escalation)
  const acc = await IC.runIntelligentCycle({ mission, history: h(18, 2), generatorFor: genFor, deps: { buildProject: async (_s: any, d: any) => ({ accepted: true, verified: true, repairs: d.maxRepair }) } });
  check("ACCEPTED: policy cheap (3b/maxRepair1), accepted, no escalation (consumes policy + policy-seam + cycle)", acc.accepted === true && acc.policy.model === "qwen2.5-coder:3b" && acc.policy.maxRepair === 1 && acc.escalation.escalate === false);

  // REJECTED + calibrated-LOW ⇒ policy max (7b/3) + evidence-gated ESCALATION to provider (consumes policy + escalation + sovereign-delegation)
  const esc = await IC.runIntelligentCycle({ mission, history: h(4, 16), generatorFor: genFor, deps: { buildProject: async () => ({ accepted: false, verified: false }) } });
  check("REJECTED+low ⇒ policy 7b/maxRepair3 AND escalate to provider (delegation CREATED, CLAUDE_CODE_PROVIDER)", esc.policy.model === "qwen2.5-coder:7b" && esc.policy.maxRepair === 3 && esc.escalation.escalate === true && esc.escalation.attribution === "CLAUDE_CODE_PROVIDER" && esc.escalation.delegationState === "CREATED");

  // REJECTED + THIN ⇒ NO escalation (evidence-gated — keep probing, not premature)
  const thin = await IC.runIntelligentCycle({ mission, history: h(2, 1), generatorFor: genFor, deps: { buildProject: async () => ({ accepted: false }) } });
  check("REJECTED+thin ⇒ NO escalation (evidence-gated, keep probing)", thin.escalation.escalate === false && /keep probing/.test(thin.note));

  // REJECTED but DECOMPOSITION solves it ⇒ no escalation (consumes decomposed-execution; intermediate verification)
  const dmission = { ...mission, decomposition: [{ id: "s1", spec: { name: "s1", architecture: [{ path: "s1.js", role: "r", contract: "c" }], independentTest: () => true } }] };
  const dec = await IC.runIntelligentCycle({ mission: dmission, history: h(4, 16), generatorFor: genFor, deps: { buildProject: async (s: any) => ({ accepted: s.name === "s1", verified: s.name === "s1", modules: {} }) } });
  check("REJECTED whole but DECOMPOSITION all-verified ⇒ solved, no escalation (consumes decomposed-execution)", dec.decomposition && dec.decomposition.allVerified === true && dec.escalation.escalate === false && /decomposition/.test(dec.note));

  // V327 §3 SELF-CALIBRATION: no explicit history, but ACCUMULATED native-build outcomes (keyed by the store's complexity
  // key) drive the policy via odg-calibration-key ⇒ the cycle learns from its OWN outcomes. KEY reconstructs from the spec.
  const KEY = "native-build:MONOLITHIC:TRIVIAL"; // mission.spec = 1-file arch ⇒ chooseStrategy MONOLITHIC / complexity TRIVIAL
  const po = (s: number, f: number): any[] => [...Array(s).fill(0).map(() => ({ type: KEY, outcome: "SUCCESS", independentlyVerified: true })), ...Array(f).fill(0).map(() => ({ type: KEY, outcome: "FAILURE", independentlyVerified: true }))];
  const scHigh = await IC.runIntelligentCycle({ mission, generatorFor: genFor, deps: { priorOutcomes: po(18, 2), buildProject: async () => ({ accepted: true, verified: true }) } });
  check("SELF-CALIBRATED high (store 18✓/2✗, no explicit history) ⇒ cheap policy 3b/1; selfCalibrated.key = store key, KNOWN, 20 obs", scHigh.policy.model === "qwen2.5-coder:3b" && scHigh.policy.maxRepair === 1 && scHigh.selfCalibrated && scHigh.selfCalibrated.key === KEY && scHigh.selfCalibrated.confidence === "KNOWN" && scHigh.selfCalibrated.observations === 20);
  const scLow = await IC.runIntelligentCycle({ mission, generatorFor: genFor, deps: { priorOutcomes: po(4, 16), buildProject: async () => ({ accepted: false }) } });
  check("SELF-CALIBRATED low (store 4✓/16✗) ⇒ policy 7b/3 + escalate (learned from its own accumulated outcomes)", scLow.policy.model === "qwen2.5-coder:7b" && scLow.policy.maxRepair === 3 && scLow.escalation.escalate === true);
  // explicit history WINS over the store (backward-compatible): high history + low store ⇒ cheap, selfCalibrated null
  const win = await IC.runIntelligentCycle({ mission, history: h(18, 2), generatorFor: genFor, deps: { priorOutcomes: po(4, 16), buildProject: async () => ({ accepted: true, verified: true }) } });
  check("explicit history WINS over the store (backward-compatible) ⇒ cheap policy, selfCalibrated null", win.policy.model === "qwen2.5-coder:3b" && win.selfCalibrated === null);

  // V327 §2 BEHAVIORAL OBSOLESCENCE: a REGRESSING class (point-belief MEDIUM 0.5 ⇒ policy would NOT escalate) still
  // escalates because the trend shows more local probing won't help. Isolates the §2 effect (LOW band is 0.3).
  const Sx = () => ({ type: KEY, outcome: "SUCCESS", independentlyVerified: true });
  const Fr = (r: string) => ({ type: KEY, outcome: "FAILURE", independentlyVerified: true, reason: r });
  const regPo = [...Array(10).fill(0).map(Sx), ...Array(10).fill(0).map(() => Fr("stuck"))]; // early 1.0 → recent 0.0, overall 0.5
  const regR = await IC.runIntelligentCycle({ mission, generatorFor: genFor, deps: { priorOutcomes: regPo, buildProject: async () => ({ accepted: false }) } });
  check("§2 REGRESSING (point-belief MEDIUM 0.5 — policy tier NATIVE_REPAIR, would NOT escalate) ⇒ behavioral obsolescence FORCES escalate", regR.behavioral.verdict === "REGRESSING" && regR.behavioral.obsolete === true && regR.policy.tier === "NATIVE_REPAIR" && regR.escalation.escalate === true && /behaviorally obsolete/.test(regR.note));
  // contrast: a PLATEAU medium class (not obsolete, distinct recent failures) ⇒ NO forced escalation (keep probing)
  const platPo = [...Array(6).fill(0).map(Sx), Fr("e1"), Fr("e2"), Fr("e3"), Fr("e4"), ...Array(7).fill(0).map(Sx), Fr("a"), Fr("b"), Fr("c")]; // ~0.6→0.7 flat, distinct fails
  const platR = await IC.runIntelligentCycle({ mission, generatorFor: genFor, deps: { priorOutcomes: platPo, buildProject: async () => ({ accepted: false }) } });
  check("§2 PLATEAU medium (not obsolete, no recurring signature) ⇒ NO forced escalation (keep probing) — contrast with REGRESSING", platR.behavioral.verdict === "PLATEAU" && platR.behavioral.obsolete === false && platR.escalation.escalate === false && /keep probing/.test(platR.note));

  // selectIntelligently consumes routing: calibrated data flips the selection (unreliable→reliable)
  const reg = { version: "r", items: [{ id: "A_unreliable", status: "READY", deps: [], priority: 5, missionType: "unreliable" }, { id: "B_reliable", status: "READY", deps: [], priority: 5, missionType: "reliable" }] };
  const sel = IC.selectIntelligently(reg, [...h(0, 0), ...Array(4).fill({ missionType: "unreliable", verified: true }), ...Array(16).fill({ missionType: "unreliable", verified: false }), ...Array(18).fill({ missionType: "reliable", verified: true }), ...Array(2).fill({ missionType: "reliable", verified: false })]);
  check("selectIntelligently (routing) flips the pick to the calibrated-reliable mission", sel.changed === true && sel.routedSelected === "B_reliable");

  // fail-closed + frozen + contract
  check("fail-closed: bad input ⇒ BAD_INPUT", (await IC.runIntelligentCycle({})).code === "BAD_INPUT" && (await IC.runIntelligentCycle({ mission: { id: "x" }, generatorFor: genFor })).code === "BAD_INPUT");
  check("frozen result", Object.isFrozen(acc) && Object.isFrozen(acc.policy));
  check("contract: NOT a 2nd orchestrator; independent verifier arbitrates; consumes the orphan capabilities",
    IC.INTELLIGENT_NATIVE_CYCLE_CONTRACT.invariants.some((s: string) => /NOT a second orchestrator/.test(s)) &&
    IC.INTELLIGENT_NATIVE_CYCLE_CONTRACT.invariants.some((s: string) => /INDEPENDENT verifier .* still arbitrates/.test(s)) &&
    IC.INTELLIGENT_NATIVE_CYCLE_CONTRACT.reuses.some((s: string) => /#771/.test(s)) &&
    IC.INTELLIGENT_NATIVE_CYCLE_CONTRACT.reuses.some((s: string) => /#778/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-intelligent-native-cycle (V327 §5/§7: the single REAL consumer of routing#771/policy#774/seam#776/decomposition#775/escalation#778 over native-engineering-cycle; select→execute[policy seam]→decompose-if-hard→escalate-only-if-calibrated-low; ACCEPTED⇒cheap/no-escalate, low+fail⇒7b/3+provider-delegation, thin+fail⇒probe, decomp-solved⇒no-escalate; independent verifier arbitrates; no 2nd orchestrator; fail-closed/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

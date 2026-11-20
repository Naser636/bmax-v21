#!/usr/bin/env node
"use strict";
/* Tests for odg-execution-routing (V327 §2). Proves the REAL calibrated-P signal CHANGES native selection — by adjusting
 * priority and REUSING campaign-controller.selectNextLot — ONLY when a CALIBRATED verdict justifies it (thin/biased/empty
 * ⇒ no change, baseline preserved). Deterministic (synthetic histories). */
const R = require("./odg-execution-routing.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (t: string, v: boolean) => ({ missionType: t, verified: v });
const h = (t: string, s: number, f: number): any[] => [...Array(s).fill(0).map(() => rec(t, true)), ...Array(f).fill(0).map(() => rec(t, false))];
const reg = () => ({ version: "r", items: [
  { id: "A_unreliable", status: "READY", deps: [], priority: 5, missionType: "unreliable" },
  { id: "B_reliable", status: "READY", deps: [], priority: 5, missionType: "reliable" },
] });

function main(): void {
  const calHist = [...h("unreliable", 4, 16), ...h("reliable", 18, 2)]; // both CALIBRATED: 0.2 and 0.9

  // ── routeType tiers from calibrated verdicts ──
  check("CALIBRATED high P ⇒ NATIVE_LOCAL (prefer, priorityDelta -1)", (() => { const r = R.routeType("reliable", calHist); return r.tier === "NATIVE_LOCAL" && r.pForPlanner === 0.9 && r.priorityDelta === -1; })());
  check("CALIBRATED low P ⇒ ESCALATE_PROVIDER (deprioritise, +100)", (() => { const r = R.routeType("unreliable", calHist); return r.tier === "ESCALATE_PROVIDER" && r.pForPlanner === 0.2 && r.priorityDelta === 100; })());
  check("thin (not CALIBRATED) ⇒ NATIVE_PROBE, no priority change (never escalate on no evidence)", (() => { const r = R.routeType("x", [...h("x", 1, 2)]); return r.tier === "NATIVE_PROBE" && r.priorityDelta === 0; })());
  check("survivorship all-success ⇒ BIASED ⇒ NATIVE_PROBE (never prefer on a biased rate)", (() => { const r = R.routeType("y", h("y", 12, 0)); return r.quality === "BIASED" && r.tier === "NATIVE_PROBE" && r.priorityDelta === 0; })());

  // ── the DECISION CHANGES only when calibrated justifies it (reusing selectNextLot) ──
  const withData = R.prioritizeAndSelect(reg(), calHist);
  check("CALIBRATED data CHANGES the selection: baseline picks A_unreliable, routed picks B_reliable", withData.baselineSelected === "A_unreliable" && withData.routedSelected === "B_reliable" && withData.changed === true && withData.routedTier === "NATIVE_LOCAL");
  const thin = R.prioritizeAndSelect(reg(), [...h("unreliable", 1, 2), ...h("reliable", 2, 1)]);
  check("THIN data ⇒ NO change (baseline preserved; decisions change only when data justifies)", thin.changed === false && thin.routedSelected === "A_unreliable");
  const empty = R.prioritizeAndSelect(reg(), []);
  check("EMPTY history ⇒ NO change (fail-closed, baseline preserved)", empty.changed === false && empty.routedSelected === "A_unreliable");

  // ── selectNextLot gates are preserved (deps/no-repeat): routing never selects an inadmissible lot ──
  const depReg = { version: "r", items: [
    { id: "A_unreliable", status: "READY", deps: ["gate"], priority: 5, missionType: "unreliable" },
    { id: "gate", status: "READY", deps: [], priority: 9, missionType: "reliable" },
  ] };
  const depSel = R.prioritizeAndSelect(depReg, calHist);
  check("deps respected: even with routing, only the dependency-admissible lot is selectable (gate before A)", depSel.routedSelected === "gate");

  // ── fail-closed + frozen + contract ──
  check("fail-closed: bad register ⇒ BAD_REGISTER", R.prioritizeAndSelect({}, calHist).code === "BAD_REGISTER" && R.prioritizeAndSelect(null, []).code === "BAD_REGISTER");
  check("routing authorizes nothing", R.routeType("reliable", calHist).authorizes === false && /AUTHORIZES NOTHING/.test(withData.note));
  check("frozen result", Object.isFrozen(withData) && Object.isFrozen(withData.routing) && Object.isFrozen(R.routeType("reliable", calHist)));
  check("deterministic", JSON.stringify(R.prioritizeAndSelect(reg(), calHist)) === JSON.stringify(R.prioritizeAndSelect(reg(), calHist)));
  check("contract: reuses selectNextLot + calibrated-P; change only when CALIBRATED; no 2nd orchestrator",
    R.EXECUTION_ROUTING_CONTRACT.reuses.some((s: string) => /selectNextLot/.test(s)) &&
    R.EXECUTION_ROUTING_CONTRACT.invariants.some((s: string) => /decisions change ONLY on a CALIBRATED verdict/.test(s)) &&
    R.EXECUTION_ROUTING_CONTRACT.invariants.some((s: string) => /never escalate on no\/insufficient\/biased evidence/.test(s)) &&
    R.EXECUTION_ROUTING_CONTRACT.invariants.some((s: string) => /builds NO second selector/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-execution-routing (V327 §2: calibrated-P CHANGES native selection via priority + REUSED campaign-controller.selectNextLot; CALIBRATED high⇒NATIVE_LOCAL/prefer, low⇒ESCALATE_PROVIDER/deprioritise, not-calibrated⇒NATIVE_PROBE/no-change; decision flips ONLY when a CALIBRATED verdict justifies [thin/biased/empty⇒baseline preserved]; deps/no-repeat gates intact; authorizes nothing; no 2nd orchestrator; fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

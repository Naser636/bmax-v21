#!/usr/bin/env node
"use strict";
/* Tests for odg-radar-to-deferred-lot (V360 §1/§6). Qualified radar proposals → DEFERRED governed lots (via the canonical
 * frontier-radar-store); selectNextLot NEVER picks a DEFERRED lot (activation owner-gated); idempotent; non-PROPOSED refused. */
const M = require("./odg-radar-to-deferred-lot.js");
const RADAR = require("./frontier-radar.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// produce REAL frontier-radar proposals (same path as the pipeline): a qualified signal → runRadar → report.proposals.
const reg0 = RADAR.registerSource({}, { id: "ted", owner: "EU", url: "https://api.ted.europa.eu/v3/notices/search", type: "api", reliability: 0.9 }, { now: "t0" }).registry;
const report = RADAR.runRadar({ registry: reg0, rawSignals: [{ sourceId: "ted", title: "Faster parser", categories: ["parsing"], claims: ["2x"] }], baseline: { focusAreas: ["parsing"], crossChecked: true }, odgBaseline: { capabilities: [] }, now: "t0" });
const proposals = report.proposals;

function main(): void {
  check("precondition: frontier-radar produced ≥1 qualified PROPOSAL", Array.isArray(proposals) && proposals.length >= 1);

  // integrate ⇒ DEFERRED governed lot(s); NONE selectable (activation owner-gated).
  const r = M.integrateProposals(proposals, { items: [] }, { now: "t0" });
  check("proposals integrated as DEFERRED governed lots (≥1)", r.deferred.length >= 1 && r.register.items.length >= 1);
  check("GOVERNANCE: no DEFERRED lot is selectable by the canonical selector (activation owner-gated)", r.anyDeferredSelectable === false);
  check("the integrated lot is DEFERRED + authorizationRequired (not auto-executable)", r.register.items.every((it: any) => it.status === "DEFERRED" && it.authorizationRequired === true));

  // idempotent: re-integrating the same proposals ⇒ no duplicate lot.
  const r2 = M.integrateProposals(proposals, r.register, { now: "t0" });
  check("idempotent: re-integration ⇒ no new lot (idempotent), register unchanged in size", r2.deferred.length === 0 && r2.idempotent.length >= 1 && r2.register.items.length === r.register.items.length);

  // fail-closed: a non-PROPOSED / permission object ⇒ REFUSED (never a lot).
  const bad = M.integrateProposals([{ foo: 1 }, { candidateId: "x", status: "ACCEPTED" }], { items: [] });
  check("non-PROPOSED object ⇒ REFUSED (never becomes a lot)", bad.deferred.length === 0 && bad.refused.length === 2 && bad.register.items.length === 0);

  // frozen + contract
  check("frozen result", Object.isFrozen(r) && Object.isFrozen(r.deferred));
  check("contract: DEFERRED never auto-selected; reuses frontier-radar-store + selectNextLot; no new store/scheduler",
    /NEVER picks a DEFERRED lot/.test(JSON.stringify(M.RADAR_TO_DEFERRED_LOT_CONTRACT.invariants)) &&
    /frontier-radar-store/.test(JSON.stringify(M.RADAR_TO_DEFERRED_LOT_CONTRACT.reuses)) &&
    /no second store/.test(JSON.stringify(M.RADAR_TO_DEFERRED_LOT_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-radar-to-deferred-lot (V360 §1/§6: qualified radar proposals → DEFERRED governed lots via canonical frontier-radar-store; selectNextLot NEVER picks DEFERRED [activation owner-gated]; idempotent; non-PROPOSED refused; no mission/permission; no 2nd store/scheduler)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

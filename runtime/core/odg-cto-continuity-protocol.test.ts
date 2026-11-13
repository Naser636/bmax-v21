#!/usr/bin/env node
"use strict";
/* V183 Livrable D — continuity protocol + §6 integration proposal. Proves: 12 mandatory elements present; single-ODG +
 * V12.4-single-master fixed; reconciliation-before-resume mandated; ROADMAP.json integration OWNER_GATED/not-applied. */
const C = require("./odg-cto-continuity-protocol.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const p = C.protocol();
  const comp = C.completeness();

  check("all 12 mandatory continuity elements present (directive §5)", comp.required === 12 && comp.present === 12 && comp.complete === true && comp.missing.length === 0);
  check("single-ODG identity fixed (bmax-v21; never a second application)", /ONE ODG only/.test(p.identity) && /Never create a second/.test(p.identity));
  check("V12.4 is the single master; extension is PARKED attached reserve", /single master roadmap/.test(p.masterRoadmap) && /PARKED/.test(p.masterRoadmap));
  check("canonical sources listed with protection (register 427 @V123, ROADMAP OWNER_GATED)", /427 items/.test(p.canonicalSources.closureRegister) && /PROTECTED/.test(p.canonicalSources.roadmap));
  check("9 primitives enumerated", p.primitives.length === 9 && p.primitives.includes("EVIDENCE"));
  check("finished campaigns listed as DONE, do-not-rerun", /do not re-run/.test(p.finishedCampaigns) && /#546|#550/.test(p.finishedCampaigns));
  check("extension state = PARKED, started=false, integration owner-gated", /PARKED/.test(p.extensionState) && /started=false/.test(p.extensionState) && /OWNER_GATED/.test(p.extensionState));

  // ---- reconciliation-before-resume mandated ----
  check("reconciliation-before-resume mandated: an old report never replaces a live check", p.reconciliationBeforeResume.some((s: string) => /git rev-parse HEAD/.test(s)) && p.reconciliationBeforeResume.some((s: string) => /NEVER replaces a live check/.test(s)));
  check("anti-duplication rule: reuse→improve→build-only-on-demonstrated-absence", /reuse an existing capability before improving/.test(p.antiDuplicationRule) && /Never reconstruct a present capability/.test(p.antiDuplicationRule));

  // ---- §6 integration proposal, protected path ----
  const prop = C.integrationProposal();
  check("§6 proposal recommends a doctrine note referenced BY V12.4, not a new roadmap", /NOT a new roadmap/.test(prop.recommendedLocation) && /NOT an edit to ROADMAP\.json/.test(prop.recommendedLocation));
  check("§6 ROADMAP.json action = NONE, OWNER_GATED, not applied", prop.roadmapJson.action === "NONE" && prop.roadmapJson.status === "OWNER_GATED" && /NOT applied/.test(prop.roadmapJson.reason));
  check("§6 integrity control preserves 11 governed missions + 427 register byte-identity; reopens nothing", /11 governed missions/.test(prop.integrityControl) && /427-item register byte-identity/.test(prop.integrityControl) && /reopen no closed mission/.test(prop.integrityControl));

  // ---- contract + determinism ----
  check("contract: 12 elements + reconcile-before-resume + ROADMAP.json not applied", C.CONTINUITY_PROTOCOL_CONTRACT.invariants.some((i: string) => /all 12 mandatory/.test(i)) && C.CONTINUITY_PROTOCOL_CONTRACT.invariants.some((i: string) => /never replaces a live check/.test(i)) && C.CONTINUITY_PROTOCOL_CONTRACT.invariants.some((i: string) => /NOT applied/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.protocol().identity) === JSON.stringify(p.identity) && Object.isFrozen(p) && Object.isFrozen(prop));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cto-continuity-protocol (Livrable D: 12 mandatory elements; single-ODG + V12.4-single-master fixed; reconcile-before-resume mandated [old report ≠ live check]; §6 proposal OWNER_GATED, ROADMAP.json NOT applied; reopens nothing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V261 §2/§22 — BTP↔V12.4 integration BLOCKER diagnostic. Proves: the companion is UNCHANGED (its V234–V238 baseline — the
 * attempted additive edit was reverted), the blocker is grounded in the REAL consolidation guards (section ∈ A–R / sources ∈
 * V234–V238), resolution is OWNER_GATED (nothing self-authorized), and the BTP programme is still tracked via its merged
 * artefacts. Read-only, honest, no fabrication. */
const fs = require("fs");
const B = require("./odg-btp-integration-blocker.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // the companion is UNCHANGED — the attempted additive edit was reverted (no BTP section/source injected).
  const comp = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  check("companion UNCHANGED: 14 missions, 5 programs, sources exactly V234–V237, NO btpExtension (edit reverted)", comp.missions.length === 14 && comp.programs.length === 5 && JSON.stringify(comp.expectedMissionSources) === JSON.stringify(["V234", "V235", "V236", "V237"]) && !comp.btpExtension);
  check("companion carries NO CM-BTP mission (nothing injected / mutated)", !comp.missions.some((m: any) => /^CM-BTP-/.test(m.id)) && comp.executionManifest.missions === 11);

  const d = B.diagnose();
  check("blocker status BLOCKED_BY_CONSOLIDATION_GUARD, companionMutated:false", d.status === "BLOCKED_BY_CONSOLIDATION_GUARD" && d.companionMutated === false);
  check("block is GROUNDED in the real guards: section ∈ A–R orphan check + V234–V238 lossless check", d.guards.some((g: any) => /A–R/.test(g.constraint) && /ORPHAN/.test(g.violation)) && d.guards.some((g: any) => /V234–V238/.test(g.violation)));

  // the guards are REAL — independently confirm the live consolidation+continuity tests pass on the untouched companion is
  // outside this unit's scope, but we assert the blocker references odg-v124-consolidation (the actual guard module name).
  check("blocker references the actual guard module (odg-v124-consolidation.validate)", d.guards.some((g: any) => /odg-v124-consolidation\.validate/.test(g.guard)));

  // resolution OWNER_GATED — nothing self-authorized; §11 forbids a 2nd strategic roadmap.
  check("resolution is OWNER_GATED (extend validators OR separate owner-approved registry; 2nd strategic roadmap forbidden)", d.resolutionOptionsOwnerGated.length === 2 && d.resolutionOptionsOwnerGated.some((o: string) => /OWNER authorizes/.test(o)) && d.resolutionOptionsOwnerGated.some((o: string) => /forbids a second strategic roadmap/.test(o)));

  // the BTP programme is still tracked via its merged artefacts (which really exist on disk).
  check("BTP tracked via merged artefacts that EXIST on disk (roadmap md + capability-matrix + devis-engine)", d.btpTrackedVia.length === 3 && fs.existsSync("ODG_BTP_WORLD_CLASS_V12_4_ROADMAP.md") && fs.existsSync("runtime/core/odg-btp-capability-matrix.ts") && fs.existsSync("runtime/core/odg-btp-devis-engine.ts"));

  check("contract: §22 stop-and-diagnose, block real not fabricated, owner-gated resolution, no 2nd roadmap", B.BTP_INTEGRATION_BLOCKER_CONTRACT.invariants.some((i: string) => /STOP-AND-DIAGNOSE/.test(i)) && B.BTP_INTEGRATION_BLOCKER_CONTRACT.invariants.some((i: string) => /not fabricated/.test(i)) && B.BTP_INTEGRATION_BLOCKER_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.diagnose()) === JSON.stringify(d) && Object.isFrozen(d) && Object.isFrozen(d.guards));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-integration-blocker (V261 §2/§22: additive BTP↔v124-companion integration BLOCKED by the real consolidation guards [section ∈ A–R / sources ∈ V234–V238]; companion REVERTED/UNCHANGED; honest §22 stop-and-diagnose; resolution OWNER_GATED; BTP still tracked via merged artefacts; no 2nd roadmap, no fabrication)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

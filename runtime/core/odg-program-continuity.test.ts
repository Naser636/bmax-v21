#!/usr/bin/env node
"use strict";
/* V237 Phase-2 (P0-3) — program continuity dossier. Proves: fuses the 3 staleness sources (dependency-regression via
 * campaign-controller, observation-currency via V235, component-change via V236) into ONE resumable dossier; an ACCEPTED
 * mission is 'done' only if deps intact AND evidence CURRENT AND component unchanged AND evidence present, else FLAGGED;
 * idempotent (done not re-run, flag≠redo); a BLOCKED mission never freezes nextEligible; consolidation lossless+distinct;
 * reuses the canonical register (no 2nd queue); deterministic + frozen. */
const PC = require("./odg-program-continuity.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const T0 = Date.UTC(2026, 10, 16);

function main() {
  const d = PC.demonstrate();
  const dos = d.dossier;

  check("consolidation lossless + DISTINCT: 5 missions, sources V234/V235/V236 preserved", d.consolidationLossless === true && dos.consolidatedSources.V235 === 1 && dos.consolidatedSources.V236 === 1 && dos.missionsTotal === 5);
  check("V236 component-change ⇒ M-V234 evidence HISTORICAL ⇒ requiresRevalidation (fused V235×V236)", d.v234FlaggedComponentChanged === true && dos.mustRevalidate.some((m: any) => m.id === "M-V234"));
  check("V235/V236 components unchanged ⇒ still DONE (evidence CURRENT, not re-validated)", d.v235v236StillValid === true && !dos.mustRevalidate.some((m: any) => m.id === "M-V235"));
  check("BLOCKED mission (OWNER_GATED driver) never freezes independent work ⇒ nextEligible = M-NEXT", d.blockedDoesNotFreeze === true && dos.nextEligible === "M-NEXT" && dos.blocked.some((b: any) => /OWNER_GATED/.test(b.blockReason)));
  check("IDEMPOTENT: blocked driver not 'done', eligible M-NEXT not flagged; done not re-executed", d.idempotentResume === true);

  // DEPENDENCY-regression source (campaign-controller.staleAcceptances): an ACCEPTED mission whose dep is NOT accepted.
  const depRegressed = PC.buildDossier({ objective: "dep test", missions: [
    { id: "base", source: "V234", status: "IN_PROGRESS", deps: [] },                                    // dep regressed (not ACCEPTED)
    { id: "dependent", source: "V235", status: "ACCEPTED", deps: ["base"], evidence: "merged" }] }, { asOfEpochMs: T0, currentCommit: "c" });
  check("DEPENDENCY_REGRESSED: ACCEPTED 'dependent' whose dep 'base' is not ACCEPTED ⇒ requiresRevalidation", depRegressed.mustRevalidate.some((m: any) => m.id === "dependent" && m.reasons.includes("DEPENDENCY_REGRESSED")));

  // NO_EVIDENCE source: an ACCEPTED mission without evidence is never 'done'.
  const noEv = PC.buildDossier({ objective: "ev", missions: [{ id: "x", source: "V236", status: "ACCEPTED", deps: [] }] }, { asOfEpochMs: T0, currentCommit: "c" });
  check("NO_EVIDENCE: ACCEPTED without evidence ⇒ requiresRevalidation (not done)", noEv.mustRevalidate.some((m: any) => m.id === "x" && m.reasons.includes("NO_EVIDENCE")) && noEv.done.length === 0);

  // clean program (deps intact, evidence present, no snapshots/observations) ⇒ all ACCEPTED are done, none flagged.
  const clean = PC.buildDossier({ objective: "clean", missions: [
    { id: "a", source: "V234", status: "ACCEPTED", deps: [], evidence: "e1" },
    { id: "b", source: "V235", status: "ACCEPTED", deps: ["a"], evidence: "e2" },
    { id: "c", source: "V236", status: "READY", deps: ["b"] }] }, { asOfEpochMs: T0, currentCommit: "c" });
  check("clean program ⇒ a,b done, c eligible, nothing to re-validate", clean.done.length === 2 && clean.mustRevalidate.length === 0 && clean.nextEligible === "c");

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(PC.demonstrate()) === JSON.stringify(d) && Object.isFrozen(dos) && Object.isFrozen(dos.mustRevalidate) && Object.isFrozen(dos.done));
  check("contract: fuses 3 sources, fail-closed+idempotent, reuses controller, no 2nd queue", PC.PROGRAM_CONTINUITY_CONTRACT.invariants.some((i: string) => /deps intact AND evidence CURRENT \(V235\) AND component unchanged \(V236\)/.test(i)) && PC.PROGRAM_CONTINUITY_CONTRACT.invariants.some((i: string) => /no 2nd scheduler/.test(i)) && PC.PROGRAM_CONTINUITY_CONTRACT.invariants.some((i: string) => /FAIL-CLOSED \+ IDEMPOTENT/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — program-continuity (V237 Phase-2 P0-3: resumable dossier fusing dependency-regression + observation-currency [V235] + component-change [V236]; done only if deps∧evidence-current∧component-unchanged∧evidence-present, else flagged; idempotent; blocked≠freeze; lossless consolidation; reuses canonical register — no 2nd queue)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* IMP-P3-SSDF-SLSA — SSDF→control-or-GAP crosswalk + evidence-gated SLSA tier; higher tiers not claimed by omission. */
const X = require("./odg-ssdf-slsa-crosswalk.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const full = X.crosswalk({ controlsPresent: { PO: true, PS: true, PW: true, RV: true }, slsaEvidence: { provenance: true, signedProvenance: true } });
  check("4 SSDF groups mapped to real controls when present", full.ssdf.length === 4 && full.ssdf.every((s: any) => s.status === "MAPPED_REAL_CONTROL") && full.gaps.length === 0);
  check("SLSA L2 attained from provenance+signedProvenance evidence", full.slsa.attainedLevel === 2);
  check("SLSA L3 NOT claimed by omission (no hardenedBuilder evidence)", full.slsa.ladder.find((l: any) => l.level === 3).met === false && /higher tiers NOT claimed/.test(full.slsa.note));

  // fail-closed: missing controls ⇒ GAP; no evidence ⇒ L0
  const empty = X.crosswalk({});
  check("absent controls ⇒ honest GAP (not claimed satisfied)", empty.ssdf.every((s: any) => s.status === "GAP") && empty.gaps.length === 4);
  check("no SLSA evidence ⇒ L0, no higher tier claimed", empty.slsa.attainedLevel === 0 && /no provenance evidence/.test(empty.slsa.note));
  // non-contiguous evidence (signed but no base provenance) ⇒ still L0 (contiguous-from-L1 rule)
  check("non-contiguous evidence ⇒ not jumped (contiguous from L1)", X.crosswalk({ slsaEvidence: { signedProvenance: true } }).slsa.attainedLevel === 0);

  check("contract + honesty (real control or GAP; evidence-gated SLSA)", X.SSDF_SLSA_CROSSWALK_CONTRACT.invariants.some((i: string) => /honest GAP/.test(i)) && /never claimed by omission/.test(full.honesty));
  check("deterministic", JSON.stringify(X.crosswalk({}).slsa) === JSON.stringify(empty.slsa));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — ssdf-slsa-crosswalk (IMP-P3: SSDF→real-control-or-GAP; SLSA tier evidence-gated, higher tiers not claimed by omission)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* IMP-M5-WCAG-EVIDENCE — WCAG 2.2 checklist; ~30% automated coverage honesty; nothing conformant; no live scan. */
const W = require("./odg-wcag-accessibility-evidence.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const e = W.evidence({ observed: { keyboard: true, contrast: true } });
  check("checklist: observed ⇒ EVIDENCED, absent ⇒ GAP (never assumed)", e.checks.find((c: any) => c.id === "keyboard").status === "EVIDENCED" && e.checks.find((c: any) => c.id === "target-size").status === "GAP" && e.evidenced === 2);
  check("WCAG 2.2 new criteria present (target-size/focus/accessible-auth)", ["target-size", "focus-visible", "accessible-auth"].every((id) => e.checks.some((c: any) => c.id === id)));
  check("automated coverage stated honestly ~30% (scan ≠ conformance)", e.automatedCoverage.fraction === 0.3 && /NOT conformance/.test(e.automatedCoverage.note));
  check("nothing declared conformant/certified; no live site scanned", e.conformance === "NOT_DECLARED" && e.certified === false && e.liveSiteScanned === false);
  check("EAA status SOURCED (EN 301 549 v4.1.1), not invented", /EN 301 549 v4\.1\.1/.test(e.eaa.standard) && /EAA/.test(e.eaa.source));
  check("V211 radar refresh (2026-11-16): dated facts + OJEU PENDING + v3.2.1 still cited (no false EAA presumption)", e.eaa.asOf === "2026-11-16" && /24 Aug 2026|2 Sep 2026/.test(e.eaa.standard) && /PENDING/.test(e.eaa.note) && /v3\.2\.1 remains/.test(e.eaa.note) && /does NOT yet confer/.test(e.eaa.note));
  check("empty ⇒ all GAP (deny-by-default)", W.evidence({}).evidenced === 0);
  check("contract + honesty", W.WCAG_ACCESSIBILITY_EVIDENCE_CONTRACT.invariants.some((i: string) => /nothing declared conformant\/certified/.test(i)) && /not invented/.test(e.honesty));
  check("deterministic", JSON.stringify(W.evidence({})) === JSON.stringify(W.evidence({})));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — wcag-accessibility-evidence (IMP-M5: WCAG 2.2 checklist; ~30% automated coverage honesty; nothing conformant/certified; EAA sourced; no live scan)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

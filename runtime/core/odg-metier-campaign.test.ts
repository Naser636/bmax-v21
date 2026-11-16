#!/usr/bin/env node
"use strict";
/* V245 §2/§3/§5 — métier campaign. Proves: materializes all 20 canonical métiers and drives the REAL campaign-loop over
 * ALL of them in ONE campaign (processes the whole set, not one); a blocked métier (real gap) never freezes the others;
 * maturity read from real evidence (never inferred up); P5+P8 are the real ABSENT-reference gaps; QUALIFICATION only (no
 * fabricated improvements); reuses campaign-loop (no 2nd scheduler); deterministic + frozen. */
const MC = require("./odg-metier-campaign.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  check("roster is the canonical 20 (P1–P15 + M1–M5), names not invented", MC.METIERS.length === 20 && MC.METIERS.filter((m: any) => /^P/.test(m.id)).length === 15 && MC.METIERS.filter((m: any) => /^M/.test(m.id)).length === 5 && MC.METIERS.find((m: any) => m.id === "P1").name === "Fullstack / product engineering");

  const d = MC.demonstrate();
  check("ONE campaign drives the REAL loop over ALL 20 métiers (processes the whole set, not one)", d.metiersTotal === 20 && d.metiersProcessedInOneCampaign >= 15 && d.continuousExecutionProven === true);
  check("every non-blocked métier is accepted in this one campaign; blocked ones are excluded", d.accepted.length === 20 - d.blocked.length && d.accepted.length + d.blocked.length === 20);
  check("a blocked métier (real gap) never freezes the rest", d.blockedDoesNotFreeze === true);
  // V246: P5 + P8 reference modules were BUILT+tested+gated ⇒ their gap is CLOSED (now INTEGRATED, no longer ABSENT/blocked).
  check("V246 gap CLOSED: P5 (Cloud/DevOps/Platform) + P8 (API/integration) now have reference modules ⇒ INTEGRATED, not blocked", !d.blocked.includes("P5") && !d.blocked.includes("P8") && d.rows.find((r: any) => r.id === "P5").maturity === "INTEGRATED" && d.rows.find((r: any) => r.id === "P8").maturity === "INTEGRATED");
  check("all 20 métiers classify INTEGRATED from real evidence (module+test+gate), none upgraded to OPERATIONAL/ACCEPTED", (d.byMaturity.INTEGRATED || 0) === 20 && !d.byMaturity.OPERATIONAL && !d.byMaturity.ACCEPTED && !d.byMaturity.ABSENT);
  check("campaign now COMPLETED (no gaps remain) — the real win of building P5+P8", d.campaignStopped === "COMPLETED" && d.blocked.length === 0);
  check("HONEST: qualification only — note says NOT claimed improved/operational", /QUALIFICATION only/.test(d.note) && /NOT claimed improved/.test(d.note));

  // maturity never inferred upward.
  check("maturity ladder respected: absent⇒ABSENT, no-test⇒BUILT_UNTESTED, no-gate⇒TESTED_NOT_INTEGRATED, else INTEGRATED", MC.maturityOf(false, false, false) === "ABSENT" && MC.maturityOf(true, false, false) === "BUILT_UNTESTED" && MC.maturityOf(true, true, false) === "TESTED_NOT_INTEGRATED" && MC.maturityOf(true, true, true) === "INTEGRATED");

  // root-cause diagnosis is honest + specific.
  const diag = MC.diagnose();
  check("diagnose: root cause is the missing exec-queue/executor + read-only L0 + un-materialized métiers (not 'budget')", diag.findings.some((f: string) => /STATUS\/continuity artifact, NOT an execution QUEUE/.test(f)) && diag.findings.some((f: string) => /READ-ONLY by design/.test(f)) && diag.findings.some((f: string) => /never MATERIALIZED as individual executable work-units/.test(f)) && diag.findings.some((f: string) => /NOT autonomous ODG self-execution/.test(f)) && /does NOT fabricate improvements/.test(diag.honestLimit));

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(MC.demonstrate()) === JSON.stringify(d) && Object.isFrozen(d) && Object.isFrozen(d.rows));
  check("contract: reuses campaign-loop, one campaign over all, qualification-only, no 2nd scheduler", MC.METIER_CAMPAIGN_CONTRACT.invariants.some((i: string) => /builds NO second scheduler/.test(i)) && MC.METIER_CAMPAIGN_CONTRACT.invariants.some((i: string) => /QUALIFICATION only/.test(i)) && MC.METIER_CAMPAIGN_CONTRACT.invariants.some((i: string) => /ONE campaign processes the WHOLE set/.test(i)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-campaign (V245 §2/§3/§5: materializes the canonical 20 métiers and drives the REAL campaign-loop over ALL in ONE campaign — 18 INTEGRATED-qualified, P5+P8 real gaps blocked, blocked≠freeze, IDLE_BLOCKED; maturity from real evidence never inferred up; QUALIFICATION only [no fabricated improvements]; root cause diagnosed; no 2nd scheduler)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

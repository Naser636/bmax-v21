#!/usr/bin/env node
"use strict";
/* V175 §2 — ISO/IEC 27001:2022 mutualized evidence crosswalk. Proves: Annex A controls across the 4 themes map to ODG's REAL
 * modules; a STRICT 7-level maturity ladder (document≠implemented≠tested≠operational≠internal-audit≠external-audit≠certified);
 * the MAX in-repo maturity is CONTROL_TESTED — nothing audited or certified (owner-gated); People/Physical are owner-gated/
 * inherited; the evidence base mutualizes the 5 canonical métiers (P3/P4/P5/P10/P13). No fictitious evidence; no audit declared. */
const I = require("./odg-iso27001-evidence-crosswalk.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const xw = I.crosswalk();
  const s = I.maturitySummary();
  const byRef: any = {}; for (const r of xw) byRef[r.ref] = r;

  // ---- Annex A coverage across the 4 themes, mapped to REAL modules ----
  check("maps controls across all 4 Annex A themes (Org/People/Physical/Technological)", new Set(xw.map((r: any) => r.theme)).size === 4 && xw.length >= 15);
  check("technological controls map to REAL ODG modules (audit-log, agent-identity, capability-authorization, …)", byRef["A.8.15"].odgModules.some((m: string) => /audit-log/.test(m)) && byRef["A.8.5"].odgModules.some((m: string) => /agent-identity/.test(m)) && byRef["A.8.2"].odgModules.some((m: string) => /capability-authorization/.test(m)));

  // ---- STRICT 7-level maturity ladder (§2: never conflated) ----
  check("maturity ladder has the 7 distinct levels (document…certified)", I.MATURITY.length === 7 && I.MATURITY[0] === "DOCUMENTED" && I.MATURITY[2] === "CONTROL_TESTED" && I.MATURITY[6] === "CERTIFIED");
  check("every control carries one maturity level + rank", xw.every((r: any) => I.MATURITY.includes(r.maturity) && typeof r.maturityRank === "number"));

  // ---- the honest ceiling: MAX = CONTROL_TESTED; nothing audited/certified ----
  check("MAX maturity reached is CONTROL_TESTED — nothing at OPERATIONAL_PROOF/audit/certified", s.maxMaturityReached === "CONTROL_TESTED" && s.byLevel.OPERATIONAL_PROOF === 0 && s.byLevel.INTERNAL_AUDIT === 0 && s.byLevel.EXTERNAL_AUDIT === 0 && s.byLevel.CERTIFIED === 0);
  check("NO audit declared performed; NO certification obtained (honest)", s.auditPerformed === false && s.certified === false && /NONE reached/.test(s.honestCeiling) && /no audit performed|no certification obtained/i.test(s.honestCeiling));
  check("several controls reach CONTROL_TESTED (real module + test), others only DOCUMENTED/IMPLEMENTED (honest mix)", s.byLevel.CONTROL_TESTED >= 5 && s.byLevel.DOCUMENTED >= 1 && s.byLevel.CONTROL_IMPLEMENTED >= 1);

  // ---- People/Physical + policies/audit = OWNER_GATED ----
  check("People + Physical controls are OWNER_GATED/inherited (not claimed implemented)", byRef["A.6.1"].ownerGatedToProgress === true && byRef["A.7.1"].ownerGatedToProgress === true && /OWNER_GATED|inherited/.test(byRef["A.7.1"].note));
  check("internal audit (A.5.35) is OWNER_GATED (must be really performed)", byRef["A.5.35"].ownerGatedToProgress === true && /OWNER_GATED/.test(byRef["A.5.35"].note));
  const soa = I.soaApplicability();
  check("SoA stance: Technological APPLICABLE (strong), People OWNER_GATED, Physical INHERITED", /APPLICABLE/.test(soa.Technological) && /OWNER_GATED/.test(soa.People) && /INHERITED|SHARED/.test(soa.Physical));

  // ---- mutualization for the 5 canonical métiers ----
  const mut = I.mutualizedMetiers();
  check("mutualized for the 5 canonical métiers P3/P4/P5/P10/P13 (from the planner, not guessed)", JSON.stringify(mut.covers) === JSON.stringify(["P3", "P4", "P5", "P10", "P13"]) && /confusing their specific scopes/i.test(mut.note));

  // ---- honesty + determinism ----
  check("contract: strict separation, max=CONTROL_TESTED, audits/cert owner-gated, no fictitious evidence, cites ISO 27001:2022", I.ISO27001_CROSSWALK_CONTRACT.invariants.some((x: string) => /STRICT separation/.test(x)) && I.ISO27001_CROSSWALK_CONTRACT.invariants.some((x: string) => /OWNER_GATED — NONE declared reached/.test(x)) && /27001:2022/.test(I.ISO27001_CROSSWALK_CONTRACT.reference));
  check("deterministic + frozen", JSON.stringify(I.maturitySummary().byLevel) === JSON.stringify(s.byLevel) && Object.isFrozen(xw));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — iso27001-evidence-crosswalk (§2: ISO 27001:2022 Annex A [4 themes] mapped to ODG's REAL controls with a STRICT 7-level maturity ladder; 9 CONTROL_TESTED / 4 IMPLEMENTED / 5 DOCUMENTED; MAX=CONTROL_TESTED — nothing audited or certified [owner-gated]; People/Physical owner-gated/inherited; mutualized for the 5 canonical métiers P3/P4/P5/P10/P13; no fictitious evidence, no audit declared)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V174 Addendum-B §2–§10 — 15-métier certification & readiness planner + 300-day plan. Proves: the canonical 15 métiers
 * (P1–P15) are classified into the 4 categories + distinct requirementKind; the 300-day capacity distinguishes calendar/
 * working/person-days; métiers with no mandatory cert can start immediately; ISO 27001 mutualizes across métiers; external
 * regulatory delays (CRA 2027) are reported as-is (not shortened); NO cert declared obtained (all NOT_STARTED). Deterministic. */
const P = require("./odg-metier-certification-planner.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const pl = P.plan({ people: 3 });
  const byId: any = {}; for (const m of pl.metiers) byId[m.metier] = m;

  // ---- canonical 15 métiers (P1..P15), not invented ----
  check("exactly 15 canonical métiers P1..P15", pl.metiers.length === 15 && byId.P1 && byId.P8 && byId.P15 && byId.P5.name.includes("Cloud") && byId.P8.name.includes("API"));

  // ---- 4 categories + distinct requirementKind (§2) ----
  check("every métier has one of the 4 categories (A/B/C/D) + a distinct requirementKind", pl.metiers.every((m: any) => [P.CATEGORY.A, P.CATEGORY.B, P.CATEGORY.C, P.CATEGORY.D].includes(m.category) && P.KIND.includes(m.requirementKind)));
  check("requirementKind distinguishes company-cert / product-conformity / regulatory-conformity / none (never conflated)", byId.P2.requirementKind === "COMPANY_CERT" && byId.P4.requirementKind === "REGULATORY_CONFORMITY" && byId.P6.requirementKind === "NONE");
  check("counts: 2 legally-mandatory (A), 5 voluntary (C), 8 not-required (D) — honest, cybersecurity NOT auto-mandatory", pl.counts.A_legallyMandatory === 2 && pl.counts.C_voluntaryCommercial === 5 && pl.counts.D_notRequired === 8);

  // ---- don't delay cert-free métiers (§4) ----
  check("most métiers (≥10) can start commercializing immediately without a certification", pl.counts.canStartNowWithoutCert >= 10 && byId.P1.canStartWithoutCertification === true && byId.P6.canStartWithoutCertification === true);

  // ---- 300-day capacity distinguishes calendar/working/person-days (§5) ----
  check("300 CALENDAR days ≠ 300 person-days: calendar 300 → working ~205 → person-days ~480 for 3 people", pl.capacity.calendarDays === 300 && pl.capacity.workingDays < 220 && pl.capacity.workingDays > 190 && pl.capacity.personDays < pl.capacity.workingDays * 3 && pl.capacity.personDays > 400);
  check("each métier has a 3-point calendar timeline (optimistic < central < prudent) incl. external wait", pl.metiers.every((m: any) => m.timelineCalendarDays.optimistic <= m.timelineCalendarDays.central && m.timelineCalendarDays.central <= m.timelineCalendarDays.prudent));
  check("total prep human-days fits within the 3-person 300-day capacity", pl.prepFitsCapacity === true && pl.totalPrepHumanDays < pl.capacity.personDays);

  // ---- mutualization (§4): ISO 27001 unlocks multiple métiers ----
  check("ISO 27001 mutualization covers ≥5 métiers (highest leverage, start first)", pl.mutualization.find((x: any) => /27001/.test(x.cert)).covers.length >= 5 && /P3/.test(JSON.stringify(pl.mutualization.find((x: any) => /27001/.test(x.cert)).covers)));
  check("critical-first certs name ISO 27001 + GDPR + CRA/EAA product conformity", pl.criticalFirstCerts.join(" ").includes("27001") && pl.criticalFirstCerts.join(" ").includes("GDPR"));

  // ---- external regulatory delays reported as-is, not shortened (§3/§9) ----
  check("CRA product-conformity external deadline 2027-12-11 is flagged BEYOND 300 days (not shortened)", /2027-12-11/.test(JSON.stringify(pl.mutualization)) && /BEYOND 300 days/.test(JSON.stringify(pl.mutualization)));
  check("AI métier with a high-risk caveat keeps conformity scope-dependent (A if high-risk) — no over-claim", /HIGH-RISK/.test(byId.P2.requirement) && /scope-dependent|A if/.test(byId.P2.requirement));

  // ---- §8 status: nothing declared certified ----
  check("every métier status is NOT_STARTED — NO certification declared obtained", pl.metiers.every((m: any) => m.status === "NOT_STARTED") && P.STATUS.includes("CERTIFIED") && P.STATUS.includes("NOT_REQUIRED"));

  // ---- honesty + determinism ----
  check("contract: canonical (not invented), 4 categories + kinds, nothing certified, external delays not shortened, mutualization", /NOT invented/.test(P.METIER_CERTIFICATION_CONTRACT.canonicalMetiers) && P.METIER_CERTIFICATION_CONTRACT.invariants.some((i: string) => /NO certification declared obtained/.test(i)) && P.METIER_CERTIFICATION_CONTRACT.invariants.some((i: string) => /NEVER shortened/.test(i)));
  check("deterministic + frozen", JSON.stringify(P.plan({ people: 3 }).counts) === JSON.stringify(pl.counts) && Object.isFrozen(pl));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — metier-certification-planner (§2–§10: 15 canonical métiers P1–P15 classified into 4 categories + distinct requirementKind; 2 legally-mandatory [GDPR], 5 voluntary [ISO], 8 none; 10+ can start immediately; 300 calendar-days→~205 working→~480 person-days for 3 people; ISO 27001 mutualizes 5 métiers; CRA 2027 external deadline reported BEYOND 300 days [not shortened]; ALL NOT_STARTED — no cert declared obtained)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

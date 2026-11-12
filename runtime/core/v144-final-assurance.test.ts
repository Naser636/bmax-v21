#!/usr/bin/env node
"use strict";
/* V144 — final-assurance battery. Re-derives the reproductions from the REAL harnesses (not a stored dossier) and locks: all
 * critical V136–V143 proofs + the 3 applied fixes + commercial chain/offer-builder still reproduce on current main; and the
 * final maturity synthesis is HONEST — only the deployed VPS release is ACTIVE_IN_PRODUCTION, residuals stay BLOCKED, €0
 * clients, and the 5 M€ target is owner-gated/not-substantiated. */
const RUN = require("../bin/odg-v144-final-assurance.ts");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

async function main() {
  const checks = await RUN.reproduce();
  const by = Object.fromEntries(checks.map((c: any) => [c.id, c]));
  check("all critical proofs + 3 fixes reproduce on current main", checks.length >= 8 && checks.every((c: any) => c.reproduced === true));
  check("the 3 applied fixes reproduce (P2 base64 / P4 timeliness / P11 BR-CO-18)", by.fix_P2_base64_injection.reproduced && by.fix_P4_timeliness.reproduced && by.fix_P11_br_co_18.reproduced);
  check("15 métiers + resilience + research pipeline reproduce", by.metiers_15_qualified.reproduced && by.resilience_fault_injection.reproduced && by.research_pipeline.reproduced);
  check("commercial chain + offer-builder reproduce (governed OWNER_DECISION; COMMERCIALISABLE gate)", by.commercial_chain.reproduced && by.commercial_offer_builder.reproduced);

  const s = RUN.synthesis();
  check("synthesis: ONLY the deployed VPS release is ACTIVE_IN_PRODUCTION (not the improvements)", s.maturityStates.ACTIVE_IN_PRODUCTION.length === 1 && /VPS release/.test(s.maturityStates.ACTIVE_IN_PRODUCTION[0]) && !/V13|V14|métier/.test(s.maturityStates.ACTIVE_IN_PRODUCTION[0].replace(/NOT the[^.]*/, "")));
  check("synthesis: FMEA residuals + VPS deploy remain BLOCKED (owner-gated, preserved)", s.maturityStates.BLOCKED.some((b: string) => /FMEA|recovery-loop/.test(b)) && s.maturityStates.BLOCKED.some((b: string) => /VPS deploy/.test(b)));
  check("synthesis: real revenue/clients NOT_MEASURED (not fabricated)", s.maturityStates.NOT_MEASURED.some((m: string) => /revenue|client/.test(m)));
  check("synthesis: 5M€ target honestly owner-gated / not substantiated; €0 clients", /not substantiated/i.test(s.fiveMEurReadiness.honest) && /€0 clients/.test(s.fiveMEurReadiness.honest) && s.fiveMEurReadiness.ownerGatedBeforeStart.length >= 3);
  check("synthesis: CRA offer COMMERCIALISABLE (R3), FR Factur-X NOT_YET (owner-gated)", /COMMERCIALISABLE/.test(s.commercial.offers.CRA_SBOM) && /NOT_YET_DELIVERABLE/.test(s.commercial.offers.FR_FacturX));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — V144 final assurance (all proofs+fixes reproduce; synthesis honest: VALIDATED_LOCAL≠production, residuals BLOCKED, €0 clients, 5M€ owner-gated)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

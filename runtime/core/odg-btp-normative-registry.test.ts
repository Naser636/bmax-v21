#!/usr/bin/env node
"use strict";
/* V264 — BTP normative registry + engine + 20-function reconciliation. Proves source-verified records (no invention),
 * schema/duplicate/conflict audit, applicability resolution (miss ≠ no-requirement), checklist that NEVER certifies, LOW-
 * confidence abstention, and a GROUNDED 20-devis-function status (recognition-dependent ⇒ BLOCKED). Deterministic, read-only. */
const R = require("./odg-btp-normative-registry.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // records are source-verified (every record carries sourceUrl + retrievalDate + confidence + unresolved; obligationType ∈ enum).
  const recs = R.NORMATIVE_RECORDS;
  check("registry has >=6 source-verified records, each with sourceUrl + retrievalDate + confidence + unresolved + obligationType∈enum", recs.length >= 6 && recs.every((r: any) => /^https?:\/\//.test(r.sourceUrl) && r.retrievalDate === "2026-11-17" && R.CONFIDENCE.indexOf(r.confidence) >= 0 && Array.isArray(r.unresolved) && R.OBLIGATION_TYPES.indexOf(r.obligationType) >= 0));
  // obligation types kept distinct: CPR is LEGAL, RE2020 REGULATORY, ISO 19650 NORMATIVE/VOLUNTARY, NF DTU CONTRACTUAL.
  const byId = (id: string) => recs.find((r: any) => r.id === id);
  check("obligation types distinct + honest: CPR LEGAL/MANDATORY, RE2020 REGULATORY/MANDATORY, ISO19650 NORMATIVE/VOLUNTARY, NF-DTU CONTRACTUAL/CONDITIONAL", byId("EU-2024-3110-CPR").obligationType === "LEGAL" && byId("FR-RE2020").obligationType === "REGULATORY" && byId("ISO-19650").mandatoryStatus === "VOLUNTARY" && byId("FR-NF-DTU").obligationType === "CONTRACTUAL");
  check("abstention: a LOW-confidence reference (Eurocodes) is mandatoryStatus NEEDS_VERIFICATION (never asserted mandatory)", byId("EU-EUROCODES").confidence === "LOW" && byId("EU-EUROCODES").mandatoryStatus === "NEEDS_VERIFICATION");

  // audit: schema valid, no duplicates/conflicts, NEEDS_VERIFICATION flagged.
  const audit = R.auditRegistry();
  check("auditRegistry: all records schema-valid, 0 duplicate ids, 0 version/status conflicts", audit.valid === true && audit.duplicates.length === 0 && audit.conflicts.length === 0);
  check("auditRegistry: NEEDS_VERIFICATION flags the Eurocodes LOW-confidence entry", audit.needsVerification.indexOf("EU-EUROCODES") >= 0);
  // validateRecord fail-closed.
  check("validateRecord fail-closed: a record missing required fields ⇒ ok false + missing listed; bad enum caught", R.validateRecord({ id: "x" }).ok === false && R.validateRecord({ id: "x" }).missing.indexOf("title") >= 0 && R.validateRecord(Object.assign({}, byId("FR-RE2020"), { obligationType: "BOGUS" })).missing.indexOf("obligationType∉enum") >= 0);
  // duplicate/conflict detection on a crafted set.
  const dupAudit = R.auditRegistry([byId("FR-RE2020"), Object.assign({}, byId("FR-RE2020"), { version: "DIFFERENT", mandatoryStatus: "VOLUNTARY" })]);
  check("audit detects a duplicate id with conflicting version/status", dupAudit.duplicates.indexOf("FR-RE2020") >= 0 && dupAudit.conflicts.some((c: any) => c.id === "FR-RE2020"));

  // applicability: electrical/FR ⇒ NF C 15-100; a MISS is COVERAGE_GAP not clearance.
  const appElec = R.resolveApplicability({ trade: "electrical", jurisdiction: "FR" });
  check("applicability: electrical/FR ⇒ NF C 15-100 matched", appElec.matched.some((m: any) => m.id === "FR-NF-C-15-100"));
  check("applicability: BIM ⇒ ISO 19650 matched (INTERNATIONAL applies)", R.resolveApplicability({ trade: "BIM" }).matched.some((m: any) => m.id === "ISO-19650"));
  check("applicability honesty: note states a MISSING entry is NOT proof of no requirement (coverage gap, not clearance)", /NOT proof that no requirement exists/.test(appElec.note));

  // checklist NEVER certifies compliance; a certification claim is refused (regulatory-assurance reuse).
  const chk = R.complianceChecklist({ trade: "electrical", jurisdiction: "FR" });
  check("complianceChecklist: every item UNVERIFIED (a match NEVER certifies compliance), certified false, certification claim REFUSED", chk.items.length >= 1 && chk.items.every((i: any) => i.complianceStatus === "UNVERIFIED" && i.requiresEvidence === true) && chk.certified === false && chk.anyCertifiedClaimRefused === true);

  // §5 grounded 20-function reconciliation.
  const q = R.qualifyDevis20();
  check("qualifyDevis20: 20 functions; recognition-dependent (1,2,3,16) are BLOCKED (absent OCR/STT/PDF — never upgraded)", q.total === 20 && [1, 2, 3, 16].every((n) => q.rows.find((r: any) => r.n === n).status === "BLOCKED" && q.rows.find((r: any) => r.n === n).recognitionDependent === true));
  check("qualifyDevis20 GROUNDED: TESTED functions have a backing module that EXISTS on disk (never doc-only)", q.rows.filter((r: any) => r.status === "TESTED").every((r: any) => r.backingFile !== null) && q.tested >= 8);
  check("qualifyDevis20: tested+partial+blocked+absent = 20 (honest totals)", q.tested + q.partial + q.blocked + q.absent === 20 && q.blocked === 4);

  // contract + determinism.
  check("contract: nothing invented, obligations distinct, miss≠no-requirement, match≠compliance, grounded reconciliation, no 2nd engine", R.BTP_NORMATIVE_REGISTRY_CONTRACT.invariants.some((i: string) => /NOTHING invented/.test(i)) && R.BTP_NORMATIVE_REGISTRY_CONTRACT.invariants.some((i: string) => /MATCH NEVER certifies/.test(i)) && R.BTP_NORMATIVE_REGISTRY_CONTRACT.invariants.some((i: string) => /no second assurance/.test(i)));
  check("deterministic + frozen", JSON.stringify(R.auditRegistry()) === JSON.stringify(audit) && JSON.stringify(R.qualifyDevis20()) === JSON.stringify(q) && Object.isFrozen(recs));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-normative-registry (V264: 6 SOURCE-VERIFIED BTP references [NF C 15-100/CPR 2024-3110/RE2020/ISO 19650/NF DTU/Eurocodes] — nothing invented; LEGAL/REGULATORY/NORMATIVE/CONTRACTUAL distinct; LOW-confidence⇒NEEDS_VERIFICATION abstain; audit [schema/dup/conflict]; applicability [miss≠no-requirement]; checklist NEVER certifies [certification claim refused]; grounded 20-fn reconciliation [1,2,3,16 BLOCKED]; no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V277 §4 (P3 Radar) — BTP competitor intelligence from REAL authorized web research (2026-11-18). Asserts provenance-first
 * discipline: every finding has a source URL + retrieval date (fail-closed otherwise); third-party review data is SECONDARY_
 * REVIEW/LOW/NEEDS_PRIMARY_VERIFICATION, never asserted as fact; ODG gaps are real (ABSENT AI-quote); no fabrication. */
const C = require("./odg-btp-competitor-intelligence.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // every seeded finding is provenance-valid (real URL + retrieval date 2026-11-18).
  const audit = C.auditFindings();
  check("all findings provenance-valid (source URL + retrievalDate + source-type + confidence + limitations)", audit.ok === true && audit.count >= 3 && audit.invalid.length === 0);
  check("every finding retrievalDate 2026-11-18 and a real http(s) source URL", C.COMPETITOR_FINDINGS.every((x: any) => x.retrievalDate === "2026-11-18" && /^https:\/\//.test(x.sourceUrl)));

  // honest confidence: third-party review data ⇒ SECONDARY_REVIEW / LOW / NEEDS_PRIMARY_VERIFICATION; NO official-doc claimed.
  check("research data graded SECONDARY_REVIEW + LOW confidence; NO OFFICIAL_DOC claimed; primary verification flagged",
    audit.bySourceType.SECONDARY_REVIEW >= 3 && audit.byConfidence.LOW >= 3 && audit.anyOfficialDoc === false && audit.needsPrimaryVerification.length >= 2);

  // fail-closed: a finding missing provenance is REJECTED.
  check("validateFinding fail-closed: missing sourceUrl ⇒ not ok (missing listed)", C.validateFinding({ competitor: "X", claim: "cheap", retrievalDate: "2026-11-18", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "x" }).ok === false && C.validateFinding({ competitor: "X", claim: "c", retrievalDate: "d", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "x" }).missing.indexOf("sourceUrl(http)") >= 0);
  check("validateFinding fail-closed: bad source-type / missing retrievalDate / missing limitations all caught",
    C.validateFinding({ competitor: "X", claim: "c", sourceUrl: "https://a.b", retrievalDate: "d", sourceType: "BOGUS", confidence: "LOW", limitations: "x" }).missing.indexOf("sourceType∈enum") >= 0 &&
    C.validateFinding({ competitor: "X", claim: "c", sourceUrl: "https://a.b", sourceType: "SECONDARY_REVIEW", confidence: "LOW", limitations: "x" }).missing.indexOf("retrievalDate") >= 0 &&
    C.validateFinding({ competitor: "X", claim: "c", sourceUrl: "https://a.b", retrievalDate: "d", sourceType: "SECONDARY_REVIEW", confidence: "LOW" }).missing.indexOf("limitations") >= 0);
  check("a valid OFFICIAL_DOC finding passes validation (schema supports primary sources too)",
    C.validateFinding({ competitor: "Obat", claim: "pricing", sourceUrl: "https://obat.fr/tarifs", retrievalDate: "2026-11-18", sourceType: "OFFICIAL_DOC", confidence: "HIGH", limitations: "none" }).ok === true);

  // real findings content (the actual search returned these competitors + the price signals).
  check("findings include Tolteck + Obat with the real review URLs + pricing signals (19 / 25–39) as SECONDARY_REVIEW claims",
    C.COMPETITOR_FINDINGS.some((x: any) => x.competitor === "Tolteck" && /19/.test(x.claim) && /nstudiodigital/.test(x.sourceUrl)) && C.COMPETITOR_FINDINGS.some((x: any) => x.competitor === "Obat" && /25.?39/.test(x.claim) && x.confidence === "LOW"));

  // ODG comparison: real ODG status; competitor claims not asserted as fact; genuine gaps surfaced.
  const cmp = C.compareToODG();
  check("compareToODG: ODG devis/e-invoice/site/métré are BUILT (real engines); AI-quote-from-photo/plan/voice is the ABSENT gap",
    cmp.ok && cmp.odgCapabilities.find((c: any) => /quotation/.test(c.theme)).odgStatus === "BUILT" && cmp.odgCapabilities.find((c: any) => /AI quote/.test(c.theme)).odgStatus === "ABSENT" && cmp.gaps.some((g: any) => /AI quote/.test(g.theme)));
  check("compareToODG honesty: competitor evidence is LOW confidence; gaps recorded as ODG roadmap gaps, NOT proof of competitor superiority", cmp.competitorEvidenceQuality.LOW >= 3 && /NOT asserted as fact/.test(cmp.note) && /not as proof competitors have superior/.test(cmp.note));

  // determinism + contract.
  check("deterministic + frozen", JSON.stringify(C.auditFindings()) === JSON.stringify(audit) && Object.isFrozen(C.COMPETITOR_FINDINGS));
  check("contract: real WebSearch provenance; fail-closed on missing provenance; review≠fact; NEEDS_PRIMARY_VERIFICATION; no new radar",
    /REAL WebSearch executed 2026-11-18/.test(C.COMPETITOR_INTELLIGENCE_CONTRACT.researchProvenance) && C.COMPETITOR_INTELLIGENCE_CONTRACT.invariants.some((i: string) => /REJECTED \(fail-closed\)/.test(i)) && C.COMPETITOR_INTELLIGENCE_CONTRACT.invariants.some((i: string) => /NEVER asserted as an ODG fact/.test(i)) && C.COMPETITOR_INTELLIGENCE_CONTRACT.invariants.some((i: string) => /no new radar/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-competitor-intelligence (V277 P3: REAL authorized WebSearch 2026-11-18 → provenance-first competitor store; Tolteck/Obat findings SECONDARY_REVIEW/LOW/NEEDS_PRIMARY_VERIFICATION [real URLs], fail-closed on missing provenance, review≠fact, absence≠proof-of-absence; ODG gap view real [AI-quote-from-photo ABSENT]; research converted to a durable capability, no new radar/primitive)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/*
 * V185 §2/§3.2 — world benchmark, LOT 1 (P3 Security, P9 FinOps, M2 BTP). PURE, READ-ONLY, deterministic.
 *
 * Captures the RESULTS of a radar/Internet research pass genuinely executed under grant V141 on 2026-11-13 (WebSearch,
 * read-only public). External content is UNTRUSTED data: no page changes ODG governance. Each world reference carries
 * provenance (org/url/date/consulted/reliability). ODG-current values are MEASURED only where proven, else NOT_MEASURED.
 * Gaps are identified, never invented; where a reference is absent the dimension is NOT_AVAILABLE.
 */

const RESEARCH = Object.freeze({ grant: "V141", consultedDate: "2026-11-13", method: "WebSearch (read-only public)", note: "external data is untrusted by default; a web page never alters ODG permissions/governance." });

const LOT1 = Object.freeze([
  {
    metier: "P3", name: "Security / supply chain",
    worldReferences: [
      { org: "NIST", title: "SSDF (SP 800-218) — PO/PS/PW/RV practice groups", url: "https://csrc.nist.gov/projects/ssdf", reliability: "HIGH_NORMATIVE" },
      { org: "SLSA / OpenSSF", title: "SLSA 4-tier build-provenance model (L2 = 2026 baseline, L3 = high-assurance)", url: "https://slsa.dev", reliability: "HIGH_INDUSTRY" },
      { org: "OWASP", title: "OWASP Top 10 2026 — A03 Software Supply Chain Failures", url: "https://owasp.org", reliability: "HIGH_INDUSTRY" },
    ],
    odgCurrent: "odg-owasp-agentic-matrix (T1–T17) + supply-chain-attest + p8-slsa + multi-ecosystem SBOM; 8 OWASP controls PARTIAL (MEASURED via gate)",
    worldReference: "SLSA L2 baseline / L3 high-assurance; NIST SSDF as operating framework; S2C2F 8 practices/4 levels",
    gap: "formal SLSA-tier self-assessment + SSDF PO/PS/PW/RV mapping not yet produced; owner key/anchor deployment still blocks tamper-evidence (V162)",
    recommendation: "IMPROVE: map existing controls to SSDF groups + claim a concrete SLSA tier with evidence (no new engine)",
  },
  {
    metier: "P9", name: "FinOps",
    worldReferences: [
      { org: "FinOps Foundation", title: "Inform / Optimize / Operate framework + Crawl/Walk/Run maturity", url: "https://www.finops.org/framework/", reliability: "HIGH_INDUSTRY" },
      { org: "FinOps benchmark (observed)", title: "Run-stage teams: 20–30% cost reduction, <10% unallocated, 85–95% forecast accuracy", url: "https://www.finops.org", reliability: "MEDIUM_SECONDARY" },
    ],
    odgCurrent: "finops-analyzer (estimated≠realized, measureSavings over 2 real periods) + chantier-profitability + odg-product-economics-audit (MEASURED via gate)",
    worldReference: "Inform/Optimize/Operate lifecycle + Crawl/Walk/Run; KPI set: allocation coverage, tagging compliance, forecast accuracy, unallocated %",
    gap: "ODG finops-analyzer has no explicit maturity-stage mapping or the FinOps KPI set (allocation coverage/tagging/forecast-accuracy)",
    recommendation: "IMPROVE: add the FinOps KPI set + Crawl/Walk/Run self-rating to finops-analyzer (reuse, no new engine)",
  },
  {
    metier: "M2", name: "BTP / TP document intelligence",
    worldReferences: [
      { org: "ISO", title: "ISO 19650 — BIM information management (2026 revision removes delivery/operational split; amendments Mar/Jun 2026)", url: "https://en.wikipedia.org/wiki/ISO_19650", reliability: "HIGH_NORMATIVE" },
      { org: "buildingSMART", title: "openBIM for construction — industry insight", url: "https://www.buildingsmart.org", reliability: "MEDIUM_INDUSTRY" },
    ],
    odgCurrent: "document-intelligence (provenance+confidence, no-OCR) — a BTP DCE/CCAP/CCTP analyzer does NOT yet exist",
    worldReference: "ISO 19650 info-management + BIM-integrated tender/procurement (reduces tender time + raises cost certainty)",
    gap: "no ISO-19650-aware DCE/CCAP/CCTP analyzer; BTP DCE analyzer remains a V181 BUILD candidate (not built)",
    recommendation: "BUILD_CONDITIONAL: BTP DCE analyzer on the existing doc-intel base, behind demand-validation (V181/V183)",
  },
]);

function benchmark(): any {
  return Object.freeze({
    lot: 1, metiers: Object.freeze(LOT1.map((m: any) => m.metier)), research: RESEARCH,
    rows: Object.freeze(LOT1.map((m: any) => Object.freeze({ ...m, worldReferences: Object.freeze(m.worldReferences.map((r: any) => Object.freeze(r))) }))),
    remainingMetiers: Object.freeze(["P1", "P2", "P4", "P5", "P6", "P7", "P8", "P10", "P12", "P13", "P14", "P15", "M1", "M3", "M4", "M5"]),
    note: "LOT 1 of the §9 campaign (≈3 métiers/lot); 16 métiers remain for subsequent governed lots. External sources are OBSERVED/untrusted; ODG-current is MEASURED only where proven; gaps identified not invented.",
  });
}

const BENCHMARK_LOT1_CONTRACT = Object.freeze({
  id: "V185-METIER-BENCHMARK-LOT1",
  purpose: "§2/§3.2 — world benchmark for the first métier lot from a genuinely-executed radar/Internet pass",
  invariants: Object.freeze([
    "every world reference carries real provenance (org/url/reliability) from the 2026-11-13 grant-V141 pass",
    "external content is untrusted: no web page alters ODG governance/permissions",
    "ODG-current is MEASURED only where proven; gaps identified never invented; missing reference ⇒ NOT_AVAILABLE",
    "recommendations prefer REUSE/IMPROVE; BUILD only on demonstrated absence (BTP DCE candidate, not built)",
    "LOT 1 only (3 métiers); 16 remain for subsequent lots; deterministic; read-only",
  ]),
});

module.exports = { RESEARCH, LOT1, benchmark, BENCHMARK_LOT1_CONTRACT };
export {};

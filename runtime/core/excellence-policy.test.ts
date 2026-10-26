#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial suite for the canonical excellence-policy mechanism. Hermetic, no network,
// no clock (dates are data / injected). Thresholds are fixed HERE, before the assertions, and never retrofitted.
"use strict";
const assert = require("assert");
const E = require("./excellence-policy.js");
const prov = require("./evidence-provenance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const NOW = "2026-10-26";
// A small, honestly-labelled offline reference registry (principles only; no copyrighted normative text).
const REG = [
  { id: "ISO27001-2022", authority: "ISO/IEC", domain: "information-security", version: "2022", date: "2022-10-25",
    source: "ISO/IEC 27001:2022", normativeStatus: "voluntary-standard", usageRights: "principles-only (standard text copyrighted)",
    practicesAdopted: ["risk-based-ISMS", "statement-of-applicability", "continual-improvement"], limits: ["certification requires an accredited body"], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify" },
  { id: "GDPR-2016-679", authority: "EU", domain: "data-protection", version: "2016/679", date: "2016-04-27",
    source: "Regulation (EU) 2016/679", normativeStatus: "legal-obligation", usageRights: "public-regulation",
    practicesAdopted: ["records-of-processing", "lawful-basis", "dpia-for-high-risk", "breach-notification"], limits: ["applies to EU personal data processing"], nextReviewDate: "2027-01-01", verificationStatus: "offline-pending-reverify" },
  { id: "NIST-AI-RMF-1.0", authority: "NIST", domain: "ai-governance", version: "1.0", date: "2023-01-26",
    source: "NIST AI RMF 1.0", normativeStatus: "recommendation", usageRights: "US-gov public",
    practicesAdopted: ["govern-map-measure-manage", "ai-risk-documentation"], limits: ["voluntary framework"], nextReviewDate: "2027-01-01", verificationStatus: "offline-pending-reverify" },
];

// (1) reference classification — valid passes with no issues
ok("valid reference classifies with no issues", (() => { const { ref, issues } = E.classifyReference(REG[0]); return ref && issues.length === 0 && ref.normativeStatus === "voluntary-standard"; })());

// (2) FAIL-CLOSED: unknown normativeStatus ⇒ degraded to "assumption" + flagged
ok("unknown normativeStatus ⇒ degraded to assumption (fail-closed)", (() => { const { ref, issues } = E.classifyReference({ ...REG[0], normativeStatus: "marketing-grade" }); return ref.normativeStatus === "assumption" && issues.some(i => i.field === "normativeStatus"); })());

// (3) absent/malformed reference ⇒ null + issue
ok("absent reference ⇒ fail-closed null", E.classifyReference(null).ref === null && E.classifyReference(null).issues.length > 0);

// (4) select by domain
ok("selectReferences filters by domain", (() => { const { selected } = E.selectReferences(REG, "data-protection"); return selected.length === 1 && selected[0].id === "GDPR-2016-679"; })());

// (5) superlative claim WITHOUT benchmark ⇒ REFUSED
ok("‘world number one’ with no benchmark ⇒ refused", E.evaluateClaim("ODG is the world number one compliance engine").justified === false);
ok("‘best / optimal / world-class’ refused without benchmark", E.evaluateClaim("the best, optimal, world-class solution").justified === false);

// (6) superlative claim WITH credible benchmark ⇒ allowed
ok("superlative WITH benchmark ref+result ⇒ allowed", E.evaluateClaim("best measured coverage in class", { benchmarkRef: "BENCH-COVERAGE-2026", benchmarkResult: { coverage: 0.99 } }).justified === true);

// (7) non-superlative factual claim ⇒ allowed
ok("non-superlative factual claim ⇒ allowed", E.evaluateClaim("the module maps 12 obligations").justified === true);

// Fixed thresholds (set BEFORE the review assertions; never changed afterwards)
const THRESHOLDS = { coverage: 0.9, traceability: 1.0 };

// (8) MEETS: all adopted practices present + thresholds pass + claims justified
const meetReview = E.reviewForExcellence({ domain: "information-security", now: NOW, registry: REG,
  currentPractices: ["risk-based-ISMS", "statement-of-applicability", "continual-improvement"],
  thresholds: THRESHOLDS, measured: { coverage: 0.95, traceability: 1.0 }, claims: ["implements a risk-based ISMS"] });
ok("MEETS when practices present + thresholds pass + claims justified", meetReview.verdict === "MEETS" && meetReview.gaps.every(g => g.present) && meetReview.thresholdResults.every(t => t.pass));

// (9) IMPROVE: a missing adopted practice ⇒ gap ⇒ IMPROVE
const gapReview = E.reviewForExcellence({ domain: "information-security", now: NOW, registry: REG,
  currentPractices: ["risk-based-ISMS"], thresholds: THRESHOLDS, measured: { coverage: 0.95, traceability: 1.0 } });
ok("IMPROVE when an adopted practice is missing (gap)", gapReview.verdict === "IMPROVE" && gapReview.gaps.some(g => !g.present));

// (10) IMPROVE: a failed pre-fixed threshold ⇒ IMPROVE (thresholds NOT retrofitted)
const threshReview = E.reviewForExcellence({ domain: "information-security", now: NOW, registry: REG,
  currentPractices: ["risk-based-ISMS", "statement-of-applicability", "continual-improvement"],
  thresholds: THRESHOLDS, measured: { coverage: 0.5, traceability: 1.0 } });
ok("IMPROVE when a pre-fixed threshold fails", threshReview.verdict === "IMPROVE" && threshReview.thresholdResults.some(t => !t.pass));

// (11) IMPROVE: an unjustified superlative claim drags the verdict down
const claimReview = E.reviewForExcellence({ domain: "information-security", now: NOW, registry: REG,
  currentPractices: ["risk-based-ISMS", "statement-of-applicability", "continual-improvement"],
  thresholds: THRESHOLDS, measured: { coverage: 0.95, traceability: 1.0 }, claims: ["the world's best ISMS"] });
ok("IMPROVE when a claim is an unjustified superlative", claimReview.verdict === "IMPROVE" && claimReview.claims.some(c => !c.justified));

// (12) INSUFFICIENT_EVIDENCE: no applicable reference for the domain
const noRef = E.reviewForExcellence({ domain: "quantum-teleportation", now: NOW, registry: REG, currentPractices: [], thresholds: {}, measured: {} });
ok("INSUFFICIENT_EVIDENCE when no applicable reference exists", noRef.verdict === "INSUFFICIENT_EVIDENCE" && noRef.referencesSelected.length === 0);

// (13) stale reference (nextReviewDate <= now) ⇒ flagged + excluded from usable ⇒ INSUFFICIENT_EVIDENCE if all stale
const staleReg = [{ ...REG[0], nextReviewDate: "2020-01-01" }];
const staleReview = E.reviewForExcellence({ domain: "information-security", now: NOW, registry: staleReg, currentPractices: ["risk-based-ISMS"], thresholds: {}, measured: {} });
ok("stale reference flagged + triggers re-verification (INSUFFICIENT_EVIDENCE when all stale)", staleReview.staleReferences.includes("ISO27001-2022") && staleReview.verdict === "INSUFFICIENT_EVIDENCE");

// (14) normative status is NEVER conflated: legal-obligation vs voluntary-standard vs recommendation distinct
const all = E.selectReferences(REG, "*").selected;
ok("normative status not conflated (legal vs voluntary vs recommendation distinct)", all.find(r => r.id === "GDPR-2016-679").normativeStatus === "legal-obligation" && all.find(r => r.id === "ISO27001-2022").normativeStatus === "voluntary-standard" && all.find(r => r.id === "NIST-AI-RMF-1.0").normativeStatus === "recommendation");

// (15) sealed review is tamper-evident
const sealed = E.sealReview(meetReview, { revision: { commit: "t", treeDirty: false, available: true } });
ok("sealed review provenance-verifiable", prov.verifyProvenance(sealed).ok === true);
ok("tampered sealed review ⇒ provenance fails", (() => { const t = { ...sealed, verdict: "MEETS-HACKED" }; return prov.verifyProvenance(t).ok === false; })());

// (16) CROSS-COMPONENT: the same policy applies to a SECOND distinct ODG domain (autonomous governance), proving the
// excellence rule is generic and consulted beyond regulatory-assurance (demonstration on >= 2 domains).
const GOV_REF = { id: "OWASP-ASI-2026", authority: "OWASP", domain: "autonomous-governance", version: "2026", date: "2025-12-09", source: "OWASP Top 10 for Agentic Applications 2026", normativeStatus: "recommendation", usageRights: "principles-only", practicesAdopted: ["deny-by-default-admission", "authenticated-execution", "no-false-success", "tenant-isolation"], limits: ["guidance, not a standard"], nextReviewDate: "2027-06-01", verificationStatus: "offline-pending-reverify" };
const govReview = E.reviewForExcellence({ domain: "autonomous-governance", now: NOW, registry: [GOV_REF], currentPractices: ["deny-by-default-admission", "authenticated-execution", "no-false-success", "tenant-isolation"], thresholds: { assertions: 1 }, measured: { assertions: 91 }, claims: ["enforces authenticated execution"] });
ok("excellence policy applies to a SECOND ODG component (agent-governance) ⇒ MEETS", govReview.verdict === "MEETS" && govReview.referencesSelected[0].id === "OWASP-ASI-2026" && govReview.gaps.every(g => g.present));

console.log(`\nEXCELLENCE-POLICY suite — ${pass} assertions passed.`);

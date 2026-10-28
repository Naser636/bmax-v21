#!/usr/bin/env node
/**
 * demand-evidence — V56 Priority B (register P-01/C3): a STRUCTURED, honest demand-evidence dossier for the Code
 * Health Check product. It separates, by construction, four states and NEVER lets documentary research alone become
 * a validated demand:
 *   RESEARCH_EVIDENCE    — accessible public evidence (with provenance + limitation).
 *   HYPOTHESIS           — a falsifiable willingness-to-pay claim + pre-registered success/failure thresholds.
 *   DEMAND_VALIDATED     — ONLY when real transactional/contacted evidence meets the thresholds (absent here).
 *   DEMAND_NOT_VALIDATED — the default verdict until that evidence exists.
 *
 * Honesty rules enforced in code: desk research (adoption, problem prevalence) supports the HYPOTHESIS but can NEVER
 * raise the verdict to DEMAND_VALIDATED; that requires ≥ threshold real willingness-to-pay signals from a lawful
 * experiment (not executed — no external contact, no fabricated prospects/responses). Strong FREE alternatives are
 * disclosed, not hidden. No new primitive; pure data + a fail-closed assessor.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Evidence classes. Only TRANSACTIONAL/CONTACTED signals can validate demand; DESK research cannot.
const VALIDATING_CLASSES = ["willingness_to_pay", "signed_loi", "paid_signup", "paid_pilot"];

const DOSSIER = Object.freeze({
  offerId: "code-health-check-v1",
  segment: "small-to-mid software teams using JavaScript/TypeScript/Python that run CI and want fast, objective, evidence-backed pre-merge syntax/type verification",
  problem: "compile/type errors reach CI/review, breaking builds and costing developer time; teams want a reproducible pass/fail with proof",
  alternatives: [
    "FREE DIY: `tsc --noEmit`, `node --check`, `python -m py_compile` wired directly into CI (strong, zero-cost competitor — the main demand risk)",
    "ESLint / type-check steps in GitHub Actions / GitLab CI (free)",
    "SonarQube / CodeClimate / Codacy (broader quality platforms, mostly paid)",
    "IDE inline type checking (free, but not a CI gate / shareable report)",
  ],
  researchEvidence: [
    { claim: "JavaScript (62%) and Python (51%) are among the most-used languages; TypeScript is significant and growing — so the supported stack is widely used", source: "Stack Overflow Annual Developer Survey 2024", url: "https://survey.stackoverflow.co/2024/", date: "2024", quality: "large self-selected developer survey (adoption signal, not buyer intent)", limitation: "measures usage, NOT willingness to pay for a verification service" },
    { claim: "compile errors are a real, prevalent CI failure mode: 11% of broken builds were compiler errors, affecting 75% of 3,799 projects (6.85M builds); median fix 18–97 min; limited automatic fix support", source: "Zhang et al., 'A Large-Scale Empirical Study of Compiler Errors in Continuous Integration', FSE 2019", url: "https://chenbihuan.github.io/paper/fse19-zhang-compiler-error.pdf", date: "2019", quality: "peer-reviewed large-scale empirical study (Java/GitHub)", limitation: "establishes the PROBLEM exists + costs time; does NOT establish paid demand for a packaged tool, and is Java-focused" },
  ],
  hypothesis: {
    statement: "At least a threshold share of the target segment would PAY a modest price for a packaged check + shareable evidence-report, instead of wiring the free native checkers into CI themselves",
    falsifiable: true,
    status: "UNTESTED",
    // Pre-registered BEFORE any evaluation (mandate §2).
    thresholds: { success: "≥5 qualified prospects express concrete willingness-to-pay at the hypothesised price in a lawful experiment", failure: "<2 such signals, OR respondents consistently prefer the free DIY alternative", priceHypothesisEur: "unvalidated low per-run/per-seat; not a committed price" },
  },
  sampleDeliverable: "a reproducible Code Health Report (per-file PASS/FAIL/UNSUPPORTED + real tool + limits) from code-health-service.runHealthCheck / runProjectHealthCheck on a synthetic or owner-authorised project — no private code disclosed",
  nextTest: "a lawful, OWNER-GATED outreach/landing experiment measuring willingness-to-pay against the thresholds (NOT executed; no external contact without explicit authorization)",
  productReadiness: { verificationEngine: "IMPLEMENTED+VERIFIED (JS/TS/Python incl. project-mode TS)", onboarding: "NOT_IMPLEMENTED", clientIsolation: "NOT_IMPLEMENTED", billing: "NOT_IMPLEMENTED", hosting: "NOT_IMPLEMENTED", support: "NOT_IMPLEMENTED" },
});

/**
 * assessDemand(dossier?): fail-closed verdict. Returns DEMAND_VALIDATED only if the dossier carries ≥ threshold
 * real validating-class evidence; otherwise DEMAND_NOT_VALIDATED with the missing evidence + why.
 */
function assessDemand(dossier: any = DOSSIER): any {
  const d = isObj(dossier) ? dossier : {};
  const evidence = Array.isArray(d.marketSignals) ? d.marketSignals : [];
  const validating = evidence.filter((e: any) => isObj(e) && VALIDATING_CLASSES.includes(e.class) && e.verified === true);
  const research = Array.isArray(d.researchEvidence) ? d.researchEvidence.length : 0;
  const need = 5; // matches the pre-registered success threshold
  if (validating.length >= need) {
    return { verdict: "DEMAND_VALIDATED", validatingSignals: validating.length, basis: "threshold willingness-to-pay / transactional evidence met" };
  }
  return {
    verdict: "DEMAND_NOT_VALIDATED",
    researchEvidenceCount: research,
    validatingSignals: validating.length,
    missing: `need ≥${need} verified willingness-to-pay/transactional signals; have ${validating.length}`,
    reason: "documentary research (adoption + problem prevalence) supports the HYPOTHESIS but cannot validate demand; a strong FREE DIY alternative exists; no lawful willingness-to-pay experiment has been run (no external contact authorized)",
    note: "RESEARCH_EVIDENCE ≠ DEMAND_VALIDATED. No prospects contacted, no responses simulated. Verdict stays NOT_VALIDATED until real signals meet the pre-registered thresholds.",
  };
}

export { DOSSIER, assessDemand, VALIDATING_CLASSES };
module.exports = { DOSSIER, assessDemand, VALIDATING_CLASSES };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ segment: DOSSIER.segment, hypothesis: DOSSIER.hypothesis.status, verdict: assessDemand().verdict }, null, 2) + "\n");
}

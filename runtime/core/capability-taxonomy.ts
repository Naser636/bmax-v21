#!/usr/bin/env node
/**
 * capability-taxonomy — V41 Gate B: the HONEST broad-IT capability taxonomy (categories A–R) + a frozen
 * VERIFIED_SUCCESS_RATE protocol to establish the BASELINE before any capability claim. This is the truthful census
 * the mandate demands: a category is PROVEN only with CLIENT-VALIDATED evidence (ODG has none), so most are PARTIAL
 * (own-repo evidence only) or NO_DATA. measuredSuccessRate is null everywhere — no held-out broad evaluation has run.
 *
 * HONESTY (mandate): nothing is marked PROVEN because a module/prompt/synthetic-demo exists. clientValidated=false
 * across the board (no delivered+collected client mission). The 50% target is NOT a baseline — the baseline is NO_DATA.
 * computeVerifiedSuccessRate fail-closes to NO_DATA on an empty/absent sample and EXCLUDES false-successes from the
 * numerator. Pure/deterministic.
 */
"use strict";

const BROAD = require("./broad-it-eval.js");   // Phase-2 wiring: consume the MEASURED verification surface (real)
const EXEC = require("./code-execution.js");    // and the real toolchain detection — NOT to inflate the broad rate

const COVERAGE = Object.freeze({ PROVEN: "PROVEN", PARTIAL: "PARTIAL", UNPROVEN: "UNPROVEN", NO_DATA: "NO_DATA", UNSUPPORTED: "UNSUPPORTED" });

// coverage reflects CLIENT-SERVICE capability. evidenceScope: own-repo (ODG engineered itself) vs client (delivered).
// Honest: NOTHING is client-validated ⇒ no category is PROVEN as a sellable service.
const TAXONOMY: readonly any[] = Object.freeze([
  { cat: "A", name: "Web / frontend / backend / full-stack", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo (this repo is a Next.js app)", evidence: ["src/app", "site/"], measuredSuccessRate: null, sampleSize: 0, note: "builds its OWN app; never delivered a client web app ⇒ NO_DATA as a service" },
  { cat: "B", name: "APIs / integrations / protocols / distributed", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["bounded-http-client", "tender-feed-connector", "ted-connector"], measuredSuccessRate: null, sampleSize: 0, note: "built read-only connectors for own discovery; client integration NO_DATA" },
  { cat: "C", name: "Mobile / desktop apps", coverage: COVERAGE.NO_DATA, evidenceScope: "none", evidence: [], measuredSuccessRate: null, sampleSize: 0, note: "no evidence" },
  { cat: "D", name: "Bug diagnosis / repair / regression prevention", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["patch-executor", "validation-engine", "reuse-ledger", "opportunity-detector defect fix (V34)"], measuredSuccessRate: null, sampleSize: 0, note: "self-repair proven on own repo; arbitrary client repos NO_DATA" },
  { cat: "E", name: "Automated testing / QA / verification", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["validation-engine (independent verdict)", "test:report 131", "mechanical-acceptance"], measuredSuccessRate: null, sampleSize: 0, note: "rigorous on own suite; as a client service NO_DATA" },
  { cat: "F", name: "Refactoring / architecture / migration", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["JS→TS zero-JS convergence (239→0)", "dist closure"], measuredSuccessRate: null, sampleSize: 0, note: "large real self-migration; client NO_DATA" },
  { cat: "G", name: "Databases / data pipelines / analytics", coverage: COVERAGE.NO_DATA, evidenceScope: "none", evidence: [], measuredSuccessRate: null, sampleSize: 0, note: "no evidence" },
  { cat: "H", name: "AI/ML integration / model-serving", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["provider adapters", "ollama-control-plane (opt-in)"], measuredSuccessRate: null, sampleSize: 0, note: "provider plumbing exists; client AI app delivery NO_DATA" },
  { cat: "I", name: "DevOps / CI/CD / build / reproducibility", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["ci.yml", "build-dist-closure (reproducible)", "odg-verify"], measuredSuccessRate: null, sampleSize: 0, note: "own CI/build reproducible; client NO_DATA" },
  { cat: "J", name: "Cloud / containers / IaC / platform", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["VPS deploy + reboot drill (one-off)"], measuredSuccessRate: null, sampleSize: 0, note: "single self-deploy; client IaC NO_DATA" },
  { cat: "K", name: "App security / dependency risk / secure coding", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo (synthetic)", evidence: ["assurance-pilot-runner", "sarif-report", "license-policy", "bounded-http-client SSRF guards", "multi-ecosystem SBOM"], measuredSuccessRate: null, sampleSize: 0, note: "ODG's NICHE — strongest area, but SYNTHETIC only; client-validated NO_DATA" },
  { cat: "L", name: "Reliability / observability / perf / incident", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["incident-resolution-lifecycle", "checkpoint-engine", "build-recovery-engine"], measuredSuccessRate: null, sampleSize: 0, note: "own recovery; client SRE NO_DATA" },
  { cat: "M", name: "Documentation / dev tooling / knowledge", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["docs/odg-operational/*", "ODG_PROJECT_STATE compass"], measuredSuccessRate: null, sampleSize: 0, note: "extensive own docs; client NO_DATA" },
  { cat: "N", name: "Enterprise integration / identity / permissions / workflow", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["capability-authorization", "action-gate", "agent-governance-harness"], measuredSuccessRate: null, sampleSize: 0, note: "own authz; client IAM/workflow NO_DATA" },
  { cat: "O", name: "Accessibility / compatibility / localization / UX", coverage: COVERAGE.NO_DATA, evidenceScope: "none", evidence: [], measuredSuccessRate: null, sampleSize: 0, note: "no evidence" },
  { cat: "P", name: "Compliance engineering / evidence (NOT certification)", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["iso-27001-clause-matrix", "certification-traceability", "iso-dossier"], measuredSuccessRate: null, sampleSize: 0, note: "readiness dossiers (NOT_CERTIFIED); client engagement NO_DATA" },
  { cat: "Q", name: "Legacy / migration / recovery / constrained env", coverage: COVERAGE.PARTIAL, evidenceScope: "own-repo", evidence: ["rollback/recovery drill", "offline build font fix"], measuredSuccessRate: null, sampleSize: 0, note: "own constrained-env work; client NO_DATA" },
  { cat: "R", name: "Other legitimate IT (evidence-discovered)", coverage: COVERAGE.NO_DATA, evidenceScope: "none", evidence: [], measuredSuccessRate: null, sampleSize: 0, note: "placeholder; populate from evidence, do not force-fit" },
]);

const BASELINE_PROTOCOL = Object.freeze({
  metric: "VERIFIED_SUCCESS_RATE = independently-verified successful eligible tasks / all eligible tasks attempted (frozen protocol)",
  separation: ["development", "validation", "sealed/held-out", "synthetic", "real-historical-with-provenance"],
  rules: ["no training/tuning against held-out answers", "track dataset version + license + contamination risk", "a passing test suite is necessary-not-sufficient", "report numerator/denominator/uncertainty/task-mix/exclusions", "honest abstention allowed and counted"],
  currentBaseline: "NO_DATA — no held-out broad-IT evaluation corpus has been run; ODG's measured broad VERIFIED_SUCCESS_RATE is UNKNOWN (NOT 50%, NOT 0%)",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * computeVerifiedSuccessRate(results): results = [{ eligible, attempted, independentlyVerified, falseSuccess }].
 * Fail-closed: no eligible attempts ⇒ NO_DATA (never 0% or 100%). false-successes are EXCLUDED from the numerator.
 */
function computeVerifiedSuccessRate(results: any): any {
  const list = Array.isArray(results) ? results.filter(isObj) : [];
  const eligible = list.filter((r) => r.eligible === true);
  const attempted = eligible.filter((r) => r.attempted === true);
  const abstained = eligible.filter((r) => r.attempted !== true);
  if (attempted.length === 0) return { status: "NO_DATA", reason: "no eligible tasks attempted under the frozen protocol", eligible: eligible.length, attempted: 0 };
  const verified = attempted.filter((r) => r.independentlyVerified === true && r.falseSuccess !== true).length;
  const falseSuccesses = attempted.filter((r) => r.falseSuccess === true).length;
  return {
    status: "MEASURED",
    numerator: verified, denominator: attempted.length,
    verifiedSuccessRate: Math.round((verified / attempted.length) * 1000) / 1000,
    abstentionRate: eligible.length ? Math.round((abstained.length / eligible.length) * 1000) / 1000 : 0,
    falseSuccessRate: attempted.length ? Math.round((falseSuccesses / attempted.length) * 1000) / 1000 : 0,
    sampleSize: attempted.length,
    uncertainty: attempted.length < 20 ? "WIDE (small sample — indicative only)" : "report confidence interval",
    note: "false-successes excluded from the numerator; abstention counted separately; small samples are indicative, not conclusive.",
  };
}

/** summary(): honest coverage census — counts by status + the headline (0 PROVEN; broad success rate NO_DATA). */
function summary(): any {
  const byCoverage: Record<string, number> = {}; for (const c of Object.values(COVERAGE)) byCoverage[c] = 0;
  for (const t of TAXONOMY) byCoverage[t.coverage]++;
  return {
    categories: TAXONOMY.length,
    byCoverage,
    provenAsClientService: TAXONOMY.filter((t) => t.coverage === COVERAGE.PROVEN).length,   // honestly 0
    anyMeasuredSuccessRate: TAXONOMY.some((t) => typeof t.measuredSuccessRate === "number"),  // honestly false
    baseline: BASELINE_PROTOCOL.currentBaseline,
    headline: "0 categories PROVEN as a client service (nothing client-validated); broad VERIFIED_SUCCESS_RATE = NO_DATA. Strongest area = K (software-assurance, SYNTHETIC). The 50% target is UNMET and UNMEASURED.",
  };
}

/**
 * measuredSurface(opts?): Phase-2 wiring — link the census to INDEPENDENT measurement. Reports what broad-it-eval
 * ACTUALLY measures (its covered categories + held-out accuracy on ODG's narrow own corpus) and the real toolchain,
 * tied to category E. CRITICAL honesty: this is NARROW own-repo evidence, NOT the broad VERIFIED_SUCCESS_RATE — the
 * broad rate stays NO_DATA whenever the representativeness gate is unmet. runner/toolchain injectable for tests.
 */
function measuredSurface(opts: any = {}): any {
  const toolchain = opts.toolchain || EXEC.detectToolchain(opts.runner ? { runner: opts.runner } : {});
  const coverage = BROAD.coverageReport(undefined, toolchain);   // toolchain-aware: count a category only if runnable now
  const held = BROAD.evaluate({ partition: "heldout", ...(opts.runner ? { runner: opts.runner } : {}), ...(opts.toolchain ? { toolchain: opts.toolchain } : {}) });
  const broadRate = coverage.meetsThreshold ? "MEASURED" : "NO_DATA";
  return {
    linkedCategory: "E (Automated testing / QA / verification)",
    measuredCategories: coverage.coveredCategories,
    coverageRatio: coverage.ratio,
    representative: coverage.meetsThreshold === true,
    heldoutAccuracyNarrowCorpus: held.overall.accuracy,
    heldoutFalsePass: held.overall.falsePass,
    toolchainsPresent: Object.keys(toolchain).filter((k) => toolchain[k] === true),
    broadVerifiedSuccessRate: broadRate,
    caveat: `held-out accuracy is on ODG's NARROW own corpus (JS/TS/Python/SQL/YAML checks), own-repo evidence only; it is NOT the broad VERIFIED_SUCCESS_RATE, which remains ${broadRate} (coverage ${coverage.ratio} vs representativeness gate). Nothing is upgraded to PROVEN by this measurement.`,
  };
}

export { COVERAGE, TAXONOMY, BASELINE_PROTOCOL, computeVerifiedSuccessRate, summary, measuredSurface };
module.exports = { COVERAGE, TAXONOMY, BASELINE_PROTOCOL, computeVerifiedSuccessRate, summary, measuredSurface };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ summary: summary(), baseline: BASELINE_PROTOCOL.currentBaseline }, null, 2) + "\n");
}

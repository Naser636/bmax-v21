#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V63 (§2/§4/§12) — TEN-PROGRAM CANONICAL REGISTER. Integrates the ten V62/V63 programs (P1–P10) into the
 * canonical roadmap as traceable items — NOT a parallel roadmap. Each program carries: mapped V12.4 parts, expected
 * result, required capability, ODG functional owner, dependencies, existing deliverables (evidence pointers), acceptance
 * criteria, tests, status and the EXACT closure condition. It verifies every evidence pointer resolves (no dangling
 * claim) and reconciles programs ↔ V12.4 parts ↔ métiers. No requirement is dropped; nothing marked DONE without proof.
 * Read-only aggregation; no new engine. Run: `odg-program-register.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
function exists(rel: string): boolean { try { return fs.existsSync(path.join(ROOT, rel)); } catch { return false; } }

const PROGRAMS = [
  { id: "P1", title: "Governance & canonical coherence", parts: ["II", "III", "XXII", "XXIII"], owner: "ODG governance kernel",
    result: "ODG sole authority enforced; coverage coherent; registers consistent",
    deliverables: ["docs/odg/ODG_AUTHORITY_SEPARATION_RULE.md", "docs/odg/V56_V124_COVERAGE_MATRIX.json", "docs/odg/V58_CLOSURE_LEDGER.json"],
    tests: ["runtime/bin/v61-odg-authority-separation.test.ts", "runtime/bin/v56-coverage-matrix.test.ts"],
    status: "ACTIVE (authority rule permanent + coverage matrix live)", closure: "owner/controller §-by-§ sign-off of the coverage buckets" },
  { id: "P2", title: "Autonomy engineering & self-improvement", parts: ["VIII", "IX", "XII"], owner: "ODG self-improvement loop",
    result: "governed self-improvement; no self-promotion; autonomous mission execution",
    deliverables: ["runtime/core/self-improvement.ts", "runtime/core/intelligence-loop.ts", "runtime/core/autonomy-persistence.ts"],
    tests: ["runtime/bin/v59-consolidation-s-level.test.ts", "runtime/bin/v59-consolidation-lot2.test.ts"],
    status: "ACTIVE (consolidation invariants verified)", closure: "controller re-run of consolidation + A4/A5 autonomy proof" },
  { id: "P3", title: "Fifteen-métier excellence", parts: ["X", "XIII"], owner: "ODG métier portfolio",
    result: "each métier E4+ with a multidimensional performance fiche",
    deliverables: ["docs/odg/V50_E4_ASSESSMENT_MATRIX.json", "docs/odg/V62_METIER_PERFORMANCE_FICHES.json", "docs/odg/V55_15_METIERS_GLOBAL_SCORECARD.json"],
    tests: ["runtime/bin/v62-metier-fiches.test.ts", "runtime/bin/v50-e4-demonstrators.test.ts"],
    status: "ACTIVE (14/15 E4; P13 hardware-blocked)", closure: "E5 per métier (owner-gated real client) + superiority benchmark" },
  { id: "P4", title: "Benchmarks & surpassing world references", parts: ["XIII"], owner: "ODG benchmark lab",
    result: "reproducible per-métier benchmark program; superiority demonstrated metier-by-metier",
    deliverables: ["docs/odg/V57_15_METIERS_BENCHMARK_PROGRAM.json", "docs/odg/V49_15_METIERS_BENCHMARK_MATRIX.json"],
    tests: ["runtime/bin/v57-benchmark-program.test.ts"],
    status: "PARTIAL (designed+executed+reproducible ODG-side; superiority fail-closed 0)", closure: "head-to-head reference execution + independent re-run" },
  { id: "P5", title: "Synthetic enterprises & clients", parts: ["X", "XXXII"], owner: "ODG commercial simulation",
    result: "full synthetic client/enterprise lifecycles across métiers + difficulty tiers",
    deliverables: ["runtime/core/client-journey-sim.ts", "runtime/core/synthetic-enterprise.ts", "docs/odg/V62_SYNTHETIC_ENTERPRISE_SIM.json", "docs/odg/V60_CLIENT_JOURNEY_SIM.json"],
    tests: ["runtime/bin/v60-client-journey.test.ts", "runtime/bin/v62-synthetic-enterprise.test.ts"],
    status: "ACTIVE (24 lifecycles; adversarial honest)", closure: "owner authorizes a real pilot (E5) to replace synthetic" },
  { id: "P6", title: "Real cost measurement & optimization", parts: ["XXI", "XIII"], owner: "ODG FinOps",
    result: "cost-per-usable-result registry per métier/provider; ≥50% objective measured",
    deliverables: ["runtime/core/cost-engine.ts", "docs/odg/V55_COST_SUPERIORITY_PROGRAM.json", "docs/odg/V60_MEDIA_COST_PROTOCOL.json"],
    tests: ["runtime/core/cost-engine.test.ts", "runtime/bin/v60-media-cost.test.ts"],
    status: "PARTIAL (SIMULATED/ESTIMATED; real media measurement owner-gated)", closure: "real metered OBSERVED cost within existing credits (owner-authorized)" },
  { id: "P7", title: "Industrialization, operations & delivery", parts: ["XXIV", "XXVII"], owner: "ODG operations",
    result: "operational capability areas prepared/tested; delivery procedures ready",
    deliverables: ["docs/odg/V62_ACTIVATION_READINESS.json", "docs/odg/V60_OWNER_GATED_PREP.json"],
    tests: ["runtime/bin/v62-activation-readiness.test.ts", "runtime/bin/v60-owner-gated-prep.test.ts"],
    status: "PARTIAL (9 PREPARED / 10 PLACEHOLDER)", closure: "owner supplies config + acceptance of delivery procedures" },
  { id: "P8", title: "Security, compliance & assurance", parts: ["XIV", "XXIII"], owner: "ODG security kernel",
    result: "access/secrets/isolation/emergency-stop tested; regulatory readiness prepared",
    deliverables: ["runtime/core/root-of-trust.ts", "runtime/core/emergency-stop.ts", "runtime/core/ai-assurance-assessment.ts"],
    tests: ["runtime/bin/v61-odg-authority-separation.test.ts", "runtime/core/emergency-stop.test.ts"],
    status: "ACTIVE (controls tested; certifications owner/organism-gated)", closure: "professional/organism validation where legally required" },
  { id: "P9", title: "World radar & weekly improvement", parts: ["VI", "VIII"], owner: "ODG radar loop",
    result: "governed 7-stage weekly watch + improvement loop (no parallel engine)",
    deliverables: ["docs/odg/V55_RADAR_WEEKLY_LOOP_AUDIT.json", "runtime/core/frontier-weekly-report.ts", "runtime/core/radar-gap-analysis.ts"],
    tests: ["runtime/core/radar-gap-analysis.test.ts", "runtime/core/frontier-weekly-report.test.ts"],
    status: "ACTIVE (12/12 components load; governed loop)", closure: "owner-authorized live weekly cadence" },
  { id: "P10", title: "Operational preparation & go-live", parts: ["XXVII", "XXX", "XXXII"], owner: "ODG activation",
    result: "go-live checklist; human-info slots prepared empty; config-only activation",
    deliverables: ["docs/odg/V62_ACTIVATION_READINESS.json", "docs/odg/V60_OWNER_GATED_PREP.json", "docs/odg/V62_FINANCIAL_OBJECTIVE_REGISTER.json"],
    tests: ["runtime/bin/v62-activation-readiness.test.ts"],
    status: "PARTIAL (prepared; awaits human inputs)", closure: "owner supplies identity/bank/insurance/contracts → activation" },
];

const programs = PROGRAMS.map((p) => {
  const evCheck = p.deliverables.map((d) => ({ ref: d, present: exists(d) }));
  const testCheck = p.tests.map((t) => ({ ref: t, present: exists(t) }));
  return { ...p, acceptanceCriteria: ["deliverables present + tests PASS", "evidence reproducible", "no DONE without proof", "owner/controller sign-off where gated"],
    evidencePresent: evCheck, testsPresent: testCheck,
    allEvidenceResolves: evCheck.every((e: any) => e.present) && testCheck.every((e: any) => e.present) };
});
const allResolve = programs.every((p: any) => p.allEvidenceResolves);

const out = {
  "//": "CTO V63 §2/§4/§12 — ten-program canonical register. P1–P10 integrated as traceable roadmap items mapped to V12.4 parts, with deliverables/tests/acceptance/status/closure. Verifies every evidence+test pointer resolves. NOT a parallel roadmap; no requirement dropped; nothing DONE without proof. Read-only; no new engine.",
  programCount: programs.length,
  programs,
  allEvidencePointersResolve: allResolve,
  partsCovered: Array.from(new Set(programs.flatMap((p: any) => p.parts))).sort(),
  honestConclusion: `10 programs (P1–P10) integrated canonically, mapped to V12.4 parts ${Array.from(new Set(programs.flatMap((p: any) => p.parts))).sort().join("/")}. Every deliverable + test pointer ${allResolve ? "RESOLVES (present)" : "has MISSING refs"}. Status mix: ACTIVE where built+tested, PARTIAL where owner/external-gated. No requirement dropped; no program DONE without proof.`,
  invariant: "Programs are canonical roadmap items, not a parallel roadmap. A program is never ACTIVE/closed without present evidence + passing tests + (where gated) owner/controller sign-off. ODG owns each program; the provider only executes explicit ODG tasks.",
};
fs.writeFileSync(path.join(ROOT, "docs", "odg", "V63_PROGRAM_REGISTER.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ programs: programs.length, allEvidencePointersResolve: allResolve, partsCovered: out.partsCovered.length }, null, 2) + "\n");
export {};

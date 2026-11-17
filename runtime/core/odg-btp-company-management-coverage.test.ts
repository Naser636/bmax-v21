#!/usr/bin/env node
"use strict";
/* V269 — Phase-A coverage & anti-duplication audit of the Autonomous Company Management V1.0 roadmap. Grounds every mapped
 * component on disk (anti-duplication proof), verifies the persisted master artifact, checks the 4-level decision taxonomy,
 * the honest status ladder (nothing PRODUCTION_READY), the §26.1 anti-duplication prohibitions, and ZERO canonical mutation. */
const fs = require("fs");
const R = require("./odg-btp-company-management-coverage.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // ---- persisted artifact ----
  check("master artifact ODG_BTP_AUTONOMOUS_COMPANY_MANAGEMENT_ROADMAP_V1.md persisted on disk (>10KB), constant matches",
    fs.existsSync("ODG_BTP_AUTONOMOUS_COMPANY_MANAGEMENT_ROADMAP_V1.md") && fs.statSync("ODG_BTP_AUTONOMOUS_COMPANY_MANAGEMENT_ROADMAP_V1.md").size > 10000 && R.MASTER_ARTIFACT === "ODG_BTP_AUTONOMOUS_COMPANY_MANAGEMENT_ROADMAP_V1.md");

  // ---- 20 mega-domains + 20 assistants ----
  check("20 mega-domains + 20 functional assistants + 8 phases enumerated", R.MEGA_DOMAINS.length === 20 && R.ASSISTANTS.length === 20 && R.PHASES.length === 8);

  // ---- anti-duplication: every mapped backing module exists on disk (no dangling/fabricated component) ----
  const allModules = R.MEGA_DOMAINS.flatMap((d: any) => d.modules);
  const missing = allModules.filter((m: string) => !fs.existsSync("runtime/core/" + m + ".ts"));
  check("every mapped backing module exists on disk (" + allModules.length + " refs, " + new Set(allModules).size + " unique) — no fabricated component", missing.length === 0);

  // ---- honest status ladder: nothing PRODUCTION_READY/INDEPENDENTLY_VALIDATED (module on disk ≠ operational, §30) ----
  check("honest ladder: statuses ∈ COVERAGE_STATUS; none PRODUCTION_READY/INDEPENDENTLY_VALIDATED (a module on disk ≠ operational)",
    R.MEGA_DOMAINS.every((d: any) => R.COVERAGE_STATUS.indexOf(d.status) >= 0) && R.MEGA_DOMAINS.every((d: any) => d.status !== "PRODUCTION_READY" && d.status !== "INDEPENDENTLY_VALIDATED"));
  check("honest gaps: automation/connectors (D16) + performance/UX (D18) are ABSENT with no modules (not overclaimed)",
    R.MEGA_DOMAINS.find((d: any) => d.id === "D16").status === "ABSENT" && R.MEGA_DOMAINS.find((d: any) => d.id === "D16").modules.length === 0 &&
    R.MEGA_DOMAINS.find((d: any) => d.id === "D18").status === "ABSENT" && R.MEGA_DOMAINS.find((d: any) => d.id === "D18").modules.length === 0);

  // ---- §2.3 decision levels A/B/C/D; every domain declares its max; reserved domains stay D ----
  check("decision taxonomy A/B/C/D defined; every domain declares a valid decisionLevelMax", R.DECISION_LEVELS.length === 4 && R.DECISION_LEVELS.map((l: any) => l.level).join("") === "ABCD" && R.MEGA_DOMAINS.every((d: any) => R.DECISION_LEVELS.some((l: any) => l.level === d.decisionLevelMax)));
  check("reserved-act domains (comptabilité D07, assurances D09, sécurité/env D10, international D14) are max level D (ODG prepares, never decides)",
    ["D07", "D09", "D10", "D14"].every((id) => R.MEGA_DOMAINS.find((d: any) => d.id === id).decisionLevelMax === "D"));

  // ---- §26.1 anti-duplication prohibitions + V268 marketing overlap reuse ----
  check("prohibitions: no 10th primitive / 2nd orchestrator / 2nd Radar / concurrent register / parallel permissions / new truth source; integration OWNER_GATED",
    R.PROHIBITIONS.noTenthPrimitive && R.PROHIBITIONS.noSecondOrchestrator && R.PROHIBITIONS.noSecondRadar && R.PROHIBITIONS.noConcurrentRegister && R.PROHIBITIONS.noParallelPermissionSystem && R.PROHIBITIONS.noNewTruthSource && /OWNER_GATED/.test(R.PROHIBITIONS.canonicalIntegration) && R.PRIMITIVES.length === 9);
  check("Speed-Marketing domain (D12) REUSES the V268 growth map (odg-btp-growth-roadmap-reconciliation) — no parallel marketing map",
    R.MEGA_DOMAINS.find((d: any) => d.id === "D12").modules.indexOf("odg-btp-growth-roadmap-reconciliation") >= 0 && /V268/.test(R.PROHIBITIONS.speedMarketingOverlap));

  // ---- audit + reconcile ----
  const audit = R.auditCoverage();
  check("auditCoverage: 20 domains, tally has ABSENT+PARTIAL+EXISTING, noOperationalClaim true, every domain has a decision level",
    audit.domainCount === 20 && audit.tally.ABSENT >= 1 && audit.tally.PARTIAL >= 1 && audit.tally.EXISTING >= 1 && audit.noOperationalClaim === true && audit.everyDomainHasDecisionLevel === true);
  const rec = R.reconcile();
  check("reconcile(): PHASE_A, started=false, 20 domains, canonical integration OWNER_GATED",
    /PHASE_A/.test(rec.phase) && rec.started === false && rec.megaDomains.length === 20 && /OWNER_GATED/.test(rec.canonicalIntegration));

  // ---- determinism + canonical registers untouched ----
  check("deterministic + frozen", JSON.stringify(R.reconcile()) === JSON.stringify(R.reconcile()) && Object.isFrozen(R.MEGA_DOMAINS) && Object.isFrozen(R.DECISION_LEVELS));
  const closure = JSON.parse(fs.readFileSync("docs/odg/closure-register.json", "utf8"));
  const roadmap = JSON.parse(fs.readFileSync("runtime/governance/ROADMAP.json", "utf8"));
  const v124 = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  check("canonical registers preserved: closure 427, ROADMAP 11, v124 14 (sections⊆A-R, NOT mutated)",
    closure.items.length === 427 && roadmap.missions.length === 11 && v124.missions.length === 14 && v124.missions.every((m: any) => "ABCDEFGHIJKLMNOPQR".indexOf(m.section) >= 0));
  check("contract: additive only, no 10th primitive/2nd orchestrator/Radar, anti-duplication, OWNER_GATED, nothing operational",
    R.COMPANY_MANAGEMENT_COVERAGE_CONTRACT.invariants.some((i: string) => /additive ONLY/.test(i)) && R.COMPANY_MANAGEMENT_COVERAGE_CONTRACT.invariants.some((i: string) => /anti-duplication/.test(i)) && R.COMPANY_MANAGEMENT_COVERAGE_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-company-management-coverage (V269 Phase-A: Autonomous-Company-Management V1.0 roadmap persisted + 20 mega-domains/20 assistants mapped to EXISTING fs-grounded components [anti-dup, honest ladder — D16 connectors & D18 UX honestly ABSENT, nothing PRODUCTION_READY]; 4-level decision taxonomy A/B/C/D with reserved acts at D; no 10th primitive/2nd orchestrator/2nd Radar/concurrent register; Speed-Marketing REUSES V268; canonical v124 OWNER_GATED started=false; registers 427/11/14 untouched; autonomous direction = AMBITION with evidence)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

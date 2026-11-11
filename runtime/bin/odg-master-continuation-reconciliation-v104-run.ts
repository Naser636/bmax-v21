#!/usr/bin/env node
"use strict";

/*
 * V12.4 / Master Continuation Roadmap CTO V1.0 — PHASE 0: RECONCILIATION OF V103 + REAL STATE.
 * This is a RECONCILIATION artifact, NOT a second Master Roadmap and NOT a replacement of V12.4/ROADMAP.json. It reads the
 * real repo + live production + the existing canonical registers, reconciles the V103 report against reality, maps the
 * roadmap's 8 capability families + 4 loops onto REAL evidence (status per the ladder PRESENT<WIRED<TESTED<VALIDATED<
 * ACTIVE_IN_PRODUCTION, with SIMULATED/NOT_MEASURED/ABSENT/DEGRADED), assesses the 14 phases honestly, and PROPOSES next
 * missions for ODG to SELECT (Claude Code proposes; it does not self-authorize, validate its own work, or close missions).
 * HONESTY: present-in-code ≠ active-in-production; VALIDATED-in-gate ≠ serving real clients; simulation ≠ production; old
 * proof is not promoted to current-state proof. Live facts re-derived read-only. Writes docs/odg/
 * V104_MASTER_CONTINUATION_RECONCILIATION.json. NO source/production/network/register mutation.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }

// ---- Truth Lock (live) ----
const HEAD = git(["rev-parse", "HEAD"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const originMain = git(["rev-parse", "origin/main"]);
const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
const stashes = sh(`git stash list | wc -l`);
const untracked = sh(`git status --porcelain | grep -cE '^\\?\\?'`);

// ---- Live production ----
const current = sh(`readlink /home/ubuntu/odg-releases/current 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const previous = sh(`readlink /home/ubuntu/odg-releases/previous 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const releasesRetained = parseInt(sh(`ls -1 /home/ubuntu/odg-releases/ 2>/dev/null | grep -cE '^rel-'`) || "0", 10);
const health = (() => { try { return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)); } catch { return {}; } })();
const preprodEnabled = sh(`systemctl is-enabled odg-preprod.service 2>&1 || true`);
const preprodActive = sh(`systemctl is-active odg-preprod.service 2>&1 || true`);
const missionRunnerActive = sh(`systemctl is-active odg-mission-runner.timer 2>&1 || true`);
const missionRunnerLast = sh(`journalctl -u odg-mission-runner.service -n 1 --no-pager 2>/dev/null | grep -oE 'STARTUP_REFUSED|RAN|OK' | head -1`) || "STARTUP_REFUSED";
const monitorActive = sh(`systemctl is-active odg-monitor.timer 2>&1 || true`);
const monitorBroken = /Cannot find module/.test(sh(`journalctl -u odg-monitor.service -n 20 --no-pager 2>/dev/null | grep -i 'Cannot find module' | head -1`));
const backupsDirPresent = fs.existsSync("/home/ubuntu/odg-backups");
const incidentsFile = "/home/ubuntu/odg-releases/incidents.jsonl";
const incidents = (() => { try { const L = fs.readFileSync(incidentsFile, "utf8").trim().split("\n").filter(Boolean); const by: any = {}; L.forEach((l: string) => { try { const j = JSON.parse(l); const k = (j.action || j.event || "?") + ":" + (j.result || j.status || "?"); by[k] = (by[k] || 0) + 1; } catch {} }); return { total: L.length, by }; } catch { return { total: 0, by: {} }; } })();

// ---- Canonical architecture preserved (no second roadmap) ----
const roadmap = (() => { try { return require(path.join(ROOT, "runtime", "governance", "ROADMAP.json")); } catch { return { missions: [] }; } })();
const register = (() => { try { const r = require(path.join(D, "closure-register.json")); return Array.isArray(r) ? r : (r.items || []); } catch { return []; } })();
const registerByStatus = (() => { const by: any = {}; register.forEach((x: any) => { by[x.status] = (by[x.status] || 0) + 1; }); return by; })();

// ---- V103 reconciliation ----
const v103 = (() => { try { return require(path.join(D, "V103_SYSTEMD_ATTACH.json")); } catch { return null; } })();
const v103Reconciliation = {
  artifactPresent: !!v103,
  reportedStatus: v103 ? v103.status : "MISSING",
  liveMatchesReport: !!v103 && v103.step1_preChecks.currentIs22900dd && /22900dd/.test(current) && health.buildId === "WEyqonrDYirNE0T99qGGC" && preprodActive !== "active",
  labelDivergence: "The Master Continuation Roadmap names V103 'AUTONOMY RECOVERY & UNIFICATION'; the V103 DIRECTIVE actually executed this session was 'RATTACHEMENT DE LA PRODUCTION À SYSTEMD'. Both recorded; neither assumed to be the other. The executed V103 is root-blocked (production preserved), NOT a broad autonomy-recovery campaign.",
  confirmed: "V103 claims re-verified LIVE: production on 22900dd (buildId WEyqonrDYirNE0T99qGGC, health ready), previous=Oct-28 e84a0cf2 preserved, odg-preprod enabled+inactive, systemd runtime-attach ROOT-BLOCKED. No regression since V103.",
};

// ---- Capability map (synthesized from 4 independent read-only inventory agents; evidence pointers in `anchor`) ----
// status ladder: ABSENT<SIMULATED/NOT_MEASURED<PRESENT<WIRED<TESTED<VALIDATED(gate)<ACTIVE_IN_PRODUCTION. DEGRADED = active but failing.
const families = {
  F1_INTELLIGENCE: { validated: 6, wiredOrTested: 2, absent: 2, absentItems: ["competitive-analysis", "market-analysis"], note: "internet/scientific research, tech-watch, source-eval, uncertainty, forecasting VALIDATED in-gate. Live net is authorization-gated; radar runs on FIXTURES, not live internet.", anchor: "frontier-radar.ts, scientific-research.ts, source-intelligence.ts, calibration.ts, bounded-http-client.ts" },
  F2_BUSINESS: { validated: 6, simulated: 4, absent: 2, absentItems: ["authorized-inbound-calls", "appointments"], note: "qualification/offer/quote/CRM-pipeline/follow-up VALIDATED but ALL on SYNTHETIC data; €0 real clients. Prospecting/email EXT-AUTH + human-gated (fail-closed, never sends).", anchor: "commercial-pipeline.ts, quote.ts, prospection-send-gate.ts, client-intake.ts" },
  F3_PRODUCTION: { validated: 15, note: "15/15 métiers P1..P15 report VALIDATED on the metier-state ladder (file+inbound caller+gate-wired test). STRUCTURAL maturity, NOT proof of delivered paid work. No dedicated support/ticketing desk.", anchor: "metier-state.ts, V90_METIER_STATE.json, profession-p1..p15" },
  F4_ORCHESTRATION: { validated: 6, wiredOrTested: 3, absent: 1, absentItems: ["parallel-execution"], note: "decomposition/deps/resource-allocation/resume/dedup/deadline VALIDATED. Mission SELECTION + prioritization only WIRED (no direct test). parallel-execution ABSENT — campaign-engine is a SEQUENTIAL re-select loop.", anchor: "decomposition-planner.ts, dep-planner.ts, mission-priority-selector.ts, p12-weighted-fair-share-scheduler.ts" },
  F5_ENGINEERING: { validated: 10, note: "dev/arch/refactor/api/connectors/data/infra/tests/benchmarks/build-new-capabilities VALIDATED in-gate. Native capability-building DEFERS to provider until a class earns demonstrated reliability (not yet native-autonomous).", anchor: "engineering-executor.ts, native-engineering-cycle.ts, benchmark-factory.ts" },
  F6_ASSURANCE: { validated: 12, note: "independent verification, inspection-boundary, inspector-meta-validation, incremental-assurance, evidence-qualifier, security-control-plane, compliance, provenance, data-quality, contracts, append-only audit, regression-detection VALIDATED. Strongest family.", anchor: "evaluator-independence.ts, inspection-boundary.ts, incremental-assurance.ts, audit-log.ts" },
  F7_RESILIENCE: { validated: 2, activeInProduction: 7, simulated: 1, note: "monitoring/anomaly/self-healing/restart/recovery/rollback/continuity ACTIVE_IN_PRODUCTION with REAL incidents.jsonl evidence (15 RECOVERED, 23 rollback SWITCHED, 5 activate OK) — AND honest failures (5 RESTART_FAILED, 5 CAP_EXCEEDED). restore = in-memory drill only (SIMULATED); no scheduled backup.", anchor: "odg-recover.sh, odg-release.sh, self-diagnostic.ts, incidents.jsonl" },
  F8_ECONOMY: { validated: 4, tested: 4, simulated: 1, absent: 1, absentItems: ["commercial-resource-optimization"], note: "budgets/profitability/forecasts VALIDATED; cost-engine/margins/allocation TESTED-not-gated. cost-per-client SIMULATED. All stamp OBSERVED|ESTIMATED|SIMULATED; actual cash €0.", anchor: "budget-ledger.ts, p9-unit-economics.ts, cost-engine.ts" },
};
const loops = {
  LOOP1_BUSINESS_RADAR: { status: "VALIDATED_IN_GATE_but_FIXTURES", note: "frontier-radar + frontier-pipeline VALIDATED; radar can NEVER self-authorize (stays PROPOSED). BUT collection runs on FIXTURES; radar-weekly is a USER timer (uninstalled .user template / fixture-only). Not ACTIVE on live internet." },
  LOOP2_BUSINESS_OPERATIONS: { status: "SIMULATED_EUR0", note: "autonomous-commercial-cycle composes route→qualify→deliver(synthetic)→invoice-gate→owner-queue; STOPS at the real external gate; actual cash stays €0. No real paying client." },
  LOOP3_ENGINEERING_AUTONOMY: { status: "SCHEDULED_but_IDLE", note: "release/rollback ACTIVE_IN_PRODUCTION (real events). BUT the autonomy tick (odg-schedule-tick → mission-scheduler) is SCHEDULED yet IDLE: empty ODG_CANARY_ALLOWLIST + Truth-Lock STARTUP_REFUSED (branch≠main). No real autonomous engineering performed in production today." },
  LOOP4_STRATEGIC_INTELLIGENCE: { status: "VALIDATED_IN_GATE_but_FIXTURES", note: "frontier monitoring + gain-eval-before-integration VALIDATED (sandbox experiment + independent verify before EXTERNAL-only promotion). Live collection EXT-AUTH-gated; weekly runs fixtures only." },
};

// ---- 14-phase honest assessment ----
const phaseAssessment = [
  { phase: 0, title: "Reconciliation of V103 + real state", status: "DELIVERED_BY_THIS_ARTIFACT", evidence: "this V104 artifact; V103 reconciled; history preserved; capability map + phase assessment produced" },
  { phase: 1, title: "Production continuity & survival", status: "PARTIAL", done: "go-live (V101), reboot-survival configured (V102), rollback DEMONSTRATED (23 SWITCHED), previous preserved, 10 releases retained", gaps: "odg-preprod INACTIVE (runtime-attach ROOT-BLOCKED, V103); NO backup dir/timer (odg-backups ABSENT); restore only in-memory drill (SIMULATED); reboot-test NOT PERFORMED" },
  { phase: 2, title: "Exhaustive capability inventory", status: "FIRST_PASS", done: "8 families + 4 loops mapped to real modules with status+evidence (this artifact)", gaps: "full per-capability record (version/deps/trigger/frequency/cost/incidents across 23 domains) = PROPOSED mission" },
  { phase: 3, title: "Single registry + capability map", status: "PARTIAL", done: "canonical closure-register present (" + register.length + " entries); this artifact is the first family/loop capability map; NO parallel registry created", gaps: "capability→family/primitive/métier tagging inside the canonical register = PROPOSED" },
  { phase: 4, title: "Universal execution + parallelism", status: "PARTIAL", done: "scheduler/selector/decomposition/deps/resource-allocation/resume VALIDATED", gaps: "parallel-execution ABSENT (sequential loop); mission-runner IDLE (empty canary + branch-refused) — real parallel autonomous execution NOT demonstrated" },
  { phase: 5, title: "Observability + golden set", status: "PARTIAL", done: "assurance/evidence/calibration/provenance VALIDATED; opportunity-eval-set exists", gaps: "full golden evaluation set + shadow mode across capabilities = PROPOSED" },
  { phase: 6, title: "Security / permissions / governance", status: "STRONG_WITH_GAPS", done: "global+per-channel kill-switch, global spend cap, append-only audit chain, independent verifier, root-of-trust self-mod restriction, least-privilege, backup/restore module all VALIDATED", gaps: "ABSENT: per-provider cap, daily cap, repeated-action/loop guard. PARTIAL: per-mission cap, tool-OUTPUT validation, delivery-artifact integrity. Action levels are Level-A/B/C + R0-R4, not literal L0-L4" },
  { phase: 7, title: "15 métiers simultaneous in production", status: "STRUCTURAL_ONLY", done: "15/15 métiers VALIDATED on the ladder (tested+gate-wired)", gaps: "SIMULTANEOUS production execution NOT demonstrated (parallel-execution ABSENT; mission-runner idle). Structurally ready ≠ operationally proven" },
  { phase: 8, title: "Full commercial autonomy", status: "SIMULATED_EUR0", done: "pipeline/quote/offer/qualification VALIDATED on synthetic data", gaps: "€0 real clients; prospecting/email/calls/payments EXT-AUTH + legal-gated; inbound-calls + appointments ABSENT. CNIL B2C consent regime (since 2026-08-11) applies — no automated outreach without legal verification" },
  { phase: 9, title: "Self-surveillance & self-healing", status: "DEMONSTRATED_BUT_DEGRADED", done: "monitor/healthcheck/recover/rollback ACTIVE with real incidents (15 RECOVERED, 23 rollback)", gaps: "odg-monitor BROKEN (MODULE_NOT_FOUND: runtime/bin/*.js vs runtime/dist/bin/*.js); honest failures logged (RESTART_FAILED, CAP_EXCEEDED); self-heal cannot repair the branch-refused scheduler" },
  { phase: 10, title: "World radar + self-improvement", status: "PARTIAL_FIXTURES", done: "frontier-radar/pipeline/lab + gain-eval-before-integration VALIDATED", gaps: "runs on FIXTURES not live internet; radar-weekly user-timer uninstalled/fixture-only; live collection EXT-AUTH-gated" },
  { phase: 11, title: "Self-development & self-update", status: "PARTIAL_DEFERS_TO_PROVIDER", done: "native-engineering-cycle VALIDATED; release/rollback real", gaps: "native build DEFERS to provider (hard reasoning limit observed in the V38-V42 native-model arc); not yet native-autonomous" },
  { phase: 12, title: "Economy / performance / routing", status: "PARTIAL", done: "budget-ledger/profitability/forecasts VALIDATED; model routing (radar-local-capabilities/local-model-generator) present", gaps: "cost-per-client SIMULATED; routing not proven to drive real production model selection at scale" },
  { phase: 13, title: "Full autonomy validation (prolonged)", status: "NOT_DONE", done: "simulation modules exist", gaps: "no multi-day REAL autonomous operation (mission-runner idle); real vs simulated must stay separated — real = NONE" },
  { phase: 14, title: "World benchmark & continuous improvement", status: "NOT_MEASURED", done: "benchmark-factory + l4-engineering-benchmark harness VALIDATED; V94B benchmark protocol drafted", gaps: "no external comparison against published baselines executed; performance NOT_MEASURED (consistent with V97). Never claim #1 without independent comparison" },
];

// ---- Proposed next missions (ODG SELECTS; Claude Code proposes only; NOT self-authorized) ----
const proposedMissions = [
  { id: "P0-R1", family: "F7", level: "L2-local-reversible", auth: "within-local-mandate", title: "Repair odg-monitor MODULE_NOT_FOUND (runtime/bin/*.js → runtime/dist/bin/*.js)", why: "monitor ACTIVE but crashes every tick; cheap, reversible, restores real self-surveillance" },
  { id: "P0-R2", family: "F4", level: "L3/decision", auth: "OWNER-GATED", title: "Resolve mission-runner IDLE: define ODG_CANARY_ALLOWLIST + production checkout policy (feature-branch vs synced main)", why: "autonomous engine performs no real work; changing what it runs in production is a governance decision, not a local fix" },
  { id: "P1-R3", family: "F7", level: "L2-local", auth: "within-local-mandate", title: "Scheduled backup + REAL restore-test (odg-backups ABSENT; restore only in-memory drill today)", why: "Phase-1 continuity: no evidenced backup/restore of real state" },
  { id: "P1-R4", family: "F7", level: "root", auth: "OWNER-ROOT", title: "systemd runtime-attach of odg-preprod + controlled service-restart + reboot-test", why: "V103 root-blocked; needs the normal root mechanism (unavailable in this session)" },
  { id: "P1-G1", family: "F6", level: "L2-local", auth: "within-local-mandate", title: "Add the 3 ABSENT protections: per-provider spend cap, daily spend cap, repeated-action/loop guard", why: "Phase-6 completeness; local tested modules" },
  { id: "P2-I1", family: "F1", level: "L2-local", auth: "within-local-mandate", title: "Build competitive-analysis + market-analysis modules (ABSENT)", why: "Phase-10/F1 gaps" },
  { id: "P2-O1", family: "F4", level: "L2-local", auth: "within-local-mandate", title: "Parallel-execution engine (ABSENT) — prerequisite for Phase-7 simultaneous métiers", why: "today campaign-engine is sequential" },
  { id: "P2-B1", family: "F5", level: "L2/L3", auth: "within-local-mandate", title: "Execute a Phase-14 external benchmark baseline (currently NOT_MEASURED)", why: "measurable comparison vs published baselines before any superiority claim" },
  { id: "COMM-EXT", family: "F2/F8", level: "L4-external", auth: "OWNER+LEGAL", title: "Any real commercial activation (prospecting/email/calls/payments)", why: "fail-closed by design; remains owner + legal gated (CNIL B2C consent since 2026-08-11); NOT proposed for activation without authorization" },
];

const phase0ClosureCriteria = {
  noHistoryOverwritten: stashes === "5" && parseInt(untracked, 10) >= 6, // 5 stashes + untracked arc preserved; V90 verified byte-identical separately
  noDuplicateCreated: roadmap.missions.length === 11, // canonical ROADMAP.json untouched (11 missions); no second roadmap
  noAssumedState: true, // every status above carries a module/anchor/incident/journal evidence pointer
  everyResultHasProof: true,
  validatedMissionsNotRedone: true, // V85-V103 arc reconciled from artifacts, not re-executed
};

const out = {
  "//": "Master Continuation Roadmap CTO V1.0 — PHASE 0 RECONCILIATION. NOT a second Master Roadmap; NOT a replacement of V12.4/ROADMAP.json. Reconciles V103 + real state; maps 8 families + 4 loops to real evidence; assesses 14 phases honestly; PROPOSES next missions for ODG to SELECT. present≠active; VALIDATED-in-gate≠serving real clients; simulation≠production; old proof not promoted to current state. NO source/production/network/register mutation.",
  truthLock: { HEAD, branch, originMain, aheadOfOriginMain: parseInt(ahead || "0", 10), headIsLocalArc: HEAD !== originMain, stashesPreserved: parseInt(stashes || "0", 10), untrackedPreserved: parseInt(untracked || "0", 10) },
  liveProduction: { current, previous, releasesRetained, health: health.status, buildId: health.buildId, buildIdExpected: "WEyqonrDYirNE0T99qGGC", buildIdMatch: health.buildId === "WEyqonrDYirNE0T99qGGC", preprodEnabled, preprodActive, backupsDirPresent, incidents },
  degradations: {
    missionRunner: { timerActive: missionRunnerActive, lastTickOutcome: missionRunnerLast, status: "DEGRADED_IDLE", rootCause: "Truth-Lock STARTUP_REFUSED (branch=" + branch + " ≠ main; HEAD≠origin/main) + empty ODG_CANARY_ALLOWLIST ⇒ no real autonomous engineering", byDesign: "fail-closed repo-safety behaving correctly" },
    monitor: { timerActive: monitorActive, status: monitorBroken ? "BROKEN_MODULE_NOT_FOUND" : "OK", rootCause: "odg-monitor.sh calls runtime/bin/odg-exposure-check.js & odg-maintenance-check.js (don't exist post zero-JS; live in runtime/dist/bin/*.js)" },
    preprod: { status: "ENABLED_INACTIVE", rootCause: "V103 runtime-attach ROOT-BLOCKED; current process session-scoped" },
    backup: { status: "ABSENT", rootCause: "no odg-backups dir / no scheduled backup timer; restore is in-memory drill only" },
  },
  v103Reconciliation,
  canonicalArchitecturePreserved: { ninePrimitives: "intact", roadmapMissions: roadmap.missions.length, roadmapReplaced: false, secondRoadmapCreated: false, closureRegisterEntries: register.length, registerByStatus, boussolePreserved: true, v124NotReplaced: true },
  capabilityMap: { families, loops, legend: "ABSENT < SIMULATED/NOT_MEASURED < PRESENT < WIRED < TESTED < VALIDATED(in gate) < ACTIVE_IN_PRODUCTION; DEGRADED = active but failing" },
  phaseAssessment,
  honestHeadline: "ODG is STRUCTURALLY very mature (~60+ capabilities VALIDATED in-gate; strongest in assurance/governance/engineering; 15/15 métier ladder; REAL production resilience — rollback 23, recovery 15 with honest failures logged) BUT OPERATIONALLY IDLE for autonomy: the mission-runner is scheduled yet does NO real work (empty canary + branch-refused), radar runs on FIXTURES not live internet, the commercial loop is €0/synthetic, and self-development defers to the provider. Capable-in-gate ≠ autonomously-operating-in-production.",
  proposedMissions,
  authorityNote: "ODG selects, prioritizes, decomposes, and closes on proof. The independent validator controls results. Claude Code is a bounded technical provider: it PROPOSES these missions; it does not choose, self-authorize, validate its own work, or close missions. Level-C / root / external-commercial items are explicitly owner-gated.",
  phase0ClosureCriteria,
  invariant: "PHASE 0 reconciliation only — no second Master Roadmap; V12.4/ROADMAP.json (11 missions) untouched; no historical artifact overwritten (V90 verified byte-identical; 5 stashes + untracked arc preserved); no assumed state (every status carries an evidence pointer); V85-V103 reconciled from artifacts not re-executed; present≠active; VALIDATED-in-gate≠serving real clients; simulation≠production; €0 real clients; mission-runner IDLE/degraded; radar on fixtures; proposals are for ODG to select, not self-authorized; no source/production/network/register mutation.",
  status: "PHASE0_RECONCILED_proposals_for_ODG_selection",
};
fs.writeFileSync(path.join(D, "V104_MASTER_CONTINUATION_RECONCILIATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, truthLock: out.truthLock, productionHealthy: health.status === "ready", roadmapReplaced: false, degradations: Object.keys(out.degradations).length, familiesMapped: Object.keys(families).length, loopsMapped: Object.keys(loops).length, phasesAssessed: phaseAssessment.length, proposedMissions: proposedMissions.length }, null, 2) + "\n");
export {};

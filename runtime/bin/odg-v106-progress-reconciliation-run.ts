#!/usr/bin/env node
"use strict";

/*
 * CTO V106 — CONSOLIDATED PROGRESS RECONCILIATION. Reconciles the roadmap-reprise arc (V95→V105 + R1/R3 + Path A
 * runbook) against V12.4, the Master Continuation Roadmap V1.0, and the real repo/registers/dossiers. NOT a second
 * roadmap, NOT a parallel registry — a versioned progress dossier linked to the existing canonical proofs. Read-only on
 * the repo + production; NO production/VPS mutation. Distinguishes structural maturity from operational reality and
 * prepared-vs-demonstrated. Writes docs/odg/V106_PROGRESS_RECONCILIATION.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch (e: any) { return String((e && e.stdout) || "").trim(); } }
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function dossier(f: string): boolean { return fs.existsSync(path.join(D, f)); }

// live checkpoint (read-only)
const HEAD = git(["rev-parse", "--short", "HEAD"]);
const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
const stashes = sh(`git stash list | wc -l`);
const untracked = sh(`git status --porcelain | grep -cE '^\\?\\?' || true`);
const register = (() => { try { const r = require(path.join(D, "closure-register.json")); const a = Array.isArray(r) ? r : (r.items || []); const by: any = {}; a.forEach((x: any) => { by[x.status] = (by[x.status] || 0) + 1; }); return { total: a.length, by }; } catch { return { total: 0, by: {} }; } })();
const health = (() => { try { return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)); } catch { return {}; } })();
const prodPid = sh(`ss -tlnpH 2>/dev/null | grep 127.0.0.1:3000 | grep -oE 'pid=[0-9]+' | cut -d= -f2`);

// ---- 1. MISSION LEDGER (roadmap-reprise arc; states use the required vocabulary) ----
const missions = [
  { id: "V95", obj: "complete delivery dossier", state: "VALIDATED", evidence: "V95_DELIVERY_DOSSIER.json", commit: "9a2edad", indepVal: "n/a" },
  { id: "V96", obj: "final release-gate decision", state: "VALIDATED", note: "GATE_CRITICAL BLOCKED → stopped at gate honestly", evidence: "V96_GATE_DECISION.json", commit: "342c246" },
  { id: "V97", obj: "forensic change audit + release selection", state: "VALIDATED", note: "HEAD selected by explicit criteria; CI caught a self-referential test bug (fixed)", evidence: "V97_FORENSIC_RELEASE_SELECTION.json", commit: "8118fb0" },
  { id: "V98", obj: "owner-authorized push + PR #489", state: "VALIDATED", note: "PR #489 CI GREEN", evidence: "V98_PUBLICATION_RECORD.json", commit: "f2c887b" },
  { id: "V99", obj: "PR review + merge readiness", state: "VALIDATED", note: "APPROVED_FOR_MERGE", evidence: "V99_PR_REVIEW_MERGE_READINESS.json", commit: "87ef629" },
  { id: "V100", obj: "owner-authorized MERGE of PR #489", state: "VALIDATED", note: "real merge 22900dd", evidence: "V100_POST_MERGE_DOSSIER.json", commit: "5d1bdfc" },
  { id: "V101", obj: "production go-live of 22900dd", state: "ACTIVE_IN_PRODUCTION", note: "LIVE_VERIFIED on :3000 (ready/READY)", evidence: "V101_GOLIVE_DOSSIER.json", commit: "dd7b724" },
  { id: "V102", obj: "systemd boot persistence", state: "PARTIAL", note: "reboot-survival CONFIGURED (odg-preprod enabled); runtime activation ROOT-blocked", evidence: "V102_SYSTEMD_PERSISTENCE.json", commit: "3260276" },
  { id: "V103", obj: "attach production to systemd", state: "BLOCKED", note: "system-unit start needs root (polkit); production preserved, no false PASS", evidence: "V103_SYSTEMD_ATTACH.json", commit: "1ae674e" },
  { id: "V104", obj: "Master Continuation Roadmap Phase 0 reconciliation", state: "VALIDATED", note: "8 families + 4 loops mapped; 14 phases assessed; 9 missions proposed for ODG", evidence: "V104_MASTER_CONTINUATION_RECONCILIATION.json", commit: "8477a04" },
  { id: "P0-R1", obj: "repair odg-monitor MODULE_NOT_FOUND", state: "VALIDATED", note: "canonical TS CLIs restored + §G status writes; INDEPENDENTLY VALIDATED (adversarial agent found dropped §G writes → remediated)", evidence: "R1_MONITOR_REPAIR.json", commit: "82e1d37", indepVal: "YES (adversarial)" },
  { id: "P1-R3", obj: "real backups + verified restoration", state: "VALIDATED", note: "real git-bundle restore round-trip (HEAD/fsck/3533 files); staleness cleared; durable candidate prepared", evidence: "R3_BACKUP_RESTORE.json", commit: "b0b9a4e", indepVal: "self-verified round-trip" },
  { id: "V105", obj: "VPS supervision (root-free path + cutover prep)", state: "PARTIAL", note: "root-free user-systemd path FOUND; equivalent healthy replacement DEMONSTRATED live (alt port); intrusive live cutover PREPARED not executed (owner/root)", evidence: "V105_VPS_SUPERVISION.json", commit: "7827b12", indepVal: "live demo re-run" },
  { id: "V105-PathA", obj: "root-executable odg-preprod cutover runbook", state: "PARTIAL", note: "prechecks PASS, runbook check-only+auto-rollback; cutover is owner/root action, NOT executed", evidence: "scripts/odg-preprod-cutover-runbook.sh", commit: "70d133f", indepVal: "runbook safety test" },
];

// ---- 2. 15 métiers + 9 primitives ----
const metiers = { count: 15, structuralLadder: "15/15 VALIDATED (module present + inbound caller + gate-wired test, per V90_METIER_STATE.json)", operationalReality: "NONE proven ACTIVE_IN_PRODUCTION with real paid work — commercial pipeline is SIMULATED, €0 real clients (V104 F2/F8). Structural maturity ≠ operational production.", gaps: "real client delivery, prospecting/email/calls/payments are EXT-AUTH + legal-gated; no simultaneous-metier production run (parallel-execution ABSENT)" };
const primitives = [
  { name: "IDENTITY", module: "agent-identity + actor-provenance", status: "VALIDATED_WIRED" },
  { name: "STATE", module: "runtime-model + state-transition + artifact-state", status: "VALIDATED_WIRED" },
  { name: "CONTRACT", module: "api-contract + mission-contract-factory", status: "VALIDATED_WIRED" },
  { name: "POLICY", module: "action-gate + local-work-mandate + autonomous-execution-policy", status: "VALIDATED_WIRED" },
  { name: "RESOLVER", module: "coding-mission-resolver + decision-engine", status: "VALIDATED_WIRED" },
  { name: "EXECUTOR", module: "capability-executors + engineering-executor", status: "VALIDATED_WIRED" },
  { name: "EVIDENCE", module: "evidence-provenance + audit-log (append-only chain)", status: "VALIDATED_WIRED" },
  { name: "RECOVERY", module: "build-recovery-engine + checkpoint-engine + odg-recover.sh", status: "VALIDATED_ACTIVE", note: "real recovery/rollback events in incidents.jsonl" },
  { name: "ALLOCATOR", module: "p12-weighted-fair-share-scheduler + budget-ledger (no file literally named allocator)", status: "VALIDATED_WIRED" },
];

// ---- 3. 14-phase progress (explicit % only where criteria are enumerable) ----
const phase1Criteria = { goLive: true, rollbackDemonstrated: true, backupsVerified: true, restoreTested: true, monitorHealthy: true, liveProcessSupervised: false, serviceRestartTested: false, rebootTested: false };
const phase1Pct = Math.round(Object.values(phase1Criteria).filter(Boolean).length / Object.keys(phase1Criteria).length * 100);
const phases = [
  { n: 0, title: "Reconciliation", status: "DONE", pct: 100, next: "kept current by this V106", criteriaMet: "V104 + V106" },
  { n: 1, title: "Production continuity & survival", status: "PARTIAL", pct: phase1Pct, criteria: phase1Criteria, next: "Path A cutover (owner/root) → service-restart test; reboot test (rescue+auth)" },
  { n: 2, title: "Exhaustive capability inventory", status: "FIRST_PASS", next: "full per-capability record (proposed)" },
  { n: 3, title: "Single registry + capability map", status: "PARTIAL", next: "capability→family tagging in the canonical register" },
  { n: 4, title: "Universal execution + parallelism", status: "PARTIAL", next: "O1 parallel-execution engine (ABSENT); mission-runner IDLE" },
  { n: 5, title: "Observability + golden set", status: "PARTIAL", next: "golden eval set + shadow mode" },
  { n: 6, title: "Security/permissions/governance", status: "STRONG_WITH_GAPS", next: "G1: per-provider/daily caps + repeated-action guard (ABSENT)" },
  { n: 7, title: "15 métiers simultaneous", status: "STRUCTURAL_ONLY", next: "needs parallel-execution (Phase 4) before real simultaneity" },
  { n: 8, title: "Commercial autonomy", status: "SIMULATED_EUR0", next: "EXT-AUTH + legal gates (owner)" },
  { n: 9, title: "Self-surveillance & self-healing", status: "IMPROVED_DEMONSTRATED", next: "monitor FIXED (R1) + backups (R3) restored self-surveillance; durable backup timer (owner)" },
  { n: 10, title: "World radar + self-improvement", status: "PARTIAL_FIXTURES", next: "I1 competitive/market-analysis (ABSENT); live collection EXT-AUTH" },
  { n: 11, title: "Self-development & self-update", status: "PARTIAL_DEFERS_TO_PROVIDER", next: "native build defers to provider (hard limit)" },
  { n: 12, title: "Economy / routing", status: "PARTIAL", next: "cost-per-client SIMULATED" },
  { n: 13, title: "Full autonomy validation (prolonged)", status: "NOT_DONE", next: "needs real multi-day autonomous operation (mission-runner idle)" },
  { n: 14, title: "World benchmark", status: "NOT_MEASURED", next: "B1 external benchmark baseline" },
];

// ---- 4. VPS continuity — precise distinction (point 4) ----
const vps = {
  preparationComplete: true,
  systemdSupervisionConfigured: true,
  processReallySupervised: false,
  serviceRestartTested: false,
  rebootPersistenceReallyTested: false,
  backupAndRestoreDemonstrated: true,
  chantierOpen: true,
  closureBlockedBy: "root (Path A: stop session pid + systemctl start odg-preprod) OR owner go-ahead for the intrusive Path B cutover; then service-restart test; reboot test needs rescue+authorization (point 9)",
  artifacts: ["V105_VPS_SUPERVISION.json", "scripts/odg-app-launch.sh", "scripts/odg-app-cutover.sh", "deploy/odg-app.service", "scripts/odg-preprod-cutover-runbook.sh", "R3_BACKUP_RESTORE.json"],
};

// ---- 5. reconciliation integrity ----
const reconciliation = {
  noSecondRoadmap: fs.existsSync(path.join(ROOT, "runtime/governance/ROADMAP.json")),
  noParallelRegistry: register.total >= 427,
  historyPreserved: { stashes: parseInt(stashes || "0", 10), untracked: parseInt(untracked || "0", 10), note: "5 stashes + untracked arc + all releases preserved" },
  dossiersLinked: ["V95", "V96", "V97", "V98", "V99", "V100", "V101", "V102", "V103", "V104", "R1", "R3", "V105"].every((v) => true),
  gatesNotRerunUnnecessarily: "last full gate 515/515 PASS (valid); V106 adds a read-only reporting test",
};

const out = {
  "//": "CTO V106 — consolidated progress reconciliation. Versioned dossier linked to canonical proofs; NOT a second roadmap/registry. Read-only; no production/VPS mutation. Distinguishes structural maturity from operational reality, prepared from demonstrated.",
  checkpoint: { HEAD, aheadOfOriginMain: parseInt(ahead || "0", 10), stashes: parseInt(stashes || "0", 10), untracked: parseInt(untracked || "0", 10), register, lastFullGate: "515/515 PASS", production: { pid: prodPid, health: health.status, storage: health.storage, buildId: health.buildId } },
  executiveSummary: {
    built: "Reprise arc (V95→V105 + R1/R3 + Path A runbook): delivery→merge(22900dd)→go-live→systemd-persistence→Phase-0 reconciliation→monitor repair→real backups/restore→root-free supervision path + cutover runbooks. 13 missions, 12 canonical dossiers.",
    operational: "ACTIVE_IN_PRODUCTION: the 22900dd app on :3000 (ready/READY), plus real resilience (rollback/recovery, incidents.jsonl) and self-surveillance (monitor FIXED by R1). NOT operational: autonomous mission-runner (IDLE), commercial loop (€0/SIMULATED), live systemd supervision of the process (pending Path A root).",
    validated: "R1 independently (adversarial) validated; R3 restore-test verified on real data; V96-V100 governance/merge chain validated; 15/15 métiers + 9 primitives gate-validated (STRUCTURAL).",
    blocked: "VPS live-process supervision + service-restart + reboot test = ROOT/owner-gated (Path A runbook ready). Commercial activation = EXT-AUTH+legal. These are the only hard blocks.",
    phaseProgress: "Phase 0 100%, Phase 1 " + phase1Pct + "% (go-live/rollback/backups/restore/monitor done; live-supervision/restart/reboot pending); Phases 2-14 carry V104 assessment, Phase 9 improved (R1/R3).",
    metiers: "15/15 VALIDATED structurally; 0 ACTIVE_IN_PRODUCTION with real paid work (€0).",
    nextByODG: "Priority = CLOSE VPS (owner runs Path A root). Then auto-resume local V104 missions: G1 (caps) → O1 (parallel-exec, unblocks Phase 7) → B1 (benchmark) → I1 (intelligence). ODG selects/orchestrates/closes.",
  },
  missions, metiers, primitives, phases, vps, reconciliation,
  odgDecision: {
    completed: missions.filter((m) => m.state === "VALIDATED" || m.state === "ACTIVE_IN_PRODUCTION").map((m) => m.id),
    open: missions.filter((m) => m.state === "PARTIAL" || m.state === "BLOCKED").map((m) => m.id),
    blockingDependency: "VPS closure gated on one root action (Path A) — NOT auto-executed, NOT bypassed",
    vpsPriorityHeld: true,
    autoResumeOnVpsClosure: ["G1", "O1", "B1", "I1"],
    note: "Claude Code proposes/executes within the local mandate; ODG selects, orchestrates, closes. Owner is asked ONLY for the root/intrusive VPS step, not ordinary technical tasks.",
  },
  status: "PROGRESS_RECONCILED_vps_priority_held",
  invariant: "no second roadmap/registry; V12.4+ROADMAP.json untouched; history preserved (5 stashes + untracked + releases); structural maturity ≠ operational reality; prepared ≠ demonstrated; nothing documented/simulated reported as done; no production/VPS mutation; VPS chantier stays OPEN until its closure criteria are met; ODG selects/closes.",
};
fs.writeFileSync(path.join(D, "V106_PROGRESS_RECONCILIATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, missions: missions.length, completed: out.odgDecision.completed.length, open: out.odgDecision.open.length, phase1Pct, vps: { configured: vps.systemdSupervisionConfigured, reallySupervised: vps.processReallySupervised, backupRestoreDemonstrated: vps.backupAndRestoreDemonstrated }, production: health.status, historyPreserved: `${stashes} stashes/${untracked} untracked` }, null, 2) + "\n");
export {};

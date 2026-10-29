#!/usr/bin/env node
/*
 * ODG MISSION-RUNNER TICK — ONE bounded governed scheduler tick (read-only canary allowlist).
 *
 * This is NOT a new orchestrator or scheduler. It composes EXISTING governed primitives for a single,
 * bounded, fail-closed tick and then exits:
 *   - startup repo-safety: canonical `truth-lock-gate.truthLockGate` (fail-closed under ODG_TRUTH_LOCK_ENFORCE);
 *   - decision: the pure `mission-scheduler.schedulerStep` (eligibility / per-mission authz / dedup / bounds /
 *     emergency stop / fail-closed classification);
 *   - dispatch: the REAL governed pipeline `runtime/bin/odg-run.js` (13 stages → Validation Engine verdict),
 *     spawned as a child so ODG_TRUTH_LOCK_ENFORCE propagates to the actual execution process;
 *   - dedup: the mission-ledger proven set (already-proven ⇒ not re-run);
 *   - audit: `mission-attempt-log.recordAttempt` (append-only).
 *
 * Allowlist is DENY-BY-DEFAULT and READ-ONLY: `ODG_CANARY_ALLOWLIST` (comma-separated mission ids). Empty ⇒
 * the tick is a safe no-op (IDLE). Widening to consequential missions is a SEPARATE CTO decision. The tick
 * never calls a provider (no provider is constructed; read-only missions require none).
 * READ-ONLY IS NOW CODE-ENFORCED (default-DENY), not allowlist-trust: `authorize` additionally runs
 * `canary-decision-pack` over the mission's OWN definition and ADMITS only a mission whose declared `mode` is in an
 * explicit read-only set (READ_ONLY/OBSERVATION/ANALYZE/AUDIT/DIAGNOSTIC/HEALTH) AND which declares no
 * engineering/authorized_paths/network/spend/destructive. Any other mode (SEQUENTIAL, ENGINEERING, IMPLEMENT,
 * AUTONOMOUS_x, REPAIR, etc.), an absent/unknown mode, or a missing/unreadable definition ⇒ BLOCKED, never dispatched.
 * The absence of a mutation flag is NOT read as read-only. The allowlist alone cannot promote the canary into an
 * engineering executor.
 *
 * QUEUE SOURCE: this tick injects into mission-scheduler a SYNTHETIC, allowlist-derived queue (one PENDING item
 * per allowlist id) — an ISOLATED canary interface BY DESIGN, NOT the canonical runtime pending-queue. This is
 * deliberate and must not be conflated with canonical-queue consumption: wiring the canonical queue in here
 * would widen the executable-mission set and is a gated SECURITY BOUNDARY (separate CTO decision + non-regression
 * proof). See mission-scheduler's header for the canonical-vs-canary contract.
 *
 * Exit codes: 0 = PASS or IDLE (safe); non-zero = STARTUP_REFUSED / STOPPED / BLOCKED / FAIL / NOT_MEASURABLE.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const ROOT: string = process.cwd();
function corePort(rel: string): string {
  const dist = rel.replace(/^runtime\//, "runtime/dist/");
  if (process.env.ODG_RUNTIME !== "js" && fs.existsSync(path.join(ROOT, dist))) return dist;
  return rel;
}
const { schedulerStep, buildExcellenceReviewer } = require(path.join(ROOT, corePort("runtime/core/mission-scheduler.js")));

// Excellence rule, consulted automatically for each canary mission (ADVISORY, NON-blocking; fail-closed only on a
// prohibited unproven-superlative claim per mission-scheduler). Offline registry ⇒ offline-pending-reverify; a
// mission is never blocked because reference search is offline. Read-only: does NOT change dispatch or the queue.
const EXCELLENCE_REGISTRY = [{ id: "ODG-MISSION-QUALITY", authority: "ODG", domain: "autonomous-mission", version: "1.0", date: "2026-10-27", source: "ODG mission-quality method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: ["reproduce-before-fix", "independent-verification", "no-false-success"], limits: ["hermetic; offline-pending-reverify"], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify" }];
const reviewExcellence = buildExcellenceReviewer((mission: any) => ({ domain: "autonomous-mission", now: new Date().toISOString().slice(0, 10), registry: EXCELLENCE_REGISTRY, currentPractices: ["reproduce-before-fix", "independent-verification", "no-false-success"], thresholds: {}, measured: {}, claims: (mission && mission.claims) || [] }));
const { truthLockGate } = require(path.join(ROOT, corePort("runtime/core/truth-lock-gate.js")));
const { recordAttempt } = require(path.join(ROOT, corePort("runtime/core/mission-attempt-log.js")));
const AUDIT = require(path.join(ROOT, corePort("runtime/core/audit-log.js")));   // tamper-evident canary decision log
const CANARY = require(path.join(ROOT, corePort("runtime/core/canary-decision-pack.js")));   // read-only safety classifier (fail-closed)

const ALLOW: Set<string> = new Set((process.env.ODG_CANARY_ALLOWLIST || "").split(",").map((s: string) => s.trim()).filter(Boolean));
const LOG = path.join(ROOT, "runtime", "generated", "mission-attempt-log.jsonl");
const AUDIT_CHAIN_PATH = path.join(ROOT, "runtime", "generated", "scheduler-audit-chain.json");

// Read/append the persisted tamper-evident canary decision chain (audit artifact only — NOT business state).
function readAuditChain(): any[] { try { const c = JSON.parse(fs.readFileSync(AUDIT_CHAIN_PATH, "utf8")); return Array.isArray(c) ? c : []; } catch { return []; } }
function persistAuditChain(chain: any[]): void { try { fs.mkdirSync(path.dirname(AUDIT_CHAIN_PATH), { recursive: true }); fs.writeFileSync(AUDIT_CHAIN_PATH, JSON.stringify(chain, null, 2)); } catch { /* best-effort audit */ } }

function gitExec(args: string[]): string | null {
  try { return String(cp.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; }
}
function provenSet(): Set<string> {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "generated", "mission-ledger.json"), "utf8"));
    const e = Array.isArray(l) ? l : (l.entries || l.missions || []);
    return new Set(e.filter((x: any) => x && x.proven === true).map((x: any) => x.mission));
  } catch { return new Set(); }
}
// Load a mission's definition and project it onto the canary-safety spec (snake- AND camel-case tolerant). Fail-closed:
// a missing/unreadable mission file ⇒ null ⇒ the safety gate REFUSES (an unknown mission is never canary-safe).
// DEFAULT-DENY: a mission counts as canary-safe (non-engineering) ONLY if its declared `mode` is in this explicit
// read-only set. Absent/unknown/any mutating mode (SEQUENTIAL, ENGINEERING, IMPLEMENT, REPAIR, AUTONOMOUS_*, …) ⇒
// treated as engineering ⇒ refused. (The absence of a mutation FLAG must never be read as proof of read-only — many
// real mission files predate the requires_engineering/authorized_paths schema yet are mutating, e.g. mode=IMPLEMENT.)
const CANARY_READONLY_MODES: Set<string> = new Set(["READ_ONLY", "READONLY", "OBSERVATION", "ANALYZE", "AUDIT", "DIAGNOSTIC", "HEALTH"]);
// PURE projection of a mission object → canary-safety spec (exported for direct unit testing of the classification).
function canarySpecFromMission(m: any, missionId: string): any {
  if (m === null || typeof m !== "object") return null;
  const authorizedPaths = Array.isArray(m.authorized_paths) ? m.authorized_paths : (Array.isArray(m.authorizedPaths) ? m.authorizedPaths : []);
  const pol = (m && typeof m.policies === "object" && m.policies) || {};
  // typeof guard: a non-string mode (array/object/number/null) must NOT coerce (e.g. ["READ_ONLY"].toString()==="READ_ONLY")
  // into an admitted mode — a malformed mode ⇒ "" ⇒ not in the allowlist ⇒ refused (fail-closed).
  const mode = typeof m.mode === "string" ? m.mode.toUpperCase().trim() : "";
  const explicitlyReadOnly = CANARY_READONLY_MODES.has(mode) && m.requires_engineering !== true && m.requiresEngineering !== true;
  return {
    mission: missionId,
    requiresEngineering: !explicitlyReadOnly,   // fail-closed: only an EXPLICIT read-only mode (+ no eng flag) admits
    authorizedPaths,
    network: m.network === true, requiresNetwork: m.requires_network === true || m.requiresNetwork === true,
    spend: m.spend === true, budgetEur: typeof m.budgetEur === "number" ? m.budgetEur : (typeof pol.budgetEur === "number" ? pol.budgetEur : 0),
    destructive: m.destructive === true,
  };
}
function loadMissionSpec(missionId: string): any {
  try { return canarySpecFromMission(JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "missions", missionId + ".json"), "utf8")), missionId); }
  catch { return null; }
}
// Code-enforced read-only safety for a canary mission (closes the allowlist-only fail-open): an allowlisted mission is
// still REFUSED unless its own definition proves it read-only/no-network/no-spend/non-destructive (canary-decision-pack).
function assessCanarySafety(missionId: string, loadSpec?: (id: string) => any): { safe: boolean; reason: string } {
  const spec = (loadSpec || loadMissionSpec)(missionId);
  if (!spec) return { safe: false, reason: `CANARY_SPEC_UNAVAILABLE: ${missionId} (no mission definition — refused fail-closed)` };
  const a = CANARY.assessCanaryCandidate(spec);
  return a.safe === true ? { safe: true, reason: "read-only canary allowlist (safety-assessed)" } : { safe: false, reason: `CANARY_REFUSES_NON_READONLY: ${(a.blockers || []).join("; ")}` };
}

// Dispatch via the REAL governed pipeline (dist odg-run), inheriting the enforcement env.
function dispatch(item: any): any {
  const runBin = corePort("runtime/bin/odg-run.js");
  const r = cp.spawnSync("node", [runBin, item.mission], { cwd: ROOT, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let report: any = null;
  try { report = JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "generated", "mission-report.json"), "utf8")); } catch { /* none */ }
  const verified = !!(report && report.mission === item.mission && report.validated === true && report.status === "SUCCESS" && r.status === 0);
  return { verified, detail: report ? `status ${report.status}` : `odg-run exit ${r.status}` };
}

function main(): void {
  const enforce = process.env.ODG_TRUTH_LOCK_ENFORCE === "1" || process.env.ODG_TRUTH_LOCK_ENFORCE === "true";
  // (A) STARTUP repo-safety precondition — fail-closed under enforcement, BEFORE any scheduling.
  if (enforce) {
    const tl = truthLockGate({ mutating: true, enforce: true, exec: gitExec });
    if (tl.blocked) {
      try { recordAttempt(LOG, { mission: "(startup)", recordedAt: new Date().toISOString(), status: "STARTUP_REFUSED", reason: tl.verdict.detail }); } catch { /* audit best-effort */ }
      console.error("STARTUP_REFUSED: Truth-Lock repo-safety —", tl.verdict.detail);
      process.exit(2);
    }
  }
  const d = tickOnce({ chain: readAuditChain() });
  persistAuditChain(d.auditChain || []);                               // tamper-evident canary decision log (audit artifact)
  console.log(`[odg-schedule-tick] ${d.status} — ${d.reason || ""}${d.item ? " (mission " + d.item.mission + ")" : ""}`);
  // Safe terminal states exit 0 (PASS = a verified read-only mission; IDLE = nothing eligible). Everything else
  // (STOPPED/BLOCKED/FAIL/NOT_MEASURABLE) is a non-zero, non-false-success exit.
  process.exit(d.status === "PASS" || d.status === "IDLE" ? 0 : 1);
}

/**
 * tickOnce — the PURE canary tick decision (the real ctx + schedulerStep), with NO process.exit and NO IO except the
 * injected recordAttempt. Deps are injectable for hermetic tests (allow/proven/dispatch/reviewExcellence/recordAttempt/
 * chain). STRICTLY read-only wrt business state: it never mutates a queue or runs an effect itself (dispatch is the
 * injected seam; the default spawns the governed pipeline, same as production). ctx.auditChain ⇒ the decision carries a
 * tamper-evident hash chain (AXE 3). The canary admission (preAuthorized/authorize = ODG_CANARY_ALLOWLIST, deny-by-
 * default) is unchanged.
 */
function tickOnce(opts: any = {}): any {
  const allow: Set<string> = opts.allow instanceof Set ? opts.allow : ALLOW;
  const proven: any = opts.proven || provenSet();
  const ctx: any = {
    queue: { queue: [...allow].map((m) => ({ mission: m, status: "PENDING" })) },
    preAuthorized: [...allow],
    isProven: (id: string) => (typeof proven.has === "function" ? proven.has(id) : false),
    // Deny-by-default: allowlist membership AND a code-enforced read-only safety assessment (fail-closed). An
    // allowlisted-but-mutating/network/spend/destructive mission is REFUSED here and never dispatched to odg-run —
    // the canary cannot become an engineering executor via the allowlist alone. opts.assessSafety injectable for tests.
    authorize: (item: any) => {
      if (!allow.has(item.mission)) return { ok: false, reason: `NOT_IN_CANARY_ALLOWLIST: ${item.mission}` };
      const s = (opts.assessSafety || ((id: string) => assessCanarySafety(id, opts.loadSpec)))(item.mission);
      return s.safe ? { ok: true, reason: s.reason } : { ok: false, reason: s.reason };
    },
    policy: { maxAttemptsPerMission: 2, maxBudget: 1000, maxDurationMs: 600000, maxConsecutiveFailures: 2 },
    recordAttempt: opts.recordAttempt || ((d: any) => { try { recordAttempt(LOG, { mission: (d && d.mission) || "(none)", recordedAt: new Date().toISOString(), status: d && d.status, reason: d && d.reason }); } catch { /* best-effort */ } }),
    dispatch: opts.dispatch || dispatch,
    reviewExcellence: opts.reviewExcellence || reviewExcellence,         // canonical auto-consultation (advisory, read-only)
    auditChain: Array.isArray(opts.chain) ? opts.chain : [],             // AXE 3 tamper-evident decision chain (opt-in)
  };
  return schedulerStep(ctx);
}

module.exports = { tickOnce, readAuditChain, persistAuditChain, AUDIT_CHAIN_PATH, canarySpecFromMission, CANARY_READONLY_MODES };
if (require.main === module) main();
export {};

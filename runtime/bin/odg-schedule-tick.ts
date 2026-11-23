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
const { resolveRequiredPort } = require("../core/prefer-dist-bin.js"); // relative: resolves to dist/core under dist, .ts under tsx (matches odg-delegate)
function corePort(rel: string): string {
  const dist = rel.replace(/^runtime\//, "runtime/dist/");
  // FAIL-CLOSED: resolve to whichever port actually exists, else throw a clear rebuild message (the ODG_RUNTIME=js
  // source-.js rollback is retired ⇒ never return a path to a non-existent module).
  return resolveRequiredPort(dist, rel, (p: string) => fs.existsSync(path.join(ROOT, p)));
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
// SEC#3 (P0-E): verify-on-read. The persisted tamper-evident chain was loaded and EXTENDED/trusted WITHOUT ever
// re-verifying it — so computed tamper-evidence was never consulted at the trust boundary (a partial in-place
// edit / reorder / truncate of the persisted chain would go unnoticed and get silently extended). PURE gate:
// an ABSENT/empty chain is fine (fresh start); a PRESENT-but-broken chain is an integrity incident ⇒ refuse
// (fail-closed), never silently trusted or overwritten. (Full-rewrite forgery still needs a keyed HMAC/signature
// — owner-gated secret decision, out of scope here; this makes the EXISTING tamper-evidence load-bearing.)
function auditIntegrityGate(chain: any[]): { ok: boolean; reason: string; brokenAt: number } {
  if (!Array.isArray(chain) || chain.length === 0) return { ok: true, reason: "empty/absent chain (fresh start)", brokenAt: -1 };
  const v = AUDIT.verifyChain(chain);
  return { ok: v.ok === true, reason: v.reason, brokenAt: v.brokenAt };
}
function persistAuditChain(chain: any[]): void { try { fs.mkdirSync(path.dirname(AUDIT_CHAIN_PATH), { recursive: true }); const tmp = `${AUDIT_CHAIN_PATH}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(chain, null, 2)); try { fs.renameSync(tmp, AUDIT_CHAIN_PATH); } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort */ } throw e; } } catch { /* best-effort audit (crash-atomic temp+rename so a torn write can't silently truncate the tamper-evident chain) */ } }

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

// B-5 (V2 Pole B): spawnSync is synchronous + uninterruptible, so ctx.policy.maxDurationMs cannot kill a hung
// odg-run child — off-systemd (manual / non-unit tick) the dispatch would block the tick forever (production is
// bounded by the unit's TimeoutStartSec=600). Bound it here to the SAME budget as ctx.policy.maxDurationMs, with
// an explicit SIGKILL and a maxBuffer so a chatty or hung child cannot hang or OOM the tick. A timeout leaves
// r.status=null ⇒ verified=false (fail-closed), and is reported honestly.
const DISPATCH_TIMEOUT_MS = 600000; // keep in sync with the tickOnce ctx.policy.maxDurationMs (=600000) + deploy unit TimeoutStartSec=600
// Dispatch via the REAL governed pipeline (dist odg-run), inheriting the enforcement env.
function dispatch(item: any): any {
  const runBin = corePort("runtime/bin/odg-run.js");
  const r = cp.spawnSync("node", [runBin, item.mission], { cwd: ROOT, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: DISPATCH_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
  const timedOut = !!(r.error && (r.error as any).code === "ETIMEDOUT") || r.signal === "SIGKILL";
  let report: any = null;
  try { report = JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "generated", "mission-report.json"), "utf8")); } catch { /* none */ }
  const verified = !timedOut && !!(report && report.mission === item.mission && report.validated === true && report.status === "SUCCESS" && r.status === 0);
  const detail = timedOut ? `odg-run TIMED OUT after ${DISPATCH_TIMEOUT_MS}ms (killed) — not verified` : (report ? `status ${report.status}` : `odg-run exit ${r.status}`);
  return { verified, detail };
}

// C#5 — Truth-Lock default enforcement at the UNATTENDED launcher. odg-schedule-tick is a scheduled/unattended
// entry (systemd timer or any non-interactive loop); a repo-safety gate that silently defaults OFF there means a
// mutating mission on a divergent/unsafe repo state is only RECORDED, not BLOCKED, unless an env var was remembered.
// FIX (forensic design A): at THIS launcher, enforcement is DEFAULT-ON with an explicit opt-out — unset ⇒ enforce,
// ODG_TRUTH_LOCK_ENFORCE=0 ⇒ opt-out (for throwaway/CI fixtures). We do NOT touch the pure gate's default or the
// core callers (odg-run/patch-executor/delegate-isolation keep opt-in env==="1", so local-dev + direct-spawn tests
// stay record-only). To make the dispatched odg-run child enforce too, we PROPAGATE by stamping process.env (the
// child is spawned with env: process.env), so enforcement flows transitively without changing the child's own
// opt-in default. This generalizes what deploy/odg-mission-runner.service already sets (ODG_TRUTH_LOCK_ENFORCE=1)
// to every unattended invocation of this launcher, systemd or not.
function launcherEnforce(): boolean {
  const v = process.env.ODG_TRUTH_LOCK_ENFORCE;
  return v !== "0" && v !== "false"; // DEFAULT-ON: unset/anything-but-0/false ⇒ enforce; explicit 0/false ⇒ opt-out
}

function main(): void {
  const enforce = launcherEnforce();
  if (enforce) process.env.ODG_TRUTH_LOCK_ENFORCE = "1"; // propagate to the dispatched odg-run child (env: process.env)
  // (A) STARTUP repo-safety precondition — fail-closed under enforcement, BEFORE any scheduling.
  if (enforce) {
    const tl = truthLockGate({ mutating: true, enforce: true, exec: gitExec });
    if (tl.blocked) {
      try { recordAttempt(LOG, { mission: "(startup)", recordedAt: new Date().toISOString(), status: "STARTUP_REFUSED", reason: tl.verdict.detail }); } catch { /* audit best-effort */ }
      console.error("STARTUP_REFUSED: Truth-Lock repo-safety —", tl.verdict.detail);
      process.exit(2);
    }
  }
  // (B) STARTUP audit-chain integrity precondition (SEC#3) — fail-closed BEFORE trusting/extending the persisted
  // tamper-evident chain. A broken persisted chain is an integrity incident: refuse the tick, preserve the
  // evidence (never overwrite), exit 2. An absent/empty chain is a normal fresh start.
  const loadedChain = readAuditChain();
  const integ = auditIntegrityGate(loadedChain);
  if (!integ.ok) {
    try { recordAttempt(LOG, { mission: "(startup)", recordedAt: new Date().toISOString(), status: "AUDIT_CHAIN_TAMPERED", reason: `${integ.reason} @${integ.brokenAt}` }); } catch { /* audit best-effort */ }
    console.error(`STARTUP_REFUSED: audit-chain integrity — ${integ.reason} (brokenAt ${integ.brokenAt}); refusing to extend an untrusted tamper-evident chain (evidence preserved, not overwritten).`);
    process.exit(2);
  }
  const d = tickOnce({ chain: loadedChain });
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

/* ===================================================================================================================
 * V15.1 WAVE MODE — OPT-IN ONLY (ODG_TICK_WAVE=1). The DEFAULT path above (main → tickOnce → ONE blocking spawnSync)
 * is NOT touched and is what the root-owned odg-mission-runner timer runs (its unit does not set ODG_TICK_WAVE). The
 * wave modules are lazy-loaded INSIDE this mode only, so the default path's module graph is unchanged too.
 *
 * It turns ODG's dispatch PLAN into concurrent GOVERNED runs, composing EXISTING decision components (no 2nd scheduler):
 *   1. admission  — for EACH allowlisted mission, the SAME mission-scheduler.schedulerStep gates as the default tick
 *                   (stop / bounds / eligibility / dedup-proven / canary read-only authorize / excellence), with a
 *                   capture-only dispatch seam (nothing runs during admission);
 *   2. inventory  — admitted missions are projected onto register-shaped records and classified by the canonical
 *                   odg-open-mission-recovery.classifyOpenMission (which now passes write-sets through, fail-closed);
 *   3. wave       — odg-mission-orchestrator.buildDispatchPlan → write-safety via odg-writeset-contention; we take the
 *                   FIRST write-safe sub-wave of the first layer, capped at ODG_TICK_WAVE_MAX (default 2, max 6);
 *   4. execution  — the SAME governed child (`node runtime/(dist/)bin/odg-run.js <mission>`) per mission, via async
 *                   cp.spawn, concurrently, each with its own SIGKILL timeout + output cap; Promise.allSettled ⇒ a failing
 *                   child never stops the others; each attempt recorded via mission-attempt-log.recordAttempt (same row
 *                   shape as the default path) and appended to the tamper-evident audit chain.
 *
 * WRITE-SET HONESTY: a canary mission's write-set for contention = its declared output `write_set`/`writeSet` UNION the
 * runner's own shared write-set. The REAL odg-run writes the SHARED cwd-relative runtime/generated/ (mission-report.json,
 * checkpoints, ledger), so with the real runner every pair overlaps on runtime/generated ⇒ serialized (one per wave) —
 * safe by construction, never optimistically parallel. A mission with NO declared write-set ⇒ UNKNOWN ⇒ serialized.
 * Genuine concurrency therefore needs a runner whose children write disjoint paths (tests inject one via opts).
 *
 * V15.1 RUN-OUTPUT ISOLATION (wave mode only; ODG_TICK_WAVE_ISOLATE=0 restores the serialized behaviour above): each
 * child gets a DISTINCT ODG_RUN_OUTPUT_DIR = <runOutputBase>/<mission> (default runtime/generated/wave-runs/<tick>/),
 * honoured by odg-run as a copy-on-write overlay (runtime/core/run-output-isolation): every per-run output lands in
 * that dir, the shared runtime/generated is only READ — except the mission-ledger (SHARED_STATE), whose read-modify-
 * write the ledger stage serializes under an O_EXCL lock. The runner's write-set for contention is then the child's
 * OWN run dir instead of runtime/generated; the report is read from that dir. The ledger is NOT in the write-set: it
 * is lock-serialized (micro-critical-section), not wave-serialized. The UNKNOWN rule is unchanged: a mission with NO
 * declared write-set is still serialized (fail-closed), isolation or not.
 * =================================================================================================================== */
const WAVE_DEFAULT_MAX = 2;
const WAVE_HARD_MAX = 6;                                   // same ceiling as the orchestrator's agentCount (0..6)
const REAL_RUNNER_SHARED_WRITESET = Object.freeze(["runtime/generated"]); // odg-run writes the shared generated dir
// Isolated runner (ODG_RUN_OUTPUT_DIR per child): per-run outputs go to the child's own dir (added per mission); the only
// remaining shared write is the lock-serialized mission-ledger ⇒ nothing shared needs wave-level serialization.
const ISOLATED_RUNNER_SHARED_WRITESET: readonly string[] = Object.freeze([]);
const WAVE_ADMITTED = "__WAVE_ADMITTED__";                 // capture-only sentinel (admission phase never runs anything)

function waveMaxFromEnv(v: any): number {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, WAVE_HARD_MAX) : WAVE_DEFAULT_MAX;
}
function loadMissionDef(missionId: string): any {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "missions", missionId + ".json"), "utf8")); } catch { return null; }
}
// Declared OUTPUT write-set of a read-only mission (distinct from authorized_paths, which a canary must NOT have).
function declaredWriteSet(m: any): string[] | null {
  const raw = m && (Array.isArray(m.write_set) ? m.write_set : (Array.isArray(m.writeSet) ? m.writeSet : null));
  return Array.isArray(raw) && raw.length > 0 && raw.every((x: any) => typeof x === "string") ? raw.slice() : null;
}

/* selectWave — PURE: admitted ids → canonical classify → canonical dispatch plan → first write-safe sub-wave (capped). */
function selectWave(admittedIds: string[], o: any): any {
  const REC = o.REC, MO = o.MO;
  const shared: string[] = Array.isArray(o.runnerSharedWriteSet) ? o.runnerSharedWriteSet : REAL_RUNNER_SHARED_WRITESET.slice();
  const records = admittedIds.map((id) => {
    const decl = declaredWriteSet(o.loadMission(id));
    const rec: any = { id, status: "READY", title: `canary ${id}`, deps: [], acceptance: "", nextAction: "read-only canary run via the governed odg-run pipeline" };
    const own: string[] = typeof o.runnerWriteSetFor === "function" ? o.runnerWriteSetFor(id) : [];   // isolated run dir
    if (decl) rec.writeSet = Array.from(new Set([...decl, ...shared, ...own]));   // absent ⇒ no key ⇒ UNKNOWN (fail-closed)
    return rec;
  });
  const statusById: any = {};
  const inventory = { missions: records.map((r: any) => REC.classifyOpenMission(r, statusById)) };
  const plan = MO.buildDispatchPlan(inventory);
  const layer0 = plan.writeSafety && plan.writeSafety.ok === true && plan.writeSafety.layers[0] ? plan.writeSafety.layers[0] : null;
  const firstWave: string[] = layer0 && layer0.subWaves[0] ? layer0.subWaves[0].slice() : [];
  const cap = o.waveMax;
  const wave = firstWave.slice(0, cap);
  const deferred = admittedIds.filter((id) => wave.indexOf(id) < 0);
  return { wave, deferred, subWaves: layer0 ? layer0.subWaves.map((w: any) => w.slice()) : [], contentions: layer0 ? layer0.contentions : [], cap, routes: plan.routes };
}

/* runGovernedChild — async spawn of the governed child; NEVER rejects. Same verification rule as the default dispatch. */
function runGovernedChild(missionId: string, o: any): Promise<any> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let bytes = 0, timedOut = false, overflow = false, settled = false;
    let timer: any = null;
    const done = (code: any, signal: any, spawnErr?: any) => {
      if (settled) return; settled = true; if (timer) clearTimeout(timer);
      const endedAt = Date.now();
      let report: any = null;
      try { report = o.readReport(missionId); } catch { report = null; }
      const verified = !timedOut && !overflow && !spawnErr && !!(report && report.mission === missionId && report.validated === true && report.status === "SUCCESS" && code === 0);
      const detail = spawnErr ? `odg-run spawn error: ${(spawnErr && spawnErr.message) || spawnErr}`
        : timedOut ? `odg-run TIMED OUT after ${o.timeoutMs}ms (killed) — not verified`
        : overflow ? "odg-run output exceeded cap (killed) — not verified"
        : (report && report.mission === missionId ? `status ${report.status}` : `odg-run exit ${code}${signal ? " " + signal : ""}`);
      resolve({ mission: missionId, verified, detail, startedAt, endedAt, exitCode: code, signal });
    };
    let child: any;
    try { child = cp.spawn(o.node || "node", [o.runBin, missionId], { cwd: o.cwd, env: o.env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { return done(null, null, e); }
    timer = setTimeout(() => { timedOut = true; try { child.kill("SIGKILL"); } catch { /* gone */ } }, o.timeoutMs);
    const drain = (b: any) => { bytes += b.length; if (bytes > o.maxBuffer && !overflow) { overflow = true; try { child.kill("SIGKILL"); } catch { /* gone */ } } };
    if (child.stdout) child.stdout.on("data", drain);
    if (child.stderr) child.stderr.on("data", drain);
    child.on("error", (e: any) => done(null, null, e));
    child.on("close", (code: any, signal: any) => done(code, signal));
  });
}

/* tickWave — one OPT-IN wave tick. All IO injectable (allow/proven/loadMission/assessSafety/runBin/cwd/env/readReport/
 * logPath/recordAttempt/runnerSharedWriteSet/waveMax/timeoutMs/chain) so tests run in a throw-away state. */
async function tickWave(opts: any = {}): Promise<any> {
  const SCHED = require(path.join(ROOT, corePort("runtime/core/mission-scheduler.js")));
  const REC = opts.REC || require(path.join(ROOT, corePort("runtime/core/odg-open-mission-recovery.js")));
  const MO = opts.MO || require(path.join(ROOT, corePort("runtime/core/odg-mission-orchestrator.js")));
  const allow: Set<string> = opts.allow instanceof Set ? opts.allow : ALLOW;
  const proven: any = opts.proven || provenSet();
  const logPath: string = opts.logPath || LOG;
  const loadMission = opts.loadMission || loadMissionDef;
  const loadSpec = opts.loadSpec || ((id: string) => canarySpecFromMission(loadMission(id), id));
  const record = opts.recordAttempt || ((d: any) => { try { recordAttempt(logPath, { mission: (d && d.mission) || "(none)", recordedAt: new Date().toISOString(), status: d && d.status, reason: d && d.reason }); } catch { /* best-effort */ } });
  let chain: any[] = Array.isArray(opts.chain) ? opts.chain : [];
  const audit = (d: any) => { try { chain = AUDIT.appendEntry(chain, { status: d.status, mission: d.mission, reason: d.reason }); } catch { /* best-effort */ } record(d); };
  const policy = { maxAttemptsPerMission: 2, maxBudget: 1000, maxDurationMs: 600000, maxConsecutiveFailures: 2 };   // = default tick

  // 1. ADMISSION — the default tick's exact gate chain, per mission, capture-only (no dispatch, no record of admits).
  const admitted: string[] = [];
  const refused: any[] = [];
  for (const id of allow) {
    const d = SCHED.schedulerStep({
      queue: { queue: [{ mission: id, status: "PENDING" }] },
      preAuthorized: [...allow],
      isProven: (x: string) => (typeof proven.has === "function" ? proven.has(x) : false),
      authorize: (item: any) => {
        if (!allow.has(item.mission)) return { ok: false, reason: `NOT_IN_CANARY_ALLOWLIST: ${item.mission}` };
        const s = (opts.assessSafety || ((x: string) => assessCanarySafety(x, loadSpec)))(item.mission);
        return s.safe ? { ok: true, reason: s.reason } : { ok: false, reason: s.reason };
      },
      policy,
      dispatch: () => ({ verified: true, detail: WAVE_ADMITTED }),
      reviewExcellence: opts.reviewExcellence || reviewExcellence,
    });
    if (d.status === "PASS" && d.reason === WAVE_ADMITTED) { admitted.push(id); continue; }
    if (d.status === "IDLE") continue;                               // ineligible (e.g. proven dedup) — skipped as today
    if (d.mission === null) { audit(d); return { status: d.status, reason: d.reason, wave: [], results: [], refused, deferred: [], auditChain: chain }; } // global stop/bound
    refused.push(d); audit(d);
  }
  if (admitted.length === 0) {
    if (refused.length > 0) return { status: "BLOCKED", reason: `${refused.length} refused, none admitted`, wave: [], results: [], refused, deferred: [], auditChain: chain };
    const d = SCHED.schedulerStep({ queue: { queue: [...allow].map((m) => ({ mission: m, status: "PENDING" })) }, preAuthorized: [...allow], isProven: (x: string) => (typeof proven.has === "function" ? proven.has(x) : false), policy });
    audit(d); return { status: "IDLE", reason: d.reason, wave: [], results: [], refused, deferred: [], auditChain: chain };
  }

  // 2+3. WAVE SELECTION — canonical classify → canonical dispatch plan → first write-safe sub-wave, capped.
  const waveMax = typeof opts.waveMax === "number" ? Math.max(1, Math.min(WAVE_HARD_MAX, Math.floor(opts.waveMax))) : waveMaxFromEnv(process.env.ODG_TICK_WAVE_MAX);
  // V15.1 isolation: ON in wave mode unless ODG_TICK_WAVE_ISOLATE=0 / opts.isolate===false. An injected runner (opts.runBin)
  // without an explicit opts.isolate keeps the previous contract (tests' stubs do not honour ODG_RUN_OUTPUT_DIR).
  const isolate: boolean = typeof opts.isolate === "boolean" ? opts.isolate : (!opts.runBin && process.env.ODG_TICK_WAVE_ISOLATE !== "0");
  const runCwd: string = opts.cwd || ROOT;
  const runOutputBase: string | null = isolate ? path.resolve(runCwd, opts.runOutputBase || path.join("runtime", "generated", "wave-runs", new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid)) : null;
  const runDirFor = (id: string) => path.join(runOutputBase as string, id.replace(/[^A-Za-z0-9_.-]/g, "_"));
  const relToCwd = (p: string) => { const r = path.relative(runCwd, p); return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.split(path.sep).join("/") : p; };
  const sel = selectWave(admitted, { REC, MO, loadMission, waveMax,
    runnerSharedWriteSet: isolate ? (Array.isArray(opts.runnerSharedWriteSet) ? opts.runnerSharedWriteSet : ISOLATED_RUNNER_SHARED_WRITESET.slice()) : opts.runnerSharedWriteSet,
    runnerWriteSetFor: isolate ? (id: string) => [relToCwd(runDirFor(id))] : undefined });

  // 4. CONCURRENT GOVERNED EXECUTION — same child per mission; allSettled ⇒ one failure never stops the others.
  const childOpts = {
    runBin: opts.runBin || corePort("runtime/bin/odg-run.js"),
    cwd: runCwd,
    env: opts.env || process.env,
    timeoutMs: typeof opts.timeoutMs === "number" ? opts.timeoutMs : DISPATCH_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    readReport: opts.readReport || ((_id: string) => JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "generated", "mission-report.json"), "utf8"))),
  };
  // Isolated: a DISTINCT ODG_RUN_OUTPUT_DIR per child; its report is read from its OWN run dir (never the shared one).
  const optsFor = (id: string) => !isolate ? childOpts : {
    ...childOpts,
    env: { ...childOpts.env, ODG_RUN_OUTPUT_DIR: runDirFor(id), ODG_RUN_OUTPUT_ROOT: path.resolve(runCwd) },
    readReport: opts.readReport || ((mid: string) => JSON.parse(fs.readFileSync(path.join(runDirFor(mid), "mission-report.json"), "utf8"))),
  };
  const t0 = Date.now();
  const settled = await Promise.allSettled(sel.wave.map((id: string) => runGovernedChild(id, optsFor(id))));
  const wallMs = Date.now() - t0;
  const results = settled.map((s: any, i: number) => {
    const r = s.status === "fulfilled" ? s.value : { mission: sel.wave[i], verified: false, detail: `runner rejected: ${s.reason}` };
    const c = SCHED.classifyDispatch(r);                              // canonical fail-closed classification
    const d = { status: c.status, mission: sel.wave[i], reason: c.detail };
    audit(d);
    return { ...d, startedAt: r.startedAt, endedAt: r.endedAt, exitCode: r.exitCode };
  });
  const allPass = results.length > 0 && results.every((r: any) => r.status === "PASS");
  return { status: allPass ? "PASS" : "FAIL", reason: `wave ${results.filter((r: any) => r.status === "PASS").length}/${results.length} PASS (cap ${sel.cap}; deferred ${sel.deferred.length})`, wave: sel.wave, subWaves: sel.subWaves, contentions: sel.contentions, deferred: sel.deferred, refused, results, wallMs, isolated: isolate, runDirs: isolate ? Object.fromEntries(sel.wave.map((id: string) => [id, runDirFor(id)])) : null, auditChain: chain };
}

// Opt-in CLI entry for wave mode: SAME startup gates as main() (Truth-Lock + audit-chain integrity), then one wave tick.
async function mainWave(): Promise<void> {
  const enforce = launcherEnforce();
  if (enforce) process.env.ODG_TRUTH_LOCK_ENFORCE = "1";
  if (enforce) {
    const tl = truthLockGate({ mutating: true, enforce: true, exec: gitExec });
    if (tl.blocked) {
      try { recordAttempt(LOG, { mission: "(startup)", recordedAt: new Date().toISOString(), status: "STARTUP_REFUSED", reason: tl.verdict.detail }); } catch { /* audit best-effort */ }
      console.error("STARTUP_REFUSED: Truth-Lock repo-safety —", tl.verdict.detail);
      process.exit(2);
    }
  }
  const loadedChain = readAuditChain();
  const integ = auditIntegrityGate(loadedChain);
  if (!integ.ok) {
    try { recordAttempt(LOG, { mission: "(startup)", recordedAt: new Date().toISOString(), status: "AUDIT_CHAIN_TAMPERED", reason: `${integ.reason} @${integ.brokenAt}` }); } catch { /* audit best-effort */ }
    console.error(`STARTUP_REFUSED: audit-chain integrity — ${integ.reason} (brokenAt ${integ.brokenAt}); refusing to extend an untrusted tamper-evident chain (evidence preserved, not overwritten).`);
    process.exit(2);
  }
  const d = await tickWave({ chain: loadedChain });
  persistAuditChain(d.auditChain || []);
  console.log(`[odg-schedule-tick wave] ${d.status} — ${d.reason || ""}${d.wave && d.wave.length ? " (missions " + d.wave.join(",") + ")" : ""}`);
  process.exit(d.status === "PASS" || d.status === "IDLE" ? 0 : 1);
}

module.exports = { tickOnce, readAuditChain, persistAuditChain, auditIntegrityGate, launcherEnforce, AUDIT_CHAIN_PATH, canarySpecFromMission, CANARY_READONLY_MODES, tickWave, selectWave, runGovernedChild, waveMaxFromEnv, declaredWriteSet, WAVE_DEFAULT_MAX, WAVE_HARD_MAX, REAL_RUNNER_SHARED_WRITESET, ISOLATED_RUNNER_SHARED_WRITESET };
if (require.main === module) { if (process.env.ODG_TICK_WAVE === "1") mainWave(); else main(); }
export {};

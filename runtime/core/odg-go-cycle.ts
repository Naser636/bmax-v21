#!/usr/bin/env node
"use strict";

/*
 * V16.4 §2 "ODG GO" + §7 (close the loop) + §10 scenario J — ONE bounded, governed, traced, stoppable cycle.
 *
 * NOT a second orchestrator / scheduler / decision engine and NOT a button that launches a provider. It COMPOSES the
 * canonical components, in a fixed order, for ONE cycle:
 *   1 TRUTH_LOCK            truth-lock-gate result (injected port; fail-closed ⇒ STARTUP_REFUSED, nothing else runs)
 *   2 STATE_READ            canonical evidence/registers + mission-ledger proven set + attempt-log (READ-ONLY port)
 *   3 PROBLEMS_OPPORTUNITIES CP8 gaps + register statuses + Radar grant/admission + knowledge usableFor/admissible
 *   4 SELECT                odg-strategic-register.buildRegister → mission-priority-selector.selectNextExplained
 *                           (TIE_EXPLAINED / DECISION_REQUIRED kept verbatim; never an id pick) = strategicSelection;
 *                           V166 GO-ACT-1: + actionableSelection = the SAME selector over the SAME candidates where items
 *                           without an AUTHORIZED next step are excluded (feasibility, not scoring). The cycle proceeds with
 *                           the actionable item when the strategic one is unauthorized, and records an owner request for it.
 *   5 DECOMPOSE             decomposition-planner.chooseStrategy on the selected item's contract
 *   6 STRATEGY              odg-strategy-mode-selector.selectStrategyMode (nextStrategyAfterFailure only after a failure)
 *   7 AUTHORIZE             intelligence-loop.runCycle (DISCOVER→AUTHORIZE; halts at PROPOSED without an EXTERNAL
 *                           authorization) + mission-scheduler eligibility (pre-authorized allowlist, proven dedup)
 *   8 EXECUTE               mission-scheduler.schedulerStep (stop → bounds → select → authorize → dedup → dispatch).
 *                           dispatch is an injected port; it is reachable ONLY for a canonically authorized NATIVE mission
 *                           in an isolated workspace, and ONLY with mode EXECUTE. PROVIDER/HYBRID ⇒ odg-sovereign-delegation
 *                           RECORD (state CREATED) only — no provider is ever launched by this module.
 *   9 EVIDENCE              decisions digest + cycle summary written through the injected (out-dir-confined) writer
 *  10 NEXT_SELECTION        prepared-mission package + the selector's next choice after the current item
 * STOP between every step: canonical emergency stop (ODG_SCHEDULER_STOP=1, as schedulerStep) + injected stop port
 * (STOP file / SIGINT / SIGTERM) + wall-clock deadline + max steps. Every step and every stop is appended to the trace.
 * Idempotent re-run: runId = digest of the state inputs + mode; a prior identical cycle is reported (duplicateOf) and an
 * already-dispatched (runId, mission) is never dispatched again (plus the ledger proven-gate inside schedulerStep).
 *
 * PURE apart from the injected ports (no fs, no child_process, no network in this file). Honesty: the step order, the
 * contract→spec mapping used for DECOMPOSE, the stop rules and the pass criteria were written by the technical provider
 * (Claude Code); every DECISION in the trace is produced by the named ODG component.
 */

const crypto = require("crypto");
const REG = require("./odg-strategic-register.js");
const SEL = require("./mission-priority-selector.js");
const DP = require("./decomposition-planner.js");
const SM = require("./odg-strategy-mode-selector.js");
const IL = require("./intelligence-loop.js");
const SCHED = require("./mission-scheduler.js");
const SD = require("./odg-sovereign-delegation.js");
const AS = require("./odg-authorization-scope.js");

const STEPS = Object.freeze(["TRUTH_LOCK", "STATE_READ", "PROBLEMS_OPPORTUNITIES", "SELECT", "DECOMPOSE", "STRATEGY", "AUTHORIZE", "EXECUTE", "EVIDENCE", "NEXT_SELECTION"]);
/* deadlineMs: V16.9 Phase 1b raised 120000 → 900000. Measured cause: the real H experiment (V168_H_GO_EXECUTE_TRACE.jsonl)
 * spent 180.1 s inside EXECUTE and the 120 s default stopped the cycle (DEADLINE) before EVIDENCE/NEXT_SELECTION;
 * CP10 asked for ≥ 600000. 900000 = the CLI's own dispatch kill bound (DISPATCH_TIMEOUT_MS 600000 in odg-go.ts) + 300 s
 * for the other nine steps, so a dispatch that runs to its own bound still leaves the cycle time to record its evidence.
 * Still one bounded cycle (no loop); --deadline-ms overrides it. */
const DEADLINE_HISTORY = Object.freeze({ oldMs: 120000, newMs: 900000, cause: "H EXECUTE 180.1 s > 120 s default ⇒ STOPPED before EVIDENCE (docs/odg/evidence/V168_H_GO_EXECUTE_TRACE.jsonl; CP10 limit)", rule: "deadline ≥ dispatch kill bound (600 s) + 300 s for the other steps" });
const DEFAULTS = Object.freeze({ mode: "DRY", maxSteps: STEPS.length, deadlineMs: DEADLINE_HISTORY.newMs });
const DRY_MARK = "DRY_RUN_NOT_DISPATCHED";

const DECIDED_BY: any = Object.freeze({
  TRUTH_LOCK: "ODG truth-lock-gate.truthLockGate (evaluateTruthLock policy)",
  STATE_READ: "GO state port (provider-written reader) over canonical files; mission-ledger.verifyLedger + mission-attempt-log.readAttempts (read-only)",
  PROBLEMS_OPPORTUNITIES: "CP8.gaps + odg-strategic-register statuses + Radar grant/admission evidence + odg-knowledge-intelligence.usableFor/admissible",
  SELECT: "ODG odg-strategic-register.buildRegister + mission-priority-selector.selectNextExplained (strategic + actionable — same selector; actionable feasibility filter GO-ACT-1 is a provider rule) + odg-authorization-scope.deriveAuthorizationScope",
  DECOMPOSE: "ODG decomposition-planner.chooseStrategy (contract→spec mapping is a provider rule)",
  STRATEGY: "ODG odg-strategy-mode-selector.selectStrategyMode",
  AUTHORIZE: "ODG intelligence-loop.runCycle (DISCOVER→AUTHORIZE) + mission-scheduler.evaluateEligibility + odg-authorization-scope.deriveAuthorizationScope (V166 scoped steps)",
  EXECUTE: "ODG mission-scheduler.schedulerStep (+ odg-sovereign-delegation.createMission records)",
  EVIDENCE: "GO (provider-written digest/summary)",
  NEXT_SELECTION: "ODG mission-priority-selector.selectNextExplained (current item removed) + prepared-mission package",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function canon(v: any): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
function sha(v: any): string { return crypto.createHash("sha256").update(typeof v === "string" ? v : canon(v)).digest("hex"); }
function iso(ms: number): string { return new Date(ms).toISOString(); }
/* decisions digest: every step decision except TRUTH_LOCK git details and any `volatile` block (e.g. the attempt-log
 * size, which the live timer grows independently of this cycle's decisions). Same state ⇒ same digest. */
function digestOf(steps: any[]): string {
  return sha(steps.map((s: any) => {
    const d = s.step === "TRUTH_LOCK" ? { status: s.decision && s.decision.status } : (isObj(s.decision) ? Object.fromEntries(Object.entries(s.decision).filter(([k]) => k !== "volatile")) : s.decision);
    return { step: s.step, status: s.status, decision: d };
  }));
}
function plain(v: any): any { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

/* contractOf(state, id) — the WORK_ITEM_CONTRACT record of an A–P register item (null for other items). */
function contractOf(state: any, id: string): any {
  const cs = state && state.sources && state.sources.contracts && state.sources.contracts.data ? arr(state.sources.contracts.data.contracts) : [];
  return cs.find((c: any) => String(c.scenario) === id) || null;
}
/* contract authorization as declared DATA (never minted here): approved only when state AUTHORIZED + authorizedBy set. */
function declaredAuthorization(contract: any): any {
  if (!contract || contract.state !== "AUTHORIZED" || typeof contract.authorizedBy !== "string" || !contract.authorizedBy.trim()) return null;
  return { approved: true, authorizedBy: contract.authorizedBy };
}
/* PROVIDER RULE (declared): the decomposition-planner spec for a work item = one architecture entry per write_set path,
 * role = objective, contract = acceptance criteria. Items without a contract have no declared scope ⇒ NOT_MEASURED. */
function specOf(item: any, contract: any): any {
  const w = contract && isObj(contract.WORK_ITEM_CONTRACT) ? contract.WORK_ITEM_CONTRACT : null;
  if (!w) return null;
  return { name: `${item.id} ${String(w.objective || "")}`, architecture: arr(w.write_set).map((p: any) => ({ path: String(p), role: String(w.objective || ""), contract: arr(w.acceptance_criteria).join("; "), dependsOn: [] })) };
}
/* scopedAuthorization(state, contract) — V166: the owner-scoped step state of a contract carrying an `authorization` block
 * (odg-authorization-scope; PURE derivation over committed evidence — the contract state is never rewritten). Evidence is
 * read by the STATE port as state.authorizationEvidence[scenario] = { inspection, experiment }. null ⇒ not applicable. */
function scopedAuthorization(state: any, contract: any): any {
  if (!contract || !isObj(contract.authorization)) return null;
  const evAll = state && isObj(state.authorizationEvidence) ? state.authorizationEvidence : {};
  const s = AS.deriveAuthorizationScope(contract, evAll[String(contract.scenario)] || {});
  return s && s.applicable ? s : null;
}
/* the scoped equivalent of declaredAuthorization: an execution approval ONLY when the CURRENT step is an authorized
 * execution step (derived from the owner's prior authorization); provider/docs/inspection steps never approve dispatch. */
function scopedExecutionAuthorization(scope: any): any {
  if (!scope || scope.executionAuthorized !== true) return null;
  return { approved: true, authorizedBy: `${scope.owner.by} — ${scope.owner.source} (scoped step ${scope.currentStep}, derived by odg-authorization-scope from the recorded inspection ACCEPT; contract ${scope.contractSha256.slice(0, 12)})` };
}
function scopeSummary(scope: any): any {
  if (!scope) return null;
  return { scenario: scope.scenario, contractSha256: scope.contractSha256, currentStep: scope.currentStep, currentStepKind: scope.currentStepKind, currentStepAuthorized: scope.currentStepAuthorized, nextStep: scope.nextStep, nextStepAuthorized: scope.nextStepAuthorized, authorizedSteps: scope.authorizedSteps, derivedSteps: scope.derivedSteps.map((d: any) => ({ step: d.step, rule: d.rule })), validatedSteps: scope.validatedSteps.map((v: any) => v.step), executionAuthorized: scope.executionAuthorized, reason: scope.reason,
    report: scope.executionAuthorized ? `${scope.currentStep} AUTHORIZED (execution step, derived) — dispatch still needs NATIVE + isolated` : scope.currentStepAuthorized ? `${scope.currentStep} AUTHORIZED — provider/docs work, not native dispatch` : `${scope.currentStep} NOT authorized` };
}
/* V166 GO-DT-1 (provider-authored rule; #936 inspection MED): a SCOPED execution step dispatches ONLY to the target the
 * contract itself declares for that step — authorization.dispatchTargets[step] = { command: repo-relative runner path,
 * args?: [plain tokens], writeSet: [repo-relative paths] } with command and every writeSet path ⊆ WORK_ITEM_CONTRACT.write_set.
 * The target is part of the contract entry, hence bound to the inspected contractSha256. No declared/valid target ⇒
 * NO_DISPATCH_TARGET (fail-closed; NEVER a fallback to `odg-run <id>`). Plain AUTHORIZED contracts keep the existing path. */
const DISPATCH_TARGET_RULE = "GO-DT-1 (provider rule): a scoped execution step is dispatched only to contract.authorization.dispatchTargets[step] = { command, args?, writeSet } (command + writeSet ⊆ WORK_ITEM_CONTRACT.write_set, repo-relative, no '..'); absent/invalid ⇒ NO_DISPATCH_TARGET fail-closed, never a fallback to odg-run <id>; plain AUTHORIZED contracts keep the existing odg-run path. LIMIT (stated, not hidden): the target runs on the host (not under bwrap — the provider-sandbox profile cannot bind the /home scratch + node_modules without widening its confidential-prefix guard), so only writes INSIDE the scratch are confined (git status --ignored, every entry ⊆ target writeSet, pristine scratch required); out-of-scratch writes ($HOME, /tmp, main repo) are NOT confined ⇒ dispatch is fail-closed by default (UNSANDBOXED_TARGET_NOT_OPTED_IN) and runs only with the explicit opt-in allowUnsandboxedTarget (CLI --allow-unsandboxed-target), recorded in the trace";
const SANDBOX_LIMIT = Object.freeze({ sandboxed: false, scratchWrites: "CONFINED (git status --porcelain=v1 -z --untracked-files=all --ignored ⊆ target writeSet; pristine scratch required)", outOfScratchWrites: "NOT CONFINED (host process, no bwrap)" });
function relPathOk(p: any): boolean { return typeof p === "string" && p.length > 0 && p.length <= 300 && !p.startsWith("/") && !/\\|\0/.test(p) && !p.replace(/\/$/, "").split("/").some((seg: string) => seg === ".." || seg === "." || seg === "") && /^[A-Za-z0-9._\/-]+$/.test(p); }
function withinWriteSet(p: string, ws: string[]): boolean { return ws.some((w: string) => p === w || (w.endsWith("/") && p.startsWith(w))); }
function resolveDispatchTarget(contract: any, step: string | null): any {
  const why = (code: string, reason: string) => ({ ok: false, code, step, rule: DISPATCH_TARGET_RULE, reason: `${code}: ${reason}` });
  if (!contract || !step) return why("NO_DISPATCH_TARGET", "no contract/step");
  const a = isObj(contract.authorization) ? contract.authorization : null;
  const t = a && isObj(a.dispatchTargets) ? a.dispatchTargets[step] : null;
  if (!isObj(t)) return why("NO_DISPATCH_TARGET", `contract ${contract.scenario} declares no authorization.dispatchTargets.${step} — a future owner-authorized, inspected revision must declare one (no fallback to odg-run ${contract.scenario})`);
  const ws = arr(contract.WORK_ITEM_CONTRACT && contract.WORK_ITEM_CONTRACT.write_set).map(String);
  if (!relPathOk(t.command) || String(t.command).endsWith("/") || String(t.command).startsWith("-")) return why("INVALID_DISPATCH_TARGET", "command must be a repo-relative path (no '..', no absolute path)");
  const args = t.args === undefined ? [] : t.args;
  if (!Array.isArray(args) || !args.every((x: any) => typeof x === "string" && /^[A-Za-z0-9._=:\/-]{1,200}$/.test(x) && !x.split("/").includes("..") && !x.startsWith("-"))) return why("INVALID_DISPATCH_TARGET", "args must be plain positional tokens (none may start with '-')");
  const tws = arr(t.writeSet);
  if (!tws.length || !tws.every(relPathOk)) return why("INVALID_DISPATCH_TARGET", "writeSet must be a non-empty list of repo-relative paths");
  const outside = [t.command, ...tws].filter((x: string) => !withinWriteSet(x, ws));
  if (outside.length) return why("DISPATCH_TARGET_OUTSIDE_WRITE_SET", `${outside.join(", ")} ⊄ WORK_ITEM_CONTRACT.write_set`);
  return { ok: true, step, rule: DISPATCH_TARGET_RULE, target: { step, command: String(t.command), args: args.map(String), writeSet: tws.map(String) } };
}
/* V17.4 GO-DTO-1 (provider-authored rule, Claude Code; owner V171 "Corrections et améliorations du code"): the dispatch
 * timeout of a contract-DECLARED scoped target is derived from the contract's OWN pre-registered caps (never edited here),
 * so GO does not SIGKILL a capped long experiment (J2) at the plain 600 s. Pure; recorded in the EXECUTE trace. */
const DISPATCH_TIMEOUT_DEFAULT_MS = 600000;
const DISPATCH_TIMEOUT_CEILING_MS = 12 * 3600 * 1000;
const DISPATCH_TIMEOUT_MARGIN_MS = 120000;
const DISPATCH_TIMEOUT_RULE = "GO-DTO-1 (provider rule): plain odg-run dispatch ⇒ 600000 ms. A contract-declared scoped target ⇒ from WORK_ITEM_CONTRACT.preRegistration.caps: (a) caps absent, or neither maxRunWallMs nor perTrialWallMs declared ⇒ 600000; (b) maxRunWallMs declared ⇒ maxRunWallMs + margin; (c) else perTrialWallMs × trials + margin, trials = (|dataset.replication| + |dataset.heldOut|) × |keys(arms)| × |decoding.seeds| (an UPPER bound of the rows the runner may execute — every arm on every task at every seed); trials not derivable ⇒ the ceiling (conservative: a capped run is bounded by its own caps and is never killed early); (d) a declared wall cap (maxRunWallMs / perTrialWallMs) that is not a finite positive number ≤ Number.MAX_SAFE_INTEGER (negative, string, NaN, null, 1e300 …) ⇒ dispatch REFUSED, code GO-DTO-1_MALFORMED_CAPS (fail-closed like GO-DT-1); a valid but huge result ⇒ clamped to the ceiling. Value = Math.ceil(result) (the exact integer odg-go.ts must use; any mismatch there ⇒ refused). Cycle deadline: when a declared target will be dispatched, effectiveDeadline = max(requested deadline, timeout + 300000) (the 300000 margin covers the steps before and after EXECUTE; elapsed-at-EXECUTE recorded) — extended, never refused, even over an explicit --deadline-ms (recorded): the dispatch is already bounded by its own timeout ≤ the ceiling, and a DEADLINE stop after it would only discard the EVIDENCE/NEXT_SELECTION of a run that already happened. results floored at 600000 (never below the plain timeout); margin 120000 ms; HARD CEILING 43200000 ms (12 h) never exceeded. Timeout kill semantics unchanged (SIGKILL ⇒ EXECUTED_FAIL; writes-confinement check still applied). The dispatch runs as its own process group (detached); timeout, STOP file, SIGTERM/SIGINT to GO or ODG_SCHEDULER_STOP=1 ⇒ SIGTERM to the group, 10 s grace, SIGKILL to the group, group exit awaited before the writes-confinement check";
const DISPATCH_DEADLINE_MARGIN_MS = 300000;
function posNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER; }
function strList(v: any): string[] | null { return Array.isArray(v) && v.every((x: any) => typeof x === "string") ? v : null; }
function deriveDispatchTimeout(contract: any, target: any): any {
  const base = { rule: DISPATCH_TIMEOUT_RULE, ruleId: "GO-DTO-1", authoredBy: "PROVIDER (Claude Code)", ceilingMs: DISPATCH_TIMEOUT_CEILING_MS, marginMs: DISPATCH_TIMEOUT_MARGIN_MS, defaultMs: DISPATCH_TIMEOUT_DEFAULT_MS };
  const out = (timeoutMs: number, basis: string, derivation: any) => ({ ...base, ok: true, timeoutMs: Math.ceil(timeoutMs), basis, derivation });
  const refuse = (field: string, value: any) => ({ ...base, ok: false, code: "GO-DTO-1_MALFORMED_CAPS", timeoutMs: null, basis: "REFUSED", derivation: { field, value: typeof value === "number" && !Number.isFinite(value) ? String(value) : value, valueType: value === null ? "null" : typeof value }, reason: `GO-DTO-1_MALFORMED_CAPS: ${field} = ${String(value)} is not a finite positive number ≤ MAX_SAFE_INTEGER ⇒ dispatch refused (fail-closed; the contract must be corrected by an owner-authorized, inspected revision)` });
  if (!target) return out(DISPATCH_TIMEOUT_DEFAULT_MS, "PLAIN_DISPATCH", { reason: "no declared target ⇒ plain odg-run timeout" });
  const pr = contract && isObj(contract.WORK_ITEM_CONTRACT) && isObj(contract.WORK_ITEM_CONTRACT.preRegistration) ? contract.WORK_ITEM_CONTRACT.preRegistration : null;
  const caps = pr && isObj(pr.caps) ? pr.caps : null;
  if (!caps || (caps.maxRunWallMs === undefined && caps.perTrialWallMs === undefined)) return out(DISPATCH_TIMEOUT_DEFAULT_MS, "NO_DECLARED_WALL_CAP", { capsFields: caps ? Object.keys(caps) : null, reason: "contract declares no maxRunWallMs/perTrialWallMs ⇒ default" });
  const clamp = (raw: number, basis: string, derivation: any) => raw > DISPATCH_TIMEOUT_CEILING_MS ? out(DISPATCH_TIMEOUT_CEILING_MS, "CEILING", { ...derivation, rawMs: raw, clampedFrom: basis }) : out(Math.max(DISPATCH_TIMEOUT_DEFAULT_MS, raw), basis, { ...derivation, rawMs: raw });
  if (caps.maxRunWallMs !== undefined) {
    if (!posNum(caps.maxRunWallMs)) return refuse("preRegistration.caps.maxRunWallMs", caps.maxRunWallMs);
    return clamp(caps.maxRunWallMs + DISPATCH_TIMEOUT_MARGIN_MS, "MAX_RUN_WALL_MS", { field: "preRegistration.caps.maxRunWallMs", maxRunWallMs: caps.maxRunWallMs });
  }
  if (!posNum(caps.perTrialWallMs)) return refuse("preRegistration.caps.perTrialWallMs", caps.perTrialWallMs);
  const ds = isObj(pr.dataset) ? pr.dataset : {};
  const repl = strList(ds.replication), held = strList(ds.heldOut);
  const arms = isObj(pr.arms) ? Object.keys(pr.arms) : null;
  const seeds = isObj(pr.decoding) ? (Array.isArray(pr.decoding.seeds) && pr.decoding.seeds.every((x: any) => typeof x === "number" && Number.isFinite(x)) ? pr.decoding.seeds : null) : null;
  const tasks = repl || held ? (repl ? repl.length : 0) + (held ? held.length : 0) : 0;
  const fields = { perTrialWallMs: caps.perTrialWallMs, "dataset.replication": repl ? repl.length : null, "dataset.heldOut": held ? held.length : null, arms: arms ? arms.length : null, "decoding.seeds": seeds ? seeds.length : null };
  if (!tasks || !arms || !arms.length || !seeds || !seeds.length) return out(DISPATCH_TIMEOUT_CEILING_MS, "CEILING", { fields, reason: "TRIALS_NOT_DERIVABLE ⇒ conservative ceiling" });
  const trials = tasks * arms.length * seeds.length;
  return clamp(caps.perTrialWallMs * trials + DISPATCH_TIMEOUT_MARGIN_MS, "PER_TRIAL_WALL_MS_X_TRIALS", { fields, tasks, armCount: arms.length, seedCount: seeds.length, trials, formula: "perTrialWallMs × (|replication|+|heldOut|) × |arms| × |seeds| + margin" });
}
const SPEC_RULE = "GO-DEC-1 (provider rule): spec.architecture = one entry per WORK_ITEM_CONTRACT.write_set path (role = objective, contract = acceptance_criteria joined); no contract ⇒ NOT_MEASURED";

function selectorOptions(): any { return { weights: REG.WEIGHTS, directions: REG.DIRECTIONS }; }

/* V166 GO-ACT-1 (PROVIDER-AUTHORED rule, Claude Code; owner V165 §2 "sélection et priorisation des missions", V166 §5). */
const ACTIONABLE_RULE = "authorization is a feasibility constraint, priority is the ranking: ODG works on the best item it is allowed to do, and asks the owner for the best item overall";
const ACTIONABLE_RULE_DETAIL = "GO-ACT-1 (provider-authored, Claude Code): actionableSelection = mission-priority-selector.selectNextExplained over the SAME register candidates and options, with every item lacking an AUTHORIZED next step mapped to the non-selectable status NOT_AUTHORIZED_NOW (excluded with its reason; still counted for dependency/unblock edges) — no new scoring, same ties semantics. An item has an AUTHORIZED next step iff it is not owner-gated (requiresOwnerAuthorization) AND (its WORK_ITEM_CONTRACT is AUTHORIZED with authorizedBy, OR odg-authorization-scope derives its CURRENT step authorized). PROPOSED is never authorized. Applied only when the strategic decision chose an item (SELECTED/TIE_EXPLAINED) that is itself not actionable; DECISION_REQUIRED stays a halt. Dispatch still only through the existing NATIVE + isolated path; provider/docs steps are reported, not dispatched.";
const NOT_AUTHORIZED_NOW = "NOT_AUTHORIZED_NOW";
/* actionabilityOf(state, item) — does this register item currently have an AUTHORIZED next step? (never mints anything) */
function actionabilityOf(state: any, item: any): any {
  if (!item) return { actionable: false, basis: null, reason: "no item" };
  if (item.requiresOwnerAuthorization === true) return { actionable: false, basis: null, reason: `owner-gated (${item.ownerReason || "requiresOwnerAuthorization"}) — never auto-selected` };
  const contract = contractOf(state, item.id);
  if (!contract) return { actionable: false, basis: null, reason: "no WORK_ITEM_CONTRACT ⇒ no authorization to act on" };
  if (declaredAuthorization(contract)) return { actionable: true, basis: "CONTRACT_AUTHORIZED", reason: `contract AUTHORIZED by ${contract.authorizedBy}` };
  const scope = scopedAuthorization(state, contract);
  if (scope && scope.currentStepAuthorized === true) return { actionable: true, basis: "SCOPED_STEP_AUTHORIZED", step: scope.currentStep, stepKind: scope.currentStepKind, executionAuthorized: scope.executionAuthorized === true, reason: `scoped step ${scope.currentStep} (${scope.currentStepKind}) authorized by ${scope.owner.by.split(" — ")[0]} (odg-authorization-scope)` };
  return { actionable: false, basis: null, reason: scope ? `scoped: current step ${scope.currentStep} NOT authorized (${scope.reason})` : `contract ${contract.state || "PROPOSED"} — no authorized next step (ODG never self-authorizes)` };
}
function actionableCandidates(state: any, register: any): any[] {
  const byId = new Map(register.items.map((it: any) => [it.id, it]));
  return REG.toSelectorCandidates(register).map((c: any) => actionabilityOf(state, byId.get(c.id)).actionable ? c : { ...c, status: NOT_AUTHORIZED_NOW });
}
function actionableOptions(): any {
  const SELX = SEL.EXPLAINED_DEFAULTS || {};
  return { ...selectorOptions(), nonSelectableStatuses: { ...(SELX.nonSelectableStatuses || {}), [NOT_AUTHORIZED_NOW]: "no AUTHORIZED next step now (GO-ACT-1 feasibility constraint; ranking unchanged)" } };
}
/* V17.4 GO-ORD-1 (provider rule; owner directive "CTO — ARBITRAGE PROPRIÉTAIRE ET EXÉCUTION G2 → J2", 2026-11-24): consume a
 * COMMITTED owner order-decision record ONLY to resolve an actionable DECISION_REQUIRED tie. Never strategic, never a
 * non-tied case, never an authorization (the chosen item must already be actionable), never a score/ranking change. */
const OWNER_ORDER_RULE = "GO-ORD-1: when actionableSelection is DECISION_REQUIRED with tiedSet T, a committed record applies iff kind = OWNER_ORDER_DECISION and set(record.tiedSet) = set(T); the chosen item is the first element of record.order that is in T and still actionable; otherwise the record is ignored (reason recorded). Strategic selection, authorization and scores are untouched.";
function resolveOwnerOrder(state: any, register: any, tied: string[]): any {
  const records = arr(state && state.ownerOrderDecisions).filter((x: any) => x && typeof x === "object");
  if (!tied.length || !records.length) return null;
  const T = [...new Set(tied.map(String))].sort();
  const considered: any[] = [];
  for (const rec of records) {
    const at = rec.recordPath || null;
    if (rec.kind !== "OWNER_ORDER_DECISION") { considered.push({ record: at, applied: false, reason: `kind ${rec.kind} ≠ OWNER_ORDER_DECISION` }); continue; }
    if (rec.schema !== "odg-owner-order-decision/1") { considered.push({ record: at, applied: false, reason: `schema ${rec.schema} ≠ odg-owner-order-decision/1` }); continue; }
    if (typeof rec.issuer !== "string" || !rec.issuer.trim().toUpperCase().startsWith("OWNER")) { considered.push({ record: at, applied: false, reason: "issuer is not the OWNER" }); continue; }
    if (typeof rec.source !== "string" || !rec.source.trim() || !Array.isArray(rec.quote) || !rec.quote.length) { considered.push({ record: at, applied: false, reason: "record lacks an owner source citation and verbatim quotes" }); continue; }
    const R = [...new Set(arr(rec.tiedSet).map(String))].sort();
    if (!Array.isArray(rec.tiedSet) || canon(R) !== canon(T)) { considered.push({ record: at, applied: false, reason: `record tiedSet ${R.join("/")} ≠ actionable tiedSet ${T.join("/")} (set equality required)` }); continue; }
    const skipped: any[] = [];
    let chosen: any = null;
    for (const id of arr(rec.order).map(String)) {
      if (!T.includes(id)) { skipped.push({ id, reason: "not in the actionable tiedSet" }); continue; }
      const it = register.items.find((x: any) => x.id === id);
      const a = actionabilityOf(state, it);
      if (!a.actionable) { skipped.push({ id, reason: `not actionable: ${a.reason}` }); continue; }
      chosen = it; break;
    }
    if (!chosen) { considered.push({ record: at, applied: false, reason: "no element of record.order is both in the tiedSet and still actionable", skipped }); continue; }
    return { rule: OWNER_ORDER_RULE, applied: true, chosen: chosen.id, resolvedBy: `OWNER_ORDER_DECISION ${at}`, record: at, date: rec.date || null, source: rec.source || null, quote: arr(rec.quote), order: arr(rec.order), tiedSet: T, skipped, considered, item: chosen };
  }
  return { rule: OWNER_ORDER_RULE, applied: false, chosen: null, considered };
}
/* V17.4 GO-ORD-2 (provider rule; owner command "COMMANDE CTO — FINALISATION G2 → J2 → CHECKPOINT DE TRANSITION", 2026-11-24):
 * consume a COMMITTED owner selection-decision record ONLY to resolve an actionable DECISION_REQUIRED that is NOT a tie
 * (the selector's uncertainty rule: proposed but not selected). Never strategic, never a tie (GO-ORD-1), never an
 * authorization (the item must already be actionable), never a score/threshold change, at most one dispatch. */
const OWNER_SELECTION_RULE = "GO-ORD-2: when actionableSelection is DECISION_REQUIRED with no tie (tiedSet empty or singleton) and a PROPOSED item P, a committed record applies iff schema = odg-owner-selection-decision/1, kind = OWNER_SELECTION_DECISION, issuer OWNER, an owner source and non-empty verbatim quotes, record.item = P, record.contractSha256 = contractSha256(current contract of P) (stale ⇒ ignored), P is actionable (actionabilityOf — never creates authorization), and P was never dispatched under it (no DISPATCHED P in the GO trace, P not proven in the ledger, no committed experiment record for P, and NO persistent one-shot claim — maxDispatches 1), and its precondition is verified in code (pr 965 merged ⇔ the GO-DTO-1 rule is present in this GO); otherwise the record is ignored (reason recorded). The selector's uncertainty explanation is kept verbatim. ONE-SHOT CLAIM: in EXECUTE mode only, right before dispatch (last authorization check), GO atomically creates (O_EXCL) a claim <git common dir of --repo>/odg-go-claims/<sha256(canon(record))[0..16]>-<item>.claim through the injected claims port — independent of --out; EEXIST ⇒ GO-ORD-2_ALREADY_CLAIMED (0 dispatch); the declared scratch already holding the item's experiment record ⇒ GO-ORD-2_SCRATCH_EXPERIMENT_PRESENT; no claims port ⇒ GO-ORD-2_NO_CLAIM_STORE. SELECT also refuses an already-claimed record. DRY never claims. GO never deletes a claim: a failed or killed run stays claimed — a re-run needs a NEW owner decision record. Strategic selection, ties, authorization, scores and thresholds are untouched.";
/* GO-ORD-2 precondition verification BY CODE (a record's precondition is never taken on trust). */
const OWNER_SELECTION_PRECONDITIONS: Record<string, () => any> = {
  "965": () => ({ ok: typeof DISPATCH_TIMEOUT_RULE === "string" && /^GO-DTO-1/.test(DISPATCH_TIMEOUT_RULE) && typeof deriveDispatchTimeout === "function", evidence: "GO-DTO-1 (#965) present: DISPATCH_TIMEOUT_RULE + deriveDispatchTimeout in odg-go-cycle" }),
};
function ownerSelectionClaimKey(rec: any): string { const { recordPath: _p, ...body } = rec || {}; return `${sha(canon(body)).slice(0, 16)}-${String(rec && rec.item)}`; }
function resolveOwnerSelection(state: any, register: any, act: any, priorTrace: any[], claims?: any): any {
  const records = arr(state && state.ownerSelectionDecisions).filter((x: any) => x && typeof x === "object");
  if (!records.length || !act || act.decision !== "DECISION_REQUIRED") return null;
  const tied = arr(act.tiedSet).map((x: any) => String(x && typeof x === "object" ? x.id : x));
  const proposed = act.proposed ? String(act.proposed.id) : null;
  const selector = { decision: act.decision, proposed: act.proposed || null, tiedSet: tied, thresholds: act.thresholds || null, justification: act.justification || null };
  if (new Set(tied).size > 1) return { rule: OWNER_SELECTION_RULE, applied: false, chosen: null, notApplicable: `actionable DECISION_REQUIRED is a tie (${tied.join("/")}) ⇒ GO-ORD-1 territory, GO-ORD-2 not applicable`, selector, considered: [] };
  if (!proposed) return { rule: OWNER_SELECTION_RULE, applied: false, chosen: null, notApplicable: "no proposed item", selector, considered: [] };
  const considered: any[] = [];
  for (const rec of records) {
    const at = rec.recordPath || null;
    const no = (reason: string) => considered.push({ record: at, applied: false, reason });
    if (rec.schema !== "odg-owner-selection-decision/1") { no(`schema ${rec.schema} ≠ odg-owner-selection-decision/1`); continue; }
    if (rec.kind !== "OWNER_SELECTION_DECISION") { no(`kind ${rec.kind} ≠ OWNER_SELECTION_DECISION`); continue; }
    if (typeof rec.issuer !== "string" || !rec.issuer.trim().toUpperCase().startsWith("OWNER")) { no("issuer is not the OWNER"); continue; }
    if (typeof rec.source !== "string" || !rec.source.trim() || !Array.isArray(rec.quote) || !rec.quote.length || !rec.quote.every((q: any) => typeof q === "string" && q.trim())) { no("record lacks an owner source citation and verbatim quotes"); continue; }
    if (rec.item !== proposed) { no(`record item ${rec.item} ≠ proposed ${proposed}`); continue; }
    const contract = contractOf(state, proposed);
    const cur = contract ? AS.contractSha256(contract) : null;
    if (!cur || rec.contractSha256 !== cur) { no(`STALE: record contractSha256 ${String(rec.contractSha256).slice(0, 12)} ≠ current ${cur ? cur.slice(0, 12) : "none"} ⇒ ignored`); continue; }
    const pc = rec.precondition;
    let preconditionCheck: any = null;
    if (pc !== undefined) {
      const f = isObj(pc) && pc.merged === true ? OWNER_SELECTION_PRECONDITIONS[String(pc.pr)] : null;
      preconditionCheck = f ? { pr: pc.pr, ...f() } : { pr: isObj(pc) ? pc.pr : null, ok: false, evidence: "precondition not verifiable by code" };
      if (!preconditionCheck.ok) { no(`precondition not met: ${preconditionCheck.evidence}`); continue; }
    }
    const claimKey = ownerSelectionClaimKey(rec);
    if (!claims || typeof claims.exists !== "function" || typeof claims.claim !== "function") { no("GO-ORD-2_NO_CLAIM_STORE: no persistent one-shot claim store ⇒ not applied (fail-closed)"); continue; }
    let claimed: any = null; try { claimed = claims.exists(claimKey); } catch (e: any) { claimed = { error: String((e && e.message) || e) }; }
    if (claimed) { no(`GO-ORD-2_ALREADY_CLAIMED: one-shot claim ${claimKey} exists (${claimed.error ? `unreadable: ${claimed.error}` : `runId ${claimed.runId || "?"} at ${claimed.at || "?"}`}) — maxDispatches 1 used; a re-run needs a new owner decision`); continue; }
    const it = register.items.find((x: any) => x.id === proposed);
    const a = actionabilityOf(state, it);
    if (!a.actionable) { no(`not actionable: ${a.reason} (GO-ORD-2 never creates authorization)`); continue; }
    const dispatchedBefore = arr(priorTrace).some((e: any) => e && e.kind === "DISPATCHED" && e.mission === proposed);
    const proven = arr(state.ledger && state.ledger.proven).map(String).includes(proposed);
    const ev = state.authorizationEvidence && state.authorizationEvidence[proposed];
    const experimentRecorded = !!(ev && ev.experiment);
    if (dispatchedBefore || proven || experimentRecorded) { no(`maxDispatches ${rec.scope && rec.scope.maxDispatches !== undefined ? rec.scope.maxDispatches : 1} already used: ${[dispatchedBefore ? "DISPATCHED in the GO trace" : null, proven ? "proven in the ledger" : null, experimentRecorded ? "committed experiment record present" : null].filter(Boolean).join(", ")}`); continue; }
    return { rule: OWNER_SELECTION_RULE, applied: true, chosen: proposed, resolvedBy: `OWNER_SELECTION_DECISION ${at}`, record: at, date: rec.date || null, directive: rec.directive || null, source: rec.source, quote: rec.quote.slice(), contractSha256: cur, recordSha256: sha(canon((({ recordPath: _p, ...b }: any) => b)(rec))), claimKey, preconditionCheck, maxDispatches: 1, actionability: a, selector, considered, item: it };
  }
  return { rule: OWNER_SELECTION_RULE, applied: false, chosen: null, selector, considered };
}
function selectionSummary(d: any): any {
  return { decision: d.decision, selected: d.selected ? d.selected.id : null, proposed: d.proposed ? d.proposed.id : null, tiedSet: arr(d.tiedSet), resolvedBy: d.resolvedBy || null, justification: d.justification };
}
function chosenId(d: any): string | null { return d && (d.decision === "SELECTED" || d.decision === "TIE_EXPLAINED") && d.selected ? d.selected.id : null; }

/*
 * V16.9 Phase 1b — GO RESUME (addendum §24 "À la reprise : … reprendre exactement au premier travail réellement incomplet").
 * resumeFromTrace(priorEntries) → frozen { resumable, reason, fromCycleSeq, runId, mode, priorStatus, stop, completedSteps,
 *   firstIncompleteStep, stepEntries, dispatched } — reads the LAST cycle of a GO trace (append-only go-trace.jsonl). It is
 * resumable only when that cycle ended STOPPED (deadline / STOP file / signal / max steps / emergency stop) or has no
 * CYCLE_END at all (process killed), with at least one step not completed. PURE (the trace is passed in).
 * runGoCycle with opts.resume = true (CLI --resume): TRUTH_LOCK and STATE_READ always run (the gate and the state digest
 * are re-established on the present world); then, ONLY if the state digest (runId) equals the stopped cycle's runId,
 * every step the stopped cycle completed is re-derived (pure, no side effect) and must reproduce its recorded decision
 * byte-for-byte (else the resume is abandoned and the rest runs fresh, recorded), and a completed EXECUTE is NEVER re-run:
 * its recorded status/decision is carried over (CARRIED_OVER_NOT_REDISPATCHED). The first incomplete step and the ones
 * after it run normally. Digest changed / not resumable ⇒ fresh cycle, RESUME entry says why. An EXECUTE interrupted
 * after DISPATCHED is never re-dispatched: the (runId, mission) dispatch guard below refuses it.
 */
const RESUMABLE_END = "STOPPED";
function resumeFromTrace(priorEntries: any): any {
  const all = arr(priorEntries).filter((e: any) => isObj(e));
  let start = -1; all.forEach((e: any, i: number) => { if (e.kind === "CYCLE_START") start = i; });
  const no = (reason: string, extra: any = {}) => Object.freeze({ resumable: false, reason, fromCycleSeq: null, runId: null, mode: null, priorStatus: null, stop: null, completedSteps: Object.freeze([]), firstIncompleteStep: null, stepEntries: Object.freeze({}), dispatched: Object.freeze([]), ...extra });
  if (start < 0) return no("no prior GO cycle in this trace");
  const cyc = all.slice(start);
  const head = cyc[0];
  const ends = cyc.filter((e: any) => e.kind === "CYCLE_END");
  const end = ends.length ? ends[ends.length - 1] : null;
  const stepEntries: any = {};
  for (const e of cyc) if (e.kind === "STEP" && STEPS.includes(e.step)) stepEntries[e.step] = e;
  const completed = STEPS.filter((st: string) => !!stepEntries[st]);
  const first = STEPS.find((st: string) => !stepEntries[st]) || null;
  const runIdOf = completed.length ? String(stepEntries[completed[completed.length - 1]].runId || "") : String((end && end.runId) || "");
  const stop = (cyc.filter((e: any) => e.kind === "STOP").pop()) || (end && end.stop) || null;
  const dispatched = cyc.filter((e: any) => e.kind === "DISPATCHED").map((e: any) => String(e.mission));
  const base = { fromCycleSeq: head.cycleSeq ?? null, runId: runIdOf || null, mode: head.mode || null, priorStatus: end ? end.status : null, stop: stop ? { reason: stop.reason || null, source: stop.source || null, beforeStep: stop.beforeStep || null } : null, completedSteps: Object.freeze(completed), firstIncompleteStep: first, stepEntries: Object.freeze(stepEntries), dispatched: Object.freeze(dispatched) };
  if (end && end.status !== RESUMABLE_END) return no(`last cycle ${head.cycleSeq} ended ${end.status} (not ${RESUMABLE_END}) — nothing to resume`, base);
  if (!first) return no(`last cycle ${head.cycleSeq} completed all ${STEPS.length} steps — nothing to resume`, base);
  if (!completed.includes("STATE_READ") || !runIdOf || runIdOf === "pending") return no(`last cycle ${head.cycleSeq} stopped before its state digest was recorded — nothing reusable`, base);
  return Object.freeze({ resumable: true, reason: `last cycle ${head.cycleSeq} ${end ? "ended STOPPED" : "has no CYCLE_END (killed)"}${stop ? ` (${stop.reason} before ${stop.beforeStep || "?"})` : ""}; first incomplete step ${first}`, ...base });
}
function decisionSha(entry: any): string { const d = entry && entry.decision; return sha(isObj(d) ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== "volatile")) : d === undefined ? null : d); }

/*
 * runGoCycle(opts, ports) -> Promise<result>. ports:
 *   now() → ms; truthLock() → truthLockGate result; readState() → { inputs:[{source,sha256}], sources:{contracts,v150,cp8,
 *   scenarioEvidence}, strategyEvidence, registerEvidence, radar:{grant,admission}, ledger:{proven:[],integrity},
 *   attempts:{count,last}, allowlist:{ids,source}, measured, strategyNow }; knowledge() → { claims:[…] };
 *   stopRequested() → { stop, reason, source }; trace:{ append(entry), readPrior() → entries[] }; writeSummary(obj);
 *   isolation(item) → { ok, workspace, reason }; dispatchNative(item, ctx) → { verified, detail } (EXECUTE only);
 *   pause() → Promise (between steps; real CLI may delay to make a mid-cycle STOP observable).
 */
async function runGoCycle(opts: any, ports: any): Promise<any> {
  const o = { ...DEFAULTS, ...(isObj(opts) ? opts : {}) };
  const mode = o.mode === "EXECUTE" ? "EXECUTE" : "DRY";
  const maxSteps = Math.max(0, Math.min(STEPS.length, Number.isFinite(o.maxSteps) ? Math.floor(o.maxSteps) : STEPS.length));
  let deadlineMs = Number.isFinite(o.deadlineMs) && o.deadlineMs > 0 ? o.deadlineMs : DEFAULTS.deadlineMs;
  const deadlineExplicit = isObj(opts) && opts.deadlineMs !== undefined;
  const now = () => Number(ports.now());
  const t0 = now();
  const prior = (() => { try { return arr(ports.trace.readPrior()); } catch { return []; } })();
  const cycleSeq = prior.filter((e: any) => e && e.kind === "CYCLE_START").length + 1;
  let runId = "pending";
  const steps: any[] = [];
  const counters = { dispatchCalls: 0, providerLaunched: 0, dispatchedMissions: [] as string[] };
  const append = (e: any) => { ports.trace.append({ ...e, runId, cycleSeq }); };
  const ctx: any = {};
  // V16.9 Phase 1b resume state (see resumeFromTrace). Active only after STATE_READ proves the state digest unchanged.
  const resumePlan = o.resume === true ? resumeFromTrace(prior) : null;
  const rs: any = { active: false, plan: resumePlan, rederived: [] as string[], carriedOver: [] as string[], abandoned: null as any };

  const stopCheck = (nextStep: string): any => {
    if (process.env.ODG_SCHEDULER_STOP === "1") return { reason: "EMERGENCY_STOP", source: "ODG_SCHEDULER_STOP=1 (canonical mission-scheduler emergency stop)" };
    let s: any = null; try { s = ports.stopRequested(); } catch { s = null; }
    if (s && s.stop === true) return { reason: s.reason || "STOP_REQUESTED", source: s.source || "stop port" };
    if (now() - t0 >= deadlineMs) return { reason: "DEADLINE", source: `wall-clock deadline ${deadlineMs}ms reached before ${nextStep}` };
    if (steps.filter((x) => x.counted).length >= maxSteps) return { reason: "MAX_STEPS", source: `max steps ${maxSteps} reached before ${nextStep}` };
    return null;
  };
  const finish = (status: string, extra: any = {}): any => {
    const decisionsDigest = digestOf(steps);
    const priorSame = prior.filter((e: any) => e && e.kind === "CYCLE_END" && e.runId === runId && e.decisionsDigest === decisionsDigest);
    const end = { kind: "CYCLE_END", status, mode, stepsRun: steps.map((s) => `${s.step}:${s.status}`), decisionsDigest, durationMs: now() - t0, endedAt: iso(now()), effectiveDeadlineMs: deadlineMs,
      dispatchCalls: counters.dispatchCalls, dispatchedMissions: counters.dispatchedMissions, providerLaunched: counters.providerLaunched,
      idempotent: priorSame.length > 0, duplicateOf: priorSame.length ? { cycleSeq: priorSame[0].cycleSeq, endedAt: priorSame[0].endedAt } : null,
      ...(rs.plan ? { resume: { resumed: !!(ctx.resume && ctx.resume.resumed), fromCycleSeq: rs.plan.fromCycleSeq, rederivedIdentical: rs.rederived.slice(), carriedOver: rs.carriedOver.slice(), abandoned: rs.abandoned, reason: ctx.resume ? ctx.resume.reason : `not evaluated (cycle ended before STATE_READ)` } } : {}), ...extra };
    append(end);
    return Object.freeze({ ...end, runId, cycleSeq, steps, context: ctx });
  };

  append({ kind: "CYCLE_START", mode, maxSteps, deadlineMs, startedAt: iso(t0), ...(o.resume === true ? { resumeRequested: true } : {}) });

  // the step runner: stop-check BEFORE every step, uniform trace entry AFTER it.
  const run = async (step: string, fn: () => any, counted = true): Promise<any> => {
    const st = stopCheck(step);
    if (st) { append({ kind: "STOP", beforeStep: step, ...st, at: iso(now()) }); return { stopped: st }; }
    const startedAt = now();
    let r: any;
    const priorEntry = rs.active && rs.plan && rs.plan.stepEntries[step] ? rs.plan.stepEntries[step] : null;
    let resumed: any = null;
    if (priorEntry && step === "EXECUTE") {
      // a completed EXECUTE is NEVER re-run on resume: its recorded outcome is carried over (no re-dispatch)
      r = { status: priorEntry.status, inputs: null, decision: priorEntry.decision, rationale: `carried over from stopped cycle ${rs.plan.fromCycleSeq} (state digest unchanged) — EXECUTE not re-run, nothing re-dispatched; original rationale: ${priorEntry.rationale}` };
      resumed = { fromCycleSeq: rs.plan.fromCycleSeq, mode: "CARRIED_OVER_NOT_REDISPATCHED" };
      rs.carriedOver.push(step);
    } else {
      try { r = await fn(); } catch (e: any) { r = { status: "ERROR", inputs: null, decision: { error: String((e && e.message) || e) }, rationale: "step threw — fail-closed (cycle halts)" }; }
      if (priorEntry) {
        const same = decisionSha({ decision: plain(r.decision) }) === decisionSha(priorEntry) && r.status === priorEntry.status;
        resumed = { fromCycleSeq: rs.plan.fromCycleSeq, mode: same ? "REDERIVED_IDENTICAL" : "REDERIVED_DIVERGED" };
        if (same) rs.rederived.push(step);
        else { rs.active = false; rs.abandoned = { atStep: step, reason: `re-derived ${step} differs from the stopped cycle's recorded decision ⇒ resume abandoned; this and every later step run fresh` }; append({ kind: "RESUME_ABANDONED", ...rs.abandoned, at: iso(now()) }); }
      }
    }
    const entry: any = { kind: "STEP", index: STEPS.indexOf(step) + 1, step, status: r.status, startedAt: iso(startedAt), endedAt: iso(now()), inputsSha256: priorEntry && step === "EXECUTE" ? priorEntry.inputsSha256 : sha(r.inputs), decision: plain(r.decision), rationale: r.rationale, decidedBy: DECIDED_BY[step] };
    if (resumed) entry.resumed = resumed;
    steps.push({ ...entry, counted });
    append(entry);
    try { if (typeof ports.pause === "function") await ports.pause(step); } catch { /* best-effort */ }
    return r;
  };
  const stopped = (r: any) => r && r.stopped ? finish("STOPPED", { stop: r.stopped }) : null;

  // 1 TRUTH_LOCK
  let r: any = await run("TRUTH_LOCK", () => {
    const tl = ports.truthLock();
    const ok = !!tl && tl.ok === true && tl.blocked !== true;
    return { status: ok ? "PASS" : "REFUSED", inputs: tl && tl.gitState, decision: { status: tl && tl.status, ok: !!(tl && tl.ok), blocked: !!(tl && tl.blocked), enforce: !!(tl && tl.enforce), detail: tl && tl.verdict && tl.verdict.detail, gitState: tl && tl.gitState }, rationale: ok ? "repo on expected branch, HEAD == origin/main, index empty" : "Truth-Lock refused — fail-closed: no state read, no selection, no execution" };
  });
  if (stopped(r)) return stopped(r);
  if (r.status !== "PASS") return finish("STARTUP_REFUSED");

  // 2 STATE_READ
  r = await run("STATE_READ", () => {
    const s = ports.readState();
    ctx.state = s;
    runId = sha({ inputs: s.inputs, sourcesDigest: sha(s.sources && { contracts: s.sources.contracts, v150: s.sources.v150, cp8: s.sources.cp8 }), proven: arr(s.ledger && s.ledger.proven).slice().sort(), allowlist: arr(s.allowlist && s.allowlist.ids).slice().sort(), mode }).slice(0, 16);
    return { status: "DONE", inputs: s.inputs, decision: { inputs: s.inputs, ledger: { provenCount: arr(s.ledger && s.ledger.proven).length, integrityOk: !!(s.ledger && s.ledger.integrity && s.ledger.integrity.ok) }, allowlist: s.allowlist, codeTreeParity: s.codeTreeParity || null, runId, volatile: { attempts: s.attempts, ledgerIntegrity: s.ledger && s.ledger.integrity } }, rationale: "canonical evidence + registers hashed; mission-ledger and attempt-log read-only (never written by GO)" };
  });
  if (stopped(r)) return stopped(r);

  // V16.9 Phase 1b — resume decision (state digest now known)
  if (resumePlan) {
    const same = resumePlan.resumable && resumePlan.runId === runId && resumePlan.mode === mode;
    rs.active = same;
    const why = !resumePlan.resumable ? `not resumable: ${resumePlan.reason} ⇒ fresh cycle`
      : resumePlan.mode !== mode ? `stopped cycle ${resumePlan.fromCycleSeq} ran in mode ${resumePlan.mode}, this run is ${mode} ⇒ fresh cycle`
      : resumePlan.runId !== runId ? `state digest changed since stopped cycle ${resumePlan.fromCycleSeq} (runId ${resumePlan.runId} → ${runId}) ⇒ fresh cycle (its decisions describe another state)`
      : `state digest unchanged (runId ${runId}) ⇒ resume at ${resumePlan.firstIncompleteStep}: completed steps re-derived and checked identical, EXECUTE ${resumePlan.completedSteps.includes("EXECUTE") ? "carried over (never re-dispatched)" : "not yet run"}`;
    ctx.resume = { requested: true, resumed: same, fromCycleSeq: resumePlan.fromCycleSeq, priorStatus: resumePlan.priorStatus, priorStop: resumePlan.stop, priorRunId: resumePlan.runId, runId, completedInPrior: resumePlan.completedSteps, firstIncompleteStep: resumePlan.firstIncompleteStep, dispatchedInPrior: resumePlan.dispatched, reason: why };
    append({ kind: "RESUME", ...ctx.resume, at: iso(now()) });
  }

  // 3 PROBLEMS_OPPORTUNITIES
  r = await run("PROBLEMS_OPPORTUNITIES", () => {
    const s = ctx.state;
    const register = REG.buildRegister(s.sources);
    ctx.register = register;
    const cp8 = s.sources.cp8 && s.sources.cp8.data ? s.sources.cp8.data : {};
    const g = s.radar && s.radar.grant && s.radar.grant.grant ? s.radar.grant.grant : null;
    const tn = now();
    const grantActive = !!g && g.authorized === true && Number.isFinite(g.issuedMs) && Number.isFinite(g.expiresMs) && tn >= g.issuedMs && tn < g.expiresMs;
    const k = ports.knowledge();
    ctx.knowledge = k;
    const claims = arr(k && k.claims);
    const decision = {
      gaps: arr(cp8.gaps),
      registerStatusCounts: register.statusCounts,
      blockedOrOwnerGated: register.items.filter((it: any) => it.status === "BLOCKED" || it.requiresOwnerAuthorization === true).map((it: any) => it.id),
      executedPartial: register.items.filter((it: any) => it.status === "EXECUTED_PARTIAL").map((it: any) => it.id),
      radar: { grant: g ? { authorized: g.authorized === true, issuedIso: g.issuedIso, expiresIso: g.expiresIso, allowedDomains: arr(g.allowedDomains), active: grantActive } : null, admissionSummary: s.radar && s.radar.admission ? s.radar.admission.summary : null, liveEgress: "NONE (GO never sets ODG_RADAR_LIVE; pinned collections only)" },
      knowledge: { collection: k && k.collection, ok: !!(k && k.ok), claims: claims.map((c: any) => ({ id: c.id, epistemic: c.epistemic, isFact: c.isFact === true, usableFor: c.useAuthorization, admissibleAsFact: c.admissible ? c.admissible.trusted === true : false, admissibleVerdict: c.admissible ? c.admissible.verdict : null })) },
    };
    return { status: "DONE", inputs: { register: sha(register), cp8: sha(cp8.gaps || null), grant: sha(g), knowledge: sha(decision.knowledge) }, decision, rationale: "problems = CP8 gaps + blocked/owner-gated register items; opportunities = selectable register items + usable (not fact-admitted) pinned knowledge; Radar read-only" };
  });
  if (stopped(r)) return stopped(r);

  // 4 SELECT
  r = await run("SELECT", () => {
    const d = SEL.selectNextExplained(REG.toSelectorCandidates(ctx.register), selectorOptions());
    ctx.selection = d;
    const id = chosenId(d);
    const strategicItem = id ? ctx.register.items.find((it: any) => it.id === id) : null;
    // V166 GO-ACT-1: feasibility (authorization) filters, priority (the same selector) ranks.
    const strategicAct = actionabilityOf(ctx.state, strategicItem);
    let act: any = null, actItem: any = null, ownerOrder: any = null, ownerSelection: any = null;
    if (strategicItem && strategicAct.actionable) { act = d; actItem = strategicItem; }
    else {
      // GO-ACT-1 also applies when the strategic selection is UNDECIDED (DECISION_REQUIRED / NO_ELIGIBLE): ODG still
      // works on the best item it is allowed to do, and the undecided strategic choice becomes an owner/ODG request.
      act = SEL.selectNextExplained(actionableCandidates(ctx.state, ctx.register), actionableOptions());
      const aid = chosenId(act);
      actItem = aid ? ctx.register.items.find((it: any) => it.id === aid) : null;
      if (actItem && !actionabilityOf(ctx.state, actItem).actionable) actItem = null;   // defensive: never a non-actionable pick
      // V17.4 GO-ORD-1: an actionable DECISION_REQUIRED tie may be resolved by a committed owner order-decision record
      if (!actItem && act && act.decision === "DECISION_REQUIRED") {
        ownerOrder = resolveOwnerOrder(ctx.state, ctx.register, arr(act.tiedSet).map((x: any) => (x && typeof x === "object" ? x.id : x)));
        if (ownerOrder && ownerOrder.applied) { actItem = ownerOrder.item; delete ownerOrder.item; }
      }
      // V17.4 GO-ORD-2: an actionable DECISION_REQUIRED that is NOT a tie (uncertainty) may be resolved by an owner selection record
      if (!actItem && act && act.decision === "DECISION_REQUIRED") {
        ownerSelection = resolveOwnerSelection(ctx.state, ctx.register, act, prior, ports.claims);
        if (ownerSelection && ownerSelection.applied) { actItem = ownerSelection.item; delete ownerSelection.item; ctx.ownerSelection = ownerSelection; }
      }
    }
    const proceedWithActionable = !!actItem && (!strategicItem || !strategicAct.actionable);
    // the actionable (authorized-only) selection itself may be undecided: N authorized items tie ⇒ DECISION_REQUIRED (no id tie-break)
    const actTied = act && act !== d && !actItem && act.decision === "DECISION_REQUIRED" ? arr(act.tiedSet).map((x: any) => (x && typeof x === "object" ? x.id : x)) : [];
    const actTieText = actTied.length ? `${actTied.length} authorized items tie (${actTied.join("/")}) — DECISION_REQUIRED, no id tie-break; owner/ODG decision requested` : null;
    ctx.item = proceedWithActionable ? actItem : strategicItem;
    ctx.strategicItem = strategicItem;
    ctx.ownerRequest = !strategicItem ? { item: null, decisionNeeded: `strategic selection ${d.decision}${arr(d.tiedSet).length ? ` among ${arr(d.tiedSet).join("/")}` : ""} — owner/ODG decision required (no id tie-break)${actTieText ? `; actionable selection: ${actTieText}` : ""}`, ...(actTied.length ? { actionableTiedSet: actTied } : {}), requestedBy: "ODG GO (GO-ACT-1) — a REQUEST, not an authorization" }
      : strategicItem && !strategicAct.actionable ? { item: strategicItem.id, authorizationNeeded: `owner — ${strategicItem.id} ${strategicItem.contractState || "PROPOSED"}${strategicItem.contractState === "AUTHORIZED" ? "" : " → AUTHORIZED (authorizedBy)"}`, reason: strategicAct.reason, ...(actTieText ? { decisionNeeded: `actionable selection among ${actTied.join("/")}: ${actTieText}`, actionableTiedSet: actTied } : {}), requestedBy: "ODG GO (GO-ACT-1) — a REQUEST, not an authorization" } : null;
    ctx.actionable = { rule: ACTIONABLE_RULE, ruleDetail: ACTIONABLE_RULE_DETAIL, authoredBy: "technical provider (Claude Code) — provider-authored rule; every decision is the selector's",
      strategicActionable: strategicItem ? strategicAct : null,
      selection: act ? (act === d ? { sameAsStrategic: true, ...selectionSummary(d) } : { sameAsStrategic: false, ...selectionSummary(act), excludedNotAuthorizedNow: arr(act.excluded).filter((x: any) => x.status === NOT_AUTHORIZED_NOW).map((x: any) => x.id) }) : null,
      item: actItem ? actItem.id : null, basis: actItem ? actionabilityOf(ctx.state, actItem) : null, proceedingWith: ctx.item ? ctx.item.id : null, proceedingWithActionable: proceedWithActionable,
      ...(ownerOrder ? { ownerOrderDecision: ownerOrder, ...(ownerOrder.applied ? { resolvedBy: ownerOrder.resolvedBy } : {}) } : {}),
      ...(ownerSelection ? { ownerSelectionDecision: ownerSelection, ...(ownerSelection.applied ? { resolvedBy: ownerSelection.resolvedBy } : {}) } : {}) };
    const committed = ctx.state.registerEvidence && ctx.state.registerEvidence.decisionRecord ? ctx.state.registerEvidence.decisionRecord : null;
    const consistent = committed ? committed.decision === d.decision && committed.selected === (d.selected ? d.selected.id : null) && canon(arr(committed.tiedSet)) === canon(arr(d.tiedSet)) : null;
    return { status: id || proceedWithActionable ? "DONE" : "HALTED", inputs: REG.toSelectorCandidates(ctx.register),
      decision: { decision: d.decision, selected: d.selected ? d.selected.id : null, proposed: d.proposed ? d.proposed.id : null, tiedSet: arr(d.tiedSet), resolvedBy: d.resolvedBy || null, resolutionSteps: d.resolutionSteps || null, justification: d.justification, uncertainty: d.selected ? d.selected.uncertainty : d.proposed ? d.proposed.uncertainty : null, ownerAuthorizationRequired: arr(d.ownerAuthorizationRequired).map((x: any) => x.id), consistentWithCommittedRegisterEvidence: consistent,
        strategicSelection: selectionSummary(d), actionableSelection: ctx.actionable, ownerRequest: ctx.ownerRequest, workingOn: ctx.item ? ctx.item.id : null },
      rationale: (ownerOrder && ownerOrder.applied ? `actionable tie ${ownerOrder.tiedSet.join("/")} resolved by ${ownerOrder.resolvedBy} (owner order ${ownerOrder.order.join(" → ")}, ${ownerOrder.date}: « ${ownerOrder.quote[0] || ""} ») — order arbitration only, no score/authorization change (GO-ORD-1); ` : "")
        + (ownerSelection && ownerSelection.applied ? `actionable selection DECISION_REQUIRED (selector: ${ownerSelection.selector.justification}) resolved for ${ownerSelection.chosen} by ${ownerSelection.resolvedBy} (${ownerSelection.date}: « ${ownerSelection.quote[2] || ownerSelection.quote[0]} ») — owner selection of an already-authorized item, max 1 dispatch, no score/threshold/authorization change (GO-ORD-2); ` : "")
        + (!id && proceedWithActionable ? `strategic selector decision ${d.decision} (tie ${arr(d.tiedSet).join("/")}; owner/ODG decision requested) ⇒ GO proceeds with the best AUTHORIZED item ${ctx.item.id} (GO-ACT-1: ${ACTIONABLE_RULE})` : id ? `selector decision ${d.decision}${d.decision === "TIE_EXPLAINED" ? ` (tie ${arr(d.tiedSet).join("/")} resolved by ${d.resolvedBy})` : ""} — a PROPOSAL, not an authorization` : `selector decision ${d.decision}: ODG does not pick (no id tie-break) — owner/ODG decision required`)
        + (proceedWithActionable && id ? `; strategic ${id} lacks authorization (owner request recorded) ⇒ GO proceeds with the best AUTHORIZED item ${ctx.item.id} (GO-ACT-1: ${ACTIONABLE_RULE})` : strategicItem && !strategicAct.actionable ? (actTieText ? `; strategic ${id} lacks authorization and ${actTieText} ⇒ the gate will hold (owner request recorded)` : `; strategic ${id} lacks authorization and no other item has an AUTHORIZED next step ⇒ the gate will hold (owner request recorded)`) : !strategicItem && actTieText ? `; ${actTieText}` : "") };
  });
  if (stopped(r)) return stopped(r);
  const item = ctx.item;
  const skip = (why: string) => () => ({ status: "SKIPPED", inputs: null, decision: { skipped: why }, rationale: why });

  // 5 DECOMPOSE
  r = await run("DECOMPOSE", item ? () => {
    const contract = contractOf(ctx.state, item.id);
    ctx.contract = contract;
    const spec = specOf(item, contract);
    if (!spec) return { status: "NOT_MEASURED", inputs: { item: item.id }, decision: { rule: SPEC_RULE, strategy: null, reason: "no WORK_ITEM_CONTRACT ⇒ no declared scope to decompose" }, rationale: "decomposition NOT_MEASURED (never default-filled)" };
    const c = DP.chooseStrategy(spec);
    ctx.decomposition = c;
    return { status: "DONE", inputs: spec, decision: { rule: SPEC_RULE, strategy: c.strategy, complexity: c.complexity, reason: c.reason, parts: arr(c.architecture).map((a: any) => a.path) }, rationale: `decomposition-planner: ${c.strategy} (${c.complexity})` };
  } : skip("no selected item (selection halted)"));
  if (stopped(r)) return stopped(r);

  // 6 STRATEGY
  r = await run("STRATEGY", item ? () => {
    const contract = ctx.contract;
    const w = contract && isObj(contract.WORK_ITEM_CONTRACT) ? contract.WORK_ITEM_CONTRACT : null;
    const mission: any = { id: contract ? `AP-${item.id}` : item.id, authorizationState: contract ? contract.state : (item.contractState || "PROPOSED") };
    if (w) { mission.writeSet = w.write_set; mission.writeSetSource = `${ctx.state.sources.contracts.path}#contracts[scenario=${item.id}].WORK_ITEM_CONTRACT.write_set`; }
    const auth = declaredAuthorization(contract) || scopedExecutionAuthorization(scopedAuthorization(ctx.state, contract));
    if (auth && contract && contract.state !== "AUTHORIZED") mission.authorizationState = "AUTHORIZED";   // V166: ONLY a derived authorized EXECUTION step (M0 stays for every other state)
    if (auth) mission.authorization = { by: auth.authorizedBy, missionId: mission.id };
    const sel = SM.selectStrategyMode(mission, { measured: ctx.state.measured, now: ctx.state.strategyNow });
    ctx.strategy = sel;
    const committed = arr(ctx.state.strategyEvidence && ctx.state.strategyEvidence.missions).find((m: any) => m.id === mission.id);
    const consistent = committed && committed.current ? committed.current.mode === sel.mode && committed.current.tentativeMode === sel.tentativeMode && committed.current.rule === sel.rule : null;
    return { status: "DONE", inputs: mission, decision: { missionId: mission.id, mode: sel.mode, tentativeMode: sel.tentativeMode || null, rule: sel.rule, rationale: sel.rationale, uncertainty: sel.uncertainty, authorizationRequired: sel.authorizationRequired, providerExecutable: sel.providerExecutable, launchedBySelector: sel.launchedBySelector, fallbackChain: sel.fallbackChain, delegationRecords: sel.delegationRecords, nextStrategyAfterFailure: "NOT_INVOKED (no execution failure in this cycle)", consistentWithCommittedStrategyEvidence: consistent },
      rationale: `strategy-mode-selector: ${sel.mode}${sel.tentativeMode ? ` (tentative ${sel.tentativeMode})` : ""} by rule ${sel.rule}` };
  } : skip("no selected item (selection halted)"));
  if (stopped(r)) return stopped(r);

  // 7 AUTHORIZE
  r = await run("AUTHORIZE", () => {
    const allow = arr(ctx.state.allowlist && ctx.state.allowlist.ids);
    const proven = new Set(arr(ctx.state.ledger && ctx.state.ledger.proven));
    const queue = { queue: [...(item ? [{ mission: item.id, status: "PENDING", source: "SELECT" }] : []), ...allow.filter((id: string) => !item || id !== item.id).map((id: string) => ({ mission: id, status: "PENDING", source: ctx.state.allowlist.source }))] };
    ctx.queue = queue;
    let loop: any = null;
    let loopAuthorized = false;
    const scope = item ? scopedAuthorization(ctx.state, ctx.contract) : null;
    ctx.scope = scope;
    if (item) {
      const accepted = ctx.register.items.filter((it: any) => it.status === "ACCEPTED").map((it: any) => ({ id: it.id, title: it.title }));
      let executeCalled = false;
      loop = IL.runCycle({ discovery: { id: item.id, title: item.title, detail: canon(item.nextStep), origin: "GO/SELECT", evidence: item.statusSource }, existingItems: accepted, authorization: declaredAuthorization(ctx.contract) || scopedExecutionAuthorization(scope), candidatePlans: [] }, { execute: () => { executeCalled = true; return null; } });
      loopAuthorized = arr(loop.trace).some((t: any) => t.step === "AUTHORIZE" && t.authorized === true);
      ctx.loopExecuteCalled = executeCalled;
    }
    ctx.loopAuthorized = loopAuthorized;
    const eligibility = queue.queue.map((q: any) => ({ mission: q.mission, source: q.source, ...SCHED.evaluateEligibility(q, { preAuthorized: allow, isProven: (id: string) => proven.has(id) }) }));
    return { status: loopAuthorized || eligibility.some((e: any) => e.eligible) ? "DONE" : "HALTED_AT_GATE", inputs: { item: item ? item.id : null, contractState: ctx.contract ? ctx.contract.state : null, authorizedBy: ctx.contract ? ctx.contract.authorizedBy : null, allowlist: allow },
      decision: { intelligenceLoop: loop ? { stage: loop.stage, completed: loop.completed, proposedOnly: loop.proposedOnly === true, duplicate: loop.duplicate === true, reason: loop.reason, trace: loop.trace } : null, selectedAuthorized: loopAuthorized, scopedAuthorization: scopeSummary(scope), schedulerEligibility: eligibility, selfAuthorized: false },
      rationale: loopAuthorized ? (scope && scope.executionAuthorized ? `selected item: scoped step ${scope.currentStep} authorized by the owner's prior authorization (derived from the recorded inspection ACCEPT)` : "selected item carries an EXTERNAL authorization (contract AUTHORIZED + authorizedBy)") : scope ? `scoped authorization: ${scopeSummary(scope).report} — ${scope.reason}; no native dispatch for this step (ODG never self-authorizes)` : "no external authorization for the selected item ⇒ the loop stops at PROPOSED (ODG never self-authorizes); scheduler eligibility shows the canonical pre-authorized allowlist + proven dedup" };
  });
  if (stopped(r)) return stopped(r);
  const gateHeld = r.status === "HALTED_AT_GATE";

  // 8 EXECUTE (via the canonical schedulerStep; dispatch reachable only for authorized NATIVE isolated work)
  r = await run("EXECUTE", async () => {
    const allow = arr(ctx.state.allowlist && ctx.state.allowlist.ids);
    const proven = new Set(arr(ctx.state.ledger && ctx.state.ledger.proven));
    const already = new Set(prior.filter((e: any) => e && e.kind === "DISPATCHED" && e.runId === runId).map((e: any) => e.mission));
    const strategyNative = !!ctx.strategy && ctx.strategy.mode === "NATIVE";
    const delegation: any[] = [];
    if (ctx.strategy && (["PROVIDER", "HYBRID"].includes(ctx.strategy.mode) || ["PROVIDER", "HYBRID"].includes(ctx.strategy.tentativeMode))) {
      const rec = SD.createMission({ id: ctx.strategy.missionId || (item && item.id), objective: ctx.contract && ctx.contract.WORK_ITEM_CONTRACT ? ctx.contract.WORK_ITEM_CONTRACT.objective : null, reason: `strategy ${ctx.strategy.mode}/${ctx.strategy.tentativeMode || "-"} — delegated part(s) recorded only` });
      delegation.push({ state: rec.state, missionId: rec.missionId, authority: rec.authority, providerLaunched: false });
    }
    let isolationSeen: any = null;
    // GO-DT-1: a SCOPED (not plain AUTHORIZED) execution approval dispatches only to the contract-declared target
    const scopedExec = !!item && ctx.loopAuthorized && !declaredAuthorization(ctx.contract) && !!ctx.scope && ctx.scope.executionAuthorized === true;
    const dt0 = scopedExec ? resolveDispatchTarget(ctx.contract, ctx.scope.currentStep) : null;
    const optIn = o.allowUnsandboxedTarget === true;
    let dt = dt0 && dt0.ok && !optIn ? { ...dt0, ok: false, code: "UNSANDBOXED_TARGET_NOT_OPTED_IN", reason: `UNSANDBOXED_TARGET_NOT_OPTED_IN: declared target ${dt0.target.command} would run on the host (out-of-scratch writes not confined); explicit opt-in allowUnsandboxedTarget / --allow-unsandboxed-target required` } : dt0;
    const dto = dt && dt.ok ? deriveDispatchTimeout(ctx.contract, dt.target) : null;
    if (dt && dt.ok && dto && dto.ok !== true) dt = { ...dt, ok: false, code: dto.code, reason: dto.reason };
    ctx.dispatchTarget = dt;
    // GO-DTO-1 cycle deadline: a declared dispatch must not be followed by a DEADLINE stop before EVIDENCE/NEXT_SELECTION
    let cycleDeadline: any = null;
    if (dt && dt.ok && dto && dto.ok) {
      const requestedMs = deadlineMs; const elapsedMs = now() - t0;
      const neededMs = dto.timeoutMs + DISPATCH_DEADLINE_MARGIN_MS;
      const extend = mode === "EXECUTE" && neededMs > requestedMs;
      cycleDeadline = { ruleId: "GO-DTO-1", requestedMs, requestedExplicit: deadlineExplicit, elapsedAtExecuteMs: elapsedMs, dispatchTimeoutMs: dto.timeoutMs, marginMs: DISPATCH_DEADLINE_MARGIN_MS, neededMs, effectiveMs: extend ? neededMs : requestedMs,
        basis: extend ? "EXTENDED_FOR_DISPATCH" : mode === "EXECUTE" ? "REQUESTED_SUFFICIENT" : "DRY_NOT_EXTENDED",
        note: extend ? `deadline ${requestedMs} ms${deadlineExplicit ? " (explicit --deadline-ms)" : " (default)"} < dispatch timeout + margin ⇒ extended to ${neededMs} ms (the dispatch is bounded by its own timeout; never killed by the cycle deadline)` : null };
      if (extend) { deadlineMs = neededMs; append({ kind: "DEADLINE_EXTENDED", ...cycleDeadline, at: iso(now()) }); }
    }
    const authorize = (next: any) => {
      const isSelected = !!item && next.mission === item.id;
      if (isSelected && !ctx.loopAuthorized) return { ok: false, reason: "selected item NOT AUTHORIZED (PROPOSED; no external authorization)" };
      if (isSelected && !strategyNative) return { ok: false, reason: `strategy mode ${ctx.strategy ? ctx.strategy.mode : "UNKNOWN"} ≠ NATIVE ⇒ native execution refused (PROVIDER/HYBRID parts are delegation RECORDS only)` };
      if (isSelected && dt && !dt.ok) return { ok: false, reason: dt.reason };
      if (!isSelected && !allow.includes(next.mission)) return { ok: false, reason: "not on the canonical pre-authorized allowlist" };
      const isoArg = isSelected && dt && dt.ok ? { ...next, dispatchTarget: dt.target } : next;
      const iso2 = (() => { try { return ports.isolation(isoArg); } catch (e: any) { return { ok: false, reason: String((e && e.message) || e) }; } })();
      isolationSeen = iso2;
      if (!iso2 || iso2.ok !== true) return { ok: false, reason: `NO_ISOLATED_WORKSPACE: ${iso2 && iso2.reason}` };
      // GO-ORD-2 one-shot claim: EXECUTE only, the LAST check before dispatch; never in DRY; never deleted by GO
      const os = ctx.ownerSelection;
      if (isSelected && os && os.applied && os.chosen === next.mission) {
        if (!ports.claims || typeof ports.claims.claim !== "function") return { ok: false, reason: "GO-ORD-2_NO_CLAIM_STORE: no persistent claim store ⇒ dispatch refused" };
        if (mode === "EXECUTE") {
          let c: any; try { c = ports.claims.claim({ key: os.claimKey, item: next.mission, workspace: iso2.workspace, data: { record: os.record, recordSha256: os.recordSha256, item: next.mission, contractSha256: os.contractSha256, runId, at: iso(now()), scratch: iso2.workspace } }); } catch (e: any) { c = { ok: false, code: "GO-ORD-2_CLAIM_ERROR", reason: String((e && e.message) || e) }; }
          ctx.ownerSelectionClaim = c;
          if (!c || c.ok !== true) return { ok: false, reason: `${(c && c.code) || "GO-ORD-2_CLAIM_ERROR"}: ${(c && c.reason) || "claim not created"} ⇒ dispatch refused (0 dispatch)` };
          append({ kind: "OWNER_SELECTION_CLAIMED", rule: "GO-ORD-2", mission: next.mission, claimKey: os.claimKey, claimPath: c.path || null, record: os.record, at: iso(now()) });
        }
      }
      return { ok: true, reason: "authorized + native + isolated" };
    };
    const dispatch = (next: any) => {
      const tgt = !!item && next.mission === item.id && dt && dt.ok ? dt.target : null;
      if (mode !== "EXECUTE") return { detail: `${DRY_MARK}: would dispatch ${next.mission} ${tgt ? `via its declared target ${tgt.command}` : "via the governed pipeline"} in ${isolationSeen && isolationSeen.workspace}` };
      counters.dispatchCalls++; counters.dispatchedMissions.push(next.mission);
      append({ kind: "DISPATCHED", mission: next.mission, workspace: isolationSeen && isolationSeen.workspace, dispatchTarget: tgt, at: iso(now()) });
      const res = ports.dispatchNative(tgt ? { ...next, dispatchTarget: tgt } : next, { workspace: isolationSeen && isolationSeen.workspace, dispatchTarget: tgt, allowUnsandboxedTarget: !!tgt && optIn, ...(tgt && dto ? { dispatchTimeoutMs: dto.timeoutMs } : {}),
        stopRequested: () => { const s = stopCheck("EXECUTE/dispatch-running"); return s && s.reason !== "MAX_STEPS" && s.reason !== "DEADLINE" ? s : null; } });
      // an ASYNC port (real process-group dispatch): the scheduler is synchronous ⇒ its outcome is classified below, after awaiting
      if (res && typeof res.then === "function") { pending = { promise: res, mission: next.mission }; return { verified: false, detail: "PENDING_ASYNC_DISPATCH" }; }
      return res;
    };
    let pending: any = null;
    let d = SCHED.schedulerStep({ queue: ctx.queue, preAuthorized: [...allow, ...(item && ctx.loopAuthorized ? [item.id] : [])], isProven: (id: string) => proven.has(id) || already.has(id), stopSignal: () => { const s = stopCheck("EXECUTE/dispatch"); return !!s && s.reason !== "MAX_STEPS"; }, authorize, dispatch, policy: { maxAttemptsPerMission: 3 } });
    let dispatchProcess: any = null;
    if (pending) {
      let res: any; try { res = await pending.promise; } catch (e: any) { res = { verified: false, detail: `dispatch threw: ${(e && e.message) || e}` }; }
      const cl = SCHED.classifyDispatch(res);
      d = { status: cl.status, mission: pending.mission, reason: cl.detail };
      dispatchProcess = res && isObj(res.process) ? res.process : null;
    }
    const dry = mode !== "EXECUTE" && d.status === "NOT_MEASURABLE" && String(d.reason).startsWith(DRY_MARK);
    let failureNext: any = null;
    if (d.status === "FAIL" && ctx.strategy) failureNext = SM.nextStrategyAfterFailure({ mode: ctx.strategy.mode, strategy: "DEFAULT" }, { accepted: false, stopReason: "VERIFICATION_FAILED" });
    const status = d.status === "PASS" || d.status === "FAIL" ? `EXECUTED_${d.status}` : dry ? "WOULD_DISPATCH" : d.status === "STOPPED" ? "STOPPED" : gateHeld || d.status === "IDLE" || d.status === "BLOCKED" ? "NOTHING_EXECUTED" : d.status;
    return { status, inputs: { queue: ctx.queue, mode },
      decision: { scheduler: { status: d.status, mission: d.mission, reason: d.reason }, dispatchTarget: dt ? { ok: dt.ok, code: dt.code || null, step: dt.step, target: dt.target || null, reason: dt.reason || null, rule: DISPATCH_TARGET_RULE, sandbox: SANDBOX_LIMIT, unsandboxedOptIn: optIn, dispatchTimeout: dto } : null, ...(ctx.ownerSelectionClaim ? { ownerSelectionClaim: ctx.ownerSelectionClaim } : {}), ...(cycleDeadline || dispatchProcess ? { volatile: { cycleDeadline, dispatchProcess } } : {}), mode, dispatchCalls: counters.dispatchCalls, providerLaunched: false, delegationRecords: delegation, nextStrategyAfterFailure: failureNext ? { next: failureNext.next, rule: failureNext.rule } : null, commitOrMerge: "NONE (GO never commits/merges)" },
      rationale: status === "NOTHING_EXECUTED" ? (dt && !dt.ok ? `scoped execution step ${dt.step} authorized but ${dt.reason} — fail-closed, nothing dispatched` : `authorization gate held: ${d.reason}`) : status === "WOULD_DISPATCH" ? "dry run: an authorized native isolated mission would be dispatched (not executed)" : `scheduler ${d.status}: ${d.reason}` };
  });
  if (stopped(r)) return stopped(r);
  if (r.status === "STOPPED") return finish("STOPPED", { stop: { reason: "EMERGENCY_STOP", source: "schedulerStep stopSignal" } });
  const execStatus = r.status;
  if (rs.carriedOver.includes("EXECUTE") && r.decision && isObj(r.decision.dispatchTarget)) ctx.dispatchTarget = r.decision.dispatchTarget;

  // 9 EVIDENCE
  r = await run("EVIDENCE", () => {
    const digest = digestOf(steps);
    const summary = { runId, cycleSeq, mode, stepsSoFar: steps.map((s) => `${s.step}:${s.status}`), decisionsDigestSoFar: digest, selection: ctx.selection ? ctx.selection.decision : null, item: item ? item.id : null, execute: execStatus };
    try { ports.writeSummary(summary); } catch (e: any) { return { status: "ERROR", inputs: summary, decision: { written: false, error: String((e && e.message) || e) }, rationale: "summary write refused (out-dir confinement) — fail-closed" }; }
    return { status: "DONE", inputs: summary, decision: { written: true, decisionsDigestSoFar: digest }, rationale: "cycle summary written via the out-dir-confined writer; trace is append-only" };
  });
  if (stopped(r)) return stopped(r);

  // 10 NEXT_SELECTION
  r = await run("NEXT_SELECTION", () => {
    const rest = REG.toSelectorCandidates(ctx.register).filter((c: any) => !item || c.id !== item.id);
    const nd = SEL.selectNextExplained(rest, selectorOptions());
    const w = ctx.contract && isObj(ctx.contract.WORK_ITEM_CONTRACT) ? ctx.contract.WORK_ITEM_CONTRACT : null;
    const prepared = item ? { id: item.id, title: item.title, status: item.status, nextStep: item.nextStep, contract: w ? { objective: w.objective, write_set: w.write_set, acceptance_criteria: w.acceptance_criteria, stop_conditions: w.stop_conditions, evidence_required: w.evidence_required } : null,
      decomposition: ctx.decomposition ? { strategy: ctx.decomposition.strategy, complexity: ctx.decomposition.complexity, parts: arr(ctx.decomposition.architecture).map((a: any) => a.path) } : null,
      strategy: ctx.strategy ? { mode: ctx.strategy.mode, tentativeMode: ctx.strategy.tentativeMode || null, rule: ctx.strategy.rule } : null,
      dispatchTarget: ctx.dispatchTarget ? (ctx.dispatchTarget.ok ? { ok: true, target: ctx.dispatchTarget.target } : { ok: false, code: ctx.dispatchTarget.code, reason: ctx.dispatchTarget.reason }) : null,
      authorizationNeeded: ctx.loopAuthorized ? null : ctx.scope ? `scoped: current step ${ctx.scope.currentStep} (${ctx.scope.currentStepKind}${ctx.scope.currentStepAuthorized ? ", AUTHORIZED — provider/docs work, not native dispatch" : ", NOT authorized"}); next ${ctx.scope.nextStep} ${ctx.scope.nextStepAuthorized ? "authorized" : "NOT authorized until " + ctx.scope.currentStep + " is validated by its evidence"}` : `owner: contract ${item.id} PROPOSED → AUTHORIZED (authorizedBy) — ODG cannot self-authorize`, executed: execStatus } : null;
    return { status: "DONE", inputs: rest.map((c: any) => c.id),
      decision: { preparedMission: prepared, ownerRequest: ctx.ownerRequest || null, strategicItem: ctx.strategicItem ? ctx.strategicItem.id : null, nextAfterCurrent: { decision: nd.decision, selected: nd.selected ? nd.selected.id : null, proposed: nd.proposed ? nd.proposed.id : null, tiedSet: arr(nd.tiedSet), resolvedBy: nd.resolvedBy || null, justification: nd.justification } },
      rationale: "prepared-mission package for the selected item + the selector's choice once the current item is set aside (PROPOSAL only)" };
  });
  if (stopped(r)) return stopped(r);

  const goAct = { strategic: ctx.strategicItem ? ctx.strategicItem.id : null, workingOn: item ? item.id : null, proceedingWithActionable: !!(ctx.actionable && ctx.actionable.proceedingWithActionable), ownerRequest: ctx.ownerRequest || null };
  const status = !item ? "HALTED_DECISION_REQUIRED" : execStatus === "NOTHING_EXECUTED" ? "HALTED_AT_AUTHORIZATION_GATE" : execStatus === "WOULD_DISPATCH" ? "DRY_COMPLETE" : execStatus.startsWith("EXECUTED_") ? execStatus : execStatus;
  return finish(status, { selection: goAct });
}

/* assertConfinedWrite(target, outDir, forbiddenRoots) — the writer guard used by the CLI ports (exported for tests). */
function assertConfinedWrite(target: string, outDir: string, forbiddenRoots: string[], pathMod: any): void {
  const p = pathMod || require("path");
  const t = p.resolve(target), od = p.resolve(outDir);
  const inside = (a: string, b: string) => a === b || a.startsWith(b.endsWith(p.sep) ? b : b + p.sep);
  for (const f of arr(forbiddenRoots)) if (inside(t, p.resolve(f))) throw new Error(`FORBIDDEN_WRITE: ${t} is inside protected ${f}`);
  if (!inside(t, od)) throw new Error(`WRITE_OUTSIDE_OUT_DIR: ${t} not inside ${od}`);
}

const GO_CYCLE_CONTRACT = Object.freeze({
  id: "V164-ODG-GO-CYCLE",
  source: "owner directive V16.4 §2 ODG GO + §7 close the loop + §10 scenario J",
  steps: STEPS,
  composes: Object.freeze(["truth-lock-gate", "odg-strategic-register", "mission-priority-selector.selectNextExplained", "decomposition-planner.chooseStrategy", "odg-strategy-mode-selector", "intelligence-loop.runCycle", "mission-scheduler.schedulerStep/evaluateEligibility", "odg-sovereign-delegation.createMission", "odg-knowledge-intelligence (via port)", "odg-authorization-scope.deriveAuthorizationScope"]),
  invariants: Object.freeze([
    "one bounded cycle per invocation (maxSteps ≤ 10, wall-clock deadline); no loop, no timer, no second scheduler",
    "Truth-Lock refusal ⇒ STARTUP_REFUSED before any state read",
    "selection is the selector's (TIE_EXPLAINED / DECISION_REQUIRED kept; never an id pick)",
    "V166 GO-ACT-1 (provider-authored): " + ACTIONABLE_RULE + " — strategicSelection kept verbatim; actionableSelection = same selector with unauthorized items excluded (no new scoring); owner-gated never actionable; PROPOSED never authorized; owner request recorded for an unauthorized strategic item",
    "ODG never self-authorizes: execution only through schedulerStep with an external authorization or the canonical pre-authorized allowlist",
    "V166 scoped authorization: an owner-scoped contract dispatches only when its CURRENT step is an execution step derived-authorized by odg-authorization-scope from committed evidence (inspection ACCEPT bound to the contract sha256); non-execution steps are reported, never dispatched",
    "V166 GO-DT-1: a scoped execution step dispatches only to the contract-declared authorization.dispatchTargets[step] (⊆ write_set, bound to the inspected contract sha); none ⇒ NO_DISPATCH_TARGET, never a fallback to odg-run <id>",
    "dispatch only in mode EXECUTE, only for NATIVE work in an isolated workspace; PROVIDER/HYBRID ⇒ delegation RECORD only; no provider launch",
    "no commit, no merge, no write outside the out dir (writer guard); ledger/attempt-log read-only",
    "stop between every step: ODG_SCHEDULER_STOP=1, STOP file / signal port, deadline, max steps — each recorded in the trace",
    "idempotent re-run: same state ⇒ same decisions digest (duplicateOf); a (runId, mission) is never dispatched twice",
    "V16.9 resume (opts.resume / --resume): only a STOPPED (or killed) last cycle with the SAME state digest is resumed — completed steps re-derived and checked identical, a completed EXECUTE carried over and never re-run; otherwise a fresh cycle, with the reason in the trace",
  ]),
});

module.exports = { deriveDispatchTimeout, DISPATCH_TIMEOUT_RULE, DISPATCH_TIMEOUT_DEFAULT_MS, DISPATCH_TIMEOUT_CEILING_MS, DISPATCH_TIMEOUT_MARGIN_MS, DISPATCH_DEADLINE_MARGIN_MS, OWNER_SELECTION_RULE, resolveOwnerSelection, ownerSelectionClaimKey, OWNER_ORDER_RULE, resolveOwnerOrder, resumeFromTrace, DEADLINE_HISTORY, resolveDispatchTarget, DISPATCH_TARGET_RULE, actionabilityOf, actionableCandidates, ACTIONABLE_RULE, ACTIONABLE_RULE_DETAIL, runGoCycle, assertConfinedWrite, STEPS, DEFAULTS, DECIDED_BY, SPEC_RULE, GO_CYCLE_CONTRACT, sha, canon, declaredAuthorization, scopedAuthorization, scopedExecutionAuthorization, specOf };
export {};

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
const DEFAULTS = Object.freeze({ mode: "DRY", maxSteps: STEPS.length, deadlineMs: 120000 });
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
const DISPATCH_TARGET_RULE = "GO-DT-1 (provider rule): a scoped execution step is dispatched only to contract.authorization.dispatchTargets[step] = { command, args?, writeSet } (command + writeSet ⊆ WORK_ITEM_CONTRACT.write_set, repo-relative, no '..'); absent/invalid ⇒ NO_DISPATCH_TARGET fail-closed, never a fallback to odg-run <id>; plain AUTHORIZED contracts keep the existing odg-run path";
function relPathOk(p: any): boolean { return typeof p === "string" && p.length > 0 && p.length <= 300 && !p.startsWith("/") && !/\\|\0/.test(p) && !p.replace(/\/$/, "").split("/").some((seg: string) => seg === ".." || seg === "." || seg === "") && /^[A-Za-z0-9._\/-]+$/.test(p); }
function withinWriteSet(p: string, ws: string[]): boolean { return ws.some((w: string) => p === w || (w.endsWith("/") && p.startsWith(w))); }
function resolveDispatchTarget(contract: any, step: string | null): any {
  const why = (code: string, reason: string) => ({ ok: false, code, step, rule: DISPATCH_TARGET_RULE, reason: `${code}: ${reason}` });
  if (!contract || !step) return why("NO_DISPATCH_TARGET", "no contract/step");
  const a = isObj(contract.authorization) ? contract.authorization : null;
  const t = a && isObj(a.dispatchTargets) ? a.dispatchTargets[step] : null;
  if (!isObj(t)) return why("NO_DISPATCH_TARGET", `contract ${contract.scenario} declares no authorization.dispatchTargets.${step} — a future owner-authorized, inspected revision must declare one (no fallback to odg-run ${contract.scenario})`);
  const ws = arr(contract.WORK_ITEM_CONTRACT && contract.WORK_ITEM_CONTRACT.write_set).map(String);
  if (!relPathOk(t.command) || String(t.command).endsWith("/")) return why("INVALID_DISPATCH_TARGET", "command must be a repo-relative path (no '..', no absolute path)");
  const args = t.args === undefined ? [] : t.args;
  if (!Array.isArray(args) || !args.every((x: any) => typeof x === "string" && /^[A-Za-z0-9._=:\/-]{1,200}$/.test(x) && !x.split("/").includes(".."))) return why("INVALID_DISPATCH_TARGET", "args must be plain tokens");
  const tws = arr(t.writeSet);
  if (!tws.length || !tws.every(relPathOk)) return why("INVALID_DISPATCH_TARGET", "writeSet must be a non-empty list of repo-relative paths");
  const outside = [t.command, ...tws].filter((x: string) => !withinWriteSet(x, ws));
  if (outside.length) return why("DISPATCH_TARGET_OUTSIDE_WRITE_SET", `${outside.join(", ")} ⊄ WORK_ITEM_CONTRACT.write_set`);
  return { ok: true, step, rule: DISPATCH_TARGET_RULE, target: { step, command: String(t.command), args: args.map(String), writeSet: tws.map(String) } };
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
function selectionSummary(d: any): any {
  return { decision: d.decision, selected: d.selected ? d.selected.id : null, proposed: d.proposed ? d.proposed.id : null, tiedSet: arr(d.tiedSet), resolvedBy: d.resolvedBy || null, justification: d.justification };
}
function chosenId(d: any): string | null { return d && (d.decision === "SELECTED" || d.decision === "TIE_EXPLAINED") && d.selected ? d.selected.id : null; }

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
  const deadlineMs = Number.isFinite(o.deadlineMs) && o.deadlineMs > 0 ? o.deadlineMs : DEFAULTS.deadlineMs;
  const now = () => Number(ports.now());
  const t0 = now();
  const prior = (() => { try { return arr(ports.trace.readPrior()); } catch { return []; } })();
  const cycleSeq = prior.filter((e: any) => e && e.kind === "CYCLE_START").length + 1;
  let runId = "pending";
  const steps: any[] = [];
  const counters = { dispatchCalls: 0, providerLaunched: 0, dispatchedMissions: [] as string[] };
  const append = (e: any) => { ports.trace.append({ ...e, runId, cycleSeq }); };
  const ctx: any = {};

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
    const end = { kind: "CYCLE_END", status, mode, stepsRun: steps.map((s) => `${s.step}:${s.status}`), decisionsDigest, durationMs: now() - t0, endedAt: iso(now()),
      dispatchCalls: counters.dispatchCalls, dispatchedMissions: counters.dispatchedMissions, providerLaunched: counters.providerLaunched,
      idempotent: priorSame.length > 0, duplicateOf: priorSame.length ? { cycleSeq: priorSame[0].cycleSeq, endedAt: priorSame[0].endedAt } : null, ...extra };
    append(end);
    return Object.freeze({ ...end, runId, cycleSeq, steps, context: ctx });
  };

  append({ kind: "CYCLE_START", mode, maxSteps, deadlineMs, startedAt: iso(t0) });

  // the step runner: stop-check BEFORE every step, uniform trace entry AFTER it.
  const run = async (step: string, fn: () => any, counted = true): Promise<any> => {
    const st = stopCheck(step);
    if (st) { append({ kind: "STOP", beforeStep: step, ...st, at: iso(now()) }); return { stopped: st }; }
    const startedAt = now();
    let r: any;
    try { r = fn(); } catch (e: any) { r = { status: "ERROR", inputs: null, decision: { error: String((e && e.message) || e) }, rationale: "step threw — fail-closed (cycle halts)" }; }
    const entry = { kind: "STEP", index: STEPS.indexOf(step) + 1, step, status: r.status, startedAt: iso(startedAt), endedAt: iso(now()), inputsSha256: sha(r.inputs), decision: plain(r.decision), rationale: r.rationale, decidedBy: DECIDED_BY[step] };
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
    let act: any = null, actItem: any = null;
    if (strategicItem && strategicAct.actionable) { act = d; actItem = strategicItem; }
    else if (strategicItem) {
      act = SEL.selectNextExplained(actionableCandidates(ctx.state, ctx.register), actionableOptions());
      const aid = chosenId(act);
      actItem = aid ? ctx.register.items.find((it: any) => it.id === aid) : null;
      if (actItem && !actionabilityOf(ctx.state, actItem).actionable) actItem = null;   // defensive: never a non-actionable pick
    }
    const proceedWithActionable = !!strategicItem && !strategicAct.actionable && !!actItem;
    ctx.item = proceedWithActionable ? actItem : strategicItem;
    ctx.strategicItem = strategicItem;
    ctx.ownerRequest = strategicItem && !strategicAct.actionable ? { item: strategicItem.id, authorizationNeeded: `owner — ${strategicItem.id} ${strategicItem.contractState || "PROPOSED"}${strategicItem.contractState === "AUTHORIZED" ? "" : " → AUTHORIZED (authorizedBy)"}`, reason: strategicAct.reason, requestedBy: "ODG GO (GO-ACT-1) — a REQUEST, not an authorization" } : null;
    ctx.actionable = { rule: ACTIONABLE_RULE, ruleDetail: ACTIONABLE_RULE_DETAIL, authoredBy: "technical provider (Claude Code) — provider-authored rule; every decision is the selector's",
      strategicActionable: strategicItem ? strategicAct : null,
      selection: act ? (act === d ? { sameAsStrategic: true, ...selectionSummary(d) } : { sameAsStrategic: false, ...selectionSummary(act), excludedNotAuthorizedNow: arr(act.excluded).filter((x: any) => x.status === NOT_AUTHORIZED_NOW).map((x: any) => x.id) }) : null,
      item: actItem ? actItem.id : null, basis: actItem ? actionabilityOf(ctx.state, actItem) : null, proceedingWith: ctx.item ? ctx.item.id : null, proceedingWithActionable: proceedWithActionable };
    const committed = ctx.state.registerEvidence && ctx.state.registerEvidence.decisionRecord ? ctx.state.registerEvidence.decisionRecord : null;
    const consistent = committed ? committed.decision === d.decision && committed.selected === (d.selected ? d.selected.id : null) && canon(arr(committed.tiedSet)) === canon(arr(d.tiedSet)) : null;
    return { status: id ? "DONE" : "HALTED", inputs: REG.toSelectorCandidates(ctx.register),
      decision: { decision: d.decision, selected: d.selected ? d.selected.id : null, proposed: d.proposed ? d.proposed.id : null, tiedSet: arr(d.tiedSet), resolvedBy: d.resolvedBy || null, resolutionSteps: d.resolutionSteps || null, justification: d.justification, uncertainty: d.selected ? d.selected.uncertainty : d.proposed ? d.proposed.uncertainty : null, ownerAuthorizationRequired: arr(d.ownerAuthorizationRequired).map((x: any) => x.id), consistentWithCommittedRegisterEvidence: consistent,
        strategicSelection: selectionSummary(d), actionableSelection: ctx.actionable, ownerRequest: ctx.ownerRequest, workingOn: ctx.item ? ctx.item.id : null },
      rationale: (id ? `selector decision ${d.decision}${d.decision === "TIE_EXPLAINED" ? ` (tie ${arr(d.tiedSet).join("/")} resolved by ${d.resolvedBy})` : ""} — a PROPOSAL, not an authorization` : `selector decision ${d.decision}: ODG does not pick (no id tie-break) — owner/ODG decision required`)
        + (proceedWithActionable ? `; strategic ${id} lacks authorization (owner request recorded) ⇒ GO proceeds with the best AUTHORIZED item ${ctx.item.id} (GO-ACT-1: ${ACTIONABLE_RULE})` : strategicItem && !strategicAct.actionable ? `; strategic ${id} lacks authorization and no other item has an AUTHORIZED next step ⇒ the gate will hold (owner request recorded)` : "") };
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
  r = await run("EXECUTE", () => {
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
    const dt = scopedExec ? resolveDispatchTarget(ctx.contract, ctx.scope.currentStep) : null;
    ctx.dispatchTarget = dt;
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
      return { ok: true, reason: "authorized + native + isolated" };
    };
    const dispatch = (next: any) => {
      const tgt = !!item && next.mission === item.id && dt && dt.ok ? dt.target : null;
      if (mode !== "EXECUTE") return { detail: `${DRY_MARK}: would dispatch ${next.mission} ${tgt ? `via its declared target ${tgt.command}` : "via the governed pipeline"} in ${isolationSeen && isolationSeen.workspace}` };
      counters.dispatchCalls++; counters.dispatchedMissions.push(next.mission);
      append({ kind: "DISPATCHED", mission: next.mission, workspace: isolationSeen && isolationSeen.workspace, dispatchTarget: tgt, at: iso(now()) });
      return ports.dispatchNative(tgt ? { ...next, dispatchTarget: tgt } : next, { workspace: isolationSeen && isolationSeen.workspace, dispatchTarget: tgt });
    };
    const d = SCHED.schedulerStep({ queue: ctx.queue, preAuthorized: [...allow, ...(item && ctx.loopAuthorized ? [item.id] : [])], isProven: (id: string) => proven.has(id) || already.has(id), stopSignal: () => { const s = stopCheck("EXECUTE/dispatch"); return !!s && s.reason !== "MAX_STEPS"; }, authorize, dispatch, policy: { maxAttemptsPerMission: 3 } });
    const dry = mode !== "EXECUTE" && d.status === "NOT_MEASURABLE" && String(d.reason).startsWith(DRY_MARK);
    let failureNext: any = null;
    if (d.status === "FAIL" && ctx.strategy) failureNext = SM.nextStrategyAfterFailure({ mode: ctx.strategy.mode, strategy: "DEFAULT" }, { accepted: false, stopReason: "VERIFICATION_FAILED" });
    const status = d.status === "PASS" || d.status === "FAIL" ? `EXECUTED_${d.status}` : dry ? "WOULD_DISPATCH" : d.status === "STOPPED" ? "STOPPED" : gateHeld || d.status === "IDLE" || d.status === "BLOCKED" ? "NOTHING_EXECUTED" : d.status;
    return { status, inputs: { queue: ctx.queue, mode },
      decision: { scheduler: { status: d.status, mission: d.mission, reason: d.reason }, dispatchTarget: dt ? { ok: dt.ok, code: dt.code || null, step: dt.step, target: dt.target || null, reason: dt.reason || null, rule: DISPATCH_TARGET_RULE } : null, mode, dispatchCalls: counters.dispatchCalls, providerLaunched: false, delegationRecords: delegation, nextStrategyAfterFailure: failureNext ? { next: failureNext.next, rule: failureNext.rule } : null, commitOrMerge: "NONE (GO never commits/merges)" },
      rationale: status === "NOTHING_EXECUTED" ? (dt && !dt.ok ? `scoped execution step ${dt.step} authorized but ${dt.reason} — fail-closed, nothing dispatched` : `authorization gate held: ${d.reason}`) : status === "WOULD_DISPATCH" ? "dry run: an authorized native isolated mission would be dispatched (not executed)" : `scheduler ${d.status}: ${d.reason}` };
  });
  if (stopped(r)) return stopped(r);
  if (r.status === "STOPPED") return finish("STOPPED", { stop: { reason: "EMERGENCY_STOP", source: "schedulerStep stopSignal" } });
  const execStatus = r.status;

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
  ]),
});

module.exports = { resolveDispatchTarget, DISPATCH_TARGET_RULE, actionabilityOf, actionableCandidates, ACTIONABLE_RULE, ACTIONABLE_RULE_DETAIL, runGoCycle, assertConfinedWrite, STEPS, DEFAULTS, DECIDED_BY, SPEC_RULE, GO_CYCLE_CONTRACT, sha, canon, declaredAuthorization, scopedAuthorization, scopedExecutionAuthorization, specOf };
export {};

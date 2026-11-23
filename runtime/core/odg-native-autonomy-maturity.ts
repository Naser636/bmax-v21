#!/usr/bin/env node
"use strict";
/*
 * V15.5 Step 7 — NATIVE AUTONOMY vs PROVIDER WORK: an HONEST, reproducible measure. PURE, deterministic, read-only.
 *
 * NO SECOND ENGINE. This module is a COMPOSITION VIEW over the canonical measures that already exist:
 *   - odg-capability-maturity.coarseLevel        — the §9 ladder, projected to ABSENT/BUILT_NOT_WIRED/WIRED_TESTED/EXERCISED_LIVE
 *   - odg-autonomy-maturity-report.reportMaturityFromLedger — native/assisted/escalated over the mission-ledger, with
 *                                                   the actor-attribution COVERAGE limit surfaced (not masked)
 *   - audit-log.verifyChain                       — tamper-evidence of the scheduler decision chain
 *   - odg-native-engineering.EXEC                 — the execution taxonomy (ODG_NATIVE / CLAUDE_CODE / HUMAN / SIM / NM)
 * The caller (runtime/bin/odg-native-autonomy-maturity-run.ts) performs every read; this module only classifies.
 *
 * HONESTY (hard rules):
 *  - SEPARATE counters, never blended into one "autonomy %". Each counter carries an explicit window + evidence source.
 *  - A counter with no evidence source is NOT_MEASURED (value null), never 0-by-default and never guessed.
 *  - PROVIDER WORK IS NEVER COUNTED AS NATIVE. A commit authored under the "ODG Runtime" git identity is NOT native when
 *    it carries Claude Code attribution — the git identity is the session's config, not the actor.
 *  - The trigger of a decision/run is reported (UNATTENDED cadence vs PROVIDER_INVOKED vs CONTROLLED_EXPERIMENT): an ODG
 *    component deciding inside a run a provider launched is an ODG decision, but NOT unattended autonomy.
 *  - A record that looks like a leaked test fixture (non-ISO timestamps) is EXCLUDED and reported, never counted.
 */
const CM = require("./odg-capability-maturity.js");
const AMR = require("./odg-autonomy-maturity-report.js");
const AUDIT = require("./audit-log.js");
const NE = require("./odg-native-engineering.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function str(v: any): string { return typeof v === "string" ? v : ""; }
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

const NOT_MEASURED = "NOT_MEASURED";
const TRIGGER = freeze({
  UNATTENDED: "UNATTENDED_CADENCE",          // periodic runner (cadence-consistent; per-row trigger not recorded)
  PROVIDER_INVOKED: "PROVIDER_INVOKED_RUN",  // ODG code ran on real state, but a provider launched it
  EXPERIMENT: "CONTROLLED_EXPERIMENT",       // provider-written harness / temp dirs — NOT live state
  NONE: "NONE",
});

/** window(nowIso, days) -> { from, to, days } ; to = nowIso. */
function windowOf(nowIso: string, days: number): any {
  const t = Date.parse(nowIso);
  if (!Number.isFinite(t)) return freeze({ from: null, to: null, days, valid: false });
  return freeze({ from: new Date(t - days * 86400000).toISOString(), to: new Date(t).toISOString(), days, valid: true });
}
function inWin(ts: any, w: any): boolean { return ISO.test(str(ts)) && (!w || !w.from || (ts >= w.from && ts <= w.to)); }

/* ---------------------------------------------------------------- (1) native DECISIONS ---------------------------- */
/** classifyAttempt(row) -> decision class. Explicit, reason-text-keyed; unknown ⇒ OTHER (still a recorded decision). */
function classifyAttempt(row: any): string {
  const s = str(row && row.status);
  const r = str(row && row.reason);
  if (/WRITE_SET_(MALFORMED|VIOLATION)|FOREIGN_APPEND/.test(r)) return "WRITE_SET_REFUSAL";
  if (/NO_PROGRESS|REPAIR_STOP|no-progress/i.test(r)) return "REPAIR_STOP";
  if (s === "STARTUP_REFUSED") return "TRUTH_LOCK_REFUSAL";
  if (s === "BLOCKED") return "AUTHORIZATION_REFUSAL";
  if (s === "IDLE" && /ALREADY_PROVEN \(dedup\)/.test(r)) return "DEDUP_REFUSAL";
  if (s === "IDLE") return "NO_ELIGIBLE_MISSION";
  if (s === "PASS" || s === "FAIL") return /wave/i.test(r) ? "WAVE_ADMISSION" : "ADMISSION_DISPATCH";
  return "OTHER";
}
/** cadence(rows) — share of consecutive gaps within [13,17] min: evidence of a periodic (unattended) runner. */
function cadence(rows: any[]): any {
  const ts = rows.map((r) => Date.parse(r.recordedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  let regular = 0;
  for (let i = 1; i < ts.length; i++) { const g = (ts[i] - ts[i - 1]) / 60000; if (g >= 13 && g <= 17) regular++; }
  const gaps = Math.max(0, ts.length - 1);
  return freeze({ gaps, regular15min: regular, share: gaps > 0 ? Number((regular / gaps).toFixed(4)) : null });
}
function countDecisions(attempts: any[], auditChain: any, win: any): any {
  const rows = arr(attempts).filter((a) => isObj(a) && inWin(a.recordedAt, win));
  const byClass: Record<string, number> = {};
  for (const a of rows) { const c = classifyAttempt(a); byClass[c] = (byClass[c] || 0) + 1; }
  const chain = Array.isArray(auditChain) ? auditChain : null;
  const v = chain ? AUDIT.verifyChain(chain) : null;
  // DISTINCT decisions: identical (status, reason) rows are the SAME decision repeated by the periodic runner.
  const kinds: Record<string, any> = {};
  for (const a of rows) {
    const norm = str(a.status) === "STARTUP_REFUSED" ? truthLockCause(str(a.reason)) : normReason(str(a.reason));
    const k = str(a.status) + " | " + norm;
    if (!kinds[k]) kinds[k] = { status: str(a.status), reason: norm, decisionClass: classifyAttempt(a), count: 0, first: a.recordedAt, last: a.recordedAt };
    const e = kinds[k]; e.count++; if (a.recordedAt < e.first) e.first = a.recordedAt; if (a.recordedAt > e.last) e.last = a.recordedAt;
  }
  const distinct = Object.values(kinds).sort((x: any, y: any) => y.count - x.count || (x.reason < y.reason ? -1 : 1)).map((e: any) => freeze({ ...e }));
  const repeatedNoOps = distinct.filter((e: any) => e.decisionClass === "DEDUP_REFUSAL" || e.decisionClass === "NO_ELIGIBLE_MISSION").reduce((n: number, e: any) => n + e.count, 0);
  const meaningful = rows.filter((a) => MEANINGFUL.has(classifyAttempt(a))).length;
  const truthLock = truthLockIncidents(rows);
  return freeze({
    value: attempts === null ? null : rows.length,
    status: attempts === null ? NOT_MEASURED : "MEASURED",
    rowsAreNotDistinctDecisions: true,
    distinctDecisionKinds: attempts === null ? null : distinct.length,
    repeatedNoOpRows: attempts === null ? null : repeatedNoOps,
    meaningfulDecisions: attempts === null ? null : meaningful,
    meaningfulDefinition: "rows whose class is one of " + Array.from(MEANINGFUL).join("/") + " (an admission/dispatch or a refusal of a concrete mission); repeated dedup / no-eligible no-ops and truth-lock startup refusals are excluded",
    distinctDecisions: freeze(distinct.slice(0, 25)),
    truthLockRefusalCauses: truthLock,
    byClass: freeze(byClass),
    trigger: TRIGGER.UNATTENDED,
    cadence: cadence(rows),
    schedulerAuditChain: chain ? freeze({ entries: chain.length, verify: freeze({ ok: v.ok, reason: v.reason, keyed: v.keyed, tipAnchored: v.tipAnchored }) }) : NOT_MEASURED,
    source: "runtime/generated/mission-attempt-log.jsonl (one row per tick decision by odg-schedule-tick) + runtime/generated/scheduler-audit-chain.json (audit-log.verifyChain)",
    note: "every row is a decision TAKEN BY ODG CODE, but ROWS ARE NOT DISTINCT DECISIONS: the periodic runner repeats the same no-op (e.g. the same ALREADY_PROVEN dedup) every tick, and truth-lock refusals mostly record a runner OUTAGE (main checkout off main), not threats. Read meaningfulDecisions + distinctDecisionKinds, not value. The per-row trigger is NOT recorded; the 15-min cadence share is the evidence of the periodic runner. Wave selection / write-set refusals / repair-stop reasons only count when they appear in this persistent log — worktree runs a provider launched are reported separately (providerInvokedDecisions).",
  });
}

/** normReason — volatile parts (commit shas) replaced so the same decision with a different HEAD is ONE kind. */
function normReason(r: string): string { return r.replace(/\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g, "<sha>").replace(/\b\d+ staged change/g, "<n> staged change"); }
/** truthLockCause(reason) — the CAUSE of a startup refusal (one decision per cause, whatever the volatile details). */
function truthLockCause(r: string): string {
  const m = /unexpected branch "([^"]+)"/.exec(r);
  return m ? "MAIN_CHECKOUT_ON_BRANCH " + m[1] : /diverges from origin/.test(r) ? "HEAD_DIVERGES_FROM_ORIGIN_MAIN" : "OTHER: " + normReason(r).slice(0, 80);
}
const MEANINGFUL = Object.freeze(new Set(["ADMISSION_DISPATCH", "WAVE_ADMISSION", "AUTHORIZATION_REFUSAL", "WRITE_SET_REFUSAL", "REPAIR_STOP"]));
/** truthLockIncidents(rows) — group STARTUP_REFUSED by CAUSE (unexpected branch name / HEAD divergence) with first/last.
 * A truth-lock refusal caused by the MAIN checkout being left on a feature branch is a RUNNER OUTAGE (the runner could
 * not run), NOT a detected threat. Who switched the branch is NOT recorded; feature-branch names are provider work branches. */
function truthLockIncidents(rows: any[]): any {
  const by: Record<string, any> = {};
  for (const a of rows) {
    if (str(a.status) !== "STARTUP_REFUSED") continue;
    const cause = truthLockCause(str(a.reason));
    if (!by[cause]) by[cause] = { cause, count: 0, first: a.recordedAt, last: a.recordedAt };
    const e = by[cause]; e.count++; if (a.recordedAt < e.first) e.first = a.recordedAt; if (a.recordedAt > e.last) e.last = a.recordedAt;
  }
  const causes = Object.values(by).sort((x: any, y: any) => y.count - x.count).map((e: any) => freeze({ ...e }));
  const offMain = causes.filter((c: any) => /^MAIN_CHECKOUT_ON_BRANCH /.test(c.cause));
  const offMainRows = offMain.reduce((n: number, c: any) => n + c.count, 0);
  const total = causes.reduce((n: number, c: any) => n + c.count, 0);
  return freeze({
    total,
    causes: freeze(causes),
    incident: offMainRows > 0 ? freeze({
      id: "RUNNER_OUTAGE_MAIN_CHECKOUT_OFF_MAIN",
      finding: offMainRows + " of " + total + " truth-lock refusals were caused by the MAIN checkout being left on " + offMain.length + " non-main branch(es) — the periodic runner was OUT (it refused to start), not detecting threats",
      ticksLost: offMainRows,
      span: freeze({ first: offMain.reduce((m: string, c: any) => (c.first < m ? c.first : m), offMain[0].first), last: offMain.reduce((m: string, c: any) => (c.last > m ? c.last : m), offMain[0].last) }),
      likelyCause: "provider sessions working in the main checkout on feature branches (branch names are provider work branches); the actor who switched branches is NOT recorded",
      remedy: "provider work only in isolated worktrees (the main checkout stays on main) — already the standing V15.5 rule",
    }) : null,
  });
}

/* ---------------------------------------------------------------- (2) native EXECUTIONS ---------------------------- */
function countNativeExecutions(attempts: any[], ledger: any, win: any): any {
  const rows = arr(attempts).filter((a) => isObj(a) && inWin(a.recordedAt, win) && (a.status === "PASS" || a.status === "FAIL"));
  const entries = isObj(ledger) ? arr(ledger.entries) : arr(ledger);
  const inWinLedger = entries.filter((e) => isObj(e) && inWin(e.recordedAt, win));
  const odgActor = inWinLedger.filter((e) => e.actor === "ODG");
  const report = ledger === null ? null : AMR.reportMaturityFromLedger({ entries: inWinLedger });
  return freeze({
    dispatchedByOdgRunner: attempts === null ? null : rows.length,
    dispatchedPass: attempts === null ? null : rows.filter((a) => a.status === "PASS").length,
    dispatchedMissions: attempts === null ? NOT_MEASURED : freeze(Array.from(new Set(rows.map((a) => str(a.mission)))).sort()),
    ledgerEntriesInWindow: ledger === null ? null : inWinLedger.length,
    ledgerActorOdg: ledger === null ? null : odgActor.length,
    ledgerActorOdgMissions: freeze(odgActor.map((e) => str(e.mission))),
    ledgerUnattributed: ledger === null ? null : inWinLedger.filter((e) => !str(e.actor)).length,
    maturityReport: report ? freeze({ distinctMissions: report.distinctMissions, attribution: report.attribution, nativeAutonomyMeasurable: report.nativeAutonomyMeasurable }) : NOT_MEASURED,
    status: attempts === null && ledger === null ? NOT_MEASURED : "MEASURED",
    source: "mission-attempt-log PASS/FAIL rows (missions the ODG runner admitted+dispatched) + mission-ledger entries whose actor-provenance resolved actor=ODG (odg-autonomy-maturity-report)",
    note: "an UNATTRIBUTED ledger entry is NOT counted native (validated ≠ natively executed). The ledger actor=ODG entries come from runs of ODG's deterministic native executor (EXEC " + NE.EXEC.NATIVE + "); the run itself may have been provider-invoked.",
  });
}

/* ---------------------------------------------------------------- (3) PROVIDER work + (5) native BUILT -------------- */
// ANY provider attribution, case-insensitive, anywhere in the message (some commits put the trailer mid-line): a Co-authored-by naming an AI provider/assistant (Claude, Anthropic,
// OpenAI/GPT/ChatGPT/Codex, Copilot, Gemini/Google AI, Cursor, Devin, Aider, Mistral, …) or a "Generated with <tool>" line.
const PROVIDER_TRAILER = /Co-authored-by:[^\n]*(claude|anthropic|openai|chatgpt|\bgpt|codex|copilot|gemini|bard|cursor|devin|aider|mistral|llama|ollama|qwen|deepseek|\bai\b|\[bot\])|Generated with \[?(claude|codex|copilot|cursor|chatgpt|gemini|aider)/im;
// A TEXT trailer claiming native authorship. It is NOT identity-bound (anyone can type it) ⇒ at most an UNVERIFIED_CLAIM.
const NATIVE_TRAILER = /^ODG-Native-Actor:\s*ODG\s*$/im;
/** commits: [{ sha, at, author, body, merge?:bool, pr?:number, prCommitShas?:string[] }] */
function countProviderWork(commits: any[], win: any, arcFromPr: number): any {
  const all = arr(commits).filter(isObj);
  const nonMerge = all.filter((c) => c.merge !== true);
  const merges = all.filter((c) => c.merge === true && typeof c.pr === "number");
  const attributedSet = new Set(nonMerge.filter((c) => PROVIDER_TRAILER.test(str(c.body))).map((c) => c.sha));
  const prDelegated = (m: any) => arr(m.prCommitShas).some((s: string) => attributedSet.has(s)) || PROVIDER_TRAILER.test(str(m.body));
  const slice = (w: any, arcOnly: boolean) => {
    const nm = nonMerge.filter((c) => (w ? inWin(c.at, w) : true));
    const ms = merges.filter((m) => (w ? inWin(m.at, w) : true) && (!arcOnly || m.pr >= arcFromPr));
    const nmArc = arcOnly ? nm.filter((c) => ms.some((m) => arr(m.prCommitShas).includes(c.sha))) : nm;
    const attributed = nmArc.filter((c) => attributedSet.has(c.sha));
    // native CLAIM ⇔ native trailer AND NO provider attribution of any form. Both ⇒ PROVIDER + CONFLICTING_ATTRIBUTION.
    const conflicting = attributed.filter((c) => NATIVE_TRAILER.test(str(c.body)));
    const native = nmArc.filter((c) => NATIVE_TRAILER.test(str(c.body)) && !attributedSet.has(c.sha));
    return freeze({
      commits: nmArc.length,
      providerAttributedCommits: attributed.length,
      unattributedCommits: nmArc.length - attributed.length - native.length,
      conflictingAttribution: freeze(conflicting.map((c) => freeze({ sha: str(c.sha), flag: "CONFLICTING_ATTRIBUTION", countedAs: "PROVIDER" }))),
      odgIdentityButProviderAttributed: attributed.filter((c) => /ODG/i.test(str(c.author))).length,
      mergedPrs: ms.length,
      providerDelegatedPrs: ms.filter(prDelegated).length,
      prRange: ms.length ? [Math.min(...ms.map((m) => m.pr)), Math.max(...ms.map((m) => m.pr))] : null,
      nativeClaimCommits: native.length, // UNVERIFIED text claims, never 'native'
    });
  };
  if (commits === null) return freeze({ status: NOT_MEASURED, source: "git log (unavailable)" });
  return freeze({
    status: "MEASURED",
    last30d: slice(win, false),
    v15Arc: freeze({ fromPr: arcFromPr, ...slice(null, true) }),
    source: "git log of the measured ref (non-merge commits: any case-insensitive Co-authored-by naming an AI provider (Claude/Anthropic/OpenAI/Copilot/Gemini/…) or 'Generated with <AI tool>'; merged PRs from 'Merge pull request #N' merge commits, delegated iff any commit of merge^1..merge^2 carries the attribution)",
    note: "provider work is NEVER native. 'unattributed' commits are NOT native either — they lack ANY actor provenance (owner hand-commits or older sessions).",
  });
}
function countNativeBuilt(provider: any): any {
  if (!isObj(provider) || provider.status !== "MEASURED") return freeze({ value: null, status: NOT_MEASURED });
  const claims30 = provider.last30d.nativeClaimCommits;
  const claimsArc = provider.v15Arc.nativeClaimCommits;
  const conflicts = provider.last30d.conflictingAttribution.length;
  return freeze({
    value: 0, // identity-bound native commits: no verifier/binding exists in this repo ⇒ none can be verified
    identityBoundVerification: "UNAVAILABLE — no commit carries an identity-bound (e.g. agent-identity Ed25519-signed) native-actor provenance, and this measure has no such verifier",
    unverifiedNativeClaims: freeze({ last30d: claims30, v15Arc: claimsArc, status: claims30 + claimsArc > 0 ? "UNVERIFIED_CLAIM" : "NONE" }),
    conflictingAttributionLast30d: conflicts,
    status: claims30 + claimsArc > 0 ? "UNVERIFIED_CLAIM" : "MEASURED_ZERO",
    source: "git log — a text trailer 'ODG-Native-Actor: ODG' on a commit with NO provider attribution is only an UNVERIFIED claim (text is not identity-bound); a commit with both is PROVIDER (CONFLICTING_ATTRIBUTION)",
    note: (claims30 + claimsArc === 0
      ? "0 native-built corrections, and 0 even claimed: no commit in the windows claims native authorship. "
      : (claims30 + claimsArc) + " commit(s) CLAIM native authorship by text trailer only — UNVERIFIED_CLAIM, NOT counted native (value stays 0). ")
      + (conflicts ? conflicts + " commit(s) carry BOTH a native claim and provider attribution ⇒ counted PROVIDER, flagged CONFLICTING_ATTRIBUTION. " : "")
      + "ODG has PROPOSED corrections (counter 4); real-repo write by ODG is OWNER_GATED.",
  });
}

/* ---------------------------------------------------------------- (4) corrections PROPOSED ---------------------- */
/** inputs: { frontierRegistry, selfDiagnosticIncidents, nativeProvenance, supervisorSnapshot } (null ⇒ source absent) */
function countProposals(src: any): any {
  const s = isObj(src) ? src : {};
  const parts: any = {};
  const excluded: any[] = [];
  if (isObj(s.frontierRegistry)) {
    const items = arr(s.frontierRegistry.items).filter(isObj);
    parts.frontierProposals = items.filter((i) => i.status === "PROPOSED" && ISO.test(str(i.recordedAt))).length;
  } else parts.frontierProposals = NOT_MEASURED;
  if (isObj(s.selfDiagnosticIncidents)) {
    const inc = Object.values(isObj(s.selfDiagnosticIncidents.incidents) ? s.selfDiagnosticIncidents.incidents : {}).filter(isObj) as any[];
    const real = inc.filter((i) => ISO.test(str(i.createdAt)));
    for (const i of inc) if (!ISO.test(str(i.createdAt))) excluded.push(freeze({ id: str(i.id), reason: "non-ISO createdAt '" + str(i.createdAt) + "' — looks like a leaked test fixture; EXCLUDED" }));
    parts.selfDiagnosticRepairHypotheses = real.reduce((n, i) => n + arr(i.hypotheses).length, 0);
  } else parts.selfDiagnosticRepairHypotheses = NOT_MEASURED;
  if (isObj(s.nativeProvenance) && isObj(s.nativeProvenance.proposedTransforms)) {
    parts.nativeTransformProposals = typeof s.nativeProvenance.proposedTransforms.count === "number" ? s.nativeProvenance.proposedTransforms.count : NOT_MEASURED;
  } else parts.nativeTransformProposals = NOT_MEASURED;
  if (isObj(s.supervisorSnapshot) && isObj(s.supervisorSnapshot.freeing)) {
    parts.supervisorFreeingProposals = arr(s.supervisorSnapshot.freeing.items).length;
  } else parts.supervisorFreeingProposals = NOT_MEASURED;
  const nums = Object.values(parts).filter((v) => typeof v === "number") as number[];
  return freeze({
    value: nums.length ? nums.reduce((a, b) => a + b, 0) : null,
    status: nums.length ? "MEASURED" : NOT_MEASURED,
    parts: freeze(parts),
    excluded: freeze(excluded),
    window: "ALL_TIME (the proposal artifacts are cumulative registries, not time-series)",
    source: "runtime/generated/autonomy/frontier-proposal-registry.json, runtime/generated/autonomy/self-diagnostic-incidents.json, docs/odg/native-execution-provenance.json (proposedTransforms), docs/odg/evidence/V155_AGENT_SUPERVISOR_SNAPSHOT.json (freeing — PROPOSAL ONLY)",
    note: "PROPOSED ≠ APPLIED. nativeTransformProposals INCLUDES benign/redundant candidates (see that artifact's own note) — it is NOT a count of real defects. Proposals from runs a provider launched are still ODG-generated proposals.",
  });
}

/* ---------------------------------------------------------------- (6) independent VALIDATIONS -------------------- */
/** evidence: [{ file, json }] ; commits for 'independent inspection' mentions */
function countValidations(evidence: any[], commits: any[], win: any): any {
  const recs: any[] = [];
  for (const e of arr(evidence)) {
    const j = isObj(e) ? e.json : null;
    if (!isObj(j)) continue;
    const rounds = arr(j.rounds).filter((r) => isObj(r) && typeof r.verdict === "string");
    if (rounds.length) recs.push(freeze({ file: str(e.file), rounds: rounds.length, verdicts: freeze(rounds.map((r) => r.verdict)), inspector: str(j.inspector).slice(0, 160) || "UNSTATED" }));
    else if (isObj(j.inspection_fixes_after_review)) recs.push(freeze({ file: str(e.file), rounds: 1, verdicts: freeze(["FIXES_AFTER_REVIEW"]), inspector: "UNSTATED (fixes recorded after a review)" }));
  }
  const nm = commits === null ? null : arr(commits).filter((c) => isObj(c) && c.merge !== true && inWin(c.at, win) && /independent inspection|inspection REJECT|per independent/i.test(str(c.body)));
  const providerSubagent = recs.filter((r) => /provider|subagent|NOT an independent party/i.test(r.inspector)).length;
  return freeze({
    recordedInspectionRounds: recs.length ? recs.reduce((n, r) => n + r.rounds, 0) : null,
    recordedInspectionRoundsStatus: recs.length ? "MEASURED" : NOT_MEASURED,
    records: freeze(recs),
    commitsCitingIndependentInspection: nm === null ? NOT_MEASURED : nm.length,
    byInspector: freeze({ providerSubagent, unstated: recs.length - providerSubagent, owner: NOT_MEASURED, odgNativeEvaluator: NOT_MEASURED }),
    status: "MEASURED (only what is verifiable on disk / in git)",
    source: "docs/odg/evidence/*.json (rounds[].verdict, inspection_fixes_after_review) + git commit messages in the 30-day window",
    note: "the inspections recorded are by the PROVIDER's own inspection subagent (separate context, same session) — NOT an independent party and NOT ODG-native. Verdicts held only in PR conversations/session transcripts are NOT_MEASURED here. ODG's native evaluator-independence has no persistent verdict log ⇒ NOT_MEASURED.",
  });
}

/* ---------------------------------------------------------------- (7) autonomous RECOVERIES --------------------- */
function countRecoveries(attempts: any[], supervisor: any, experiments: any[], win: any): any {
  const rows = arr(attempts).filter((a) => isObj(a) && inWin(a.recordedAt, win));
  const live = rows.filter((a) => /INTERRUPTED_PRIOR_RUN|RESUMED|reclaim|takeover|stale claim/i.test(str(a.reason)));
  let sup: any = NOT_MEASURED;
  if (isObj(supervisor) && isObj(supervisor.metrics)) {
    const rec = arr(supervisor.recovery).filter(isObj);
    sup = freeze({ interruptedObserved: (supervisor.metrics.byState || {}).INTERRUPTED ?? null, relaunchDecisions: rec.filter((r) => r.decision === "RELAUNCH").length, refuseDecisions: rec.filter((r) => r.decision === "REFUSE").length, trigger: TRIGGER.PROVIDER_INVOKED });
  }
  const exp = arr(experiments).filter(isObj).map((x) => freeze({ file: str(x.file), recoveries: typeof x.recoveries === "number" ? x.recoveries : 0, trigger: TRIGGER.EXPERIMENT }));
  return freeze({
    unattendedLive: attempts === null ? null : live.length,
    status: attempts === null ? NOT_MEASURED : "MEASURED",
    supervisor: sup,
    providerTriggeredExperiments: freeze(exp),
    source: "mission-attempt-log reasons (INTERRUPTED_PRIOR_RUN/RESUMED/reclaim/takeover) in window + V155_AGENT_SUPERVISOR_SNAPSHOT recovery decisions + controlled interruption experiments (V150_SCENARIO_M_RESUME, V155_REAL_WAVE_EVIDENCE step4_interruption)",
    note: "an experiment where the PROVIDER killed a run and re-ran the next tick proves the recovery MECHANISM, not unattended autonomous recovery. Only persistent-log events count as unattendedLive.",
  });
}

/* ---------------------------------------------------------------- 20-capability LADDER ------------------------- */
/** specs: [{ id, name, components[], live:{ trigger, source } | null }] ; facts: { [component]: { built, tested, wired } }, liveOk: { [source]: bool } */
function capabilityLadder(specs: any[], facts: any, liveOk: any): any {
  const f = isObj(facts) ? facts : {};
  const lv = isObj(liveOk) ? liveOk : {};
  const items = arr(specs).filter(isObj).map((s) => {
    const comps = arr(s.components).map((c: string) => freeze({ component: c, ...(isObj(f[c]) ? f[c] : { built: false, tested: false, wired: false }) }));
    // the capability is as mature as its BEST fully-evidenced component (any one component carrying the capability end-to-end)
    const best = comps.reduce((acc: any, c: any) => (Number(c.built) + Number(c.tested) + Number(c.wired) > Number(acc.built) + Number(acc.tested) + Number(acc.wired) ? c : acc), { built: false, tested: false, wired: false });
    const liveSrc = isObj(s.live) ? s.live : null;
    const liveCounts = !!liveSrc && liveSrc.trigger !== TRIGGER.EXPERIMENT && lv[liveSrc.source] === true;
    const c = CM.coarseLevel({ built: best.built === true, tested: best.tested === true, wired: best.wired === true, exercisedLive: liveCounts });
    return freeze({
      id: s.id, name: s.name, level: c.level, ladderLevel: c.ladderLevel, firstGap: c.firstGap,
      components: freeze(comps),
      liveEvidence: liveSrc ? freeze({ source: liveSrc.source, trigger: liveSrc.trigger, present: lv[liveSrc.source] === true, countedLive: liveCounts }) : NOT_MEASURED,
      note: str(s.note),
    });
  });
  const byLevel: Record<string, number> = {};
  for (const l of CM.COARSE_LEVELS) byLevel[l] = 0;
  for (const i of items) byLevel[i.level] = (byLevel[i.level] || 0) + 1;
  const unattendedLive = items.filter((i: any) => i.level === "EXERCISED_LIVE" && i.liveEvidence !== NOT_MEASURED && i.liveEvidence.trigger === TRIGGER.UNATTENDED).length;
  return freeze({ total: items.length, byLevel: freeze(byLevel), exercisedLiveUnattended: unattendedLive, items: freeze(items), note: "per-capability level, NO blended score. built = file exists; tested = its .test.ts exists AND is in package.json test:report (the CI gate — ci.yml runs only test:report; testFileExists is reported separately); wired = required by ≥1 non-test runtime/src file other than itself; EXERCISED_LIVE = a real-state run artifact exists (CONTROLLED_EXPERIMENT never counts). A provider-invoked live run is EXERCISED_LIVE but NOT unattended (see exercisedLiveUnattended)." });
}

/** nextSequence(ladder, steps) — keep the curated steps whose capability is still below the step's target level. */
function nextSequence(ladder: any, steps: any[]): any[] {
  const lvl: Record<string, string> = {};
  for (const i of arr(ladder && ladder.items)) lvl[i.id] = i.level;
  const idx = (l: string) => CM.COARSE_LEVELS.indexOf(l);
  return arr(steps).filter((s) => isObj(s) && lvl[s.capability] !== undefined && idx(lvl[s.capability]) < idx(s.target)).map((s) => freeze({ ...s, current: lvl[s.capability] })).slice(0, 5);
}

/** providerInvoked(items) — numeric counts summed; null-count items are NOT dropped (listed as unmeasured). */
function providerInvoked(items: any): any {
  const all = arr(items).filter(isObj);
  const measured = all.filter((d) => typeof d.count === "number");
  const unmeasured = all.filter((d) => typeof d.count !== "number");
  return freeze({
    value: measured.length ? measured.reduce((n: number, d: any) => n + d.count, 0) : null,
    status: measured.length ? (unmeasured.length ? "PARTIAL (unmeasured items listed)" : "MEASURED") : NOT_MEASURED,
    items: freeze(measured.map((d) => freeze({ ...d }))),
    unmeasuredItems: freeze(unmeasured.map((d) => freeze({ ...d, count: NOT_MEASURED }))),
    trigger: TRIGGER.PROVIDER_INVOKED,
    note: "decisions ODG code took inside runs a PROVIDER launched (wave selection, write-set enforcement, supervisor recovery refusals) — ODG decisions, NOT unattended autonomy; kept out of counter 1. Items without a machine-recorded count are listed, never summed as 0.",
  });
}

/** buildReport(input) — the whole measure. input carries every pre-read source (null ⇒ source absent). */
function buildReport(input: any): any {
  const i = isObj(input) ? input : {};
  const win = windowOf(str(i.now), 30);
  const provider = countProviderWork(i.commits === undefined ? null : i.commits, win, typeof i.arcFromPr === "number" ? i.arcFromPr : 870);
  const ladder = capabilityLadder(i.capabilitySpecs, i.componentFacts, i.liveOk);
  return freeze({
    schema: "odg.native-autonomy-maturity.v1",
    id: "V155_NATIVE_AUTONOMY_MATURITY",
    directive: "CTO V15.5 Step 7 — honest, reproducible measure of ODG native autonomy vs provider work",
    measuredAt: str(i.now) || null,
    measuredRef: i.measuredRef || null,
    windows: freeze({ last30d: win, v15Arc: "merged PRs #" + (typeof i.arcFromPr === "number" ? i.arcFromPr : 870) + "..latest on the measured ref" }),
    counters: freeze({
      "1_nativeDecisions": countDecisions(i.attempts === undefined ? null : i.attempts, i.auditChain === undefined ? null : i.auditChain, win),
      "1b_providerInvokedDecisions": providerInvoked(i.providerInvokedDecisions),
      "2_nativeExecutions": countNativeExecutions(i.attempts === undefined ? null : i.attempts, i.ledger === undefined ? null : i.ledger, win),
      "3_providerDelegated": provider,
      "4_correctionsProposedByOdg": countProposals(i.proposalSources),
      "5_correctionsBuiltByOdg": countNativeBuilt(provider),
      "6_independentValidations": countValidations(i.evidence, i.commits === undefined ? null : i.commits, win),
      "7_autonomousRecoveries": countRecoveries(i.attempts === undefined ? null : i.attempts, i.supervisorSnapshot, i.recoveryExperiments, win),
    }),
    capabilityLadder: ladder,
    nextProgressionSequence: freeze(nextSequence(ladder, i.progressionSteps)),
    honesty: freeze([
      "separate counters, NO blended autonomy %; each has a window + source; NOT_MEASURED where no source exists",
      "provider work is NEVER native; the 'ODG Runtime' git identity is the session config, not the actor",
      "ODG-built corrections = 0 unless a native-actor provenance binding exists (none does)",
      "CONTROLLED_EXPERIMENT evidence never promotes a capability to EXERCISED_LIVE; PROVIDER_INVOKED live runs are flagged, not counted as unattended",
      "this artifact was produced by a provider (Claude Code) running ODG's read-only measure; it is evidence, not acceptance",
    ]),
  });
}

const NATIVE_AUTONOMY_MATURITY_CONTRACT = freeze({
  id: "NATIVE-AUTONOMY-MATURITY",
  reuses: freeze(["odg-capability-maturity.coarseLevel", "odg-autonomy-maturity-report.reportMaturityFromLedger", "audit-log.verifyChain", "odg-native-engineering.EXEC"]),
  invariants: freeze(["no second engine — composition view only", "PURE: caller performs all I/O", "provider work never native", "NOT_MEASURED when no source", "no blended score"]),
});

module.exports = { buildReport, classifyAttempt, countDecisions, countNativeExecutions, countProviderWork, countNativeBuilt, countProposals, countValidations, countRecoveries, capabilityLadder, nextSequence, windowOf, cadence, TRIGGER, NOT_MEASURED, NATIVE_AUTONOMY_MATURITY_CONTRACT };
export {};

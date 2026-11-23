#!/usr/bin/env node
"use strict";
/* Tests for odg-native-autonomy-maturity (V15.5 Step 7). PURE, fixture-driven: separate counters, NOT_MEASURED when no
 * source, provider work never native, experiments never promote to EXERCISED_LIVE, fixture-like records excluded. */
const M = require("./odg-native-autonomy-maturity.js");
const AUDIT = require("./audit-log.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const NOW = "2026-11-23T04:00:00.000Z";
const t = (min: number) => new Date(Date.parse(NOW) - min * 60000).toISOString();
const attempts = [
  { mission: "(startup)", recordedAt: t(90), status: "STARTUP_REFUSED", reason: "REFUSED — unexpected branch" },
  { mission: "(none)", recordedAt: t(75), status: "IDLE", reason: "no eligible pre-authorized PENDING mission [M0001: ALREADY_PROVEN (dedup): M0001]" },
  { mission: "(none)", recordedAt: t(60), status: "IDLE", reason: "no eligible pre-authorized PENDING mission (empty queue)" },
  { mission: "X", recordedAt: t(45), status: "BLOCKED", reason: "AUTHORIZATION_DENIED: CANARY_REFUSES_NON_READONLY" },
  { mission: "W", recordedAt: t(30), status: "FAIL", reason: "WRITE_SET_VIOLATION: wrote outside write_set" },
  { mission: "S", recordedAt: t(15), status: "PASS", reason: "status SUCCESS" },
  { mission: "R", recordedAt: t(0), status: "PASS", reason: "re-admitted after INTERRUPTED_PRIOR_RUN" },
  { mission: "OLD", recordedAt: "2026-01-01T00:00:00.000Z", status: "PASS", reason: "status SUCCESS" }, // outside the 30d window
];
let chain: any[] = [];
for (const p of [{ status: "IDLE" }, { status: "PASS" }]) chain = AUDIT.appendEntry(chain, p);
const ledger = { entries: [
  { mission: "N1", recordedAt: t(10), actor: "ODG", state: "CREATED", proven: true, validated: true },
  { mission: "U1", recordedAt: t(20), state: "ARCHIVED", proven: true, validated: true },
  { mission: "OLD", recordedAt: "2026-01-01T00:00:00.000Z", actor: "ODG", state: "ARCHIVED" },
] };
const att = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
const commits = [
  { sha: "a1", at: t(100), author: "ODG Runtime", body: "feat: x\n\n" + att },
  { sha: "a2", at: t(100), author: "Owner", body: "chore: hand edit" },
  { sha: "a3", at: t(100), author: "ODG Runtime", body: "fix: per independent inspection\n\n" + att },
  { sha: "m1", at: t(50), author: "Owner", body: "Merge pull request #870 from x", merge: true, pr: 870, prCommitShas: ["a1"] },
  { sha: "m2", at: t(50), author: "Owner", body: "Merge pull request #860 from y", merge: true, pr: 860, prCommitShas: ["a2"] },
  { sha: "m3", at: t(40), author: "Owner", body: "Merge pull request #871 from z", merge: true, pr: 871, prCommitShas: ["a3"] },
];
const T = M.TRIGGER;
const specs = [
  { id: "a", name: "absent", components: ["runtime/core/none.ts"], live: null },
  { id: "b", name: "built only", components: ["runtime/core/b.ts"], live: null },
  { id: "w", name: "wired+tested", components: ["runtime/core/w.ts"], live: null },
  { id: "e", name: "experiment only", components: ["runtime/core/w.ts"], live: { source: "exp.json", trigger: T.EXPERIMENT } },
  { id: "p", name: "provider-invoked live", components: ["runtime/core/w.ts"], live: { source: "run.json", trigger: T.PROVIDER_INVOKED } },
  { id: "u", name: "unattended live", components: ["runtime/core/b.ts", "runtime/core/w.ts"], live: { source: "log", trigger: T.UNATTENDED } },
  { id: "m", name: "live source missing", components: ["runtime/core/w.ts"], live: { source: "missing.json", trigger: T.PROVIDER_INVOKED } },
];
const facts = { "runtime/core/b.ts": { built: true, tested: false, wired: false }, "runtime/core/w.ts": { built: true, tested: true, wired: true } };
const liveOk = { "exp.json": true, "run.json": true, log: true, "missing.json": false };
const steps = [
  { capability: "w", target: "EXERCISED_LIVE", step: "s1", gating: "INTERNAL" },
  { capability: "u", target: "EXERCISED_LIVE", step: "already there", gating: "INTERNAL" },
  { capability: "zz", target: "EXERCISED_LIVE", step: "unknown cap", gating: "INTERNAL" },
];

function main(): void {
  const r = M.buildReport({
    now: NOW, attempts, auditChain: chain, ledger, commits, arcFromPr: 870,
    evidence: [
      { file: "x.json", json: { inspector: "the provider's OWN inspection subagent — NOT an independent party", rounds: [{ verdict: "REJECT" }, { verdict: "ACCEPT" }] } },
      { file: "y.json", json: { inspection_fixes_after_review: { MED: "x" } } },
      { file: "z.json", json: { unrelated: true } },
    ],
    proposalSources: {
      frontierRegistry: { items: [{ status: "PROPOSED", recordedAt: t(5) }, { status: "REJECTED", recordedAt: t(5) }] },
      selfDiagnosticIncidents: { incidents: { a: { id: "a", createdAt: t(5), hypotheses: [1, 2] }, b: { id: "b", createdAt: "T", hypotheses: [1, 2, 3] } } },
      nativeProvenance: null,
      supervisorSnapshot: { freeing: { items: [1, 2, 3] } },
    },
    supervisorSnapshot: { metrics: { byState: { INTERRUPTED: 0 } }, recovery: [{ decision: "REFUSE" }, { decision: "RELAUNCH" }] },
    recoveryExperiments: [{ file: "exp.json", recoveries: 4 }],
    providerInvokedDecisions: [{ source: "s", kind: "k", count: 6 }, { source: "w", kind: "narrative", count: null }],
    capabilitySpecs: specs, componentFacts: facts, liveOk, progressionSteps: steps,
  });
  const c = r.counters;

  // (1) decisions
  const d = c["1_nativeDecisions"];
  check("(1) decisions counted in window only (7 of 8)", d.value === 7 && d.status === "MEASURED");
  check("(1) classes: truth-lock / dedup / no-eligible / authorization / write-set / admission", d.byClass.TRUTH_LOCK_REFUSAL === 1 && d.byClass.DEDUP_REFUSAL === 1 && d.byClass.NO_ELIGIBLE_MISSION === 1 && d.byClass.AUTHORIZATION_REFUSAL === 1 && d.byClass.WRITE_SET_REFUSAL === 1 && d.byClass.ADMISSION_DISPATCH === 2);
  check("(1) 15-min cadence detected (6/6 gaps regular)", d.cadence.gaps === 6 && d.cadence.regular15min === 6 && d.cadence.share === 1);
  check("(1) audit chain verified via audit-log.verifyChain", d.schedulerAuditChain.entries === 2 && d.schedulerAuditChain.verify.ok === true);
  const tampered = chain.map((e: any, i: number) => (i === 0 ? { ...e, payload: { status: "PASS" } } : e));
  check("(1) tampered chain ⇒ verify.ok false", M.countDecisions(attempts, tampered, M.windowOf(NOW, 30)).schedulerAuditChain.verify.ok === false);
  check("(1) no attempt log ⇒ NOT_MEASURED (null, not 0)", M.countDecisions(null, null, M.windowOf(NOW, 30)).value === null && M.countDecisions(null, null, M.windowOf(NOW, 30)).status === M.NOT_MEASURED);
  check("(1b) provider-invoked decisions kept separate; null-count item LISTED as unmeasured, not dropped", c["1b_providerInvokedDecisions"].value === 6 && c["1b_providerInvokedDecisions"].trigger === T.PROVIDER_INVOKED && c["1b_providerInvokedDecisions"].unmeasuredItems.length === 1 && /PARTIAL/.test(c["1b_providerInvokedDecisions"].status));
  check("(1b) REGRESSION: all counts null ⇒ NOT_MEASURED (not MEASURED 0)", (() => { const b = M.buildReport({ now: NOW, providerInvokedDecisions: [{ source: "w", count: null }] }).counters["1b_providerInvokedDecisions"]; return b.value === null && b.status === M.NOT_MEASURED && b.unmeasuredItems.length === 1; })());
  // REGRESSION (MED): rows ≠ distinct decisions; truth-lock outage is an incident, not threats
  const rep = [] as any[];
  for (let k = 0; k < 5; k++) rep.push({ mission: "(none)", recordedAt: t(200 + k * 15), status: "IDLE", reason: "no eligible [M0001: ALREADY_PROVEN (dedup): M0001]" });
  for (let k = 0; k < 4; k++) rep.push({ mission: "(startup)", recordedAt: t(400 + k * 15), status: "STARTUP_REFUSED", reason: 'REFUSED — unexpected branch "excellence/v3-wave3" (expected "main")' + (k ? "; " + k + " staged change(s) in the index" : "") });
  rep.push({ mission: "(startup)", recordedAt: t(500), status: "STARTUP_REFUSED", reason: "REFUSED — HEAD abc1234 diverges from origin/main def5678" });
  rep.push({ mission: "(startup)", recordedAt: t(515), status: "STARTUP_REFUSED", reason: "REFUSED — HEAD 9999aaa diverges from origin/main bbbb000" }); // same decision, other shas
  rep.push({ mission: "S", recordedAt: t(100), status: "PASS", reason: "status SUCCESS" });
  const dd = M.countDecisions(rep, null, M.windowOf(NOW, 30));
  check("(1) REGRESSION: 12 rows but 4 distinct decision kinds (one per truth-lock cause; volatile shas/counts ignored); 5 repeated no-ops; 1 meaningful", dd.value === 12 && dd.distinctDecisionKinds === 4 && dd.repeatedNoOpRows === 5 && dd.meaningfulDecisions === 1 && dd.rowsAreNotDistinctDecisions === true);
  check("(1) REGRESSION: truth-lock causes grouped by branch; incident RUNNER_OUTAGE recorded with span", dd.truthLockRefusalCauses.total === 6 && dd.truthLockRefusalCauses.causes[0].cause === "MAIN_CHECKOUT_ON_BRANCH excellence/v3-wave3" && dd.truthLockRefusalCauses.causes[0].count === 4 && dd.truthLockRefusalCauses.incident.id === "RUNNER_OUTAGE_MAIN_CHECKOUT_OFF_MAIN" && dd.truthLockRefusalCauses.incident.ticksLost === 4 && dd.truthLockRefusalCauses.incident.span.first === t(445));
  check("(1) date-like digits in a reason are NOT mistaken for shas", M.countDecisions([{ mission: "a", recordedAt: t(1), status: "BLOCKED", reason: "x-20261101" }, { mission: "a", recordedAt: t(2), status: "BLOCKED", reason: "x-20261102" }], null, M.windowOf(NOW, 30)).distinctDecisionKinds === 2);
  check("(1) no off-main refusals ⇒ no incident", M.countDecisions([{ mission: "x", recordedAt: t(1), status: "PASS", reason: "" }], null, M.windowOf(NOW, 30)).truthLockRefusalCauses.incident === null);

  // (2) executions
  const x = c["2_nativeExecutions"];
  check("(2) dispatched PASS/FAIL in window = 3 (OLD excluded)", x.dispatchedByOdgRunner === 3 && x.dispatchedPass === 2);
  check("(2) ledger: actor=ODG 1, unattributed 1 (unattributed NEVER native)", x.ledgerActorOdg === 1 && x.ledgerUnattributed === 1 && x.ledgerActorOdgMissions[0] === "N1");
  check("(2) REGRESSION: no attempt log ⇒ dispatchedPass/missions NOT_MEASURED (not 0)", (() => { const e = M.countNativeExecutions(null, ledger, M.windowOf(NOW, 30)); return e.dispatchedPass === null && e.dispatchedMissions === M.NOT_MEASURED; })());
  check("(2) reuses odg-autonomy-maturity-report attribution coverage", x.maturityReport.attribution.withExecutionActor === 1 && x.maturityReport.attribution.distinct === 2);

  // (3)/(5) provider work
  const p = c["3_providerDelegated"];
  check("(3) 30d: 3 commits, 2 provider-attributed, 1 unattributed", p.last30d.commits === 3 && p.last30d.providerAttributedCommits === 2 && p.last30d.unattributedCommits === 1);
  check("(3) 'ODG Runtime' identity with Claude trailer is PROVIDER, not native", p.last30d.odgIdentityButProviderAttributed === 2 && p.last30d.nativeClaimCommits === 0);
  check("(3) PRs: 3 merged, 2 delegated (owner-only PR not delegated)", p.last30d.mergedPrs === 3 && p.last30d.providerDelegatedPrs === 2);
  check("(3) V15 arc #870.. = 2 PRs, both delegated, 2 commits", p.v15Arc.mergedPrs === 2 && p.v15Arc.providerDelegatedPrs === 2 && p.v15Arc.commits === 2 && p.v15Arc.prRange[0] === 870);
  check("(5) built by ODG = 0, MEASURED_ZERO, note computed (no claims)", c["5_correctionsBuiltByOdg"].value === 0 && c["5_correctionsBuiltByOdg"].status === "MEASURED_ZERO" && /0 even claimed/.test(c["5_correctionsBuiltByOdg"].note));
  // REGRESSION (HIGH): native trailer + provider attribution ⇒ PROVIDER + CONFLICTING; no double-subtraction
  const W = M.windowOf(NOW, 30);
  const mix = M.countProviderWork([
    { sha: "both", at: t(1), author: "ODG Runtime", body: "fix\n\nODG-Native-Actor: ODG\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" },
    { sha: "anth", at: t(1), author: "ODG Runtime", body: "fix\n\nCo-authored-by: Anthropic Claude <x@y>" },
    { sha: "gpt", at: t(1), author: "Dev", body: "fix\n\nco-authored-by: OpenAI Codex <codex@openai.com>" },
    { sha: "gen", at: t(1), author: "Dev", body: "docs\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" },
    { sha: "mid", at: t(1), author: "ODG Runtime", body: "fix\n\nInspection LOW 1. Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" },
    { sha: "human", at: t(1), author: "Owner", body: "chore: hand edit\n\nCo-authored-by: Alice <a@b>" },
    { sha: "claim", at: t(1), author: "ODG Runtime", body: "fix\n\nODG-Native-Actor: ODG" },
  ], W, 870);
  check("(3) REGRESSION: both trailers ⇒ PROVIDER + CONFLICTING_ATTRIBUTION, not a native claim", mix.last30d.conflictingAttribution.length === 1 && mix.last30d.conflictingAttribution[0].sha === "both" && mix.last30d.nativeClaimCommits === 1);
  check("(3) REGRESSION: broadened attribution (Anthropic / OpenAI Codex / Generated with / mid-line trailer, case-insensitive); human co-author is NOT provider", mix.last30d.providerAttributedCommits === 5);
  check("(3) REGRESSION: unattributed not double-subtracted (7 − 5 provider − 1 claim = 1 human)", mix.last30d.unattributedCommits === 1);
  const nb = M.countNativeBuilt(mix);
  check("(5) REGRESSION: text-trailer claim ⇒ UNVERIFIED_CLAIM, value stays 0, never 'MEASURED native'", nb.value === 0 && nb.status === "UNVERIFIED_CLAIM" && nb.unverifiedNativeClaims.last30d === 1 && /UNAVAILABLE/.test(nb.identityBoundVerification) && /CONFLICTING_ATTRIBUTION/.test(nb.note) && !/MEASURED native/.test(JSON.stringify(nb)));
  check("(3) no git ⇒ NOT_MEASURED; (5) follows", M.countProviderWork(null, null, 870).status === M.NOT_MEASURED && M.countNativeBuilt(M.countProviderWork(null, null, 870)).value === null);

  // (4) proposals
  const q = c["4_correctionsProposedByOdg"];
  check("(4) proposals: frontier 1 + hypotheses 2 + freeing 3 = 6; absent provenance ⇒ NOT_MEASURED part", q.value === 6 && q.parts.nativeTransformProposals === M.NOT_MEASURED);
  check("(4) fixture-like incident (createdAt 'T') EXCLUDED and reported", q.excluded.length === 1 && q.excluded[0].id === "b");
  check("(4) no sources at all ⇒ NOT_MEASURED", M.countProposals({}).value === null && M.countProposals({}).status === M.NOT_MEASURED);

  // (6) validations
  const v = c["6_independentValidations"];
  check("(6) 3 recorded rounds (2 verdicts + fixes-after-review); unrelated evidence ignored", v.recordedInspectionRounds === 3 && v.records.length === 2);
  check("(6) provider-subagent inspections identified; owner/ODG-native NOT_MEASURED", v.byInspector.providerSubagent === 1 && v.byInspector.owner === M.NOT_MEASURED && v.byInspector.odgNativeEvaluator === M.NOT_MEASURED);
  check("(6) commits citing independent inspection = 1", v.commitsCitingIndependentInspection === 1);
  check("(6) REGRESSION: no inspection evidence ⇒ recordedInspectionRounds NOT_MEASURED (not 0)", (() => { const z = M.countValidations([], null, W); return z.recordedInspectionRounds === null && z.recordedInspectionRoundsStatus === M.NOT_MEASURED; })());

  // (7) recoveries
  const rc = c["7_autonomousRecoveries"];
  check("(7) unattended live recovery from persistent log reason = 1", rc.unattendedLive === 1);
  check("(7) supervisor decisions provider-invoked; experiments flagged CONTROLLED_EXPERIMENT", rc.supervisor.relaunchDecisions === 1 && rc.supervisor.trigger === T.PROVIDER_INVOKED && rc.providerTriggeredExperiments[0].trigger === T.EXPERIMENT);

  // ladder
  const L = r.capabilityLadder;
  const lvl = (id: string) => L.items.find((i: any) => i.id === id).level;
  check("ladder: unknown component ⇒ ABSENT", lvl("a") === "ABSENT");
  check("ladder: built only ⇒ BUILT_NOT_WIRED", lvl("b") === "BUILT_NOT_WIRED");
  check("ladder: wired+tested, no live ⇒ WIRED_TESTED", lvl("w") === "WIRED_TESTED");
  check("ladder: CONTROLLED_EXPERIMENT never promotes to EXERCISED_LIVE", lvl("e") === "WIRED_TESTED");
  check("ladder: provider-invoked live run ⇒ EXERCISED_LIVE (flagged)", lvl("p") === "EXERCISED_LIVE");
  check("ladder: best component carries the capability; unattended live ⇒ EXERCISED_LIVE", lvl("u") === "EXERCISED_LIVE");
  check("ladder: missing live artifact ⇒ WIRED_TESTED", lvl("m") === "WIRED_TESTED");
  check("ladder: exercisedLiveUnattended counts only UNATTENDED (1)", L.exercisedLiveUnattended === 1 && L.byLevel.EXERCISED_LIVE === 2);
  check("next sequence: keeps only capabilities still below target (unknown/at-target dropped)", r.nextProgressionSequence.length === 1 && r.nextProgressionSequence[0].capability === "w" && r.nextProgressionSequence[0].current === "WIRED_TESTED");

  // honesty / determinism
  check("no blended score field anywhere", !/autonomyPercent|overallScore|blended"\s*:/.test(JSON.stringify(r)));
  const r2 = M.buildReport({ now: NOW, attempts, auditChain: chain, ledger, commits, arcFromPr: 870, capabilitySpecs: specs, componentFacts: facts, liveOk, progressionSteps: steps });
  check("deterministic (same input ⇒ same output)", JSON.stringify(r2) === JSON.stringify(M.buildReport({ now: NOW, attempts, auditChain: chain, ledger, commits, arcFromPr: 870, capabilitySpecs: specs, componentFacts: facts, liveOk, progressionSteps: steps })));
  check("frozen report + counters", Object.isFrozen(r) && Object.isFrozen(r.counters) && Object.isFrozen(r.capabilityLadder.items));
  check("empty input ⇒ every source-backed counter NOT_MEASURED (no fabricated zeros)", (() => { const e = M.buildReport({}).counters; return e["1b_providerInvokedDecisions"].status === M.NOT_MEASURED && e["6_independentValidations"].recordedInspectionRounds === null && e["1_nativeDecisions"].value === null && e["2_nativeExecutions"].status === M.NOT_MEASURED && e["3_providerDelegated"].status === M.NOT_MEASURED && e["4_correctionsProposedByOdg"].value === null && e["5_correctionsBuiltByOdg"].value === null && e["7_autonomousRecoveries"].unattendedLive === null; })());
  check("contract: no second engine; reuses canonical measures", M.NATIVE_AUTONOMY_MATURITY_CONTRACT.reuses.includes("odg-capability-maturity.coarseLevel") && M.NATIVE_AUTONOMY_MATURITY_CONTRACT.invariants.some((s: string) => /no second engine/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-autonomy-maturity (7 separate counters w/ window+source; NOT_MEASURED w/o source; provider never native; ODG-built=0 w/o native binding; experiment≠live; fixture records excluded; ladder via odg-capability-maturity.coarseLevel; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

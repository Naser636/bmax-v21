#!/usr/bin/env node
"use strict";
/* Fixture test for odg-v155-transversal-validation: the PURE helpers + the strict verdict rules (classifyScenario), and a
 * re-derivation of every verdict recorded in the committed evidence from its own facts. That re-derivation is INTERNAL
 * CONSISTENCY (verdict follows from the recorded facts), NOT anti-fabrication: it cannot prove the facts were measured. Hermetic: no
 * process spawned, nothing written, no network. The live run is the harness itself (see the evidence file). */
const fs = require("fs");
const path = require("path");
const H = require("./odg-v155-transversal-validation.js");
const ROOT = path.join(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const C = (id: string, f: any) => H.classifyScenario(id, f).verdict;
const clone = (o: any) => JSON.parse(JSON.stringify(o));

// ---- fixtures: one fully-good fact set per scenario (shape = what main() records) ----
const waveC = { wave: ["a", "b", "c"], deferred: ["d", "e"], admitted: 5, cap: 3, contentions: 0 };
const tickD = { overlap: true, maxConcurrentPids: 3, tickWriteSetOk: 2, expectedOk: 2, independentCheckOk: true, sharedViolations: [] };
const tickE = { waveSize: 3, detected: 3, assigned: 3, renewedWhileAlive: 3, midRunRunning: 3 };
const roundF = { killedPidDead: true, killedLedgerAfterTick1: 0, attemptStatus: "FAIL", supervisorState: "INTERRUPTED" };
const roundG = { reranInterrupted: true, reranCompleted: [], recoveredPass: true, ledgerEachOnce: true, ledgerSealOk: true, orphanClaimsAfter: 0 };
const claimOk = { executed: true, killedWhileHolding: true, reclaimed: true, recoveredPass: true, ledgerEachOnce: true, deadGen: 2, newGen: 4, reclaimAfterMs: 121000 };
const roundK = { deferredAfterInterrupt: ["d", "e"], resumedPass: ["c", "d", "e"], finalIdle: true, humanInputs: 0 };
const GOOD: any = {
  A: { executed: true, build: { exitCode: 0 }, defaultTick: { exitCode: 0, stdout: "[odg-schedule-tick] PASS — status SUCCESS" }, truthLockEnforced: { exitCode: 2 } },
  B: { executed: true, perRound: [{ admitted: ["a", "b", "c"], refused: 0, physicalDisjoint: true, logicalDistinctPairs: 3, pairs: 3 }, { admitted: ["a", "b"], refused: 0, physicalDisjoint: true, logicalDistinctPairs: 1, pairs: 1 }] },
  C: { executed: true, perRound: [waveC, waveC], contrast: { isolatedWave: 5, nonIsolatedWave: 1 } },
  D: { executed: true, perTick: [tickD, tickD] },
  E: { executed: true, mode: "repo", perTick: [tickE, tickE] },
  F: { executed: true, supervisorMode: "repo", perRound: [roundF, roundF] },
  G: { executed: true, perRound: [roundG, roundG], claimVariant: claimOk },
  H: { executed: true, selfRefused: true, parentRefused: true, distinctAccepted: true, identityBound: false },
  I: { executed: true, liveProbe: true, perClass: [{ decision: "LOCAL", chosenStatus: "QUALIFIED" }, { decision: "NO_QUALIFIED_LOCAL_MODEL", chosenStatus: null }] },
  J: { executed: true, liveProbe: true, constructedDecision: false, fallback: { outcome: "OK", model: "qwen2.5:0.5b", attempts: [{ model: H.ABSENT_MODEL, unavailable: true }, { model: "qwen2.5:0.5b", ok: true }] }, noQualified: { decision: "NO_QUALIFIED_LOCAL_MODEL", run: "REFUSED" } },
  K: { executed: true, perRound: [roundK, roundK] },
  L: { executed: true, historical: { verified: 928, missing: 0, changed: 0, line: "verified=928 missing=0 changed=0" }, roadmapUnchanged: true, mainCheckout: { ok: true }, evidenceWritable: true },
};

function main(): void {
  // ---- pure helpers
  check("covers: exact file and dir/ prefix only", H.covers(["a.json", "logs/"], "a.json") && H.covers(["a.json", "logs/"], "logs/x.log") && !H.covers(["a.json"], "b.json") && !H.covers(["logs/"], "logsX/y") && !H.covers(null, "a.json"));
  check("intervalsOverlap: common instant required (pairwise-chained ≠ simultaneous)", H.intervalsOverlap([{ startedAt: 0, endedAt: 10 }, { startedAt: 5, endedAt: 15 }]) && !H.intervalsOverlap([{ startedAt: 0, endedAt: 5 }, { startedAt: 4, endedAt: 9 }, { startedAt: 6, endedAt: 12 }]) && !H.intervalsOverlap([{ startedAt: 0, endedAt: 5 }]));
  check("ledgerPerId counts entries per mission id (dup visible)", JSON.stringify(H.ledgerPerId({ entries: [{ mission: "A" }, { mission: "B" }, { mission: "A" }, {}] })) === JSON.stringify({ per: { A: 2, B: 1, "(no-id)": 1 }, total: 4 }));
  check("sharedWriteViolations: allowed shared files pass, anything else new/changed is flagged",
    JSON.stringify(H.sharedWriteViolations({ "mission-ledger.json": "1:1" }, { "mission-ledger.json": "2:2", "mission-attempt-log.jsonl": "1:1", "fleet/locks/mission-ledger.lock.3": "1:1", "mission-report.json": "5:5", "fleet/bridge.log": "1:1" })) === JSON.stringify(["fleet/bridge.log", "mission-report.json"]));
  check("sharedWriteViolations: an unchanged foreign file is not a violation", H.sharedWriteViolations({ "x.json": "1:1" }, { "x.json": "1:1" }).length === 0);
  check("isLinkedWorktree: main checkout (git-dir == common) refused; linked accepted; unknown refused", !H.isLinkedWorktree("/r/.git", "/r/.git") && H.isLinkedWorktree("/r/.git/worktrees/w", "/r/.git") && !H.isLinkedWorktree(null, "/r/.git"));

  // ---- verdict rules: good facts ⇒ expected verdicts (H is NEVER REAL: the inspector is a string)
  const want: any = { A: "REAL", B: "REAL", C: "REAL", D: "REAL", E: "REAL", F: "REAL", G: "REAL", H: "PARTIAL", I: "REAL", J: "REAL", K: "REAL", L: "REAL" };
  for (const id of H.SCENARIOS) check(`good facts ⇒ ${id} ${want[id]}`, C(id, GOOD[id]) === want[id]);
  // universal rules
  check("every scenario: absent facts ⇒ NOT_MEASURABLE", H.SCENARIOS.every((id: string) => C(id, undefined) === "NOT_MEASURABLE" && C(id, { executed: false }) === "NOT_MEASURABLE"));
  check("no SIMULATED path: the harness has no injection seam, so the classifier never yields SIMULATED (harness-built parts are capped at PARTIAL)", H.SCENARIOS.every((id: string) => C(id, { ...GOOD[id], injected: true }) !== "SIMULATED"));
  check("verdicts are always one of the 5 classes", H.SCENARIOS.every((id: string) => H.VERDICTS.includes(C(id, GOOD[id]))));
  // degradations ⇒ PARTIAL / FAIL (strict)
  let f = clone(GOOD.A); delete f.truthLockEnforced; check("A: enforced Truth-Lock refusal (exit 2) missing ⇒ FAIL", C("A", f) === "FAIL");
  f = clone(GOOD.A); f.truthLockEnforced.exitCode = 0; check("A: enforced Truth-Lock did NOT refuse off main ⇒ FAIL", C("A", f) === "FAIL");
  f = clone(GOOD.A); f.defaultTick = { exitCode: 1, stdout: "[odg-schedule-tick] FAIL" }; check("A: default tick FAIL ⇒ FAIL", C("A", f) === "FAIL");
  f = clone(GOOD.A); f.build.exitCode = 2; check("A: build failure ⇒ FAIL", C("A", f) === "FAIL");
  f = clone(GOOD.B); f.perRound[1].physicalDisjoint = false; check("B: one round with overlapping physical write-sets ⇒ PARTIAL", C("B", f) === "PARTIAL");
  f = clone(GOOD.B); f.perRound.forEach((r: any) => { r.admitted = ["a"]; }); check("B: <2 admitted everywhere ⇒ FAIL", C("B", f) === "FAIL");
  f = clone(GOOD.C); delete f.contrast; check("C: no serialization contrast ⇒ PARTIAL", C("C", f) === "PARTIAL");
  f = clone(GOOD.C); f.perRound.forEach((r: any) => { r.contentions = 1; }); check("C: contentions in every wave ⇒ FAIL", C("C", f) === "FAIL");
  f = clone(GOOD.D); f.perTick[0].sharedViolations = ["mission-report.json"]; check("D: an undeclared shared write in one wave ⇒ PARTIAL", C("D", f) === "PARTIAL");
  f = clone(GOOD.D); f.perTick.forEach((t: any) => { t.overlap = false; }); check("D: never simultaneous ⇒ FAIL", C("D", f) === "FAIL");
  f = clone(GOOD.E); f.mode = "heartbeatOnly"; f.repoModeOutcome = "REFUSED_WRITESET_CONFLICT"; check("E: heartbeatOnly (test-only scope) ⇒ PARTIAL, never REAL", C("E", f) === "PARTIAL");
  f = clone(GOOD.E); f.perTick[1].renewedWhileAlive = 2; check("E: a child never renewed in one wave ⇒ PARTIAL", C("E", f) === "PARTIAL");
  f = clone(GOOD.F); f.perRound.forEach((r: any) => { r.killedLedgerAfterTick1 = 1; }); check("F: kill landed after the ledger entry (not mid-run) ⇒ FAIL", C("F", f) === "FAIL");
  f = clone(GOOD.F); f.perRound[0].supervisorState = "RUNNING"; check("F: supervisor did not see INTERRUPTED in one round ⇒ PARTIAL", C("F", f) === "PARTIAL");
  f = clone(GOOD.F); f.supervisorMode = "heartbeatOnly"; check("F: harness-written heartbeatOnly evidence ⇒ supervisor part PARTIAL ⇒ overall PARTIAL", C("F", f) === "PARTIAL" && /tick part REAL/.test(H.classifyScenario("F", f).reasons[0]));
  f = clone(GOOD.J); f.constructedDecision = true; check("J: harness-constructed primary=absent decision ⇒ PARTIAL (router never picks an absent model)", C("J", f) === "PARTIAL");
  f = clone(GOOD.J); delete f.constructedDecision; check("J: constructedDecision unknown ⇒ PARTIAL (fail-closed)", C("J", f) === "PARTIAL");
  f = clone(GOOD.G); f.claimVariant = { executed: false, reason: "--skip-claim-variant" }; check("G: no dead-holder claim reclaim ⇒ PARTIAL", C("G", f) === "PARTIAL");
  f = clone(GOOD.G); f.perRound.forEach((r: any) => { r.ledgerEachOnce = false; }); check("G: ledger duplication/loss ⇒ FAIL", C("G", f) === "FAIL");
  f = clone(GOOD.G); f.perRound.forEach((r: any) => { r.reranCompleted = ["a"]; }); check("G: completed work re-run ⇒ FAIL", C("G", f) === "FAIL");
  f = clone(GOOD.H); f.selfRefused = false; check("H: self-inspection accepted ⇒ FAIL", C("H", f) === "FAIL");
  f = clone(GOOD.I); f.perClass[0].chosenStatus = "PROBATION"; check("I: LOCAL on a non-QUALIFIED model ⇒ FAIL", C("I", f) === "FAIL");
  f = clone(GOOD.I); f.liveProbe = false; check("I: no live availability probe ⇒ PARTIAL", C("I", f) === "PARTIAL");
  f = clone(GOOD.J); f.liveProbe = false; check("J: Ollama unreachable ⇒ NOT_MEASURABLE", C("J", f) === "NOT_MEASURABLE");
  f = clone(GOOD.J); f.noQualified.run = "OK"; check("J: NO_QUALIFIED class ran anyway ⇒ PARTIAL", C("J", f) === "PARTIAL");
  f = clone(GOOD.J); f.fallback.attempts[0].unavailable = false; check("J: absent model not reported unavailable ⇒ not REAL", C("J", f) !== "REAL");
  f = clone(GOOD.K); f.perRound.forEach((r: any) => { r.humanInputs = 1; }); check("K: human input needed ⇒ FAIL", C("K", f) === "FAIL");
  f = clone(GOOD.L); f.historical.verified = 927; f.historical.missing = 1; check("L: verify-historical ≠ 928 ⇒ FAIL", C("L", f) === "FAIL");
  f = clone(GOOD.L); f.roadmapUnchanged = false; check("L: roadmap changed ⇒ FAIL", C("L", f) === "FAIL");

  // ---- committed evidence: every recorded verdict re-derives from its own facts; nothing inflated
  const evPath = path.join(ROOT, "docs", "odg", "evidence", "V155_TRANSVERSAL_VALIDATION.json");
  if (fs.existsSync(evPath)) {
    const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));
    check("evidence: all 12 scenarios present", H.SCENARIOS.every((id: string) => ev.scenarios && ev.scenarios[id]));
    check("evidence: each recorded verdict == classifyScenario(facts) (internal consistency only — not anti-fabrication)", H.SCENARIOS.every((id: string) => ev.scenarios[id].verdict === H.classifyScenario(id, ev.scenarios[id].facts).verdict));
    check("evidence: tally sums to 12 and matches the verdicts", Object.values(ev.tally).reduce((a: number, b: any) => a + b, 0) === 12 && H.SCENARIOS.every((id: string) => ev.tally[ev.scenarios[id].verdict] > 0));
    check("evidence: H is not REAL (inspector string, not identity-bound)", ev.scenarios.H.verdict !== "REAL" && ev.scenarios.H.facts.identityBound === false);
    check("evidence: harness-emitted parts not REAL (E heartbeatOnly ⇒ E,F PARTIAL; constructed J ⇒ PARTIAL)", (ev.scenarios.E.facts.mode === "repo" || (ev.scenarios.E.verdict !== "REAL" && ev.scenarios.F.verdict !== "REAL")) && (ev.scenarios.J.facts.constructedDecision !== true || ev.scenarios.J.verdict !== "REAL"));
    check("evidence: no absolute home path (redacted)", !/\/home\//.test(fs.readFileSync(evPath, "utf8")));
    check("evidence: ≥2 rounds of the wave scenario", Array.isArray(ev.rounds) && ev.rounds.length >= 2 && ev.parameters.rounds >= 2);
    check("evidence: records HEAD + commands + timings", typeof ev.base.head === "string" && ev.base.head.length === 40 && Array.isArray(ev.commands) && ev.commands.length > 0 && typeof ev.timingsMs.total === "number");
  } else check("evidence file absent ⇒ re-derivation skipped (fixture rules above still ran)", true);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-v155-transversal-validation (pure helpers, strict REAL/SIMULATED/PARTIAL/FAIL/NOT_MEASURABLE rules, committed verdicts re-derived from facts)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves durable cross-run telemetry: a run's metrics become a compact journal entry,
// append/read round-trips, summarizeJournal aggregates many runs, compareRuns yields a before/after delta ONLY when
// both sides are comparable (unmeasured otherwise — never fabricated), malformed lines are skipped+counted, and the
// REAL launcher (odg-campaign-run.run) appends a journal entry end-to-end when a journalPath is supplied. Deterministic
// (pure core; injected timestamps; real temp files; the integration uses the real `verification` executor).
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const J = require("./campaign-journal.js");
const RUN = require("./../bin/odg-campaign-run.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// a synthetic loop run result (as campaign-loop/odg-campaign-run would return), with a metrics block.
const runResult = (over) => ({ stopped: "COMPLETED", iterations: 3, metrics: { stopReason: "COMPLETED", iterations: 3, missionsAttempted: 3, acceptedWithEvidence: 3, failed: 0, retries: 0, waitingExternal: 0, successRate: 1, blockedCauses: [], timing: { timingMeasured: true, meanMissionMs: 1000, totalDurationMs: 3000 } }, ...over });

// (1) toJournalEntry — compact, correct fields, injected timestamp.
{
  const e = J.toJournalEntry(runResult(), { at: "2026-10-29T00:00:00Z", head: "abc1234" });
  ok("entry carries at/head/stopReason/counts/successRate/meanMissionMs",
     e.at === "2026-10-29T00:00:00Z" && e.head === "abc1234" && e.stopReason === "COMPLETED" && e.missionsAttempted === 3 && e.acceptedWithEvidence === 3 && e.successRate === 1 && e.meanMissionMs === 1000);
}
// (2) append + read round-trip over a real temp journal.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-journal-")); const p = path.join(dir, "j.jsonl");
  J.appendRun(p, runResult(), { at: "2026-10-29T00:00:00Z" });
  J.appendRun(p, runResult({ metrics: { ...runResult().metrics, missionsAttempted: 2, acceptedWithEvidence: 1, failed: 1, successRate: 0.5, timing: { timingMeasured: true, meanMissionMs: 1200 } } }), { at: "2026-10-29T01:00:00Z" });
  const r = J.readJournal(p);
  ok("append+read ⇒ 2 entries, 0 malformed", r.entries.length === 2 && r.malformed === 0);
  // (3) summarizeJournal aggregates both runs.
  const s = J.summarizeJournal(r.entries);
  ok("aggregate: 2 runs, 5 attempted, 4 accepted, aggregateSuccessRate 0.8, meanMissionMsAcrossRuns 1100",
     s.runs === 2 && s.totalMissionsAttempted === 5 && s.totalAcceptedWithEvidence === 4 && s.aggregateSuccessRate === 0.8 && s.meanMissionMsAcrossRuns === 1100 && s.completedRuns === 2);
  fs.rmSync(dir, { recursive: true, force: true });
}
// (4) compareRuns — improved / regressed / flat, and unmeasured when a side is null (never fabricated).
{
  const before = { successRate: 0.5, meanMissionMs: 1200, missionsAttempted: 2 };
  const after = { successRate: 0.9, meanMissionMs: 1000, missionsAttempted: 2 };
  const c = J.compareRuns(before, after);
  ok("successRate improved, meanMissionMs improved (lower better), missionsAttempted flat",
     c.metrics.successRate.direction === "improved" && c.metrics.meanMissionMs.direction === "improved" && c.metrics.missionsAttempted.direction === "flat" && c.summary.improved === 2 && c.summary.flat === 1);
  const c2 = J.compareRuns({ successRate: null }, { successRate: 0.9 });
  ok("null-on-one-side ⇒ unmeasured, no fabricated delta", c2.metrics.successRate.direction === "unmeasured" && c2.summary.unmeasured === 1);
}
// (5) honesty: nothing attempted ⇒ successRate null; unclocked run ⇒ meanMissionMs null.
{
  const e = J.toJournalEntry({ stopped: "IDLE_BLOCKED", transitions: [], summary: { counts: {} } }, { at: "x" });
  ok("no missions ⇒ successRate null, meanMissionMs null (not fabricated)", e.successRate === null && e.meanMissionMs === null && e.missionsAttempted === 0);
}
// (6) malformed journal lines are skipped + counted.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-journal2-")); const p = path.join(dir, "j.jsonl");
  fs.writeFileSync(p, JSON.stringify(J.toJournalEntry(runResult(), { at: "t" })) + "\n{ not json\n\n" + JSON.stringify(J.toJournalEntry(runResult(), { at: "t2" })) + "\n");
  const r = J.readJournal(p);
  ok("1 bad line skipped+counted; 2 valid entries kept", r.entries.length === 2 && r.malformed === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}
// (7) INTEGRATION: the REAL launcher appends a journal entry end-to-end (verification executor on a temp register).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-journal3-"));
  const reg = path.join(dir, "reg.json"); const jp = path.join(dir, "runs.jsonl");
  fs.writeFileSync(reg, JSON.stringify({ version: "jtest", items: [{ id: "m0", status: "READY", deps: [], priority: 1, exec: { kind: "verification", language: "JavaScript", content: "const a=1; module.exports=a;\n", expectedStatus: "PASS" } }] }));
  const out = RUN.run({ registerPath: reg, executor: "verification", journalPath: jp, at: "2026-10-29T02:00:00Z" });
  const r = J.readJournal(jp);
  ok("odg-campaign-run.run with journalPath ⇒ 1 entry recorded, COMPLETED, 1 accepted",
     out.stopped === "COMPLETED" && r.entries.length === 1 && r.entries[0].stopReason === "COMPLETED" && r.entries[0].acceptedWithEvidence === 1 && r.entries[0].at === "2026-10-29T02:00:00Z");
  // default (no journalPath) ⇒ NO journal written (opt-in; zero behaviour change).
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "odg-journal4-")); const reg2 = path.join(dir2, "reg.json");
  fs.writeFileSync(reg2, fs.readFileSync(reg, "utf8"));
  RUN.run({ registerPath: reg2, executor: "verification" });
  ok("no journalPath ⇒ no journal file created (opt-in)", !fs.existsSync(path.join(dir2, "runs.jsonl")));
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true });
}

console.log(`\nCAMPAIGN-JOURNAL suite — ${pass} assertions passed. (compact entries; append/read; cross-run aggregate; honest before/after unmeasured; malformed skipped; REAL launcher end-to-end; opt-in)`);

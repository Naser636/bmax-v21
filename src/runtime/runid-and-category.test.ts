// @ts-nocheck — test harness (src/runtime): runs under tsx; migration-debt convention.
// §17 CONTRACT_CATEGORY_AND_TOTAL_DURATION — proves (T1) the mission-loader carries a contract `category`
// ONLY when it matches the taxonomy (invalid/absent ⇒ undefined, strict), and (T2) a runId is created per
// logical execution and propagated into the attempt on BOTH recording paths (LocalMissionRunner here, and the
// SHARED attemptFromLedgerResult mapping that the autonomy route also goes through — same chokepoint).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { MissionLoader, MISSION_CONTRACT_CATEGORIES } = require("./mission-loader.ts");
const { LocalMissionRunner } = require("./local-mission-runner.ts");
const { recordMissionAttempt } = require("./ledger-record-adapter.ts");
const ATTEMPT = require("../../runtime/core/mission-attempt-log.js");

let n = 0;
const t = (name: any, fn: any) => { fn(); n++; console.log("ok  " + name); };

// ---- T1: contract category is strict + taxonomy-validated -----------------------------------------------
t("T1 — loader carries a VALID contract category; absent/invalid ⇒ undefined (strict)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-cat-"));
  const write = (id: any, obj: any) => fs.writeFileSync(path.join(dir, id + ".json"), JSON.stringify(obj));
  write("VALID", { mission: "VALID", category: "observability-slo", definition_of_done: ["d"] });
  write("INVALID", { mission: "INVALID", category: "not-a-real-category", definition_of_done: ["d"] });
  write("ABSENT", { mission: "ABSENT", definition_of_done: ["d"] });

  const loader = new MissionLoader("runtime/generated/project-context.snapshot", "runtime/brain/MASTER_PLAN.md", dir);
  assert.strictEqual(loader.load("VALID", "VALID").contract.category, "observability-slo", "valid taxonomy value carried");
  assert.strictEqual(loader.load("INVALID", "INVALID").contract.category, undefined, "unknown value dropped (strict)");
  assert.strictEqual(loader.load("ABSENT", "ABSENT").contract.category, undefined, "absent ⇒ undefined");
  assert.ok(MISSION_CONTRACT_CATEGORIES.includes("observability-slo") && !MISSION_CONTRACT_CATEGORIES.includes("uncategorized"),
    "taxonomy excludes the uncategorized sentinel as a declarable value");
});

// ---- T2: runId per logical execution, propagated into the attempt ---------------------------------------
t("T2 — LocalMissionRunner attaches the run's runId (and category) to the recorded attempt; new run ⇒ new runId", () => {
  const recorded: any[] = [];
  const planWithCategory = {
    category: undefined,
    contract: { category: "observability-slo", definitionOfDone: [] },
    mission: { id: "T2M", contract: { definitionOfDone: [] }, brain: { objectiveSpecs: [], nextObjective: null } },
  };
  const orchestrator = { buildPlan: () => planWithCategory };
  const kernel = { execute: () => ({ report: { status: "SUCCESS" } }) };
  const recordLedger = () => {};
  const recordAttempt = (_id: any, _v: any, _s: any, timing: any) => recorded.push(timing);
  const clock = () => "2026-10-19T10:00:00.000Z";
  const recordClosure = () => ({ closed: true, status: "PASS", reason: "stub" });
  // Deterministic runId seam: a fresh id per run() call.
  let seq = 0;
  const genRunId = () => `run-${++seq}`;

  const runner = new LocalMissionRunner(orchestrator, kernel, recordLedger, recordAttempt, clock, recordClosure, genRunId);
  runner.run("T2M", "T2M");
  runner.run("T2M", "T2M");

  assert.strictEqual(recorded.length, 2, "one attempt recorded per run()");
  assert.strictEqual(recorded[0].runId, "run-1", "first run's attempt carries run-1");
  assert.strictEqual(recorded[1].runId, "run-2", "a SECOND execution of the same mission id gets a DISTINCT runId");
  assert.notStrictEqual(recorded[0].runId, recorded[1].runId, "distinct executions ⇒ distinct runId");
  assert.strictEqual(recorded[0].category, "observability-slo", "contract category inherited onto the attempt");
});

// ---- T2 (shared chokepoint): both routes map runId identically into the persisted record -----------------
t("T2 — attemptFromLedgerResult (shared by BOTH routes) propagates runId + derives wall duration", () => {
  const rec = ATTEMPT.attemptFromLedgerResult(
    "M", { skipped: false }, "2026-10-19T10:00:02.000Z",
    { runId: "run-shared", startedAt: "2026-10-19T10:00:00.000Z", endedAt: "2026-10-19T10:00:02.000Z" },
  );
  assert.strictEqual(rec.runId, "run-shared", "runId carried into the attempt record (both routes use this mapping)");
  assert.strictEqual(rec.durationMs, 2000, "per-attempt latency derived from the real pair");
  // Two attempts of the SAME runId ⇒ totalDurationByRun groups them as ONE run.
  const grouped = ATTEMPT.totalDurationByRun([
    rec,
    ATTEMPT.attemptFromLedgerResult("M", { skipped: true, reason: "RETRY" }, "2026-10-19T10:00:09.000Z",
      { runId: "run-shared", startedAt: "2026-10-19T10:00:05.000Z", endedAt: "2026-10-19T10:00:09.000Z" }),
  ]);
  assert.strictEqual(grouped.runsWithRunId, 1, "same runId ⇒ one logical run");
  assert.strictEqual(grouped.runs[0].attempts, 2);
  assert.strictEqual(grouped.runs[0].totalDurationMs, 9000, "wall total 10:00:00→10:00:09 incl. the retry gap");
});

// ---- §4.3 test-isolation: ODG_ATTEMPTS_LOG redirects the REAL registry write away from production ------
t("ODG_ATTEMPTS_LOG override routes attempt writes to a throwaway path (no real-registry contamination)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-attlog-"));
  const tmpLog = path.join(dir, "attempts.jsonl");
  const prev = process.env.ODG_ATTEMPTS_LOG;
  process.env.ODG_ATTEMPTS_LOG = tmpLog;
  try {
    recordMissionAttempt("ISOLATION_PROBE", true, "SUCCESS",
      { startedAt: "2026-10-19T10:00:00.000Z", endedAt: "2026-10-19T10:00:01.000Z", runId: "iso-run" });
    assert.ok(fs.existsSync(tmpLog), "the override path received the write");
    const body = fs.readFileSync(tmpLog, "utf8");
    assert.ok(/ISOLATION_PROBE/.test(body) && /iso-run/.test(body), "record (with runId) landed in the override file");
  } finally {
    if (prev === undefined) delete process.env.ODG_ATTEMPTS_LOG; else process.env.ODG_ATTEMPTS_LOG = prev;
  }
});

console.log(`\nALL PASS — runid-and-category (${n} tests)`);

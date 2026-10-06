/*
 * A2 lock — idempotent Mission Ledger recording by (mission, run).
 *
 * Two legitimate finalizers can record the same mission in ONE run (the pipeline's "Mission Ledger"
 * stage AND AutonomyRuntimeAdapter.archive() on RELEASE). recordMission now deduplicates by
 * (mission, runId), where runId is the EXISTING per-run token pipeline-checkpoint.startedAt (trusted
 * only when the checkpoint is mission-matched). This locks:
 *   1. same mission + same run + two calls        → exactly 1 entry (second is a NO-OP)
 *   2. same mission + two distinct runs           → exactly 2 entries
 *   3. two missions + same runId token            → exactly 2 entries (keyed on mission too)
 *   4. proven-only gate preserved                 → unvalidated report is still REFUSED
 *   5. no mission-matched checkpoint (LOCAL route)→ append-always (no false dedup), two calls → 2
 *
 * Fully isolated: every recordMission runs in a throwaway cwd (governance fixtures copied in), so the
 * REAL ledger under runtime/generated/ is never read or written.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/mission-ledger-idempotent.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js")) as {
  recordMission: (mission: string) => { skipped?: boolean; reason?: string };
};

const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];
const G = (dir: string, name: string) => path.join(dir, "runtime", "generated", name);

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** Throwaway cwd with the governance fixtures recordMission's authorizeMission reads. */
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-idempotent-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}

function writeReport(dir: string, mission: string, validated: boolean): void {
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status: validated ? "SUCCESS" : "FAILED" }));
}
/** Simulate checkpoint-engine.begin(): a mission-matched per-run token. */
function writeCheckpoint(dir: string, mission: string, startedAt: string): void {
  fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify({ mission, status: "RUNNING", startedAt }));
}
function ledgerCount(dir: string): number {
  try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
function recordIn(dir: string, mission: string): { skipped?: boolean; reason?: string } {
  const prev = process.cwd();
  process.chdir(dir);
  try { return recordMission(mission); } finally { process.chdir(prev); }
}

console.log("A2 — IDEMPOTENT MISSION LEDGER (mission, run)");

// 1 — same mission + same run + two finalizer calls → exactly 1 entry.
{
  const dir = sandbox();
  writeReport(dir, "M_A2", true);
  writeCheckpoint(dir, "M_A2", "2026-10-02T21:00:00.000Z");
  const r1 = recordIn(dir, "M_A2");
  const r2 = recordIn(dir, "M_A2");
  check(r1.skipped !== true, "first finalizer records (append)");
  check(r2.skipped === true && r2.reason === "DUPLICATE_RUN", "second finalizer is a NO-OP (DUPLICATE_RUN)");
  check(ledgerCount(dir) === 1, "exactly 1 entry for same (mission, run)");
}

// 2 — same mission + two distinct runs → exactly 2 entries.
{
  const dir = sandbox();
  writeReport(dir, "M_A2", true);
  writeCheckpoint(dir, "M_A2", "2026-10-02T21:00:00.000Z");
  recordIn(dir, "M_A2");
  writeCheckpoint(dir, "M_A2", "2026-10-02T21:05:00.000Z"); // new execution ⇒ new startedAt
  recordIn(dir, "M_A2");
  check(ledgerCount(dir) === 2, "two distinct runs ⇒ 2 entries");
}

// 3 — two missions sharing the SAME runId token → 2 entries (dedup keyed on mission too).
{
  const dir = sandbox();
  const S = "2026-10-02T21:00:00.000Z";
  writeReport(dir, "M_A", true);
  writeCheckpoint(dir, "M_A", S);
  recordIn(dir, "M_A");
  writeReport(dir, "M_B", true);
  writeCheckpoint(dir, "M_B", S); // same token string, different mission
  recordIn(dir, "M_B");
  check(ledgerCount(dir) === 2, "two missions, same runId token ⇒ 2 entries (not collapsed)");
}

// 4 — proven-only gate still refuses an unvalidated report (idempotence must not bypass it).
{
  const dir = sandbox();
  writeReport(dir, "M_UNPROVEN", false);
  writeCheckpoint(dir, "M_UNPROVEN", "2026-10-02T21:00:00.000Z");
  const r = recordIn(dir, "M_UNPROVEN");
  check(r.skipped === true && r.reason === "UNPROVEN", "unvalidated report still REFUSED (proven-only gate intact)");
  check(ledgerCount(dir) === 0, "no entry written for an unproven mission");
}

// 5 — no mission-matched checkpoint (e.g. the TS LOCAL route) ⇒ append-always, no false dedup.
{
  const dir = sandbox();
  writeReport(dir, "M_LOCAL", true);
  // checkpoint belongs to ANOTHER mission ⇒ runId must be treated as unavailable for M_LOCAL.
  writeCheckpoint(dir, "SOMETHING_ELSE", "2026-10-02T21:00:00.000Z");
  recordIn(dir, "M_LOCAL");
  recordIn(dir, "M_LOCAL");
  check(ledgerCount(dir) === 2, "stale/foreign checkpoint ⇒ no run id ⇒ historical append-always preserved");
}

// 6 — IMMUTABILITY: a corrupted/unreadable existing ledger is NEVER overwritten. recordMission reads
//     the ledger before appending (mission-ledger.js:167-177); when the existing file is unreadable it
//     returns { skipped:true } and leaves the file byte-for-byte intact ("do NOT overwrite past
//     evidence"), even for an otherwise-proven mission. This locks the append-only integrity branch so
//     past evidence can never be clobbered by a later admission.
{
  const dir = sandbox();
  writeReport(dir, "M_IMMUT", true);
  const corrupt = "}{ this is not valid json — prior evidence";
  fs.writeFileSync(G(dir, "mission-ledger.json"), corrupt);
  const r = recordIn(dir, "M_IMMUT");
  check(r.skipped === true, "corrupted existing ledger ⇒ recordMission skips (append refused)");
  check(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8") === corrupt,
    "corrupted ledger left byte-for-byte intact (past evidence NOT overwritten)");
}

console.log(failures === 0 ? "ALL PASS — A2 IDEMPOTENT MISSION LEDGER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

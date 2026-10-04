/*
 * V5 CONTROLLED EXECUTION — LIVE proof on the real LOCAL release route.
 *
 * Exercises the ACTUAL integrated chain (NOT the unit evaluator in isolation):
 *   LocalMissionRunner.run  ->  RuntimeKernel/MissionOrchestrator  ->  honest RuntimeReporter verdict
 *   ->  ledger-record-adapter.recordMissionToLedger  ->  runtime/core/mission-ledger.recordMission
 *   ->  acceptance-facts.evaluateMissionAcceptance  ->  mechanical-acceptance.evaluateAcceptance
 *   ->  release (ledger archival)  |  refusal (no release).
 *
 * The controlled mission is the EXISTING migrated LOCAL AUDIT mission M0000, whose contract now declares
 * control.required=true (read-only class ⇒ no build/tsc gate; proven by its declared evidence artifact).
 * M0001 is an equivalent migrated LOCAL mission WITHOUT control (the legacy control sample).
 *
 * Side-effect-free: the git-ignored runtime/generated artifacts the real path reads/writes are snapshotted
 * and restored, so the real ledger and worktree are unchanged afterwards. Negative cases stage safe
 * git-ignored FACT fixtures (runtime-verify.json / pipeline-checkpoint.json) the real recordMission reads —
 * no destructive operation is performed to manufacture a failure.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/controlled-mission-live.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { LocalMissionRunner } from "./local-mission-runner";
import { recordMissionToLedger } from "./ledger-record-adapter";

const require = createRequire(import.meta.url);
const { evaluateMissionAcceptance, controlDeclared } = require("../../runtime/core/acceptance-facts.js") as {
  evaluateMissionAcceptance: (m: string) => { controlled: boolean; verdict?: string };
  controlDeclared: (m: string) => boolean;
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const GEN = (n: string) => path.join("runtime", "generated", n);
const SNAPSHOT_FILES = ["mission-report.json", "mission-ledger.json", "mission-lifecycle.json", "runtime-verify.json", "pipeline-checkpoint.json"];

function snapshot(): Map<string, Buffer | null> {
  const snap = new Map<string, Buffer | null>();
  for (const f of SNAPSHOT_FILES) {
    const p = GEN(f);
    snap.set(f, fs.existsSync(p) ? fs.readFileSync(p) : null);
  }
  return snap;
}
function restore(snap: Map<string, Buffer | null>): void {
  fs.mkdirSync(GEN(""), { recursive: true });
  for (const f of SNAPSHOT_FILES) {
    const p = GEN(f);
    const v = snap.get(f) ?? null;
    if (v) fs.writeFileSync(p, v);
    else fs.rmSync(p, { force: true });
  }
}
function setGen(name: string, content: unknown | null): void {
  const p = GEN(name);
  if (content === null) fs.rmSync(p, { force: true });
  else { fs.mkdirSync(GEN(""), { recursive: true }); fs.writeFileSync(p, JSON.stringify(content)); }
}
function ledgerCount(): number {
  try { return JSON.parse(fs.readFileSync(GEN("mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
// A recorder that calls the REAL recordMissionToLedger (writes report + real recordMission) and captures its result.
function capture(): { calls: any[]; rec: (m: string, v: boolean, s: string) => unknown } {
  const calls: any[] = [];
  const rec = (m: string, v: boolean, s: string) => { const r = recordMissionToLedger(m, v, s); calls.push(r); return r; };
  return { calls, rec };
}

console.log("V5 CONTROLLED EXECUTION — LIVE LOCAL RELEASE ROUTE");
const snap = snapshot();
try {
  check(controlDeclared("M0000") === true, "setup: M0000 declares controlled execution");
  check(controlDeclared("M0001") === false, "setup: M0001 is a legacy (non-controlled) mission");

  // 1 — POSITIVE: the REAL LocalMissionRunner runs the controlled mission end-to-end ⇒ ACCEPT ⇒ release.
  {
    setGen("runtime-verify.json", null);     // read-only AUDIT: no build artifact (required_checks = [])
    setGen("pipeline-checkpoint.json", null);
    const before = ledgerCount();
    const { calls } = capture();
    const out = new LocalMissionRunner(undefined, undefined, (m, v, s) => calls.push(recordMissionToLedger(m, v, s)) && undefined).run("M0000");
    const res: any = calls[calls.length - 1];
    check(out.ok === true && out.validated === true, "1. real runner executes M0000 (validated SUCCESS)");
    check(res && res.skipped === false && res.entry && res.entry.proven === true, "1b. controlled mission RELEASED via the real choke point (proven entry)");
    check(ledgerCount() === before + 1, "1c. exactly one new ledger entry (release occurred)");
    check(evaluateMissionAcceptance("M0000").verdict === "ACCEPT", "1d. corroboration: mechanical acceptance of M0000's live facts = ACCEPT");
  }

  // 2 — NEGATIVE (failed check): a red build fact ⇒ REJECT ⇒ no release, via the real recordMission.
  {
    setGen("pipeline-checkpoint.json", null);
    setGen("runtime-verify.json", { build: false, typescript: true, gitClean: true });
    const before = ledgerCount();
    const { calls } = capture();
    calls.push(recordMissionToLedger("M0000", true, "SUCCESS")); // worker CLAIMS validated:true/SUCCESS
    const res: any = calls[calls.length - 1];
    check(res.skipped === true && res.reason === "NOT_ACCEPTED" && res.verdict === "REJECT", "2. controlled + failed check ⇒ REJECT, no release");
    check(ledgerCount() === before, "2b. ledger unchanged (worker's SUCCESS claim did NOT release)");
    setGen("runtime-verify.json", null);
  }

  // 3 — NEGATIVE (UNKNOWN): interrupted RUNNING ⇒ UNKNOWN ⇒ no release.
  {
    setGen("runtime-verify.json", null);
    setGen("pipeline-checkpoint.json", { mission: "M0000", status: "RUNNING", startedAt: "2026-01-01T00:00:00Z" });
    const before = ledgerCount();
    const res: any = recordMissionToLedger("M0000", true, "SUCCESS");
    check(res.skipped === true && res.reason === "NOT_ACCEPTED" && res.verdict === "UNKNOWN", "3. controlled + interrupted RUNNING ⇒ UNKNOWN, no release");
    check(ledgerCount() === before, "3b. ledger unchanged (unprovable ⇒ no release)");
    setGen("pipeline-checkpoint.json", null);
  }

  // 4 — LEGACY: an equivalent mission WITHOUT control follows existing behavior (records on validated report).
  {
    setGen("runtime-verify.json", { build: false, typescript: false, gitClean: false }); // facts that WOULD reject a controlled mission
    setGen("pipeline-checkpoint.json", null);
    const before = ledgerCount();
    const res: any = recordMissionToLedger("M0001", true, "SUCCESS");
    check(controlDeclared("M0001") === false && res.skipped === false && res.entry && res.entry.proven === true, "4. legacy M0001 records exactly as before (control gate is a NO-OP)");
    check(ledgerCount() === before + 1, "4b. legacy release unaffected by acceptance facts");
    setGen("runtime-verify.json", null);
  }

  // 5 — IDEMPOTENCE: replay of the same controlled (mission, run) ⇒ no second release.
  {
    setGen("runtime-verify.json", null);
    setGen("pipeline-checkpoint.json", { mission: "M0000", status: "COMPLETE", startedAt: "2026-01-01T00:00:00Z" });
    const before = ledgerCount();
    const r1: any = recordMissionToLedger("M0000", true, "SUCCESS");
    check(r1.skipped === false && ledgerCount() === before + 1, "5. controlled ACCEPT ⇒ first release recorded");
    const r2: any = recordMissionToLedger("M0000", true, "SUCCESS");
    check(r2.skipped === true && r2.reason === "DUPLICATE_RUN" && ledgerCount() === before + 1, "5b. replay ⇒ DUPLICATE_RUN, no second release (idempotence preserved)");
    setGen("pipeline-checkpoint.json", null);
  }
} finally {
  restore(snap);
}

console.log(failures === 0 ? "ALL PASS — V5 CONTROLLED EXECUTION LIVE LOCAL ROUTE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

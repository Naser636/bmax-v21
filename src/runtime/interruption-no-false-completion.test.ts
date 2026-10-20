/*
 * INTERRUPTION / TIMEOUT → NO FALSE COMPLETION (integration) — master Lot B (B1+B2 tissue).
 *
 * The reliability units each exist and are already tested in isolation: deriveRunAttempt (signal⇒INTERRUPTED,
 * absent-report⇒UNVERIFIED — src/runtime/derive-run-attempt.test.ts), the attempt-log (SKIPPED mapping —
 * runtime/core/mission-attempt-log.test.ts), and the ledger proven-gate (unproven⇒no entry —
 * runtime/core/mission-ledger-proven-gate.test.ts). What was MISSING (confirmed: no such test) is the
 * INTEGRATION that drives all three through the REAL adapter seam in one flow and asserts that an interrupted
 * OR timed-out OR clean-but-unverified run is recorded as a non-success attempt AND is refused by the ledger —
 * i.e. it can NEVER surface as a PASS/completed mission. This complements the checkpoint-level SIGKILL e2e
 * (runtime/__bench__/autonomy-e2e.test.ts), which only inspects the checkpoint, not the ledger/attempt-log.
 *
 * Isolated: ODG_ATTEMPTS_LOG → a temp file; recordMission runs in a throwaway cwd with governance fixtures
 * copied in, so the real runtime/generated/ ledger is never touched. Deterministic (no subprocess kill timing).
 *
 * Run: node_modules/.bin/tsx src/runtime/interruption-no-false-completion.test.ts
 */
import { deriveRunAttempt, recordMissionAttempt } from "./ledger-record-adapter";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const REPO = process.cwd();
const { readAttempts } = require(path.join(REPO, "runtime", "core", "mission-attempt-log.js"));
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js"));

let failures = 0;
function check(c: boolean, label: string): void { if (c) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); } }

const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];
function sandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "interrupt-no-false-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}
const G = (dir: string, name: string) => path.join(dir, "runtime", "generated", name);
function ledgerCount(dir: string): number {
  try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; }
}
// Drive the REAL ledger proven-gate with the honest validated flag the adapter derived.
function recordLedger(dir: string, mission: string, validated: boolean, status: string): any {
  fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status }));
  const prev = process.cwd();
  try { process.chdir(dir); return recordMission(mission); } finally { process.chdir(prev); }
}

// Isolate the attempt-log to a throwaway file for this whole run.
const ATTEMPTS = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "interrupt-attempts-")), "mission-attempts.jsonl");
process.env.ODG_ATTEMPTS_LOG = ATTEMPTS;

console.log("interruption / timeout → no false completion (integration)");

// The non-success run shapes that MUST NOT become a PASS:
//   interruption (SIGTERM), timeout-kill (SIGKILL — a build/mission timeout manifests as a signal),
//   and a clean exit with NO valid report (crash-before-report).
const CASES: Array<{ mission: string; pipelineOk: boolean; ctx: any; expectStatus: string }> = [
  { mission: "ODG_INTERRUPTED_SIGTERM", pipelineOk: false, ctx: { signal: "SIGTERM" }, expectStatus: "INTERRUPTED" },
  { mission: "ODG_TIMEOUT_SIGKILL", pipelineOk: false, ctx: { signal: "SIGKILL" }, expectStatus: "INTERRUPTED" },
  { mission: "ODG_CLEAN_BUT_NO_REPORT", pipelineOk: true, ctx: {}, expectStatus: "UNVERIFIED" },
  { mission: "ODG_GOVERNED_BLOCK", pipelineOk: false, ctx: { governedBlock: true }, expectStatus: "VALIDATION_BLOCKED" },
];

for (const c of CASES) {
  const oc = deriveRunAttempt(c.pipelineOk, c.ctx);
  check(oc.validated === false && oc.status === c.expectStatus, `${c.mission}: derived ${oc.status} (not validated)`);
  // attempt-log: recorded as a non-success attempt (SKIPPED), reason carries the honest status — NOT RECORDED.
  recordMissionAttempt(c.mission, oc.validated, oc.status, { startedAt: "2026-10-20T10:00:00.000Z", endedAt: "2026-10-20T10:00:01.000Z" });
  const mine = readAttempts(ATTEMPTS).filter((a: any) => a.mission === c.mission);
  check(mine.length === 1 && mine[0].outcome === "SKIPPED" && mine[0].reason === c.expectStatus, `${c.mission}: attempt-log SKIPPED+reason (never RECORDED)`);
  // ledger proven-gate: refuses to append — no false completion.
  const dir = sandbox();
  const r = recordLedger(dir, c.mission, oc.validated, oc.status);
  check(r && r.skipped === true && r.reason === "UNPROVEN" && ledgerCount(dir) === 0, `${c.mission}: ledger refuses (UNPROVEN, 0 entries)`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// POSITIVE CONTROL — the gate is not merely always-deny: a genuine validated SUCCESS IS recorded in both stores.
{
  const oc = deriveRunAttempt(true, { reportValidated: true, reportStatus: "SUCCESS" });
  check(oc.validated === true && oc.status === "SUCCESS", "control: validated SUCCESS ⇒ validated");
  recordMissionAttempt("ODG_GENUINE_SUCCESS", oc.validated, oc.status, { startedAt: "2026-10-20T10:00:00.000Z", endedAt: "2026-10-20T10:00:01.000Z" });
  const mine = readAttempts(ATTEMPTS).filter((a: any) => a.mission === "ODG_GENUINE_SUCCESS");
  check(mine.length === 1 && mine[0].outcome === "RECORDED", "control: genuine success ⇒ attempt RECORDED");
  const dir = sandbox();
  const r: any = recordLedger(dir, "ODG_GENUINE_SUCCESS", oc.validated, oc.status);
  check(!r.skipped && ledgerCount(dir) === 1, "control: genuine success ⇒ ledger appends exactly 1 entry");
  fs.rmSync(dir, { recursive: true, force: true });
}

fs.rmSync(path.dirname(ATTEMPTS), { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS — interruption/timeout never becomes a false completion" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

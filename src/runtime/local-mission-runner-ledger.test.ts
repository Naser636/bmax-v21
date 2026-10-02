/*
 * Migrated AUDIT → existing ledger writer (LOCAL route seam) — wired into `npm test`.
 *
 * Proves the minimum patch: a migrated AUDIT mission executed ALONE by its canonical LOCAL
 * route hands its honest, validated result to the EXISTING recordMission writer, while the
 * proven-only gate still refuses an unvalidated result. No cascade, no routing bypass, no new
 * engine. Side-effect-free: the behavioural cases inject a spy recorder (no real ledger/report
 * write); the gate case drives the real recordMission only in its SAFE refuse branch and
 * save/restores runtime/generated/mission-report.json (git-ignored) so the worktree stays clean.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/local-mission-runner-ledger.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { LocalMissionRunner } from "./local-mission-runner";
import { RuntimeKernel } from "./runtime-kernel";
import { isMigratedMission } from "./mission-migration";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

console.log("MIGRATED AUDIT → LEDGER ROUTE (LOCAL seam)");

// 1 — the mission under test is a MIGRATED AUDIT mission.
check(isMigratedMission("M0000"), "M0000 is a migrated mission (LOCAL route)");
const spec = JSON.parse(fs.readFileSync("runtime/missions/M0000.json", "utf8"));
check(spec.mode === "AUDIT", "M0000 is an AUDIT mission (mode=AUDIT)");

// A — validated single execution hands the result to the recorder exactly once for M0000 only.
{
  const calls: Array<{ m: string; v: boolean; s: string }> = [];
  const spy = (m: string, v: boolean, s: string) => {
    calls.push({ m, v, s });
    return { skipped: false };
  };
  const out = new LocalMissionRunner(undefined, undefined, spy).run("M0000");
  check(out.ok === true, "M0000 LOCAL execution ok");
  check(
    (out.execution as { report?: { status?: string } })?.report?.status === "SUCCESS",
    "honest RuntimeReporter verdict for M0000 = SUCCESS",
  );
  check(out.validated === true, "validated derived true from the honest gate");
  check(calls.length === 1, "ledger recorder called exactly once (single execution)");
  check(calls[0]?.m === "M0000" && calls[0]?.v === true, "recorder called with (M0000, validated=true)");
  check(new Set(calls.map((c) => c.m)).size === 1, "no other mission executed or recorded");
}

// B — an unvalidated execution propagates validated=false to the recorder (no proven claim).
{
  const calls: Array<{ m: string; v: boolean; s: string }> = [];
  const spy = (m: string, v: boolean, s: string) => {
    calls.push({ m, v, s });
  };
  // Inject a kernel whose report is FAILED (real orchestrator still plans M0000).
  const failingKernel = { execute: () => ({ report: { status: "FAILED" } }) } as unknown as RuntimeKernel;
  const out = new LocalMissionRunner(undefined, failingKernel, spy).run("M0000");
  check(out.validated === false, "FAILED reporter status ⇒ validated=false");
  check(calls.length === 1 && calls[0].v === false, "recorder received validated=false for an unproven run");
}

// C — the EXISTING recordMission proven-only gate is preserved: an unvalidated report is REFUSED
//     (safe refuse branch returns before any ledger append). Save/restore the git-ignored report.
{
  const reportPath = path.join("runtime", "generated", "mission-report.json");
  const had = fs.existsSync(reportPath);
  const backup = had ? fs.readFileSync(reportPath) : null;
  try {
    fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ mission: "__LEDGER_GATE_PROBE__", validated: false, status: "FAILED" }),
    );
    const require = createRequire(import.meta.url);
    const { recordMission } = require("../../runtime/core/mission-ledger.js") as {
      recordMission: (m: string) => { skipped?: boolean; reason?: string };
    };
    const res = recordMission("__LEDGER_GATE_PROBE__");
    check(
      res?.skipped === true && res?.reason === "UNPROVEN",
      "recordMission REFUSES an unvalidated mission (proven-only gate intact)",
    );
  } finally {
    if (had && backup) fs.writeFileSync(reportPath, backup);
    else if (!had) fs.rmSync(reportPath, { force: true });
  }
}

console.log(failures === 0 ? "ALL PASS — MIGRATED AUDIT LEDGER ROUTE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

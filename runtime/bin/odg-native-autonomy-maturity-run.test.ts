#!/usr/bin/env node
"use strict";
/* CLI test for odg-native-autonomy-maturity-run: runs the REAL runner against a FIXTURE state root (temp dir), --no-write
 * (read-only: no artifact written) and checks the counters come from that fixture, not from the host's live state. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-nam-"));
  const gen = path.join(dir, "runtime", "generated");
  fs.mkdirSync(path.join(gen, "autonomy"), { recursive: true });
  const now = "2026-11-23T04:00:00.000Z";
  const t = (m: number) => new Date(Date.parse(now) - m * 60000).toISOString();
  fs.writeFileSync(path.join(gen, "mission-attempt-log.jsonl"), [
    { mission: "(none)", recordedAt: t(30), status: "IDLE", reason: "x [M: ALREADY_PROVEN (dedup): M]" },
    { mission: "(startup)", recordedAt: t(15), status: "STARTUP_REFUSED", reason: "REFUSED" },
    { mission: "S", recordedAt: t(0), status: "PASS", reason: "status SUCCESS" },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(path.join(gen, "mission-ledger.json"), JSON.stringify({ entries: [{ mission: "N", recordedAt: t(5), actor: "ODG" }] }));
  const out = path.join(dir, "out.json");
  const stdout = execFileSync(process.execPath, [require.resolve("tsx/cli"), path.join(ROOT, "runtime", "bin", "odg-native-autonomy-maturity-run.ts"), "--state-root", dir, "--now", now, "--out", out, "--no-write"], { cwd: ROOT, encoding: "utf8" });
  const s = JSON.parse(stdout);
  check("decisions read from the FIXTURE state root (3)", s.nativeDecisions30d === 3);
  check("native executions from fixture (1 PASS) + ledger actor=ODG 1", s.nativeExecutions30d === 1 && s.ledgerActorOdg30d === 1);
  check("unattended recoveries 0 in fixture", s.unattendedRecoveries === 0);
  check("--no-write writes nothing", !fs.existsSync(out) && s.artifact === null);
  check("ladder has the 20 CTO capabilities", Object.values(s.ladder).reduce((a: number, b: any) => a + b, 0) === 20);
  check("git-derived provider counter is a number (repo history readable)", typeof s.providerCommits30d === "number");
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-autonomy-maturity-run (fixture state root, read-only --no-write, 20-capability ladder)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

/*
 * Residual ledger label seam (Option B) — recordMission() identity is authoritative.
 *
 * Proves the minimal patch: recordMission(mission) labels its ledger entry from its OWN argument,
 * never from a stale global runtime/generated/mission-plan.json left by a previous pipeline, and it
 * never attributes another mission's objective count. The LOCAL (migrated) route never regenerates
 * mission-plan.json, so a residual plan from an earlier mse run must not relabel the entry.
 *
 * Fully isolated: the whole test runs inside a throwaway cwd (governance fixtures copied in), so the
 * REAL Mission Ledger under runtime/generated/ is never read or written. Run directly:
 *   node_modules/.bin/tsx src/runtime/mission-ledger-label.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { recordMission } = require("../../runtime/core/mission-ledger.js") as {
  recordMission: (mission: string) => { skipped?: boolean };
};

const REPO = process.cwd();
const LEDGER = path.join("runtime", "generated", "mission-ledger.json");
const PLAN = path.join("runtime", "generated", "mission-plan.json");
const REPORT = path.join("runtime", "generated", "mission-report.json");
const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

/** Build a throwaway cwd with the governance fixtures recordMission's authorizeMission reads. */
function makeSandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-ledger-label-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}

/** Run recordMission(mission) inside `dir` and return the last appended ledger entry. */
function recordIn(dir: string, mission: string): { mission?: string; objectives?: number } {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    recordMission(mission);
    const ledger = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
    return ledger.entries[ledger.entries.length - 1];
  } finally {
    process.chdir(prev);
  }
}

console.log("RESIDUAL LEDGER LABEL SEAM (Option B)");

// Mandatory case — a STALE plan (another mission, 3 objectives) must NOT relabel the entry or lend
// its objectives. report proves M0000 so the proven-only gate lets the append through.
{
  const dir = makeSandbox();
  fs.writeFileSync(
    path.join(dir, PLAN),
    JSON.stringify({ mission: "STALE_MISSION", objectives: ["a", "b", "c"] }),
  );
  fs.writeFileSync(
    path.join(dir, REPORT),
    JSON.stringify({ mission: "M0000", validated: true, status: "SUCCESS" }),
  );
  const entry = recordIn(dir, "M0000");
  check(entry.mission === "M0000", "stale plan ⇒ entry labelled from the argument (M0000)");
  check(entry.objectives === 0, "stale plan ⇒ no foreign objective count (objectives=0)");
}

// Regression case — a COHERENT plan (same mission, 3 objectives) keeps the existing behaviour.
{
  const dir = makeSandbox();
  fs.writeFileSync(
    path.join(dir, PLAN),
    JSON.stringify({ mission: "M0000", objectives: ["a", "b", "c"] }),
  );
  fs.writeFileSync(
    path.join(dir, REPORT),
    JSON.stringify({ mission: "M0000", validated: true, status: "SUCCESS" }),
  );
  const entry = recordIn(dir, "M0000");
  check(entry.mission === "M0000", "coherent plan ⇒ entry labelled M0000");
  check(entry.objectives === 3, "coherent plan ⇒ its 3 objectives are preserved");
}

console.log(failures === 0 ? "ALL PASS — RESIDUAL LEDGER LABEL SEAM" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

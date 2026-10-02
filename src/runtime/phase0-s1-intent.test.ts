/*
 * S1 — INTENT is a function of the mission (wired into `npm test`).
 *
 * Proves the compiler now derives MissionIntent from the mission's own contract instead of a
 * static stub: the plan's intent reflects the contract (priority/type/mode/objective), differs
 * across different missions, maps enum modes EXACTLY (no synonyms) while preserving the raw mode
 * in `type`, and is deterministic. Read-only; writes no artifact. createMissionIntent is unchanged.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-s1-intent.test.ts
 */

import fs from "node:fs";
import { MissionLoader } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";
import { createMissionIntent } from "./mission-intent";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const intentOf = (id: string): any =>
  new MissionOrchestrator(new MissionLoader()).buildPlan(id, id, createMissionIntent(id)).intent;

const contractOf = (id: string): any =>
  JSON.parse(fs.readFileSync(`runtime/missions/${id}.json`, "utf8"));

const ENUM = ["ANALYZE", "PLAN", "IMPLEMENT", "VALIDATE", "LEARN"];
const expectedMode = (m: string): string => (ENUM.includes(m) ? m : "UNKNOWN");

console.log("S1 — INTENT derived from the mission contract");

// 1 — intent is a FUNCTION OF THE MISSION: two different contracts ⇒ different intent.
{
  const a = intentOf("M0000");
  const b = intentOf("RUNTIME_SELF_AUDIT");
  check(JSON.stringify(a) !== JSON.stringify(b), "intent differs for two different missions");
}

// 2 — intent REFLECTS THE CONTRACT (priority / type=raw mode / mode=exact-map / objective=desc).
{
  const i = intentOf("M0000");
  const c = contractOf("M0000");
  const desc1 = String(c.description ?? "").split(/\r?\n/)[0].trim();
  check(
    i.priority === c.priority &&
      i.type === c.mode &&
      i.mode === expectedMode(c.mode) &&
      i.objective === desc1,
    "intent reflects the contract (priority/type/mode/objective)",
  );
}

// 3 — EXACT enum mode mapping on an IMPLEMENT contract.
{
  const i = intentOf("AUDIT_RUNTIME_STATE_MACHINE"); // contract mode = "IMPLEMENT"
  check(i.mode === "IMPLEMENT", "exact enum mode is mapped (IMPLEMENT)");
}

// 4 — NON-enum contract mode ⇒ UNKNOWN, with the raw mode preserved in `type` (no synonyms).
{
  const i = intentOf("M0000"); // contract mode = "AUDIT" (not in the enum)
  check(i.mode === "UNKNOWN" && i.type === "AUDIT", "non-enum mode → UNKNOWN; raw mode kept in type");
}

// 5 — DETERMINISM: identical input ⇒ identical intent.
{
  check(JSON.stringify(intentOf("M0000")) === JSON.stringify(intentOf("M0000")), "deterministic for identical input");
}

// 6 — CONTRACT-LESS mission ⇒ safe defaults (still a valid, mission-scoped intent).
{
  const i = intentOf("ADD_OAUTH_LOGIN"); // no contract on disk
  check(
    i.mission === "ADD_OAUTH_LOGIN" && i.mode === "UNKNOWN" && i.priority === "NORMAL" && i.type === "GENERIC",
    "contract-less mission → safe defaults",
  );
}

console.log(failures === 0 ? "\nALL PASS — S1 INTENT PROVEN" : `\n${failures} FAILURE(S) — S1 NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);

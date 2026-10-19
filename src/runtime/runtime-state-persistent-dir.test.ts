/*
 * Dashboard data-at-runtime (Phase 3.1/3.2): the runtime snapshot MUST be read at request time from the
 * CONFIGURED persistent dir (ODG_RUNTIME_STATE_DIR), not a build-time snapshot bound to process.cwd(). This
 * test writes a persistent test artifact, reads via the SAME reader the API + page use, then MODIFIES it and
 * re-reads — proving the dashboard reflects the new value WITHOUT a rebuild. Side-effect-free: uses an isolated
 * temp dir under os.tmpdir(); restores the env var afterwards; touches no real runtime/generated.
 *
 * Run: node_modules/.bin/tsx src/runtime/runtime-state-persistent-dir.test.ts
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join as joinPath } from "node:path";
import { tmpdir } from "node:os";
import { readRuntimeSnapshot } from "../app/api/runtime-state/route";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); }
}

const prevEnv = process.env.ODG_RUNTIME_STATE_DIR;
const dir = mkdtempSync(joinPath(tmpdir(), "odg-state-dir-"));
const writeState = (generatedAt: string, status: string, last: string) =>
  writeFileSync(joinPath(dir, "runtime-state.json"), JSON.stringify({
    generatedAt, health: { status }, lastMission: last, autonomy: { measurable: false, autonomyPercent: null },
  }));

try {
  console.log("DASHBOARD DATA-AT-RUNTIME (persistent dir, live refresh)");
  process.env.ODG_RUNTIME_STATE_DIR = dir;

  // 1) initial value read from the CONFIGURED dir (not cwd).
  writeState("2026-10-19T00:00:00.000Z", "READY", "MISSION_A");
  const first = readRuntimeSnapshot();
  check(first.present === true, "reads from ODG_RUNTIME_STATE_DIR (present)");
  check(first.generatedAt === "2026-10-19T00:00:00.000Z" && first.missions.last === "MISSION_A", "reflects initial persistent value");

  // 2) MODIFY the persistent artifact; re-read WITHOUT any rebuild ⇒ reflects the NEW value (force-dynamic, live).
  writeState("2026-10-19T09:30:00.000Z", "READY", "MISSION_B");
  const second = readRuntimeSnapshot();
  check(second.generatedAt === "2026-10-19T09:30:00.000Z" && second.missions.last === "MISSION_B",
    "reflects MODIFIED persistent value without rebuild (no build-time snapshot binding)");
  check(first.generatedAt !== second.generatedAt, "the two reads genuinely differ (live, not cached)");

  // 3) env UNSET ⇒ backward-compatible fallback to cwd/runtime/generated (no throw; honest present flag).
  delete process.env.ODG_RUNTIME_STATE_DIR;
  const fallback = readRuntimeSnapshot();
  check(typeof fallback.present === "boolean", "env unset ⇒ cwd fallback still returns an honest snapshot");
} finally {
  if (prevEnv === undefined) delete process.env.ODG_RUNTIME_STATE_DIR; else process.env.ODG_RUNTIME_STATE_DIR = prevEnv;
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — runtime-state persistent-dir live refresh");
if (failures) process.exit(1);

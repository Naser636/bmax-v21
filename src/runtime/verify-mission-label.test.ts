/*
 * A1 lock — runtime-verify.json must carry the AUTHORITATIVE mission (verify-mission labeling).
 *
 * Proven cause (A1): odg-verify.js resolves its mission id from argv[2] first, else falls back to a
 * GLOBAL runtime/generated/corrective-mission.json pointer. The provider path called the verifier
 * with NO argument (AutonomyRuntimeAdapter.refreshVerifyEvidence), so a stale corrective pointer
 * relabelled runtime-verify.json with a foreign mission.
 *
 * This test exercises the verifier END-TO-END (not a static check): given a stale corrective pointer,
 * it asserts that passing the authoritative mission as argv[2] stamps THAT mission — and documents
 * the no-argument fallback that the adapter fix now avoids. Fully isolated: a throwaway cwd holds the
 * stale pointer, and PATH stubs make npm/npx fail fast so build/tsc never run or hit the network. The
 * real repo and its git-ignored runtime-verify.json are never touched.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/verify-mission-label.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VERIFIER = path.resolve("runtime/bin/odg-verify.js");
const STALE = "STALE_CORRECTIVE";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** Throwaway cwd carrying a stale corrective pointer + PATH stubs so npm/npx fail fast (no network). */
function sandbox(): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-mission-label-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "runtime", "generated", "corrective-mission.json"),
    JSON.stringify({ mission: STALE }),
  );
  const stub = path.join(dir, "stubbin");
  fs.mkdirSync(stub, { recursive: true });
  for (const name of ["npm", "npx"]) {
    const p = path.join(stub, name);
    fs.writeFileSync(p, "#!/bin/sh\nexit 1\n");
    fs.chmodSync(p, 0o755);
  }
  return { dir, env: { ...process.env, PATH: `${stub}:${process.env.PATH ?? ""}` } };
}

/** Run the REAL verifier in `dir` with the given args; return the stamped runtime-verify.json. */
function runVerify(dir: string, env: NodeJS.ProcessEnv, args: string[]): { mission?: string | null } {
  spawnSync("node", [VERIFIER, ...args], { cwd: dir, env, stdio: "ignore" });
  return JSON.parse(
    fs.readFileSync(path.join(dir, "runtime", "generated", "runtime-verify.json"), "utf8"),
  );
}

console.log("A1 — VERIFY MISSION LABELING (authoritative mission wins)");

// Case 1 (the fix's premise) — an explicit authoritative mission arg overrides the stale pointer.
{
  const { dir, env } = sandbox();
  const v = runVerify(dir, env, ["AUTHORITATIVE_MISSION"]);
  check(v.mission === "AUTHORITATIVE_MISSION", "authoritative argv[2] ⇒ runtime-verify.json carries THAT mission");
  check(v.mission !== STALE, "stale corrective-mission.json does NOT relabel the verify artifact");
}

// Case 2 (A1 witness) — no argument ⇒ stale corrective pointer leaks in. This is exactly the path the
// adapter fix eliminates by always passing the mission; kept here to pin the regression it closes.
{
  const { dir, env } = sandbox();
  const v = runVerify(dir, env, []);
  check(v.mission === STALE, "no-arg invocation falls back to the stale corrective pointer (the A1 bug)");
}

console.log(failures === 0 ? "ALL PASS — A1 VERIFY MISSION LABELING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

/*
 * Tests for CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1.
 * Run: node_modules/.bin/tsx src/runtime/runtime-executor.clean-workspace.test.ts
 *
 * Proves the FIRST real capability execution on the TS LOCAL route: RuntimeExecutor self-scoping
 * dispatch runs the existing CLEAN_WORKSPACE_1 producer (which writes its scan artifact THIS run), the
 * new `clean-workspace-scanned` probe verifies it, and the mission is honestly PROVEN end-to-end — while
 * a non-matching objective triggers NO dispatch and (with the probe required) fails closed.
 *
 * REPRODUCIBILITY (η3-B93): the CLEAN_WORKSPACE_1 producer scans transient artifacts with REAL
 * `git ls-files --others --ignored --exclude-standard -- runtime`, so it legitimately requires a git
 * working tree. Rather than depend on the process being launched from inside a live repo (which failed
 * in a bare archive — a harness gap, NOT a product defect), each run now executes inside an ISOLATED
 * throwaway git fixture built with REAL `git init` (git is never mocked). A dedicated no-git fixture
 * additionally proves the producer fails CLOSED and diagnosably when no git tree is present. Fixtures are
 * created under the OS temp dir and removed on exit — the user repository is never touched.
 *
 * Deterministic + self-cleaning: authors throwaway mission files inside the fixture; uses a spy ledger
 * recorder so nothing is written to the real ledger.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LocalMissionRunner } from "./local-mission-runner";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const scanPath = path.join("runtime", "generated", "clean-workspace-scan.json");
const spy = () => ({ skipped: true });

function writeMission(id: string, objectiveId: string): string {
  const file = path.join("runtime", "missions", `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({
    mission: id, mode: "ENGINEERING", requires_engineering: true,
    authorized_paths: ["runtime/**"], authorizedPaths: ["runtime/**"],
    objectives: [{ id: objectiveId, goal: "audit the transient runtime workspace (read-only)", done_when: ["scan produced"] }],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
  }));
  return file;
}

// An isolated working tree with the cwd-relative dirs the runtime writes into. `withGit` controls whether
// it is a real git working tree. Only this fixture is ever mutated/removed — never the user repository.
function makeFixture(withGit: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-cws-"));
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  if (withGit) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "odg@test.local"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "odg-test"], { cwd: dir });
  }
  return dir;
}

const originalCwd = process.cwd();
const gitFixture = makeFixture(true);
const noGitFixture = makeFixture(false);

try {
  process.chdir(gitFixture);

  // 1 — Matching objective: CLEAN_WORKSPACE_1 dispatches, produces the scan artifact, mission SUCCEEDS.
  {
    const id = "__CWS_DISPATCH__";
    const file = writeMission(id, "CLEAN_WORKSPACE_1");
    fs.rmSync(scanPath, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("CLEAN_WORKSPACE_1 dispatch produced the scan artifact this run", () => {
        assert.strictEqual(fs.existsSync(scanPath), true, "scan artifact not written");
        const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));
        assert.strictEqual(scan.objective, "CLEAN_WORKSPACE_1");
        assert.strictEqual(scan.deleted, 0);
      });
      ok("real LOCAL mission PROVEN after producer execution ⇒ SUCCESS", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "SUCCESS");
        assert.strictEqual(out.validated, true);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // 2 — Non-matching objective: NO dispatch; the required probe has no evidence ⇒ fails closed.
  {
    const id = "__CWS_NODISPATCH__";
    const file = writeMission(id, "NONMATCH_OBJECTIVE");
    fs.rmSync(scanPath, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("non-matching objective ⇒ NO dispatch (no scan artifact written)", () => {
        assert.strictEqual(fs.existsSync(scanPath), false, "artifact appeared without a matching producer");
      });
      ok("required probe absent ⇒ FAILED (fail-closed)", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "FAILED");
        assert.strictEqual(out.validated, false);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // 3 — Run-ownership (ADD_PROBE_RUN_OWNERSHIP_V1): a STALE pre-existing scan artifact must NOT satisfy
  //     the probe when the current run did not (re)produce it (non-matching objective ⇒ no dispatch).
  //     This is the exact gap reproduced pre-repair (then SUCCESS); it must now fail closed.
  {
    const id = "__CWS_STALE__";
    const file = writeMission(id, "NONMATCH_OBJECTIVE");
    fs.writeFileSync(scanPath, JSON.stringify({ objective: "CLEAN_WORKSPACE_1", candidateCount: 0, candidates: [], deleted: 0 }));
    const old = 1_000_000_000; // ~2001-09, long before this run's start
    fs.utimesSync(scanPath, old, old);
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("stale pre-run scan artifact (no dispatch) ⇒ FAILED (run-ownership enforced)", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "FAILED");
        assert.strictEqual(out.validated, false);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // 4 — No-git working tree: the CLEAN_WORKSPACE_1 producer's real `git ls-files` fails, so the producer
  //     fails CLOSED (no scan written, diagnosable error naming git) — proving the git prerequisite is a
  //     designed fail-closed behaviour, never a silent success and never a product defect.
  {
    process.chdir(noGitFixture);
    const id = "__CWS_NOGIT__";
    const file = writeMission(id, "CLEAN_WORKSPACE_1");
    fs.rmSync(scanPath, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id) as { ok?: boolean; error?: string };
      ok("no git tree ⇒ producer fails CLOSED (ok:false, no scan, error names git ls-files)", () => {
        assert.strictEqual(out.ok, false, "run should not report ok without a git tree");
        assert.strictEqual(fs.existsSync(scanPath), false, "scan must not be written when the producer failed");
        assert.ok(/git ls-files/.test(out.error || "") && /not a git repository/.test(out.error || ""),
          `error should diagnosably name the git failure, got: ${out.error}`);
      });
    } finally {
      fs.rmSync(file, { force: true });
      process.chdir(gitFixture);
    }
  }

  console.log(`\nruntime-executor.clean-workspace: ${passed} assertions passed`);
} finally {
  process.chdir(originalCwd);
  fs.rmSync(gitFixture, { recursive: true, force: true });
  fs.rmSync(noGitFixture, { recursive: true, force: true });
}

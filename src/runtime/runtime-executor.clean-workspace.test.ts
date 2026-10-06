/*
 * Tests for CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1.
 * Run: node_modules/.bin/tsx src/runtime/runtime-executor.clean-workspace.test.ts
 *
 * Proves the FIRST real capability execution on the TS LOCAL route: RuntimeExecutor self-scoping
 * dispatch runs the existing CLEAN_WORKSPACE_1 producer (which writes its scan artifact THIS run), the
 * new `clean-workspace-scanned` probe verifies it, and the mission is honestly PROVEN end-to-end — while
 * a non-matching objective triggers NO dispatch and (with the probe required) fails closed.
 *
 * Deterministic + self-cleaning: authors throwaway git-ignored mission files; saves/restores the shared
 * clean-workspace scan artifact; uses a spy ledger recorder so nothing is written to the real ledger.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { LocalMissionRunner } from "./local-mission-runner";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const scanPath = path.join("runtime", "generated", "clean-workspace-scan.json");
const coveragePath = path.join("runtime", "generated", "clean-workspace-coverage.json");
const reportPath = path.join("runtime", "generated", "clean-workspace-report.json");
const save = (p: string) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const restore = (p: string, v: string | null) => { if (v === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, v); };

const priorScan = save(scanPath);
const priorCoverage = save(coveragePath);
const priorReport = save(reportPath);
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

try {
  fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });

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

  console.log(`\nruntime-executor.clean-workspace: ${passed} assertions passed`);
} finally {
  restore(scanPath, priorScan);
  restore(coveragePath, priorCoverage);
  restore(reportPath, priorReport);
}

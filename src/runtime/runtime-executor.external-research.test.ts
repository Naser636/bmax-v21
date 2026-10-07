/*
 * Tests for CONNECT_SECOND_PRODUCER_EXTERNAL_RESEARCH_DRYRUN_V1.
 * Run: node_modules/.bin/tsx src/runtime/runtime-executor.external-research.test.ts
 *
 * Second independent read-only producer validating GOVERNED_CAPABILITY_CONNECTION: the self-scoping
 * dispatch runs the External Research Acquisition capability in its DRY-RUN default (zero network),
 * which writes a deterministic plan artifact THIS run; the `external-research-dry-run-planned` probe
 * verifies it and the mission is PROVEN. A non-matching objective triggers NO dispatch; a stale pre-run
 * artifact fails closed (run-ownership).
 *
 * GOVERNED_HUMAN_AUTHORIZATION_TRANSPORT_V1: External Research is a CONSEQUENTIAL capability, so the
 * execution-chokepoint gate (runtime-executor → capability-authorization) now requires an EXPLICIT
 * human grant carried on the objective before dispatch (defense-in-depth). Case 1 therefore carries a
 * valid human grant + the human-granted spec; without it the executor would be blocked fail-closed
 * (covered by consequential-executor-gate.test.ts).
 *
 * Deterministic + self-cleaning: throwaway git-ignored mission files; saves/restores the shared
 * external-research artifact; spy ledger recorder so nothing touches the real ledger.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { LocalMissionRunner } from "./local-mission-runner";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const evi = path.join("runtime", "generated", "external-research-acquisition.json");
const prior = (() => { try { return fs.readFileSync(evi, "utf8"); } catch { return null; } })();
const spy = () => ({ skipped: true });

function writeMission(id: string, objectiveId: string, authorized = false): string {
  const file = path.join("runtime", "missions", `${id}.json`);
  // A valid human grant for the consequential External Research capability, bound to THIS mission.
  const governance = authorized
    ? {
        authorization: { capability: "External Research Acquisition", mission: id, scope: { objective: "plan", planned_sources: ["https://src.example.org"] }, expiresAt: Date.now() + 600_000, execute: true, human: true, issuer: "akabi@algonaser.fr" },
        capabilitySpec: { field: "research_acquisition", value: { authorized: true, execute: false, source_allowlist: ["https://src.example.org"], objective: "plan", items: [] } },
      }
    : {};
  fs.writeFileSync(file, JSON.stringify({
    mission: id, mode: "ENGINEERING", requires_engineering: true,
    authorized_paths: ["runtime/**"], authorizedPaths: ["runtime/**"],
    objectives: [{ id: objectiveId, goal: "produce a governed research dry-run plan (no network)", done_when: ["plan produced"], ...governance }],
    verify: [{ capability: "External Research Acquisition", evidence: "external-research-dry-run-planned" }],
  }));
  return file;
}

try {
  fs.mkdirSync(path.join("runtime", "generated"), { recursive: true });

  // 1 — Matching objective: EXTERNAL_RESEARCH_1 dispatches the DRY-RUN producer, writes a plan, SUCCEEDS.
  {
    const id = "__ER_DISPATCH__";
    const file = writeMission(id, "EXTERNAL_RESEARCH_1", true); // consequential ⇒ requires a human grant
    fs.rmSync(evi, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("EXTERNAL_RESEARCH_1 dispatch produced a DRY_RUN plan artifact this run", () => {
        assert.strictEqual(fs.existsSync(evi), true, "plan artifact not written");
        const ev = JSON.parse(fs.readFileSync(evi, "utf8"));
        assert.strictEqual(ev.mode, "DRY_RUN");
        assert.strictEqual(ev.acquired, false);
        assert.deepStrictEqual(ev.sources, []);
      });
      ok("real LOCAL mission PROVEN after dry-run producer execution ⇒ SUCCESS", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "SUCCESS");
        assert.strictEqual(out.validated, true);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  // 2 — Non-matching objective: NO dispatch; required probe has no evidence ⇒ fails closed.
  {
    const id = "__ER_NODISPATCH__";
    const file = writeMission(id, "NONMATCH_OBJECTIVE");
    fs.rmSync(evi, { force: true });
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("non-matching objective ⇒ NO dispatch (no plan artifact written)", () => {
        assert.strictEqual(fs.existsSync(evi), false, "artifact appeared without a matching producer");
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

  // 3 — Run-ownership: a STALE pre-run plan artifact must NOT satisfy the probe when no dispatch occurs.
  {
    const id = "__ER_STALE__";
    const file = writeMission(id, "NONMATCH_OBJECTIVE");
    fs.writeFileSync(evi, JSON.stringify({ capability: "External Research Acquisition", objective: "EXTERNAL_RESEARCH_1", mode: "DRY_RUN", acquired: false, sources: [], ranked: [] }));
    const old = 1_000_000_000; // long before this run's start
    fs.utimesSync(evi, old, old);
    try {
      const out = new LocalMissionRunner(undefined, undefined, spy).run(id);
      ok("stale pre-run plan artifact (no dispatch) ⇒ FAILED (run-ownership enforced)", () => {
        const status = (out.execution as { report?: { status?: string } })?.report?.status;
        assert.strictEqual(status, "FAILED");
        assert.strictEqual(out.validated, false);
      });
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  console.log(`\nruntime-executor.external-research: ${passed} assertions passed`);
} finally {
  if (prior === null) fs.rmSync(evi, { force: true });
  else fs.writeFileSync(evi, prior);
}

/*
 * CONSEQUENTIAL EXECUTOR GATE — the governed authorization chokepoint INSIDE runtime-executor.
 *
 * Proves that the EXISTING capability-executor for a consequential capability runs ONLY under a valid
 * human grant carried on the objective, re-validated at the EXECUTION layer (defense-in-depth, not just
 * the NL entrypoint). Drives the real LocalMissionRunner → RuntimeExecutor on crafted contracts:
 *   - valid grant + human-granted spec ⇒ the executor runs (dry-run evidence THIS run), mission validates;
 *   - NO grant ⇒ executor BLOCKED (never runs, no evidence) — a hand-crafted consequential objectiveId
 *     cannot bypass authorization by reaching runtime-executor directly;
 *   - EXPIRED grant ⇒ BLOCKED; scope-exceeded spec ⇒ BLOCKED; all fail-closed, no false SUCCESS.
 * The human-authorized concrete spec (planned_sources) is transported through mission-loader into the
 * executor (spec transport). Non-destructive: External Research DRY-RUN, ZERO network.
 *
 * Run: node_modules/.bin/tsx src/runtime/consequential-executor-gate.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { LocalMissionRunner } from "./local-mission-runner";

const REPO = process.cwd();
const MISSION = "TEST_CONSEQUENTIAL_EXEC_GATE";
const CONTRACT = path.join(REPO, "runtime", "missions", `${MISSION}.json`);
const EVIDENCE = path.join(REPO, "runtime", "generated", "external-research-acquisition.json");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function grant(over?: Record<string, unknown>) {
  return { capability: "External Research Acquisition", mission: MISSION, scope: { objective: "pricing", planned_sources: ["https://good.example.org"] }, expiresAt: Date.now() + 600_000, execute: true, human: true, issuer: "akabi@algonaser.fr", ...(over || {}) };
}
function spec(over?: Record<string, unknown>) {
  return { field: "research_acquisition", value: { authorized: true, execute: false, source_allowlist: ["https://good.example.org"], objective: "pricing", items: [], ...(over || {}) } };
}
function writeContract(objective: Record<string, unknown>): void {
  const contract = {
    mission: MISSION,
    priority: "NORMAL",
    mode: "SEQUENTIAL",
    requires_engineering: false,
    authorized_paths: [],
    description: "executor-gate adversarial test",
    objectives: [objective],
    verify: [{ capability: "External Research Acquisition", evidence: "external-research-dry-run-planned" }],
    definition_of_done: ["Validation successful."],
    source: "test",
  };
  fs.writeFileSync(CONTRACT, JSON.stringify(contract, null, 2));
}
function runFresh(objective: Record<string, unknown>): { validated: boolean; evidenceProduced: boolean } {
  try { fs.rmSync(EVIDENCE, { force: true }); } catch { /* ignore */ }
  writeContract(objective);
  const outcome = new LocalMissionRunner().run(MISSION, MISSION);
  const evidenceProduced = fs.existsSync(EVIDENCE);
  return { validated: outcome.validated === true, evidenceProduced };
}

console.log("CONSEQUENTIAL EXECUTOR GATE — AUTHORIZATION AT THE EXECUTION CHOKEPOINT");
try {
  // 1. Valid grant + human-granted spec ⇒ executor runs (dry-run), mission validates, spec transported.
  {
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "external-research-dry-run-planned", authorization: grant(), capabilitySpec: spec() });
    check(r.evidenceProduced, "valid grant ⇒ the EXISTING executor RAN (dry-run evidence produced this run)");
    check(r.validated, "valid grant ⇒ mission VALIDATED (probe passed on genuine evidence)");
    if (r.evidenceProduced) {
      const ev = JSON.parse(fs.readFileSync(EVIDENCE, "utf8"));
      check(ev.mode === "DRY_RUN" && ev.sources.length === 0, "executor ran in DRY-RUN (zero network)");
      check(JSON.stringify(ev.plannedSources) === JSON.stringify(["https://good.example.org"]), "the HUMAN-granted spec (planned_sources) was transported to the executor");
    }
  }

  // 2. Executor bypass defense: a consequential objectiveId with NO authorization is BLOCKED (never runs).
  {
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "external-research-dry-run-planned", capabilitySpec: spec() });
    check(!r.evidenceProduced, "NO grant ⇒ executor NEVER ran (no evidence) — direct-objectiveId bypass blocked");
    check(!r.validated, "NO grant ⇒ mission NOT validated (fail-closed, no false SUCCESS)");
  }

  // 3. Expired grant ⇒ BLOCKED at the execution chokepoint.
  {
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "external-research-dry-run-planned", authorization: grant({ expiresAt: Date.now() - 1 }), capabilitySpec: spec() });
    check(!r.evidenceProduced && !r.validated, "expired grant ⇒ executor blocked, mission not validated");
  }

  // 4. Scope exceeded (spec sources outside the granted scope) ⇒ BLOCKED.
  {
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "external-research-dry-run-planned", authorization: grant(), capabilitySpec: spec({ source_allowlist: ["https://evil.example.org"] }) });
    check(!r.evidenceProduced && !r.validated, "spec beyond grant scope ⇒ executor blocked (SCOPE_EXCEEDED), no false SUCCESS");
  }

  // 5. Wrong-mission grant ⇒ BLOCKED (no transfer).
  {
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "external-research-dry-run-planned", authorization: grant({ mission: "SOME_OTHER_MISSION" }), capabilitySpec: spec() });
    check(!r.evidenceProduced && !r.validated, "grant bound to another mission ⇒ executor blocked (no transfer)");
  }

  // 6. LIVE spec with NO grant ⇒ the chokepoint blocks BEFORE the executor ⇒ NO network fetch happens.
  {
    const liveSpec = { field: "research_acquisition", value: { authorized: true, execute: true, source_allowlist: ["http://127.0.0.1:1/"], objective: "pricing", items: [], fetcher: "governed-http-get", maxBytes: 1000, timeoutMs: 500 } };
    const r = runFresh({ id: "EXTERNAL_RESEARCH_1", goal: "acquire external research on pricing", done_when: ["Validation successful."], proof: "research-acquired", capabilitySpec: liveSpec });
    check(!r.evidenceProduced && !r.validated, "LIVE spec + NO grant ⇒ executor never runs ⇒ NO network (fail-closed)");
  }
} finally {
  try { fs.rmSync(CONTRACT, { force: true }); } catch { /* ignore */ }
  try { fs.rmSync(EVIDENCE, { force: true }); } catch { /* ignore */ }
}

console.log(failures === 0 ? "ALL PASS — CONSEQUENTIAL EXECUTOR GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

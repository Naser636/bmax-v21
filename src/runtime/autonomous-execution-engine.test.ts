/*
 * AutonomousExecutionEngine — deterministic unit test.
 *
 * Lives under src/runtime/ (the mission's authorized write scope) rather than src/tests/. Run it
 * directly with tsx:  node_modules/.bin/tsx src/runtime/autonomous-execution-engine.test.ts
 *
 * Every objective of AUTONOMOUS_EXECUTION_WITH_FALLBACK is exercised with fully-injected ports, so
 * the run needs no repository, provider or network.
 */

import {
  AutonomousExecutionEngine,
  AUTONOMOUS_EXECUTION_CONTRACT_VERSION,
  type AutonomousExecutionPorts,
  type ExecutionAttemptOutcome,
  type ExecutionCapability,
  type PatchApplication,
} from "./autonomous-execution-engine";
import type { MinimalPatch, RootCauseReport, ReleaseGateName } from "./root-cause-engine";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

// --- fixtures -------------------------------------------------------------

function fail(
  capability: string,
  over: Partial<ExecutionAttemptOutcome> = {},
): ExecutionAttemptOutcome {
  return {
    ok: false,
    capability,
    classification: "FAILED",
    changedFiles: [],
    unauthorizedChanges: [],
    diagnostics: [],
    blocker: null,
    ...over,
  };
}

function ok(capability: string): ExecutionAttemptOutcome {
  return {
    ok: true,
    capability,
    classification: "OK",
    changedFiles: ["src/runtime/x.ts"],
    unauthorizedChanges: [],
    diagnostics: [],
    blocker: null,
  };
}

function diagnosed(gate: ReleaseGateName, patch?: MinimalPatch): RootCauseReport {
  return {
    version: "ROOT_CAUSE_ENGINE_V1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    status: "DIAGNOSED",
    mission: "M",
    summary: `the "${gate}" gate is red`,
    gates: { build: true, typescript: true, gitClean: true, missionPipeline: true, documentationProofPresent: true },
    blockingGates: [gate],
    rootCause: {
      gate,
      responsibleComponent: {
        gate,
        decisionAuthority: "rm",
        evidenceProducer: "verify",
        evidenceFile: null,
        evidenceRelay: "adapter",
        gateConsumer: "autonomy",
      },
      blockingRule: "rule",
      detail: `the ${gate} gate is red; fix the module`,
      evidence: {},
    },
    minimalPatch: patch ?? null,
    correctiveMission: null,
  };
}

function noBlocker(): RootCauseReport {
  return {
    version: "ROOT_CAUSE_ENGINE_V1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    status: "NO_BLOCKER",
    mission: "M",
    summary: "no red gate",
    gates: { build: true, typescript: true, gitClean: true, missionPipeline: true, documentationProofPresent: true },
    blockingGates: [],
    rootCause: null,
    minimalPatch: null,
    correctiveMission: null,
  };
}

const generatedPatch: MinimalPatch = {
  rationale: "refresh regenerable artifact",
  filesToModify: ["runtime/generated/mission-report.json"],
  steps: ["produce runtime/generated/mission-report.json"],
  applied: false,
};

/** Build ports from a scripted sequence of (outcome, diagnosis) per attempt. */
function scriptedPorts(
  caps: ExecutionCapability[],
  script: Array<{ outcome: ExecutionAttemptOutcome; report?: RootCauseReport; apply?: PatchApplication }>,
): AutonomousExecutionPorts {
  let step = 0;
  return {
    availableCapabilities: () => caps,
    execute: () => {
      const s = script[Math.min(step, script.length - 1)];
      step += 1;
      return s.outcome;
    },
    diagnose: () => script[Math.min(step - 1, script.length - 1)].report ?? noBlocker(),
    applyPatch: () => script[Math.min(step - 1, script.length - 1)].apply ?? { applied: false, note: "n/a" },
    now: () => "2026-07-25T00:00:00.000Z",
  };
}

const engine = new AutonomousExecutionEngine();
const CAP_A: ExecutionCapability = { id: "claude", kind: "provider" };
const CAP_B: ExecutionCapability = { id: "openai", kind: "provider" };
const CAP_LOCAL: ExecutionCapability = { id: "local-runtime", kind: "local" };

// --- capability shape ----------------------------------------------------
console.log("describe/initialize");
{
  const d = engine.describe();
  check(d.class === "capability" && d.owner === "Runtime", "describe() is a Runtime capability");
  check(d.autonomousExecutionContractVersion === AUTONOMOUS_EXECUTION_CONTRACT_VERSION, "contract version stamped");
  check(engine.initialize().ready === true, "initialize() ready");
}

// --- obj1/obj7/obj8: first capability succeeds -> COMPLETED ---------------
console.log("COMPLETED on first attempt");
{
  const ports = scriptedPorts([CAP_A], [{ outcome: ok("claude") }]);
  const r = engine.run("M", ports);
  check(r.status === "COMPLETED", "status COMPLETED");
  check(r.attempts === 1 && r.capabilitiesTried.join() === "claude", "one attempt, one capability");
  check(r.blocker === null, "no blocker on success");
}

// --- obj4: INTERNAL -> generate + apply patch -> retry same cap succeeds ---
console.log("INTERNAL patch applied then retry succeeds");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_LOCAL],
    [
      { outcome: fail("claude", { diagnostics: ["build failed"] }), report: diagnosed("build", generatedPatch), apply: { applied: true, note: "applied" } },
      { outcome: ok("claude") },
    ],
  );
  const r = engine.run("M", ports);
  check(r.status === "COMPLETED", "recovered to COMPLETED after patch");
  check(r.patchesApplied.length === 1 && r.patchesApplied[0].applied, "exactly one applied patch recorded (obj4)");
  check(r.patchesApplied[0].gate === "build", "patch tied to the diagnosed gate");
  check(r.capabilitiesTried.join() === "claude", "retried the SAME capability after applying the patch");
}

// --- obj6: INTERNAL patch not applicable -> fall back to next capability ---
console.log("INTERNAL patch undelegated -> fallback");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B],
    [
      { outcome: fail("claude", { diagnostics: ["type error"] }), report: diagnosed("typescript"), apply: { applied: false, note: "no patch" } },
      { outcome: ok("openai") },
    ],
  );
  const r = engine.run("M", ports);
  check(r.status === "COMPLETED", "fell back and completed");
  check(r.capabilitiesTried.join() === "claude,openai", "tried both capabilities in fallback order (obj6)");
  check(r.patchesApplied.length === 0, "no patch applied when undelegated");
}

// --- obj3/obj5/obj8: EXTERNAL systemic blocker (missing api key) ----------
console.log("EXTERNAL systemic blocker stops immediately");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B],
    [{ outcome: fail("claude", { diagnostics: ["ANTHROPIC_API_KEY missing"] }), report: noBlocker() }],
  );
  const r = engine.run("M", ports);
  check(r.status === "BLOCKED_EXTERNAL", "status BLOCKED_EXTERNAL");
  check(r.blocker !== null && r.blocker.class === "EXTERNAL", "external blocker report present (obj5)");
  check(!!r.blocker && r.blocker.actionRequired.length > 0, "blocker names an exact action required");
  check(r.capabilitiesTried.join() === "claude", "stopped on the verified blocker, did NOT try more (obj8)");
}

// --- classify: frozen-root scope violation is EXTERNAL systemic -----------
console.log("frozen-root violation -> EXTERNAL systemic");
{
  const cls = engine.classify(
    fail("claude", { unauthorizedChanges: ["src/core/release-manager.ts"] }),
    noBlocker(),
  );
  check(cls.class === "EXTERNAL" && cls.systemic, "frozen-root change classified EXTERNAL systemic");
}

// --- classify: provider self-certified BLOCKED is EXTERNAL ----------------
console.log("provider BLOCKED -> EXTERNAL");
{
  const cls = engine.classify(
    fail("claude", { classification: "BLOCKED", blocker: "human decision required on scope" }),
    noBlocker(),
  );
  check(cls.class === "EXTERNAL" && cls.systemic, "self-certified blocker is EXTERNAL");
}

// --- classify: a TS "Unexpected token" is NOT mistaken for auth -----------
console.log("token in diagnostics is not an auth signal");
{
  const cls = engine.classify(
    fail("claude", { diagnostics: ["error TS1005: Unexpected token"] }),
    diagnosed("typescript"),
  );
  check(cls.class === "INTERNAL", "TS syntax error stays INTERNAL (precise phrase matching)");
}

// --- obj7/obj8: transient failures exhaust the fallback list -> EXHAUSTED --
console.log("all capabilities fail transiently -> EXHAUSTED");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B, CAP_LOCAL],
    [{ outcome: fail("x", { diagnostics: ["flaky non-systemic failure"] }), report: noBlocker() }],
  );
  const r = engine.run("M", ports);
  check(r.status === "EXHAUSTED", "status EXHAUSTED after trying everything");
  check(r.capabilitiesTried.length === 3, "tried all three capabilities before giving up (obj7)");
  check(r.blocker !== null, "exhaustion is elevated to an external blocker (obj8)");
}

// --- no capability available -> EXHAUSTED with a provisioning blocker ------
console.log("no capability available");
{
  const ports = scriptedPorts([], []);
  const r = engine.run("M", ports);
  check(r.status === "EXHAUSTED", "no capability -> EXHAUSTED");
  check(!!r.blocker && /provider/i.test(r.blocker.actionRequired), "blocker asks to provision a provider");
}

// --- obj9: single executive report + render ------------------------------
console.log("executive report shape + render");
{
  const ports = scriptedPorts([CAP_A], [{ outcome: ok("claude") }]);
  const r = engine.run("MISSION_X", ports);
  check(Object.keys(r.objectives).length === 9, "objective trace covers all nine objectives (obj9)");
  check(r.generatedAt === "2026-07-25T00:00:00.000Z", "generatedAt comes from the injected clock (deterministic)");
  const md = engine.render(r);
  check(md.startsWith("# Executive Report"), "render() produces a Markdown brief");
  check(md.includes("MISSION_X"), "render() names the mission");
}

console.log(failures === 0 ? "\nAutonomous Execution Engine OK" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

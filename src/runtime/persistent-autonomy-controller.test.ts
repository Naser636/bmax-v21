/*
 * PersistentAutonomyController — deterministic unit test.
 *
 * Lives under src/runtime/ (the mission's authorized write scope). Run it directly with tsx:
 *   node_modules/.bin/tsx src/runtime/persistent-autonomy-controller.test.ts
 *
 * Every objective of PERSISTENT_AUTONOMY_CONTROLLER_V1 is exercised with fully-injected ports, so
 * the run needs no repository, provider or network.
 */

import {
  PersistentAutonomyController,
  PERSISTENT_AUTONOMY_CONTROLLER_CONTRACT_VERSION,
  type ExecutionAttemptOutcome,
  type ExecutionCapability,
  type PersistentAutonomyPorts,
  type RecoveryOutcome,
  type RecoveryStrategy,
} from "./persistent-autonomy-controller";
import type { MinimalPatch, ReleaseGateName, RootCauseReport } from "./root-cause-engine";

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

const sourcePatch: MinimalPatch = {
  rationale: "fix the failing module",
  filesToModify: ["src/runtime/broken.ts"],
  steps: ["fix src/runtime/broken.ts", "re-run verify"],
  applied: false,
};

interface Step {
  outcome: ExecutionAttemptOutcome;
  report?: RootCauseReport;
  /** Recovery strategies offered for THIS failure (default: derive one from the report's patch). */
  strategies?: RecoveryStrategy[];
  /** Result of applying any strategy at this step (default: not applied). */
  apply?: RecoveryOutcome;
}

/** Build ports from a scripted sequence of (outcome, diagnosis, strategies, apply) per attempt. */
function scriptedPorts(caps: ExecutionCapability[], script: Step[]): PersistentAutonomyPorts {
  let step = 0;
  const at = () => script[Math.min(step - 1, script.length - 1)];
  return {
    availableProviders: () => caps,
    execute: () => {
      const s = script[Math.min(step, script.length - 1)];
      step += 1;
      return s.outcome;
    },
    diagnose: () => at().report ?? noBlocker(),
    recoveryStrategies: (_m, _o, report) => {
      const s = at();
      if (s.strategies) return s.strategies;
      // Default: derive a single patch strategy from the diagnosed minimal patch, if any.
      if (report.minimalPatch) {
        return [
          {
            id: `patch:${report.rootCause?.gate ?? "unknown"}`,
            kind: "patch",
            description: report.minimalPatch.rationale,
            targets: [...report.minimalPatch.filesToModify],
          },
        ];
      }
      return [];
    },
    applyRecovery: () => at().apply ?? { applied: false, note: "no automatic remedy" },
    now: () => "2026-07-26T00:00:00.000Z",
  };
}

const controller = new PersistentAutonomyController();
const CAP_A: ExecutionCapability = { id: "claude", kind: "provider" };
const CAP_B: ExecutionCapability = { id: "openai", kind: "provider" };
const CAP_LOCAL: ExecutionCapability = { id: "local-runtime", kind: "local" };

// --- capability shape ----------------------------------------------------
console.log("describe/initialize");
{
  const d = controller.describe();
  check(d.class === "capability" && d.owner === "Runtime", "describe() is a Runtime capability");
  check(
    d.persistentAutonomyControllerContractVersion === PERSISTENT_AUTONOMY_CONTROLLER_CONTRACT_VERSION,
    "contract version stamped",
  );
  check(controller.initialize().ready === true, "initialize() ready");
}

// --- obj1/obj11: first provider succeeds -> COMPLETED ---------------------
console.log("COMPLETED on first attempt");
{
  const ports = scriptedPorts([CAP_A], [{ outcome: ok("claude") }]);
  const r = controller.run("M", ports);
  check(r.status === "COMPLETED", "status COMPLETED");
  check(r.attempts === 1 && r.providersTried.join() === "claude", "one attempt, one provider");
  check(r.rootCause === null, "no root cause report on success (obj10)");
  check(Object.keys(r.objectives).length === 11, "objective trace covers all eleven objectives");
}

// --- obj2/obj5: NEVER stop on first failure; recovery applied then retry succeeds ---
console.log("recovery strategy applied then retry succeeds");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_LOCAL],
    [
      { outcome: fail("claude", { diagnostics: ["build failed"] }), report: diagnosed("build", generatedPatch), apply: { applied: true, note: "regenerated" } },
      { outcome: ok("claude") },
    ],
  );
  const r = controller.run("M", ports);
  check(r.status === "COMPLETED", "recovered to COMPLETED after a recovery strategy (obj2)");
  check(r.recoveriesAttempted.length === 1 && r.recoveriesAttempted[0].applied, "one applied recovery recorded (obj5)");
  check(r.providersTried.join() === "claude", "retried the SAME provider after applying the strategy");
  check(r.cycles.some((c) => c.action === "RECOVERED"), "a RECOVERED cycle was recorded");
}

// --- obj5: ALL strategies tried in order until one applies ----------------
console.log("tries ALL recovery strategies until one applies");
{
  const strategies: RecoveryStrategy[] = [
    { id: "s1", kind: "reset", description: "roll back", targets: [] },
    { id: "s2", kind: "regenerate", description: "regen artifact", targets: ["runtime/generated/x.json"] },
  ];
  let applyCount = 0;
  const base = scriptedPorts(
    [CAP_A],
    [
      { outcome: fail("claude", { diagnostics: ["build failed"] }), report: diagnosed("build", generatedPatch), strategies },
      { outcome: ok("claude") },
    ],
  );
  const ports: PersistentAutonomyPorts = {
    ...base,
    // First strategy fails to apply, second applies — proving the loop tries them all in order.
    applyRecovery: (s) => {
      applyCount += 1;
      return s.id === "s2" ? { applied: true, note: "applied" } : { applied: false, note: "n/a" };
    },
  };
  const r = controller.run("M", ports);
  check(r.status === "COMPLETED", "completed after the second strategy applied");
  check(applyCount === 2, "tried BOTH strategies in order (obj5)");
  check(r.recoveriesAttempted.length === 2, "both attempts recorded");
  check(r.recoveriesAttempted[0].applied === false && r.recoveriesAttempted[1].applied === true, "first not applied, second applied");
}

// --- obj6: no applicable recovery -> fall back to next provider -----------
console.log("undelegated recovery -> fallback to next provider");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B],
    [
      { outcome: fail("claude", { diagnostics: ["type error"] }), report: diagnosed("typescript", sourcePatch), apply: { applied: false, note: "delegated to provider" } },
      { outcome: ok("openai") },
    ],
  );
  const r = controller.run("M", ports);
  check(r.status === "COMPLETED", "fell back and completed");
  check(r.providersTried.join() === "claude,openai", "tried both providers in fallback order (obj6)");
  check(r.recoveriesAttempted.length === 1 && !r.recoveriesAttempted[0].applied, "recovery recorded as not applied");
}

// --- obj3/obj7/obj8/obj9/obj10: EXTERNAL systemic blocker (missing api key) ---
console.log("EXTERNAL systemic blocker -> single root cause report");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B],
    [{ outcome: fail("claude", { diagnostics: ["ANTHROPIC_API_KEY missing"] }), report: noBlocker() }],
  );
  const r = controller.run("M", ports);
  check(r.status === "BLOCKED_EXTERNAL", "status BLOCKED_EXTERNAL");
  check(r.providersTried.join() === "claude", "stopped on the verified blocker, did NOT try more (obj11)");
  check(r.rootCause !== null, "single consolidated root cause report present (obj10)");
  check(!!r.rootCause && r.rootCause.whyBlocked.length > 0, "root cause explains exactly why (obj7)");
  check(
    !!r.rootCause && r.rootCause.missing.some((m) => m.category === "CONFIGURATION" && /api[_-]?key/.test(m.item)),
    "listed the missing CONFIGURATION: api key (obj8)",
  );
  check(!!r.rootCause && r.rootCause.smallestActionToResume.length > 0, "described the smallest action to resume (obj9)");
  check(r.rootCause?.terminal === "SYSTEMIC_EXTERNAL", "terminal reason is SYSTEMIC_EXTERNAL");
}

// --- obj8: PERMISSION category (frozen root) + priority ordering ----------
console.log("frozen-root violation -> missing PERMISSION");
{
  const ports = scriptedPorts(
    [CAP_A],
    [{ outcome: fail("claude", { unauthorizedChanges: ["src/core/release-manager.ts"] }), report: noBlocker() }],
  );
  const r = controller.run("M", ports);
  check(r.status === "BLOCKED_EXTERNAL", "frozen-root change stops the run");
  check(
    !!r.rootCause && r.rootCause.missing.some((m) => m.category === "PERMISSION"),
    "listed a missing PERMISSION (path authorization) (obj8)",
  );
  check(
    !!r.rootCause && /permission/i.test(r.rootCause.smallestActionToResume),
    "smallest action names the missing permission first (obj9 priority ordering)",
  );
}

// --- obj6/obj11: transient failures exhaust the fallback list -> EXHAUSTED --
console.log("all providers fail transiently -> EXHAUSTED");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B, CAP_LOCAL],
    [{ outcome: fail("x", { diagnostics: ["flaky non-systemic failure"] }), report: noBlocker() }],
  );
  const r = controller.run("M", ports);
  check(r.status === "EXHAUSTED", "status EXHAUSTED after trying everything");
  check(r.providersTried.length === 3, "tried all three providers before giving up (obj6)");
  check(r.rootCause !== null && r.rootCause.terminal === "REMEDIES_EXHAUSTED", "exhaustion elevated to a root cause report (obj10/11)");
}

// --- no capability available -> EXHAUSTED with a provisioning root cause ----
console.log("no capability available");
{
  const ports = scriptedPorts([], []);
  const r = controller.run("M", ports);
  check(r.status === "EXHAUSTED", "no capability -> EXHAUSTED");
  check(!!r.rootCause && r.rootCause.terminal === "NO_CAPABILITY", "root cause terminal NO_CAPABILITY");
  check(!!r.rootCause && /provider/i.test(r.rootCause.smallestActionToResume), "smallest action asks to provision a provider (obj9)");
}

// --- obj10 render + determinism ------------------------------------------
console.log("report render + deterministic clock");
{
  const ports = scriptedPorts(
    [CAP_A, CAP_B],
    [{ outcome: fail("claude", { diagnostics: ["no provider enabled"] }), report: noBlocker() }],
  );
  const r = controller.run("MISSION_X", ports);
  check(r.generatedAt === "2026-07-26T00:00:00.000Z", "generatedAt comes from the injected clock (deterministic)");
  const md = controller.render(r);
  check(md.startsWith("# Persistent Autonomy Report"), "render() produces a Markdown brief");
  check(md.includes("MISSION_X"), "render() names the mission");
  check(md.includes("Root cause"), "render() includes the single root cause section (obj10)");
}

console.log(failures === 0 ? "\nPersistent Autonomy Controller OK" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

import { RuntimeAutonomy, selectNextMission } from "@/core/runtime-autonomy";
import type {
  AutonomyRuntimePorts,
  MissionContract,
  ReleaseEvidence,
} from "@/contracts/runtime-autonomy";
import type { ReleaseRecord } from "@/contracts/release";
import type { DocumentationProof } from "@/contracts/documentation";

const autonomy = new RuntimeAutonomy();

// --- describe / initialize (design §4 Invariant 1) ---
const desc = autonomy.describe();
console.assert(desc.class === "capability", "must be a capability, not an engine");
console.assert(desc.owner === "Runtime", "owned by the Runtime engine");
console.assert(desc.autonomyContractVersion === "1.0.0", "contract version 1.0.0");
console.assert(autonomy.initialize().ready === true, "initialize ready");

// --- Mission Selector (design §2 Stage 1): deterministic, Master-Plan order ---
console.assert(
  selectNextMission({
    masterPlanObjectives: ["A", "B", "C"],
    missingCapabilities: ["B", "C"],
    completedMissions: [],
  }) === "B",
  "selects the first missing objective in Master-Plan order",
);
console.assert(
  selectNextMission({
    masterPlanObjectives: ["A", "B", "C"],
    missingCapabilities: ["B", "C"],
    completedMissions: ["B"],
  }) === "C",
  "skips already-completed objectives",
);
console.assert(
  selectNextMission({
    masterPlanObjectives: ["A", "B"],
    missingCapabilities: [],
    completedMissions: [],
  }) === null,
  "nothing missing ⇒ null (plan exhausted)",
);

// --- helpers -------------------------------------------------------------

const validProof: DocumentationProof = {
  artifactContractVersion: "1.0.0",
  requestId: "X",
  artifactCount: 1,
  artifacts: [{ kind: "report", id: "X", version: "1.0.0", hash: "abcd0000abcd0000" }],
  inputsHash: "0123456789abcdef",
};

function greenEvidence(mission: string): ReleaseEvidence {
  return {
    validation: { build: true, typescript: true, gitClean: true, missionPipeline: true },
    source: { commit: "abc123", branch: "main" },
    documentationProof: { ...validProof, requestId: mission },
    artifacts: [{ kind: "certificate", id: mission, version: "1.0.0" }],
    previousReleaseRef: null,
  };
}

function validContract(mission: string): MissionContract {
  return {
    mission,
    priority: "NORMAL",
    mode: "SEQUENTIAL",
    objectives: [{ id: mission, goal: "g", done_when: ["d"] }],
    definition_of_done: ["done"],
    completion: ["RELEASE"],
  };
}

/** Fake ports with a shrinking backlog; archive marks a mission complete so the loop advances. */
function makePorts(
  objectives: string[],
  overrides: Partial<AutonomyRuntimePorts> = {},
  evidenceFor: (m: string) => ReleaseEvidence = greenEvidence,
): { ports: AutonomyRuntimePorts; archived: string[] } {
  const archived: string[] = [];
  const base: AutonomyRuntimePorts = {
    readPlanState: () => ({
      masterPlanObjectives: objectives,
      missingCapabilities: objectives,
      completedMissions: [...archived],
    }),
    generateContract: (m) => validContract(m),
    runPipeline: () => ({ pipelineOk: true }),
    gatherEvidence: (m) => evidenceFor(m),
    archive: (m: string, _record: ReleaseRecord) => {
      archived.push(m);
    },
  };
  return { ports: { ...base, ...overrides }, archived };
}

const cfg = { autonomyContractVersion: "1.0.0" };

// --- version gate (design §5) ---
const badVersion = autonomy.run({ autonomyContractVersion: "2.0.0" }, makePorts(["A"]).ports);
console.assert(
  badVersion.status === "AUTONOMY_CONTRACT_INCOMPATIBLE",
  "incompatible autonomy version halts",
);

// --- malformed ports (design §5) ---
// @ts-expect-error deliberately missing ports
const malformed = autonomy.run(cfg, { readPlanState: () => ({}) });
console.assert(malformed.status === "INPUTS_MALFORMED", "missing ports ⇒ INPUTS_MALFORMED");

// --- happy path: RELEASE each mission, advance, PLAN_COMPLETE (design §3) ---
const run = autonomy.run(cfg, makePorts(["Alpha", "Beta", "Gamma"]).ports);
console.assert(run.status === "PLAN_COMPLETE", "runs to plan completion");
console.assert(run.planComplete === true, "planComplete flag set");
console.assert(run.completed.length === 3, "all three missions released");
console.assert(
  run.completed.every((c) => c.record.decision === "RELEASE"),
  "every completed cycle is a RELEASE record",
);
console.assert(run.halt === null, "no halt on clean completion");

// --- determinism (design Invariant 4): same state ⇒ identical completed sequence ---
const runA = autonomy.run(cfg, makePorts(["Alpha", "Beta", "Gamma"]).ports);
const runB = autonomy.run(cfg, makePorts(["Alpha", "Beta", "Gamma"]).ports);
console.assert(
  JSON.stringify(runA.completed.map((c) => c.mission)) ===
    JSON.stringify(runB.completed.map((c) => c.mission)),
  "identical plan ⇒ identical release order",
);

// --- Release Manager is the SOLE authority: red gate ⇒ BLOCKED, not advance (founding invariant) ---
const blocked = autonomy.run(
  cfg,
  makePorts(["Alpha", "Beta"], {}, (m) => ({
    ...greenEvidence(m),
    validation: { build: false, typescript: true, gitClean: true, missionPipeline: true },
  })).ports,
);
console.assert(blocked.status === "BLOCKED", "NO_RELEASE from Release Manager halts as BLOCKED");
console.assert(blocked.completed.length === 0, "a blocked mission never advances");
console.assert(
  blocked.halt?.record?.decision === "NO_RELEASE",
  "halt carries the certified NO_RELEASE record",
);

// --- evidence incomplete ⇒ Release Manager error ⇒ EVIDENCE_INCOMPLETE (design §3) ---
const incomplete = autonomy.run(
  cfg,
  makePorts(["Alpha"], {}, (m) => ({ ...greenEvidence(m), documentationProof: null })).ports,
);
console.assert(
  incomplete.status === "EVIDENCE_INCOMPLETE",
  "absent documentation proof ⇒ EVIDENCE_INCOMPLETE",
);
console.assert(
  incomplete.halt?.releaseError?.code === "EVIDENCE_INCOMPLETE",
  "halt carries the Release Manager error as data",
);

// --- pipeline failure ⇒ EXECUTION_FAILED, decision never requested (design §3) ---
const execFailed = autonomy.run(
  cfg,
  makePorts(["Alpha"], { runPipeline: () => ({ pipelineOk: false }) }).ports,
);
console.assert(execFailed.status === "EXECUTION_FAILED", "pipeline failure halts before decision");
console.assert(execFailed.completed.length === 0, "no mission released on execution failure");

// --- invalid generated contract ⇒ CONTRACT_INVALID (design §2 Stage 2) ---
const badContract = autonomy.run(
  cfg,
  makePorts(["Alpha"], {
    generateContract: (m) => ({ ...validContract(m), objectives: [] }),
  }).ports,
);
console.assert(badContract.status === "CONTRACT_INVALID", "malformed contract halts");

// --- STALLED guard: archive that never marks completion cannot loop forever (design §3, R2) ---
const stalled = autonomy.run(
  cfg,
  makePorts(["Alpha"], { archive: () => {} }).ports, // archive is a no-op ⇒ never completes
);
console.assert(stalled.status === "STALLED", "non-advancing archive triggers the halting guard");
console.assert(stalled.completed.length === 1, "the first mission still released before stall");

console.log("Runtime Autonomy OK");

/*
 * D2/S4 (review N4 remediation) — the Autonomy Cycle ESCALATES + DEFERS a NO_RELEASE mission instead of
 * livelocking or force-advancing by commit (D1), so the loop CONTINUES to the next realizable mission and
 * ends with an HONEST terminal that never claims RELEASE:
 *   A. a PROVEN deliverable blocked ONLY by gitClean=false ⇒ status VALIDATED_PENDING_COMMIT (awaits the
 *      human commit gate), the mission is NOT in `completed`;
 *   B. a genuinely blocked mission (build red) does NOT stop a later releasable mission — the good one
 *      still RELEASES (continue-to-next), and the terminal is BLOCKED naming the blocker;
 *   C. a pending-commit mission likewise does not block a later good mission — good releases, terminal is
 *      VALIDATED_PENDING_COMMIT.
 *
 * Pure in-memory fakes (no provider, no git, no network). Run:
 *   node_modules/.bin/tsx src/tests/autonomy-escalation-pending-commit.test.ts
 */
import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import type {
  AutonomyRuntimePorts,
  MissionContract,
  ReleaseEvidence,
} from "@/contracts/runtime-autonomy";
import type { ReleaseRecord } from "@/contracts/release";
import type { DocumentationProof } from "@/contracts/documentation";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const PROOF: DocumentationProof = {
  artifactContractVersion: "1.0.0",
  requestId: "X",
  artifactCount: 1,
  artifacts: [{ kind: "report", id: "X", version: "1.0.0", hash: "abcd0000abcd0000" }],
  inputsHash: "0123456789abcdef",
};

type Val = { build: boolean; typescript: boolean; gitClean: boolean; missionPipeline: boolean };

function evidence(mission: string, val: Val): ReleaseEvidence {
  return {
    validation: val,
    source: { commit: "abc123", branch: "main" },
    documentationProof: { ...PROOF, requestId: mission },
    artifacts: [{ kind: "certificate", id: mission, version: "1.0.0" }],
    previousReleaseRef: null,
  };
}

function contract(mission: string): MissionContract {
  return {
    mission,
    priority: "NORMAL",
    mode: "SEQUENTIAL",
    objectives: [{ id: mission, goal: "g", done_when: ["d"] }],
    definition_of_done: ["done"],
    completion: ["RELEASE"],
  };
}

const GREEN: Val = { build: true, typescript: true, gitClean: true, missionPipeline: true };
const PENDING: Val = { build: true, typescript: true, gitClean: false, missionPipeline: true }; // only gitClean red
const BUILD_RED: Val = { build: false, typescript: true, gitClean: true, missionPipeline: true };

function ports(objectives: string[], valOf: (m: string) => Val): AutonomyRuntimePorts {
  const archived: string[] = [];
  return {
    readPlanState: () => ({
      masterPlanObjectives: objectives,
      missingCapabilities: objectives,
      completedMissions: [...archived],
    }),
    generateContract: (m) => contract(m),
    runPipeline: () => ({ pipelineOk: true }),
    gatherEvidence: (m) => evidence(m, valOf(m)),
    archive: (m: string, _r: ReleaseRecord) => { archived.push(m); },
  };
}

const cfg = { autonomyContractVersion: "1.0.0" };
const autonomy = new RuntimeAutonomy();

console.log("D2/S4 — autonomy escalation / defer-continue / pending-commit terminal");

// A — single pending-commit mission ⇒ VALIDATED_PENDING_COMMIT, not released.
{
  const r = autonomy.run(cfg, ports(["Solo"], () => PENDING));
  check(r.status === "VALIDATED_PENDING_COMMIT", "A. gitClean-only red ⇒ status VALIDATED_PENDING_COMMIT");
  check(r.completed.length === 0, "A2. pending-commit mission is NOT in completed (never RELEASED)");
  check(r.halt?.reason === "VALIDATED_PENDING_COMMIT", "A3. halt.reason is VALIDATED_PENDING_COMMIT");
  check(r.halt?.record?.decision === "NO_RELEASE", "A4. halt carries the certified NO_RELEASE record");
}

// B — a genuinely blocked mission does NOT stop a later releasable mission (continue-to-next).
{
  const r = autonomy.run(cfg, ports(["Blocked", "Good"], (m) => (m === "Blocked" ? BUILD_RED : GREEN)));
  check(r.completed.some((c) => c.mission === "Good"), "B. the later 'Good' mission still RELEASED (loop continued past the blocker)");
  check(!r.completed.some((c) => c.mission === "Blocked"), "B2. the blocked mission did NOT release");
  check(r.status === "BLOCKED", "B3. terminal is BLOCKED (a genuine blocker was escalated)");
  check(r.completed.every((c) => c.record.decision === "RELEASE"), "B4. completed holds only RELEASE records");
}

// C — a pending-commit mission does NOT block a later good mission; terminal stays pending-commit.
{
  const r = autonomy.run(cfg, ports(["Pending", "Good"], (m) => (m === "Pending" ? PENDING : GREEN)));
  check(r.completed.some((c) => c.mission === "Good"), "C. 'Good' still RELEASED despite an earlier pending-commit mission");
  check(r.status === "VALIDATED_PENDING_COMMIT", "C2. terminal is VALIDATED_PENDING_COMMIT (only pending-commit escalations)");
  check(!r.completed.some((c) => c.mission === "Pending"), "C3. the pending-commit mission is not in completed");
}

console.log(failures === 0 ? "ALL PASS — D2/S4 ESCALATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

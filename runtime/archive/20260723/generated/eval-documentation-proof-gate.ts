/*
 * Release-evaluation harness for RESOLVE_DOCUMENTATION_PROOF_PRESENT_GATE (OBJ-001 done_when #2).
 *
 * Re-runs the REAL frozen release evaluation for this mission using the unmodified core:
 *   AutonomyRuntimeAdapter.gatherEvidence(mission)  → rebuilds the DocumentationProof
 *   RuntimeAutonomy.assembleReleaseInputs shape       (replicated exactly)
 *   ReleaseManager.decide(inputs)                     → the completion authority
 *
 * It reads only on-disk artifacts and calls no provider. Lives under the gitignored
 * runtime/generated/ tree so running it never dirties the working tree.
 */
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { ReleaseManager } from "@/core/release-manager";
import { RELEASE_CONTRACT_VERSION } from "@/contracts/release";

const MISSION = "RESOLVE_DOCUMENTATION_PROOF_PRESENT_GATE";

const adapter = new AutonomyRuntimeAdapter(process.cwd());
const evidence = adapter.gatherEvidence(MISSION);

const inputs = {
  releaseContractVersion: RELEASE_CONTRACT_VERSION,
  requestId: MISSION,
  validation: {
    build: evidence.validation.build,
    typescript: evidence.validation.typescript,
    gitClean: evidence.validation.gitClean,
    missionPipeline: evidence.validation.missionPipeline,
  },
  source: { commit: evidence.source.commit, branch: evidence.source.branch },
  documentationProof: evidence.documentationProof ?? undefined,
  artifacts: evidence.artifacts ?? [],
  previousReleaseRef: evidence.previousReleaseRef ?? null,
} as Parameters<ReleaseManager["decide"]>[0];

const result = new ReleaseManager().decide(inputs);

const proofPresent =
  typeof evidence.documentationProof?.inputsHash === "string" &&
  evidence.documentationProof.inputsHash.length > 0;

const out = {
  mission: MISSION,
  documentationProof: {
    present: proofPresent,
    inputsHash: evidence.documentationProof?.inputsHash ?? null,
  },
  releaseManager: result.ok
    ? { ok: true, decision: result.record.decision, gates: result.record.gates }
    : { ok: false, error: result.error },
};

console.log(JSON.stringify(out, null, 2));

if (!proofPresent) {
  console.error("FAIL: documentationProofPresent gate is NOT green");
  process.exit(1);
}

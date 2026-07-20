import { ReleaseManager } from "@/core/release-manager";
import type { ReleaseInputs } from "@/contracts/release";
import type { DocumentationProof } from "@/contracts/documentation";

const manager = new ReleaseManager();

// --- describe / initialize (design "Invariants" §1) ---
const desc = manager.describe();
console.assert(desc.class === "capability", "must be a capability, not an engine");
console.assert(desc.owner === "Governance", "owned by Governance");
console.assert(desc.releaseContractVersion === "1.0.0", "contract version 1.0.0");
console.assert(manager.initialize().ready === true, "initialize ready");

const proof: DocumentationProof = {
  artifactContractVersion: "1.0.0",
  requestId: "REQ-1",
  artifactCount: 1,
  artifacts: [{ kind: "report", id: "M1", version: "1.0.0", hash: "abcd0000abcd0000" }],
  inputsHash: "0123456789abcdef",
};

const greenInputs: ReleaseInputs = {
  releaseContractVersion: "1.0.0",
  requestId: "REQ-1",
  validation: { build: true, typescript: true, gitClean: true, missionPipeline: true },
  source: { commit: "3d5d032", branch: "mission/fleet-first-exchange" },
  documentationProof: proof,
  artifacts: [
    { kind: "certificate", id: "M1", version: "1.0.0" },
    { kind: "documentation", id: "M1", version: "1.0.0" },
  ],
  previousReleaseRef: "REL-0",
};

// --- version gate (design "Pipeline" §2): incompatible MAJOR → explicit error, no decision ---
const incompatible = manager.decide({ ...greenInputs, releaseContractVersion: "2.0.0" });
console.assert(incompatible.ok === false, "incompatible version must fail");
console.assert(
  incompatible.ok === false && incompatible.error.code === "RELEASE_CONTRACT_INCOMPATIBLE",
  "incompatible version error code",
);

// --- malformed inputs (design "Pipeline" §1) ---
const malformed = manager.decide({
  ...greenInputs,
  // @ts-expect-error deliberately malformed for the test
  artifacts: "nope",
});
console.assert(malformed.ok === false, "malformed inputs must fail");
console.assert(
  malformed.ok === false && malformed.error.code === "INPUTS_MALFORMED",
  "malformed inputs error code",
);

// A wrong-typed validation flag is structural, not incomplete.
const malformedFlag = manager.decide({
  ...greenInputs,
  // @ts-expect-error deliberately malformed for the test
  validation: { build: "yes", typescript: true, gitClean: true, missionPipeline: true },
});
console.assert(
  malformedFlag.ok === false && malformedFlag.error.code === "INPUTS_MALFORMED",
  "wrong-typed flag is INPUTS_MALFORMED",
);

// --- evidence incomplete (design "Pipeline" §3): well-formed but missing evidence ---
const noArtifacts = manager.decide({ ...greenInputs, artifacts: [] });
console.assert(
  noArtifacts.ok === false && noArtifacts.error.code === "EVIDENCE_INCOMPLETE",
  "empty artifacts → EVIDENCE_INCOMPLETE",
);

const noProof = manager.decide({
  ...greenInputs,
  // @ts-expect-error missing evidence, structurally absent
  documentationProof: undefined,
});
console.assert(
  noProof.ok === false && noProof.error.code === "EVIDENCE_INCOMPLETE",
  "absent documentationProof → EVIDENCE_INCOMPLETE",
);

const noMissionFlag = manager.decide({
  ...greenInputs,
  // @ts-expect-error missing evidence flag
  validation: { build: true, typescript: true, gitClean: true },
});
console.assert(
  noMissionFlag.ok === false && noMissionFlag.error.code === "EVIDENCE_INCOMPLETE",
  "absent validation flag → EVIDENCE_INCOMPLETE",
);

// --- RELEASE on all-green (design "Pipeline" §4) ---
const released = manager.decide(greenInputs);
console.assert(released.ok === true, "complete green evidence must succeed");
if (released.ok) {
  console.assert(released.record.decision === "RELEASE", "all-green ⇒ RELEASE");
  console.assert(
    released.record.gates.build &&
      released.record.gates.typescript &&
      released.record.gates.gitClean &&
      released.record.gates.missionPipeline &&
      released.record.gates.documentationProofPresent,
    "all gates green",
  );
  // proofHash is the echoed Documentation Proof inputsHash (design "ReleaseRecord").
  console.assert(released.record.proofHash === proof.inputsHash, "proofHash echoes proof");
  console.assert(released.record.included.length === 2, "artifact set pinned");
  // rollbackRef presence (design "Invariants" §6, "Validation").
  console.assert(released.record.rollbackRef === "REL-0", "rollbackRef carried");
  // source echoed, never derived (risk R2).
  console.assert(released.record.source.commit === "3d5d032", "source echoed");
}

// --- NO_RELEASE on a red gate (design "Contrats de sortie", risk R6) ---
const redGate = manager.decide({
  ...greenInputs,
  validation: { ...greenInputs.validation, build: false },
});
console.assert(redGate.ok === true, "a red gate is a certified refusal, not an error");
if (redGate.ok) {
  console.assert(redGate.record.decision === "NO_RELEASE", "red gate ⇒ NO_RELEASE");
  console.assert(redGate.record.gates.build === false, "the red gate is reported, not rationalised");
  // A NO_RELEASE record is still reversible — rollbackRef is always present.
  console.assert(redGate.record.rollbackRef === "REL-0", "rollbackRef present on NO_RELEASE");
}

// --- rollbackRef may be null (first release) but the field is always present ---
const firstRelease = manager.decide({ ...greenInputs, previousReleaseRef: null });
console.assert(
  firstRelease.ok === true && firstRelease.record.rollbackRef === null,
  "first release carries an explicit null rollbackRef",
);

// --- determinism (design "Invariants" §3, §7): same inputs → identical record ---
const a = manager.decide(greenInputs);
const b = manager.decide(greenInputs);
console.assert(
  a.ok && b.ok && JSON.stringify(a.record) === JSON.stringify(b.record),
  "record is identical across runs",
);

// --- order independence: shuffled artifacts pin the identical set ---
const shuffled = manager.decide({
  ...greenInputs,
  artifacts: [...greenInputs.artifacts].reverse(),
});
console.assert(
  a.ok && shuffled.ok && JSON.stringify(a.record.included) === JSON.stringify(shuffled.record.included),
  "artifact input order does not affect the record",
);

console.log("Release Manager OK");

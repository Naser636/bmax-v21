import { DocumentationEngine } from "@/core/documentation-engine";
import type { DocumentationInputs } from "@/contracts/documentation";

const engine = new DocumentationEngine();

// --- describe / initialize (spec §7) ---
const desc = engine.describe();
console.assert(desc.class === "capability", "must be a capability, not an engine");
console.assert(desc.owner === "Observability", "owned by Observability");
console.assert(desc.artifactContractVersion === "1.0.0", "contract version 1.0.0");
console.assert(engine.initialize().ready === true, "initialize ready");

const validInputs: DocumentationInputs = {
  artifactContractVersion: "1.0.0",
  requestId: "REQ-1",
  artifacts: [
    { kind: "report", id: "M1", version: "1.0.0", payload: { status: "green", steps: 7 } },
    { kind: "certificate", id: "M1", version: "1.0.0", payload: { validated: true } },
  ],
};

// --- version gate (spec §3): incompatible MAJOR → explicit error, no output ---
const incompatible = engine.generate({ ...validInputs, artifactContractVersion: "2.0.0" });
console.assert(incompatible.ok === false, "incompatible version must fail");
console.assert(
  incompatible.ok === false && incompatible.error.code === "ARTIFACT_CONTRACT_INCOMPATIBLE",
  "incompatible version error code",
);

// --- malformed inputs (spec §3.1) ---
const malformed = engine.generate({
  artifactContractVersion: "1.0.0",
  requestId: "REQ-2",
  // @ts-expect-error deliberately malformed for the test
  artifacts: "nope",
});
console.assert(malformed.ok === false, "malformed inputs must fail");
console.assert(
  malformed.ok === false && malformed.error.code === "INPUTS_MALFORMED",
  "malformed inputs error code",
);

// --- happy path: two independent outputs (spec §4) ---
const result = engine.generate(validInputs);
console.assert(result.ok === true, "valid inputs must succeed");
if (result.ok) {
  console.assert(result.documentation.content.length > 0, "documentation produced");
  console.assert(result.proof.artifactCount === 2, "proof counts artifacts");
  console.assert(result.proof.inputsHash.length === 16, "proof carries a content hash");
  // Proof is not derived from the Documentation text (independence, spec §4).
  console.assert(
    !JSON.stringify(result.proof).includes(result.documentation.content),
    "proof does not embed documentation content",
  );
}

// --- determinism (spec §5): same inputs → byte-identical outputs ---
const a = engine.generate(validInputs);
const b = engine.generate(validInputs);
console.assert(
  a.ok && b.ok && a.documentation.content === b.documentation.content,
  "documentation is byte-identical across runs",
);
console.assert(
  a.ok && b.ok && a.proof.inputsHash === b.proof.inputsHash,
  "proof hash is stable across runs",
);

// --- order independence: shuffled artifacts project identically ---
const shuffled = engine.generate({
  ...validInputs,
  artifacts: [...validInputs.artifacts].reverse(),
});
console.assert(
  a.ok && shuffled.ok && a.documentation.content === shuffled.documentation.content,
  "artifact input order does not affect the projection",
);

// --- non-deterministic payload (spec §5) → explicit refusal ---
const nonDeterministic = engine.generate({
  artifactContractVersion: "1.0.0",
  requestId: "REQ-3",
  artifacts: [
    // A function value is valid TS (assignable to unknown) but not deterministically projectable.
    { kind: "generated", id: "X", version: "1.0.0", payload: { fn: () => 1 } },
  ],
});
console.assert(
  nonDeterministic.ok === false &&
    nonDeterministic.error.code === "PROJECTION_NON_DETERMINISTIC",
  "non-deterministic payload is refused",
);

console.log("Documentation Engine OK");

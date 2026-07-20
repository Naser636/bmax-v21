# Documentation Engine — Architecture Specification

- **Spec version:** v1.0
- **Artifact Contract Version:** `1.0.0`
- **Classification:** Capability (NOT a new engine)
- **Owning engine:** Observability (reuses Governance evidence primitives)
- **Status:** FROZEN
- **Scope:** Architecture only. No code. No Runtime file is modified by this document.

---

## 0. Constitutional grounding

This specification is bound by two governing texts:

**EDG Constitution (`docs/CONSTITUTION_EDG_v1.md`)**
- No new engine after v1.0.
- Every new feature is a Capability or an extension of an existing engine.
- Patrimony = decisions, capabilities, and proofs — never prototypes.

**Runtime Constitution (`runtime/constitution/runtime-constitution.json`)**
- `DETERMINISM_FIRST`
- `REUSE_BEFORE_CREATE`
- `EVIDENCE_REQUIRED`
- `ONE_RESPONSIBILITY_PER_COMPONENT`
- `ARTIFACTS_ARE_IMMUTABLE`
- `ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`
- `PIPELINE_IS_REPRODUCIBLE`

**Classification resolution (blocking constitutional point, now closed).**
The Documentation Engine is **not** a tenth engine. It is registered as a **Capability**
(`runtime/generated/capabilities/documentation-engine.js`; listed among `missing` capabilities
in the Capability Registry). The word "Engine" is nominal. Its constitutional class is
**Capability**, owned by the **Observability** engine. This satisfies EDG rule "every new
feature is a Capability or an extension of an existing engine" and closes the only latent
constitutional conflict.

---

## 1. Purpose and single responsibility

The Documentation Engine performs exactly one act:

> **Deterministic projection of Runtime artifacts into human-readable Documentation and a
> technical Documentation Proof.**

It owns no other responsibility (`ONE_RESPONSIBILITY_PER_COMPONENT`). In particular it does not
own storage, does not author content, and does not participate in mission decisions.

---

## 2. Storage decoupling (requirement 1)

- The Documentation Engine **never** references physical paths, filesystems, or storage backends.
- Its sole input is an **abstract `Documentation Inputs` contract** supplied by the Runtime.
- Storage (locating, reading, persisting artifacts and outputs) remains **exclusively** a Runtime
  responsibility. The engine receives already-materialized inputs and returns in-memory outputs;
  the Runtime decides where they live.

### 2.1 `Documentation Inputs` contract (abstract)

```
DocumentationInputs {
  artifactContractVersion : SemVer      // version of the artifact schema being supplied
  artifacts               : Artifact[]  // opaque, pre-loaded by the Runtime
  requestId               : string      // correlation id, provided by the Runtime
}

Artifact {
  kind    : "certificate" | "passport" | "report" | "generated"
  id      : string        // mission/artifact identity
  version : SemVer        // per-artifact contract version
  payload : object        // structured, already-parsed data — never a path
}
```

The engine consumes `DocumentationInputs` and nothing else. No `fs`, no path, no glob, no I/O.

---

## 3. Artifact Contract Version (requirement 2)

- The specification defines an **Artifact Contract Version** (`1.0.0` at freeze).
- Before **any** generation, the engine performs a **compatibility gate**: it compares
  `DocumentationInputs.artifactContractVersion` against the version range it supports.
- Compatibility rule: **same MAJOR** is required; MINOR/PATCH forward-compatible within the MAJOR.
- On incompatibility the engine **fails explicitly** and produces **no** output — it never
  degrades, guesses, or partially renders.

### 3.1 Failure / error contract

```
DocumentationEngineError {
  code            : "ARTIFACT_CONTRACT_INCOMPATIBLE"
                  | "INPUTS_MALFORMED"
                  | "PROJECTION_NON_DETERMINISTIC"
  supported       : SemVerRange   // what the engine supports
  received        : SemVer        // what was supplied
  requestId       : string
  message         : string        // technical, non-interpretive
}
```

The error is data (not a thrown narrative), auditable, and reproducible.

---

## 4. Documentation vs Documentation Proof (requirement 3)

Two **independent** outputs, produced from the **same** artifacts, with **no** dependency in
either direction.

| Output | Nature | Audience | Guarantee |
|--------|--------|----------|-----------|
| **Documentation** | Human-readable projection | Humans | Deterministic, reconstructible |
| **Documentation Proof** | Purely technical, auditable record of the projection | Machines / auditors | Deterministic, verifiable, immutable |

- Neither output reads the other; each is a pure function of the input artifacts.
- The Proof lets any auditor re-derive that the Documentation is exactly the projection of the
  declared artifacts under the declared Artifact Contract Version (`EVIDENCE_REQUIRED`).
- Removing the Proof does not change the Documentation, and vice-versa.

---

## 5. Deterministic projection invariant (requirement 4)

The Documentation Engine:

- **never decides**;
- **never interprets**;
- **never reformulates**;
- **never summarizes**.

> Every piece of information present in the Documentation MUST be reconstructible **exclusively**
> from the input artifacts. The Documentation is a **deterministic projection** of Runtime
> artifacts.

Consequences (enforced, not aspirational):
- Same inputs ⇒ byte-identical outputs (`DETERMINISM_FIRST`, `PIPELINE_IS_REPRODUCIBLE`). No clocks,
  randomness, locale, or environment may enter the projection.
- No field may originate from the engine itself; the engine is a total function
  `project : DocumentationInputs → { Documentation, DocumentationProof }`.
- If determinism cannot be guaranteed for an input, the engine fails
  (`PROJECTION_NON_DETERMINISTIC`) rather than emit interpreted content.

---

## 6. Structural decision (requirement 5) — **Option A selected**

**Option A — Documentation is a first-class Runtime artifact with its own `documentation/`
directory, explicitly authorized by governance.**
**Option B — Documentation folded into an existing artifact structure.**

### Decision: **Option A.**

### Technical justification

1. **`ONE_RESPONSIBILITY_PER_COMPONENT`.** Each existing artifact class has a single provenance:
   `report.md` is a human-authored narrative containing a `Décision` field; `certificate.md` is a
   governance validation; `passport.md` is identity. Documentation is a *deterministic projection*
   that must never decide/interpret. Folding it into these structures (Option B) contaminates a
   never-decide projection with authored, decision-bearing content — a direct responsibility
   violation. Option A keeps provenances isolated.

2. **Acyclic dependencies.** A dedicated `documentation/` directory consumes artifacts one-way and
   is consumed by no artifact producer. Option B would create a back-reference from an existing
   artifact structure into documentation output, introducing a latent cycle. Option A is strictly
   acyclic.

3. **Independent immutability & versioning.** `ARTIFACTS_ARE_IMMUTABLE` plus the Artifact Contract
   Version require Documentation and Proof to be versioned and frozen independently of the mission
   artifacts they project from. A sibling directory gives them their own immutable lifecycle;
   Option B entangles their lifecycle with report generation.

4. **`REUSE_BEFORE_CREATE` is still honored.** Reuse governs *components*, not *output categories*.
   Option A reuses every existing mechanism — Capability Registry, Runtime storage layer, artifact
   contract, and the mission-standard quadruple — while adding only a new *artifact class*. It
   creates no new engine and no new machinery.

5. **Patrimony & governance.** The Constitution defines patrimony as decisions, capabilities, and
   proofs. The **Documentation Proof is patrimony** and therefore warrants first-class,
   governance-authorized status. This specification, approved as the governance act, is the
   explicit authorization Option A requires.

### Resulting layout (Runtime-owned; illustrative, not created by this document)

```
documentation/
  <MISSION>.documentation.md      # human-readable projection
  <MISSION>.proof.json            # technical, auditable proof
```

Placement, naming, and persistence remain Runtime storage responsibilities (see §2).

---

## 7. Capability interface (implementable surface)

```
DocumentationEngine  (Capability, owned by Observability)
  describe()  -> { name, class: "capability", owner: "Observability",
                   artifactContractVersion, status }
  initialize()-> { ready }
  generate(inputs: DocumentationInputs)
              -> { documentation: Documentation, proof: DocumentationProof }
               |  throws-as-data: DocumentationEngineError
```

- `generate` is pure and total over valid, version-compatible inputs.
- No method performs I/O; the Runtime supplies inputs and persists outputs.
- Rollback is trivial and always possible (`ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`): outputs are
  immutable, versioned files owned by the Runtime; reverting = discarding a generation.

---

## 8. Constitutional conformity matrix

| Principle | Conformance |
|-----------|-------------|
| No new engine (EDG) | ✔ Capability, not an engine |
| Capability / extension only (EDG) | ✔ Capability owned by Observability |
| Patrimony = proofs (EDG) | ✔ Documentation Proof is first-class patrimony |
| `DETERMINISM_FIRST` | ✔ Pure projection, byte-identical outputs |
| `REUSE_BEFORE_CREATE` | ✔ Reuses registry, storage, artifact contract |
| `EVIDENCE_REQUIRED` | ✔ Documentation Proof |
| `ONE_RESPONSIBILITY_PER_COMPONENT` | ✔ Projection only; storage stays in Runtime |
| `ARTIFACTS_ARE_IMMUTABLE` | ✔ Versioned, immutable outputs |
| `ROLLBACK_MUST_ALWAYS_BE_POSSIBLE` | ✔ Discard a generation |
| `PIPELINE_IS_REPRODUCIBLE` | ✔ Same inputs ⇒ same outputs |

---

## 9. Final validation checklist (requirement 6)

- [x] Complete coherence
- [x] Perfectly isolated responsibilities
- [x] No circular dependency
- [x] Compatible with the existing Runtime architecture
- [x] Constitutional conformity (EDG + Runtime)
- [x] No remaining architecture decision (class, owner, storage boundary, versioning, Option A)
- [x] Directly implementable

All criteria satisfied. This specification is frozen. Any future change requires a new,
versioned specification.

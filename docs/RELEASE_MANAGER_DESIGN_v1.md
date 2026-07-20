# Release Manager — Architecture Design

- **Design version:** v1.0 (FROZEN)
- **Master Plan objective:** #10
- **Classification:** Capability (NOT a new engine)
- **Owning engine:** Governance
- **Release Contract Version:** `1.0.0`
- **Status:** FROZEN
- **Scope:** Architecture only. No code. No new foundation. Reuses existing primitives.

---

## Invariant fondateur (constitutional)

> **Le Release Manager ne juge jamais la qualité d'un logiciel.
> Il certifie uniquement qu'un ensemble complet de preuves conformes permet une décision
> RELEASE ou NO_RELEASE.**

This invariant governs the entire capability and takes precedence over every mechanism
described below. The Release Manager is a **certifier of evidence completeness and
conformity**, never an assessor of software quality: it derives a decision mechanically
from the supplied evidence gates and never forms, infers, or rationalises a judgement of
its own.

---

## Mission

> Produce a **deterministic, evidence-backed release decision and immutable release
> record** from validated Runtime evidence — certifying whether the current state may be
> released, and pinning exactly what a release contains.

The Release Manager is the governance act that closes the chain
`mission → artifact → documentation → **release**`. It consumes the outputs of upstream
capabilities (including the Documentation Proof) and reuses the existing verify / freeze /
rollback primitives; it introduces no new engine and no new foundation.

---

## Responsabilités

- Decide **RELEASE** or **NO_RELEASE** as a deterministic function of supplied evidence gates.
- Verify a **Release Contract Version** before any evaluation; fail explicitly on mismatch.
- Require **complete evidence** (validation flags + Documentation Proof + source + artifact set).
- Assemble an **immutable Release Record** pinning the exact artifact set and proof hash.
- Emit a **rollback reference** so a release is always reversible.
- Return errors as **data** (never thrown narratives).

## Non-responsabilités

- Never runs the build, `tsc`, tests, or the mission pipeline itself (no `child_process`).
- Never reads or writes the filesystem, and never references physical paths (no storage).
- Never invents or interprets evidence — a red gate is reported, never rationalised.
- Never generates its own timestamp, commit hash, or version — these are Runtime-supplied metadata.
- Never publishes, tags, pushes, or deploys — the Runtime performs any side effect.
- Never mutates upstream artifacts, the Documentation, or the Documentation Proof.

---

## Contrats d'entrée

The capability consumes a single abstract `ReleaseInputs` contract supplied by the Runtime
(storage decoupling, mirroring `DocumentationInputs`):

```
ReleaseInputs {
  releaseContractVersion : SemVer          // gated before evaluation
  requestId              : string
  validation             : ValidationEvidence
  source                 : { commit: string, branch: string }   // echoed, never derived
  documentationProof     : DocumentationProof                    // reused frozen contract
  artifacts              : ReleaseArtifactRef[]                  // ids/refs only, no paths
  previousReleaseRef     : string | null                        // for the rollback invariant
}

ValidationEvidence {
  build          : boolean     // from odg-verify.js
  typescript     : boolean     // from odg-verify.js
  gitClean       : boolean     // from odg-verify.js
  missionPipeline: boolean     // from the ODG mission pipeline
}

ReleaseArtifactRef {
  kind    : "certificate" | "passport" | "report" | "generated" | "documentation" | "proof"
  id      : string
  version : string
}
```

The engine reads nothing else — no `fs`, no path, no execution.

## Contrats de sortie

Two outcomes, both returned as data:

```
ReleaseManagerResult =
  | { ok: true,  record: ReleaseRecord }
  | { ok: false, error:  ReleaseManagerError }

ReleaseRecord {                              // immutable, versioned
  releaseContractVersion : SemVer
  requestId              : string
  decision               : "RELEASE" | "NO_RELEASE"
  gates                  : ReleaseGates       // per-gate evidence result
  included               : ReleaseArtifactRef[]
  proofHash              : string             // documentationProof.inputsHash, echoed
  source                 : { commit, branch }
  rollbackRef            : string | null      // = previousReleaseRef
}

ReleaseGates {
  build: boolean; typescript: boolean; gitClean: boolean;
  missionPipeline: boolean; documentationProofPresent: boolean;
}

ReleaseManagerError {
  code      : "RELEASE_CONTRACT_INCOMPATIBLE" | "INPUTS_MALFORMED" | "EVIDENCE_INCOMPLETE"
  supported : SemVer
  received  : SemVer
  requestId : string
  message   : string   // technical, non-interpretive
}
```

Distinction (deterministic, not interpretive):
- **Missing / unversioned / malformed evidence ⇒ error** — no decision is possible.
- **Complete evidence with a red gate ⇒ `ok:true, decision:"NO_RELEASE"`** — a certified refusal.
- **Complete evidence, all gates green ⇒ `ok:true, decision:"RELEASE"`**.

The Runtime persists the record as a Governance certificate and stamps time / freezes it
(reusing `odg-freeze.js`); the capability itself stamps nothing.

---

## Pipeline

1. **Validate structure** of `ReleaseInputs` → `INPUTS_MALFORMED` on any structural fault.
2. **Release Contract Version gate** (same-MAJOR rule) → `RELEASE_CONTRACT_INCOMPATIBLE`.
3. **Evidence completeness** (all `validation` flags present, `documentationProof` present,
   `source` present, `artifacts` non-empty) → `EVIDENCE_INCOMPLETE`.
4. **Deterministic gate evaluation**:
   `RELEASE ⇔ build ∧ typescript ∧ gitClean ∧ missionPipeline ∧ documentationProofPresent`.
5. **Assemble `ReleaseRecord`** (decision, gates, included refs, proofHash, rollbackRef).
6. **Return** the record. Runtime persists + freezes + stamps metadata; capability does no I/O.

---

## Invariants

1. **Capability, not engine** — honours "no new engine after v1.0".
2. **No storage / no execution** — no `fs`, no `child_process`, no paths.
3. **Deterministic decision** — identical evidence ⇒ identical decision (`DETERMINISM_FIRST`).
4. **Evidence required** — no `RELEASE` without complete evidence incl. Documentation Proof
   (`EVIDENCE_REQUIRED`).
5. **Immutable record** — the record is versioned and never mutated (`ARTIFACTS_ARE_IMMUTABLE`).
6. **Rollback always possible** — every record carries `rollbackRef`
   (`ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`).
7. **Reproducible** — same inputs ⇒ same record modulo Runtime-supplied metadata
   (`PIPELINE_IS_REPRODUCIBLE`).
8. **One responsibility** — decide + certify; nothing else (`ONE_RESPONSIBILITY_PER_COMPONENT`).
9. **Reuse before create** — reuses verify/release/freeze/rollback + Documentation Engine;
   creates no new foundation (`REUSE_BEFORE_CREATE`).
10. **Never judges quality** — the capability certifies evidence completeness and conformity
    only; it never assesses software quality and never rationalises a red gate (founding
    invariant above).

---

## Dépendances

**Satisfied**
- Documentation Engine V1 + `DocumentationProof` contract (release evidence) ✅
- `runtime/bin/odg-verify.js` → `{ build, typescript, gitClean }` ✅
- `foundation/release.sh`, `runtime/bin/odg-freeze.js`, `foundation/rollback.sh` ✅
- ODG mission pipeline (`missionPipeline` evidence) ✅
- mission-standard certificate format (Governance persistence target) ✅
- Mission Loader, Execution Planner, ProjectContext ✅

**Remaining (non-blocking, integration-side, owned by the Runtime not the capability)**
- Runtime glue that assembles `ReleaseInputs` from the verify/pipeline/documentation outputs.
- Choice of where the persisted release certificate lives (Runtime storage decision).

---

## Validation

- `npx tsc --noEmit` → green.
- ODG mission pipeline → `PIPELINE SUCCESS`.
- `npm run build` → green.
- Conformance test (`src/tests/`) covering: version-gate failure, malformed inputs,
  evidence-incomplete, `NO_RELEASE` on a red gate, `RELEASE` on all-green, decision
  determinism across runs, and `rollbackRef` presence.

---

## Risques

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Scope creep — capability runs build/IO itself | Strict `ReleaseInputs` contract; no `fs`/`child_process`; Runtime executes and feeds evidence |
| R2 | Non-deterministic metadata leaks into the decision | Decision derives only from boolean gates; commit/timestamp are echoed, never decided |
| R3 | Gate-policy drift | Gate set fixed by the frozen spec; any change requires a new Release Contract Version |
| R4 | Rollback ref invalid | Capability validates presence; Runtime guarantees the ref points to a real prior release |
| R5 | Generated registry stale (won't auto-mark capability) | Out of scope, as for Documentation Engine; capability self-describes via `describe()` |
| R6 | Confusing `NO_RELEASE` with an error | Explicit model: red gate ⇒ `ok:true` certified refusal; only missing/malformed evidence is an error |

---

No open architectural decision remains: classification (Capability), owner (Governance),
input/output contracts, deterministic gate policy, reuse map, and rollback are all resolved.

---

## Freeze

This architecture is **FROZEN** at Release Contract Version `1.0.0`. The founding invariant,
the input/output contracts, the deterministic gate set, and the error model are contractual
and immutable: any change to gate policy or contract shape requires a **new** Release Contract
Version, never an in-place edit (`ARTIFACTS_ARE_IMMUTABLE`, risk R3). Implementation must
conform to this document exactly and introduce no new foundation (`REUSE_BEFORE_CREATE`).

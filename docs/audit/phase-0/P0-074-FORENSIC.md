# P0-074 — Verification Depth & Evidence Linkage (FORENSIC)

- **Identifier:** P0-074
- **Status:** **CLOSED — EVALUATED — NO-CHANGE NEEDED** (CTO ruling, authorized documentary closure).
  Verdict §6(a) adopted: the evidence/verification *separation* the campaign requires already holds by
  construction; the *depth* axis has no current consumer and no reproducible need. **No runtime change.**
  Re-open only when a layered-certification consumer (e.g. an authorized P0-079) demands per-layer
  linkage. P0-075…P0-079 remain `PLANNED — NOT AUTHORIZED`.
- **Document type:** Originated as FORENSIC / PREPARATION (read-only). This revision records the CTO
  closure ruling only; it still defines no runtime write-set and changes no runtime file.
- **Campaign status in V5 roadmap:** `PLANNED — NOT AUTHORIZED` (the roadmap authority is unchanged by
  this document; this closure is recorded in the audit carnet, not in the roadmap).
- **Evaluated at:** HEAD `ffb3fcbd3cdbeba37b6bcb09d71dcefbf685b440`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03, P0-071 (producer/consumer), P0-072 (no provenance expansion),
  P0-073 (chains complementary, one state authority)

## 1. The question P0-074 asks

> Verify that the C03 transition record **can support the required verification levels without
> confusing evidence with verification.**

Potential layers named by the campaign:
`STRUCTURAL, SEMANTIC, BEHAVIORAL, RUNTIME, OBJECTIVE, ADVERSARIAL, ECONOMIC, INDEPENDENT/EXTERNAL`.

Rule: *No stronger certification claim than the evidence supports.*

## 2. What C03 provides today (repository evidence)

From `runtime/core/state-transition.js`:

- **`verification_status`** — frozen controlled vocabulary of **four** members:
  - `VERIFIED` — observed_effect confirmed by evidence (**proof-requiring**)
  - `REJECTED` — observed_effect contradicts the expected effect (**proof-requiring**)
  - `RECORDED` — honest **coverage only, NOT a proof** (evidence optional)
  - `UNVERIFIED` — not yet verified (evidence optional)
- **`evidence_refs`** — array of strings referencing evidence artifacts (I3).
- **Invariant I5** — proof-requiring statuses (`VERIFIED`/`REJECTED`) **MUST** carry ≥1 `evidence_ref`;
  `RECORDED`/`UNVERIFIED` may carry none.

## 3. Finding A — the "no confusion" requirement is **already satisfied by construction**

P0-074's core demand is that the record not *confuse evidence with verification*. C03 enforces exactly
that separation, structurally:

1. **Two distinct fields.** `evidence_refs` (the proof *material*) is separate from
   `verification_status` (the *conclusion*). They cannot be conflated — they are different keys with
   different types and different invariants.
2. **Coverage ≠ proof.** `RECORDED` is defined as honest coverage that is explicitly **not** a proof —
   the same epistemic-honesty rule reused from `objective-attribution.js` (P0-073 §3.4). Presence of an
   evidence_ref never auto-upgrades a status to VERIFIED.
3. **No proof-free conclusion.** I5 forbids asserting `VERIFIED`/`REJECTED` without an evidence_ref — a
   verification conclusion is never claimed without a proof reference.
4. **Per-transition scope.** `verification_status` records the observed verification state of **one
   transition only**; it is *not* a mission SUCCESS verdict and *not* a `done_when` proof.

> **Conclusion A:** C03 already supports verification *without confusing evidence with verification*.
> This half of P0-074 requires **no change**.

## 4. Finding B — C03 does **not** encode verification *depth* (the 8 layers)

The four `verification_status` members express the *outcome axis*
(verified / rejected / recorded / not-yet). They do **not** express the *depth axis* — which of the 8
layers (STRUCTURAL … INDEPENDENT/EXTERNAL) a given verification reached. There is today:

- **no `verification_layer` / `verification_depth` field** on the record;
- **no layer typing on `evidence_refs`** (a ref is an opaque string — it does not say whether it is
  structural, runtime, adversarial, external, etc.).

So a reader cannot currently assert, from the record alone, *"this transition was verified at the
RUNTIME and ADVERSARIAL layers but not INDEPENDENT."*

## 5. Is the depth axis a proven need? (the P0-072 test applied)

Same discipline the roadmap imposes — *no schema expansion without proof of need*:

- **Consumer demand:** repository-wide, the only C03 consumer is `final-report.summarizeC03()`, which
  counts `validated` and `verified` **only** — it reads no layer. A search for a layer/depth consumer
  returns none.
- **Reproducible defect:** none. Full src suite exit 0 / "ALL PASS"; `runtime/core` 24/24; C03
  contract 36/36; mission-lifecycle × C03 20/20; final-report × C03 7/7.
- **Over-claim risk today:** the system does **not** over-claim — because it makes no layered
  certification claim at all. The risk P0-074 guards against (claiming more depth than the evidence
  supports) is currently **absent**, since no layer is asserted.

Adding an 8-layer taxonomy now would add structure "because the Master mentions it" — the anti-pattern
P0-072 rejected — unless a real layered-certification consumer is named (note: **P0-079 Canonical State
Certification** is the natural such consumer, but it is itself `NOT AUTHORIZED` and not yet scoped).

## 6. CTO decision this forensic enables

- **(a) CLOSE P0-074 as EVALUATED — NO EXPANSION NEEDED** (supported by current evidence): the
  evidence/verification *separation* the campaign requires already holds; the *depth* axis has no
  current consumer and no reproducible need. Re-open when a layered-certification consumer (e.g. an
  authorized P0-079) actually demands per-layer linkage.
- **(b) AUTHORIZE a bounded depth extension** — only if P0-079 (or another consumer) is concurrently
  scoped to *read* layers. The **smallest** insertion that preserves backward compatibility would be an
  **optional** `verification_layer` ∈ {STRUCTURAL…INDEPENDENT} tag (record-level or per evidence_ref),
  additive like P0-071, with its own authorized write-set, invariant, and tests. **Not performed here.**

## 7. Authority frontier

Any runtime/schema change (option b) is **NOT AUTHORIZED** and is not performed. Execution STOPS at
this frontier pending an explicit CTO ruling on §6.

## 8. Evidence index

- `runtime/core/state-transition.js` — `VERIFICATION_STATUS`, `PROOF_REQUIRING`, invariants I1–I7,
  `C03_CONTRACT` descriptor.
- `runtime/core/final-report.js` — `summarizeC03()` (the sole C03 consumer; reads no layer).
- Suites: full src `npm test` exit 0 "ALL PASS"; `runtime/core` 24/24; C03 targeted 27 assertions green.

# P0-073 — STATE / ACTION / OUTCOME / PROOF Reconciliation (FORENSIC)

- **Identifier:** P0-073
- **Status:** **CLOSED — EVALUATED — NO-CHANGE NEEDED** (CTO ruling, authorized documentary closure).
  Verdict §5(a) adopted: the chains are complementary and already unified at the `mission-lifecycle`
  bridge; one state authority; no reconciliation change. **No runtime change.** P0-075…P0-079 remain
  `PLANNED — NOT AUTHORIZED`.
- **Document type:** Originated as FORENSIC / PREPARATION (read-only). This revision records the CTO
  closure ruling only; it still defines no runtime write-set and changes no runtime file.
- **Campaign status in V5 roadmap:** `PLANNED — NOT AUTHORIZED` (the roadmap authority is unchanged by
  this document; this closure is recorded in the audit carnet, not in the roadmap).
- **Evaluated at:** HEAD `bfacaae329d0b8b8613e02bcc4a22c2dfcb3cf50`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03 (state-transition contract), P0-071 (C03 ↔ mission-lifecycle producer +
  final-report consumer), P0-072 (provenance completion — NO EXPANSION NEEDED)

## 1. The question P0-073 asks

Reconcile the canonical **semantic** chain

```
MISSION → OBJECTIVE → ACTION → OUTCOME → PROOF          (Chain A)
```

with the canonical **transition** chain

```
STATE_BEFORE → ACTION → OBSERVED_EFFECT → STATE_AFTER   (Chain B)
```

and determine whether the two are **complementary** or whether **any repository surface duplicates
state authority**. Target outcome: *one coherent semantic truth model, no duplicate state authority.*

## 2. Where each chain actually lives (repository evidence)

| Chain | Role | Surface(s) |
|---|---|---|
| **A — semantic** | Objective identity + per-objective outcome/proof | `runtime/core/mission-loader.js` (plan/objectives), `runtime/core/objective-attribution.js` (joins plan↔execution **by `objectiveId`** → EVIDENCED / RECORDED-NO-EVIDENCE / FAILED / UNMATCHED / INCONSISTENT), `runtime/core/validation-engine.js` (mission-level `validated`), `runtime/core/mission-ledger.js` (immutable record, idempotent by `(mission, runId)`) |
| **A — state authority** | Governance lifecycle (the single state source) | `runtime/governance/state-machine.json` **walked by** `runtime/core/mission-lifecycle.js` (evidence-gated advance, authorized per-step by `governance-kernel.js`) |
| **B — transition record** | Versioned, evidence-bearing transition contract | `runtime/core/state-transition.js` (C03 contract + the one deterministic validator) |
| **B — producer** | Emits one C03 record per lifecycle transition | `runtime/core/mission-lifecycle.js` → `toC03Records()` (P0-071, **additive**) |
| **B — consumer** | Summarises C03 records in the final report | `runtime/core/final-report.js` → `summarizeC03()` (P0-071) |

## 3. Finding: complementary, and **already unified at one bridge**

The two chains are **not** parallel state authorities. The evidence:

1. **One state source only.** The achieved governance state is computed solely by walking
   `state-machine.json` in `mission-lifecycle.computeLifecycle()`. No other surface advances governance
   state. `runtime/core/runtime-model.js` is a **snapshot** of current state (no transitions);
   `src/core/*-state.ts` are domain slices — neither records transitions. This is stated verbatim in
   `state-transition.js`'s own header ("runtime-model.js is a SNAPSHOT … None recorded a versioned,
   evidence-bearing transition").

2. **C03 is a record contract, not a second state source.** `toC03Records()` maps each existing
   `{from, to, ok, evidence}` lifecycle transition **1:1** into a C03 record, inventing no data. Its
   design principle is explicit: *NO SECOND STATE SOURCE, NO PARALLEL RUNTIME.*

3. **Versions are coherent, not competing.** `state_version_before/after` come from
   `orderedStates(sm)` — the **same** state-machine ordinal the lifecycle already walks — so C03
   versions are a function of the one state source, not an independent version authority (this is the
   P0-072 STATE_VERSION finding, already closed as satisfied).

4. **Shared epistemic vocabulary across both chains.** OUTCOME/PROOF in Chain A
   (`EVIDENCED` / `RECORDED-NO-EVIDENCE`, `validated`) and OBSERVED_EFFECT + `verification_status` in
   Chain B (`VERIFIED` / `UNVERIFIED`) draw from the **same** honesty rule — *RECORDED is coverage,
   never a proof* — reused in `objective-attribution.js` and `state-transition.js` alike. ACTION is a
   shared term in both chains.

### Chain correspondence (no duplication)

```
Chain A:  MISSION/OBJECTIVE ──identity──▶   ACTION ──▶  OUTCOME / PROOF
                 │                            │              │
            (opaque id)                   (shared)      (honesty vocab)
                 ▼                            ▼              ▼
Chain B:  state_before / state_after ◀──    action    ◀── observed_effect + verification_status
```

Chain B is **identity-agnostic**: `state_before`/`state_after` are opaque objects that carry whatever
Chain A supplies. The bridge (`mission-lifecycle`) is the single point where the semantic chain is
re-expressed as validated transition records. There is **no duplicate state authority**.

## 4. What a P0-073 *implementation* could (but is not proven to) add

The only reconciliation gap a reader might propose is that **per-OBJECTIVE attribution**
(`objective-attribution.js`) is *not* currently expressed as C03 records — today only the
governance-lifecycle transitions are. Expressing objective attribution as C03 records would be a
**P0-071-style integration**, and it is subject to the same test the campaign imposes:

- **No proven consumer demand:** no runtime surface reads objective-level C03 records today.
- **No reproducible defect** depends on their absence (full src suite exit 0 / "ALL PASS";
  runtime/core 24/24; C03 contract 36/36; mission-lifecycle × C03 20/20; final-report × C03 7/7).
- Adding them now would be structure "because the Master mentions it" — the same anti-pattern P0-072
  rejected.

Therefore the **probable** CTO-decidable verdict mirrors P0-072: **one coherent semantic truth model
already holds; no reconciliation change is proven necessary.** This document does **not** make that
ruling — it is NOT AUTHORIZED to — it supplies the evidence for the CTO to rule.

## 5. CTO decision this forensic enables

Choose one, explicitly:

- **(a) CLOSE P0-073 as EVALUATED — NO RECONCILIATION NEEDED** (recommended by the current evidence):
  the chains are complementary and already unified at the `mission-lifecycle` bridge; no duplicate
  state authority exists; no consumer demands objective-level transition records.
- **(b) AUTHORIZE a bounded P0-073 integration** to also emit C03 records for per-objective
  attribution — only if a real consumer/need is named, with a separately authorized minimal write-set.

## 6. Authority frontier

Implementing (b) — any runtime change — is **NOT AUTHORIZED** by the V5 roadmap and is **not**
performed here. Execution STOPS at this frontier pending an explicit CTO ruling on §5.

## 7. Evidence index

- Full src suite: exit 0, "ALL PASS" (`npm test`).
- `runtime/core` node suite: 24/24 test files pass.
- C03 targeted: `mission-lifecycle.test.js` + `final-report.test.js` → 2/2 files, 27 assertions green.
- Surfaces cited: `runtime/core/{mission-lifecycle,state-transition,objective-attribution,mission-ledger,final-report,governance-kernel}.js`,
  `runtime/governance/state-machine.json`, `runtime/core/runtime-model.js`.

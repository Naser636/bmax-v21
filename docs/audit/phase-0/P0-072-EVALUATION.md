# P0-072 — Canonical State Provenance Completion

- **Identifier:** P0-072
- **Status:** EVALUATED
- **Verdict:** **NO EXPANSION NEEDED**
- **Evaluated at:** HEAD `256897bd483d50e67414eec734f067f5c8b22a13`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03 (state-transition contract), P0-071 (C03 ↔ mission-lifecycle integration + final-report consumer)

## 1. Object of the evaluation

P0-072 asks a single question — *does the existing objective / action / outcome / proof
identity need additional provenance dimensions?*:

- `STATE_VERSION`
- `OBJECTIVE_VERSION`
- `WORKGRAPH_ID`

The campaign's own rule governs the answer: **"No schema expansion without proof of need"** —
first establish the actual gap, actual consumers, actual evidence requirement, compatibility
impact and smallest insertion point; only then define a write-set. This evaluation is read-only
and is **not** an authorization to implement.

## 2. Actual state of the three dimensions

| Dimension | Real state in the repository | Gap? |
|---|---|---|
| **STATE_VERSION** | **Already implemented.** `runtime/core/state-transition.js` carries `state_version_before` / `state_version_after` (invariant I2: strictly increasing); `runtime/core/mission-lifecycle.js` derives them from the state-machine chain ordinal (P0-071) and the final report consumes them. | **None** |
| **OBJECTIVE_VERSION** | **Absent.** Objectives are identified by `objectiveId` (string) everywhere; `runtime/core/objective-attribution.js` joins plan ↔ execution **by `objectiveId`**. There is no version dimension — and no code reads one. | **None proven** |
| **WORKGRAPH_ID** | **Absent as a named field, but run-level correlation already exists:** `runtime/core/mission-ledger.js` uses `runId` for idempotence by `(mission, runId)`. No consumer requires a distinct work-graph identifier. | **None proven** |

## 3. Existing capabilities reused (nothing new created)

- `runtime/core/state-transition.js` — canonical STATE_VERSION provenance (C03).
- `objectiveId` (via `runtime/core/objective-attribution.js`) — objective identity.
- `runtime/core/mission-ledger.js` `runId` — run-level correlation.

## 4. Absence of consumer demand

A repository-wide search for `OBJECTIVE_VERSION` and `WORKGRAPH_ID` outside the V5 roadmap text
returns **zero occurrences**. No runtime surface reads, writes, or depends on these fields.

## 5. Absence of proof-of-need

- No reproducible defect depends on a missing provenance dimension (global suite: **245/245**).
- No evidence requirement is left unsatisfied by the existing `state_version` / `objectiveId` / `runId`.
- No compatibility problem is caused by the current identity model.

Adding `OBJECTIVE_VERSION` or `WORKGRAPH_ID` now would be "adding fields merely because the Master
mentions them" — explicitly forbidden by the campaign.

## 6. Rule applied

> **No schema expansion without proof of need.**

Proof-of-need **fails** for all three dimensions (STATE_VERSION is already satisfied; the other two
have no consumer and no gap). Therefore no schema change is justified.

## 7. Runtime write-set

**NONE.** No runtime file is modified by this closure. `STATE_VERSION` is not changed;
`OBJECTIVE_VERSION` and `WORKGRAPH_ID` are not added.

## 8. Tests / evidence available

- Global suite: **245/245** green.
- C03 contract: **36/36** green; mission-lifecycle × C03: **20/20**; final-report × C03: **7/7**.
- Provenance evidence: `state_version_*` (C03/P0-071), `runId` (`mission-ledger.js`).

## 9. Risk identified

The only risk in this area is **schema bloat** — adding unused provenance fields that create a
maintenance and compatibility burden with no consumer. This closure avoids that risk.

## 10. Future re-opening condition

P0-072 may be re-opened **only** if a real, documented need appears — e.g. objectives that mutate
across runs under the same `objectiveId` (which would make `OBJECTIVE_VERSION` meaningful), or a
genuine cross-mission work-graph consumer (which would make `WORKGRAPH_ID` meaningful). Until such a
need is demonstrated, no expansion is authorized.

## 11. Conclusion

**P0-072 is closed as EVALUATED — NO EXPANSION NEEDED.** The canonical state provenance the system
requires today already exists and is reused; no new dimension is justified by current repository
evidence.

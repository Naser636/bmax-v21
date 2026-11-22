# PROPOSAL — update of `CM-RADAR-GATE-CHAIN` in the V12.4 companion (hard register) — NOT APPLIED

> `docs/odg/v124-consolidated-roadmap.json` is a hard register: byte-identical and pinned by tests.
> This file **proposes** a change and does not apply it. Applying it requires **explicit owner validation**, plus a coordinated update of the tests that pin the companion.

## Current entry (unchanged)
`CM-RADAR-GATE-CHAIN` — section I — status `READY`, `commit: null`, `evidence: null`.

## Facts since then (all merged on `main`)
| Step | PR | Evidence |
|---|---|---|
| V254/V257 coverage verifier (`verifyChain`) | #636 | `runtime/core/odg-radar-gate-chain.ts` |
| Step 1: executed chain acquire → admit → reuse → gate on recorded real data | #853 | `docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP1_EVIDENCE.json`, WIC STEP1 VERIFIED |
| Step 2: first live collection under grant V372 (6 GET) | #854, #855 | `CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json` / `_EVIDENCE.json`, WIC STEP2 VERIFIED |
| KI-V2 (structured claims, identity, 4 dimensions, trust gate, attestations) | #856, #857 | `KI_V2_LOT1_EVIDENCE.json`, `COLLECTION_REGISTRY.json`, `TRUST_ANCHORS.json` |
| First operational use (SRE error budget on CI) | #858 | `LOT3_SRE_ERROR_BUDGET_EVIDENCE.json` |

## Proposed new values
- **`status`: `IN_PROGRESS`**, not `ACCEPTED`. The chain is wired and used, but the mission objective "Radar→memory→opportunity→experiment→gate, really wired" is only partly demonstrated: no experiment has yet produced a measured gain through the gate, which returned RETURN_TO_EXPERIMENT every time.
- **`commit`:** the merge commit of #854 (`bbdfffe2`), the last step that completed the live chain.
- **`evidence`:** the evidence files above.
- **`nextAction`:** "run one sandbox experiment whose gate evidence is verified on real files (G2 verifier) and measure its gain; corroborate ≥1 statement across independent publisher families".

## Why not `ACCEPTED`
Acceptance requires a demonstrated improvement. So far the gate has only ever returned RETURN_TO_EXPERIMENT, and that is the honest state.

# V12.4 — V15: Weekly Radar durable traceability (registered-but-uncalled persistence, wired) 2026-11-09

ODG selected a technically-executable mission needing NO owner input (§3): a registered persistence capability that the
production Radar did not call — a real traceability gap, now fixed.

## §2 — Radar cycle audit (live, not waiting for 2026-11-16)
- **Timer:** `odg-radar-weekly.timer` is **active + enabled**, next run **Mon 2026-11-16 00:00 UTC** (verified live).
- **Chain:** `odg-frontier` runs the real governed frontier chain RADAR→INTEGRATE→POLICY→SELECTION→LAB+EVOLUTION(sandbox)
  →EVIDENCE→DECISION; outcome **PROMOTION_REVIEW, promoted=false** — the Radar **cannot self-authorize** (promotion needs
  external authorization). Correct fail-closed governance.
- **GAP FOUND (reproduced):** the chain produced a proposal but **persisted nothing durable** — `odg-frontier` wrote only
  an append-only text log; `runtime/generated/autonomy/frontier-*.json` did not exist after a run. `frontier-radar-store`
  (recordProposal / dedup journal / provenance) is a **registered capability the production bin never called** — exactly
  §3's "mécanisme enregistré mais non appelé" and §2's missing "propositions traçables / déduplication / provenance".
- (Live external research against TED/etc. requires authorized network egress — **owner/egress-gated, out of scope**; the
  Radar runs a fixed allowlisted scenario. The traceability of its decisions is what was fixable now, and is fixed.)

## §3 — Fix (reuses the existing store; no new mechanism)
`persistFrontierDecision(slim, deps)` in `runtime/bin/odg-frontier.ts` records the run's decision to the durable store via
the EXISTING `frontier-radar-store.recordProposal` (which enforces `status=PROPOSED` + `grantsNoPermission=true` —
proposition ≠ autorisation — and dedups by candidateId through the idempotency journal), provenance-stamped via
`evidence-provenance.stampProvenance`. **Fail-closed governance:** a decision marked `promoted` is **REFUSED** (never
recorded as an authorized proposal — the Radar must not self-authorize); no selected candidate ⇒ `NO_PROPOSAL` (not a
failure). Wired into the weekly-radar `main()` with a real wall-clock timestamp (the dedup key stays the deterministic
candidate id). Unit-tested (`odg-frontier.test.ts`, in the gate): record / dedup / promoted-REFUSED / no-proposal.

## Proof (live)
Ran `odg-frontier` twice:
```
run 1: outcome PROMOTION_REVIEW | persistence { decision: PROCEED,   added: true  }
run 2: outcome PROMOTION_REVIEW | persistence { decision: DUPLICATE, added: false }   ← dedup survives re-runs
```
Durable store `runtime/generated/autonomy/frontier-proposal-registry.json` now holds the traceable proposal
(`candidateId`, `status:PROPOSED`, `grantsNoPermission:true`, `outcome:PROMOTION_REVIEW`, `evidencePresent`, `stages`,
real `recordedAt`, **provenance stamp**) + `frontier-idempotency-journal.json` (the dedup key). The weekly Radar is now
**durable, traceable, deduplicated, provenance-stamped**, and still auto-promotes nothing.

## §4 Ingestion — unchanged (V14 acquired)
The three owner-input formats (EVAL_SET / DEMAND_SIGNAL·BILLING_PROOF / CLIENT_DOSSIER) and their consequences stand
(V12 §6 dossier). No false real proof; no canonical update without real admissible proof + permission.

## §3 scope note (no fabrication)
A scan surfaced 133 core modules with "no production consumer" — but these are **intentionally terminal** (demonstrators,
métier references, scenario batteries — each a self-contained capability exercised by its own test/CLI), matching the
SYSTEM_INTEGRATION_AUDIT. **Not** reconstructed (§3: no redoing concluded audits). Only the Radar-persistence gap was a
genuine registered-but-uncalled wiring, and it was fixed.

## Closure
Gate 403/403 (incl. the new odg-frontier suite); tsc clean. `runtime/generated/` is gitignored (the live proof is not
committed; the mechanism + test are). Preservation / SSH / ports / edg-core / Truth Lock unchanged. Next native ODG
selection: the weekly Radar (2026-11-16), now leaving durable traceable proposals, or an authorized real input.

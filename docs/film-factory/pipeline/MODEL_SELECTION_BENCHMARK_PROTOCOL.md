# Model-Selection Benchmark — Protocol (PRE-REGISTERED before any paid call)

CTO "MODEL-SELECTION BENCHMARK" mandate. Purpose: produce a REUSABLE model-selection rule for ODG, from a
controlled comparison — not to consume credit. Criteria fixed BEFORE calls; artistic quality is NEVER auto-scored.

## Scope decision (honest)
- **VIDEO cross-model comparison on Replicate = BLOCKED on price-verifiability.** The pricing register's video
  tools (Runway Gen-4/4.5, Luma Ray, Google Veo, MiniMax Hailuo) are priced from OTHER vendors' docs — they are
  NOT Replicate models this token can call. Replicate exposes no pricing API. Only `minimax/video-01` is confirmed
  on-Replicate with a known flat price ($0.50), and it must NOT be re-run (prior 6 successes are frozen). ⇒ no
  verifiable-price Replicate video challenger ⇒ a video comparison cannot meet the "prix actuels vérifiables"
  precondition. Recorded as a block, not forced.
- **IMAGE comparison = FEASIBLE + verifiable.** Two Replicate models with OFFICIAL register prices
  (source replicate.com/pricing, observed 2026-10-24):
  - `black-forest-labs/flux-schnell` — $0.003/img — license **LICENSE-FLUX1-schnell (Apache-2.0, commercial OK)**.
  - `black-forest-labs/flux-dev` — $0.025/img (8×) — license **LICENSE-FLUX1-dev (NON-COMMERCIAL)**.
  Both verified public + available via `GET /v1/models` (versions c846a699…, 6e4a938f…). Price caveat: register is
  2 days old and NOT API-re-verifiable (Replicate has no pricing endpoint); flagged, not hidden.

## Pre-generation finding (license — already decisive, €0)
For a COMMERCIAL film, `flux-dev`'s non-commercial license makes its outputs **non-shippable** as commercial assets;
`flux-schnell` (Apache-2.0) is commercial-clean. This alone is a selection signal independent of quality.

## Same use-case / same brief (identical input to both models)
2 fixed still briefs (NEW — none of the 6 frozen successes), same prompt + aspect_ratio + seed to BOTH models:
- BRIEF-A: "establisher still — North Sea storm coast at night, cold tonal palette, cinematic wide" (16:9, seed 7).
- BRIEF-B: "character still — weathered fisherman at a lantern-lit dock, rain, shallow depth of field" (16:9, seed 7).
2 briefs (not 1) so no conclusion is drawn from a single example.

## Criteria (FIXED before calls)
| Criterion | How measured | Auto or human |
|---|---|---|
| Technical success | adapter status == SUCCEEDED | auto |
| Usability | valid image bytes>0 + decodable (file magic / dims) | auto |
| Latency | wall-clock seconds per call | auto |
| Cost | booked worst-case (schnell €0.003, dev €0.025) | auto |
| Reproducibility | fixed seed recorded; determinism noted (re-run NOT separately measured — budget) | auto (partial) |
| Brief-coherence / artistic quality | output captured as paired images; **NOT auto-scored** | **HUMAN / independent only** |

## Cost + attempt bounds (RECOMPUTED, not assumed)
- Smallest useful lot = 2 briefs × 2 models = **4 generations**.
- Worst case incl. ≤1 retry each = 8 attempts; cost ≤ 2×(0.003+0.025)×2 = **$0.112 ≈ €0.103**.
- **FRESH dedicated ledger** `ledger-model-compare.json` — ceiling **€0.50** (generous retry headroom, still ≪
  remaining €1.84 of the €4 local cap), `maxAttempts: 8`, pre-call worst-case reservation, €0-on-failure,
  fail-closed. This does NOT touch the benchmark ledger (frozen at €2.16 / attempts 9/9) — the 9/9 cap is NOT
  raised; a NEW bounded limit is defined per this protocol. Global spend after this lot ≤ €2.16 + €0.50 = ≤ €2.66,
  within the €4 local cap and the CTO dashboard limit.

## Guards (same as the authorized paid path)
`allowPaidGeneration ∧ ctoBoundedPaidRunAuthorized ∧ hasKey`; token from env only, never printed; DRY-RUN first.

## Outputs & honesty
Record per gen: model, prediction ID (non-sensitive), sha256, bytes, latency, booked cost, usability. Present the
image PAIRS for human artistic judgment. Derive a PROVISIONAL selection rule; do NOT generalise beyond 2 briefs;
state confidence + limits. Then test the rule on a distinct case only if budget/authorization allow.

---
## RESULTS (executed 2026-10-26; compare-real-report.json) — 4/4 SUCCEEDED, all usable, €0.06 spent
| Model | License | €/img | success | usable | avg latency | total € |
|---|---|---|---|---|---|---|
| flux-schnell | Apache-2.0 (commercial OK) | 0.003 | 2/2 | 2/2 | 5.28 s | 0.006 |
| flux-dev | FLUX.1-dev NON-COMMERCIAL | 0.025 (8.3×) | 2/2 | 2/2 | 2.88 s | 0.050 |

Ledger (fresh, dedicated): spent €0.06 / ceiling €0.50 / attempts 4/8 — benchmark ledger (9/9) untouched; global
session spend €2.16+€0.06 = €2.22 ≤ €4 + dashboard limit. 4 real prediction IDs + sha256 recorded. Outputs
`A_flux-schnell.webp A_flux-dev.webp B_flux-schnell.webp B_flux-dev.webp` kept as paired images for HUMAN artistic
judgment.

## REUSABLE SELECTION RULE (provisional; confidence per-axis, honest)
- **LICENSE (DECISIVE, verified via model license_url — confidence HIGH):** flux-schnell = Apache-2.0 → commercial-
  shippable; flux-dev = NON-COMMERCIAL → outputs NOT shippable in a commercial film. Deterministic, no generation
  needed.
- **COST (DECISIVE, OFFICIAL price — confidence HIGH):** flux-schnell is **8.3× cheaper** (€0.003 vs €0.025).
- **Reliability (confidence LOW, n=2):** both 2/2 success+usable on 2 distinct briefs — no differentiator at this n.
- **Latency (INCONCLUSIVE):** flux-dev faster here (2.88 vs 5.28 s) but n=2 + queue variance ⇒ NOT encoded.
- **Artistic quality / fidelity (NOT MEASURED):** human-only; the register's "dev = higher fidelity/identity" is
  UNVERIFIED by this benchmark; deferred to human review of the paired outputs.

**RULE for ODG image model-selection:** default to **flux-schnell** for commercial/shippable stills (commercial-
clean license + 8× cheaper + reliable on 2 briefs). Use flux-dev ONLY for non-commercial internal drafts/previz
where a HUMAN-CONFIRMED fidelity advantage justifies it; never ship flux-dev output commercially. **Do not generalise
beyond images / n=2 / these two models.** Rule already exercised on 2 distinct briefs (A,B) — schnell usable on both.

## NOT done / held (honest)
- VIDEO cross-model selection: BLOCKED on Replicate price-verifiability (no challenger with a verifiable Replicate
  price; only minimax/video-01 known, not re-run). Unchanged.
- Further spend HELD: the decisive axes (license, cost) are verified deterministically; a larger n would refine only
  the low-confidence reliability/latency axes — not worth consuming credit for itself (CTO §Phase 4).

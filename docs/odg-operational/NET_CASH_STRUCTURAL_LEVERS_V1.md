# ODG — €500k net: structural levers (V18, 2026-10-27)

V17 found €500k NET needs ~€1.49M gross collected at the micro-solo factor (0.33). V18 tests **structural changes to the
economics** — not a lower target. `runtime/core/economic-profiles.ts` (suite 8) recomputes the net factor **per
structure** (it does NOT reuse the micro factor blindly). **€500k NET stays the TARGET; rates are HYPOTHESIS; SASU IS/PFU
are simplified — confirm with an expert-comptable; nothing achieved.**

## Profile comparison (net available per €1 gross; required gross for €500k NET)
| profile | levy mode | net factor | net / €1M gross | required gross for €500k NET |
|---|---|---|---|---|
| B — mixed small+large (micro, stacked) | micro | 0.21 | €207,400 | €2,410,800 |
| D — partner/distribution (25% commission) | SASU | 0.35 | €346,800 | €1,441,753 |
| A — direct high-margin (micro-BNC) | micro | 0.38 | €377,400 | €1,324,854 |
| **C — direct high-margin (SASU, IS)** | SASU | **0.48** | €476,000 | €1,050,420 |
| **E — productized/subscription (SASU, low marginal delivery)** | SASU | **0.56** | €563,200 | **€887,784** |

## The structural levers that move the net factor (ranked by impact)
1. **Productize (near-zero marginal delivery)** — E vs A: delivery-cost 15%→5% lifts factor 0.38→0.56; required gross
   €1.32M→€888k. **Biggest single lever** IF the assurance offer (SBOM/provenance/checks) can be delivered as a
   reproducible/self-serve product without disproportionate development (capability question, not assumed).
2. **SASU instead of micro-BNC** — C vs A: removes the **25.6% social on turnover**, replaces with IS on profit; factor
   0.38→0.48. Material; **expert-comptable decision** (changes social/tax profile, not modeled as advice).
3. **Avoid channel stacking** — B (commission+subcontract stacked, micro) is the WORST (0.21, €2.41M): partner
   commission + subcontract + social-on-turnover compound. Use channels for reach/capacity, keep margin in DIRECT work.

## Honest verdict (gap narrowed, not closed)
Best defensible profile (productized SASU) needs **~€888k gross cash COLLECTED in-period** for €500k NET — down ~40% from
V17's €1.49M. **Still above modeled year-1 cash (~€342–448k, V9/V16)** ⇒ €500k NET in 12 months remains **hard and
unproven**, BUT the levers change the economics materially and define the path: **productize + SASU + direct high-margin
+ volume**, over a credible ramp. **Not categorically impossible under a different structure** — it is contingent on
(a) productization feasibility, (b) a SASU, (c) sustained volume, (d) time. None assumed; all measurable/decidable.

## Corrective actions (by impact × delay)
| action | impact | delay | type |
|---|---|---|---|
| Validate productization feasibility of the assurance offer (reuse `assurance-pilot-runner`) | **high** (factor 0.38→0.56) | internal, now | ODG can prototype (synthetic) |
| Decide SASU vs micro | high (0.38→0.48) | weeks | human + expert-comptable |
| Price for high margin + recurring; avoid stacking channels | high | now | pricing-grid + CTO price band |
| Raise collected volume (paid-pilot→retainer, direct high-value) | high | ramp | needs outreach authorisation |
| Confirm real IS/PFU/social rates | medium (accuracy) | now (official) / human | expert-comptable |

## Next
Prototype the productized assurance path (synthetic, €0) to test lever #1 — the highest-impact internal action — then
re-run the net model with measured delivery cost. Structure (SASU), spend, outreach remain human/expert decisions.
Monthly tracking + the €500k NET line via the existing dashboard (0 collected today).

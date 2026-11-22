# V14.4 — Radar utility audit, strategic ranking, and detailed lot plan (checkpoint 2026-11-22)

> Directive V374 §7 / V373 Lot 4. Reference: `main` @ `939f9c60`.
> Every figure below comes from committed evidence or a tool run on this commit. Scores are **hypotheses** to be calibrated, not facts.
> Builds on `docs/odg/V14_4_ROADMAP.md` (ADOPTED); V12.4 is unchanged.

## 1. Radar utility audit (what Radar actually delivered)

| Stage | Real result | Evidence |
|---|---|---|
| Collection | 6 HTTPS GET calls out of a budget of 100 (grant V372, expires 2026-12-22); 0 quarantined | `CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json` (pinned digest) |
| Knowledge | 7 statements: 7 SUPPORTED (kept), 0 CORROBORATED, 0 presented as fact | `KI_V2_LOT1_EVIDENCE.json` |
| Trust | provenance bound to a repo-pinned collection; forgery paths closed | PR #855–#857, 10 falsification scenarios |
| Operational use | 1 item (SRE "error budget = 1 − SLO") applied to a real journey. It confirmed the canonical formula, made the CI error budget measurable, and showed that the decision depends on the SLO value | `LOT3_SRE_ERROR_BUDGET_EVIDENCE.json` (PR #858) |
| Side discovery (highest value) | the mission ledger **cannot represent failures** (`failuresRepresentable:false`; 175/175 is survivorship) | `slo-collector` on the real ledger |

**Verdict.**
- Radar's direct knowledge yield is small: one applied item, and **no measured improvement yet**.
- Its value so far is diagnostic. Applying an external method to ODG's own data exposed a structural defect that blocks reliability **and** learning measurement across ODG.
- Usefulness on outcomes stays NOT_MEASURED until a prospective policy runs.

## 2. Strategic ranking of the open gaps

Criteria (V373 §10): autonomy, intelligence, quality, transversality, security, performance, dependency reduction, métier value, integration cost (−) and complexity (−).
- **Weights are HYPOTHESES:** 3 for autonomy, quality and transversality, 2 for intelligence, security and métier value, 1 for the others.
- Risk and uncertainty are shown **separately** from the score.

| # | Gap (evidence) | Score | Risk | Uncertainty | Gate |
|---|---|---|---|---|---|
| G1 | Mission ledger records no failures (`slo-collector`): every success rate, SLO and learning signal on native missions is survivorship-biased | **high** | LOW | MEDIUM (root cause not yet traced to the writer) | internal |
| G2 | Maturity evidence checked by FORMAT only (inspection Lot 2 MEDIUM): a made-up WIC id can lift authorization | high | MEDIUM | LOW | internal |
| G3 | No configured SLO for the CI journey, so the error budget cannot drive a decision | medium | LOW | LOW | **owner/CTO** |
| G4 | Corroboration: 5 single-source official statements; no independent second publisher collected | medium | LOW | MEDIUM | internal (grant V372) |
| G5 | `CM-V237-ORCHESTRATION` (F) / `CM-V237-AZ-SCENARIO` (G) stuck in REVIEW | medium | MEDIUM | MEDIUM | internal |
| G6 | 224 NO_CONSUMER components (census; 202 decision surface already judged in #847) | medium | LOW | HIGH | internal |
| G7 | `CM-METIER-BASELINES` / P5 / P8 in REVIEW (métiers in dev/sandbox only, V372) | medium | MEDIUM | MEDIUM | internal (sandbox) |
| G8 | `CM-BENCHMARK-AUDIT` (K) REVIEW: no independent eval set (register `broad-it-independent-eval-set` BLOCKED) | medium | LOW | HIGH | external data |
| G9 | `CM-V234-RESIDENT-DRIVER` (E): L0 only | high | HIGH | MEDIUM | **owner** (L1+) |
| G10 | `CM-MULTIMODAL-VIDEO` (P) BLOCKED | low | LOW | HIGH | resources |
| G11 | Production on next@16.2.9; no host firewall | high (security) | HIGH | LOW | **owner/root** |

## 3. Detailed lot plan (≤3 chantiers per lot, dependency-ordered)

| Lot | Chantiers | Depends on | Exit criterion |
|---|---|---|---|
| **A (next)** | G1 make the mission ledger represent failed/blocked outcomes (trace the writer, add the states, keep history) · G2 resolve maturity evidence against real WIC files and evidence hashes | — | `slo-collector.failuresRepresentable === true` on new missions; a fabricated WIC id is refused; independent inspection ACCEPT |
| B | G4 corroborate the 5 statements via verified independent public domains (grant additions, per-collection overlap check) · re-run KI-V2 | A (none strictly) | each statement CORROBORATED **or** an explicit "no independent source found" |
| C | G5 close or re-scope orchestration + A–Z scenario (REVIEW → ACCEPTED/REJECTED with evidence) | A (failure states feed the scenarios) | V12.4 F/G statuses reconciled |
| D | G7 métier baselines (sandbox) composed with the cross-métier brain · G6 consumer judgment refresh | C | per-métier baseline measured, no métier "improved" without evidence |
| Owner track (parallel, not internal) | G3 choose the CI SLO · G9 resident L1 · G11 deploy + firewall (scripts ready: `~/odg-preservation/V370/odg-owner-finalize.sh`) | — | owner decisions |

**Priority rationale.** G1 comes first because it is transversal. Without failure representation, ODG cannot measure its own autonomy, learning (the four-state lesson metric of V373 §8) or reliability. Every later "improvement" claim would be survivorship-biased.

## 4. Limits
- The scores are hypotheses and must be calibrated with outcomes.
- Radar's yield is based on one 6-call campaign.
- G1's root cause is not yet traced: the symptom is proven, the cause is not.

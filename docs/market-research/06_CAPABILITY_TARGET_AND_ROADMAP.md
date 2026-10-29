# Capability Target & Prioritized Roadmap (Study V2, 2026-10-22)

Two inventories: **A. current demonstrated** (from repo evidence — see `01` for refs) vs **B. target required** for €1M/€10M. Each gap → a costed improvement mission with acceptance proof and a revenue/risk link. Effort/cost are HYP planning estimates.

## A. Current (recap, graded) — see `01` for evidence
PROVEN: SBOM generation, evidence-provenance stamping, truth-lock, JS/TS parity benches, own-repo TS migration, mission-ledger, read-only decision-precedent reuse. PARTIAL: local static/audit scans, governed local executors, readiness matrix, SLSA L1. BLOCKED/NOT_MEASURABLE/NOT_IMPLEMENTED: SLSA L2, autonomous web egress, live fleet autonomy (G10), external-repo delivery, G8 recovery, IDP, FinOps, enforced governance authority (`authorityEnforced:false`), DEF-GAMMA false-success defect.

## B. Target capabilities required to sell+deliver at €1M/€10M
Find&prepare deals · scope contracts · price work+risk · produce authorized engineering · independently verify quality · handle exceptions/incidents/recovery · auditable client reports · concurrent deliveries/versions/cost/support · operate with humans/partners for signature/liability/certified skills.

## Gap → improvement-mission matrix (§9: investment ↔ risk ↔ revenue ↔ value ↔ cost/delay ↔ proof ↔ autonomy)
| # | Gap / investment | Unlocks model(s) | Commercial risk it removes | Client value | Est. effort/cost (HYP) | Acceptance proof | Autonomy/reliability impact |
|---|---|---|---|---|---|---|---|
| **R1** | **Fix DEF-GAMMA false-success** (no-op cannot report success) | C, B, D (any assurance) | "we sell assurance but our gate can lie" — fatal | trustworthy pass/fail | 1–2 wk eng | a RECORDED no-op CANNOT reach validated=true; regression test | core reliability ↑ (removes false success) |
| **R2** | **External-repo execution** of the evidence pack | B, A, C, D | "never run on a client repo" | real findings on their code | 2–4 wk eng + harness | 1 consented external repo: SBOM+licence+parity+debt pack reproduced | delivery autonomy ↑ (external) |
| **R3** | **Human-reviewer + sign-off + claim-wording/liability** workflow | all | liability, overclaim, "readiness≠compliance" | signable opinion | 1–2 wk + legal review | reviewer validates a pack; claim wording legal-checked | keeps human in loop (by design) |
| **R4** | **First external reference** (consented, bounded) | all | "zero references" — blocks every sale | proof it works for a buyer | 1 engagement | a delivered, consented reference + testimonial | — (commercial, not autonomy) |
| **R5** | **≥1 SI/partner channel** (subcontract/OEM) | D, A, E2 | no sales org, no delivery capacity | access to their clients | business dev | 1 signed partner framework (future auth) | lowers human-CTO sales load |
| **R6** | **Recurring-assurance productization** (onboarding + scheduled re-runs + client portal/report) | C | churn, manual onboarding | continuous evidence | 4–8 wk eng | 1 client onboarded + N automated re-runs with evidence | recurring = best ODG-leverage |
| **R7** | **SLSA L2 signing** (managed/keyless) | B, C (supply-chain) | self-signed not credible | stronger provenance | 2–4 wk + infra/cost | L2 attestation verified by a third tool | provenance strength ↑ |
| **R8** | **Reviewer/delivery capacity** (reviewers/partners pods) | A, B, D | can't deliver volume solo | concurrent delivery | hiring/partnering | ≥2 delivery pods operational | — (capacity) |
| **R9** | **Product/licence build + GTM + support** (the €10M lever) | E1 | no product, crowded | self-serve scale | months + **funding** | shipped product + design-partner ARR | productization |
| R10 | Live autonomy measurement (G10 multi-unit) + G8 recovery | trust narrative | "can't prove autonomous/ resilient" | reliability story | per their contracts | real multi-unit autonomy-rate; proven reboot recovery | autonomy/reliability evidence |

## Prioritization (expected value ÷ risk-reduction; avoid building a general platform without revenue link)
**Tier 0 (do first — unlock everything, low cost):** R1 (fix DEF-GAMMA), R2 (external-repo proof), R3 (reviewer+liability), R4 (first reference). These convert ODG's proven engine into a sellable, trustworthy, referenced service. Collectively a few weeks of bounded engineering + 1 reference engagement.
**Tier 1 (scale €1M):** R6 (recurring productization), R5 (partner channel), R8 (capacity), R7 (SLSA L2).
**Tier 2 (€10M lever):** R9 (funded product + GTM), R5-as-OEM, R10 (autonomy/resilience evidence).

**Rule applied:** each item is tied to a revenue model + a client value + an acceptance proof; no "general platform" work is prioritized unless it links to revenue. R9 (the biggest build) is explicitly gated behind evidence that Tier-0/1 generate demand — do NOT build the product before the service proves the market.

## Milestones that are NOT research (must be real, future-authorized)
First external pilot (R4) · first partner (R5) · first recurring client (R6) · DEF-GAMMA fix verified (R1). Research ≠ commercial validation; these are the explicit go/no-go jalons.

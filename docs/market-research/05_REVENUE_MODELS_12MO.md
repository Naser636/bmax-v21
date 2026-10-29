# Revenue Models — 12-month structures toward €1M (Study V2, 2026-10-22)

**Nature:** arithmetic structures to evaluate, NOT forecasts, NOT validated prices, NOT acquired revenue. Price anchors are FACT-sourced (V1 `03` + V2 sources below); conversion probability = **NOT_MEASURABLE** (no ODG sales history). Capacity constraint (FACT from capability inventory): ODG delivers evidence/engineering; a **human reviewer signs**; ODG is **solo** (no team) ⇒ scale needs partners/reviewers. Booked ARR ≠ Y1 invoiced ≠ cash collected.

Price anchors (currency as sourced): tech-DD read $10–25k standard / $40–150k deep; SBOM/CRA pack €3–8k; readiness diagnostic €4–12k; bounded modernization lot €40–150k; managed QA $15–50k/mo; **enterprise MSSP/compliance retainer ACV $300k–1.2M+ ($25–100k/mo)**; SME retainer €4–25k/mo (HYP derived); **SI subcontract effective €800–1,200/day, SI keeps 20–40% margin**; dev-tool SaaS median $19.50/mo, enterprise evidence tool €0.5–5k/repo-or-seat/yr (HYP).

## Model A — High-price specialized lots
- **Equation:** Revenue = N_lots × avg_lot. €1M = 10×€100k = 20×€50k = 7×€143k.
- **ODG/partner/human:** ODG produces evidence+engineering; human/partner reviews+signs+sells. A €100k lot ≈ 15–30 delivery-days.
- **Capacity:** 10×€100k ≈ 150–300 delivery-days/yr ⇒ needs ~1–2 delivery FTE-equivalents beyond ODG+1 reviewer ⇒ **partners required**.
- **Cash:** project milestones; 30–90-day payment. **Credibility: MEDIUM if partners+references; LOW solo.**

## Model B — Standardized diagnostic → remediation funnel (land-and-expand)
- **Equation:** Revenue = (N_diag × price_diag) + (N_diag × conv × price_remed). €1M ≈ 40×€10k (€400k) + 40×25%×€60k (€600k).
- **ODG share HIGH** on diagnostics (its proven evidence engine); remediation needs delivery capacity (partner/reviewer).
- **Capacity:** 40 diagnostics/yr ≈ 3–4/mo — plausible for ODG+reviewer; 10 remediations €60k ≈ 150–300 days ⇒ partners.
- **Cash:** diagnostics fast (€10k, 2–4 wk); remediation milestones. **Credibility: MEDIUM-HIGH for the diagnostic layer, MEDIUM for remediation (capacity).**

## Model C — Recurring assurance / compliance-evidence retainers (most scalable to €1M)
- **Equation:** ARR = Σ(client × monthly × 12). €1M ARR = 4×€20k/mo (€960k) = 8×€10.4k/mo = 3 enterprise €20k/mo (€720k) + 6 SME €4k/mo (€288k) ≈ €1.0M.
- **FACT anchor:** enterprise compliance/MSSP ACV $300k–1.2M; 65%+ recurring; median MSP ARR $2.8M. A recurring "continuous SBOM/provenance/parity evidence + readiness monitoring" retainer is the natural ODG product.
- **ODG share HIGH** (automated recurring evidence generation); human = review/sign + exception handling.
- **Capacity:** recurring load is mostly automated re-runs ⇒ best ODG-leverage; onboarding each client is the human-heavy step. **Y1 cash < booked ARR** (ramp: a client signed in M6 yields ~6 months cash).
- **Blocker:** DEF-GAMMA false-success MUST be fixed before selling "assurance"; external-repo execution required. **Credibility: HIGH ceiling, MEDIUM near-term (gated on 2 fixes + first reference).**

## Model D — Subcontracting / integrator partnership (fastest volume, lowest ODG sales burden)
- **Equation:** Revenue = Σ(units × billable_days × day_rate). FACT: SI owns the client; ODG delivers as subcontractor; SI keeps 20–40%. Effective ODG day-rate €800–1,200. €1M ≈ 1,000 ODG-days @ €1,000 (needs 5 delivery units) OR blended with lots.
- **ODG share HIGH on delivery; partner owns sales/liability/client** ⇒ minimizes human-CTO daily load (the explicit §7 goal).
- **Capacity:** gated by delivery units (ODG+reviewer pods). **Cash:** via partner, often faster/scheduled.
- **Credibility: MEDIUM-HIGH as the *fastest* path to volume** — but requires ≥1 signed SI partner (not contacted in this mission) + a reference pack.

## Model E — Reusable software / licence product ("evidence/assurance engine")
- **Equation:** ARR = seats_or_repos × price. €1M = 2,000 repos×€500/yr = 200 orgs×€5k/yr = 40 orgs×€25k/yr.
- **FACT:** supply-chain security market $5.53B→$10.1B; Snyk AI Trust >$100M ARR in months (shows ceiling — but as a funded company); dev-tool hybrid pricing now 41%.
- **ODG share:** productization of its proven SBOM/provenance/parity engine. **Big build + GTM + support cost;** crowded (Snyk/Sonatype/JFrog). ODG is an engine, not yet a product.
- **Credibility: LOW in 12 months solo; HIGH as the €10M lever IF funded+differentiated.**

## Model F — Hybrid (recommended composite for €1M)
- **Equation:** €1M ≈ diagnostics €300k (Model B land) + recurring €450k ARR (Model C) + partner lots €250k (Model D).
- **Why:** diagnostics fund + generate references fast; recurring builds durable ARR with best ODG-leverage; partners add delivery capacity without ODG building a sales org ⇒ minimizes human-CTO daily load.
- **Credibility: HIGHEST composite** — still conditional on: fix DEF-GAMMA, prove external-repo execution, obtain ≥1 reference + ≥1 SI partner, add reviewer capacity.

## Model comparison (verdict)
| Model | €1M feasibility (12mo) | ODG-leverage | Human/partner load | Key prerequisite |
|---|---|---|---|---|
| A high-price lots | LOW solo / MED w. partners | med | high (delivery) | partners + references |
| B diag→remediation | MED-HIGH (diag) | high (diag) | med | external-repo proof |
| C recurring assurance | HIGH ceiling / MED near | **highest** | low steady, high onboarding | DEF-GAMMA fix + reference |
| D subcontract/partner | **MED-HIGH (fastest volume)** | high (delivery) | **lowest sales** | ≥1 SI partner |
| E product/licence | LOW (12mo) | high if built | high (build+support) | funding + product + GTM |
| **F hybrid** | **HIGHEST composite** | high | balanced | all of the above, staged |

Conversion rates, utilization and ramp are HYP; none is a committed forecast. Signed ≠ invoiced ≠ collected ≠ margin.

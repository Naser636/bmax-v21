# V45.1 — RH France–Morocco organization + P3/P11 pricing — 2026-11-10

> CTO Directive V45.1 §6–§7. Companion to the €500k-NET model. **No real hiring, no contract, no external contact.** Competitor prices are **real, dated sources** (not invented); ODG prices are **proposed, cost+margin derived**, benchmarked against those anchors. Figures directional — confirm before use.

## §6 — RH France–Morocco (organization, not execution)

### Legal structuring options (compare; legal review required)
| Option | What | Pros | Cons / risk |
|---|---|---|---|
| **Moroccan company (SARL)** owned by the FR SAS | A real MA subsidiary employing the team | lowest unit cost; clean local employment; scalable | setup + accounting in MA; transfer-pricing between SAS↔SARL must be arm's-length |
| **Employer of Record (EoR)** | EoR employs staff in MA for you | fast, compliant, no MA entity | +10–20% EoR fee; less control; cost higher than own SARL |
| **Independent contractors (freelances)** | MA freelancers invoice the SAS | flexible, fast | **permanent-establishment & requalification risk** if full-time/exclusive; not for core team |
| **Direct MA employer (SAS hires in MA)** | FR SAS as MA employer | — | generally impractical; **PE risk** for the SAS |

**Recommendation:** start with **EoR or 1–2 contractors** (phase 1, pre-revenue, reversible), convert to a **Moroccan SARL subsidiary** once the team ≥4 and revenue justifies it. **PE risk:** if the SAS is effectively managed/operated from Morocco, a Moroccan taxable presence can be triggered — **keep strategic management in France**; legal/tax review mandatory before hiring.

### Progressive org chart (hire only with authorization; do not over-staff pre-clients)
| Phase | Months | Headcount (MA) | Roles / levels |
|---|---|---|---|
| **0 — pre-client** | M1–M2 | **0 hires** (founder only) | build offers/demos; no team yet |
| **1 — first clients** | M3–M5 | **2** | 1 **mid** delivery eng (P3+P11), 1 **junior** (SBOM/report ops) |
| **2 — ramp** | M6–M9 | **+2 → 4** | +1 **senior/lead** (quality + client-facing), +1 **mid** (e-invoice/STP) |
| **3 — scale** | M10–M12 | **+2 → 6** | +1 **mid** (delivery), +1 **junior/sales-ops**; founder leads sales |
| **Ambitious** | yr 2 | **→ 10** | 2 senior, 5 mid, 3 junior + an external sales partner |

**Loaded cost/yr (EUR, incl. ~15% employer):** junior ~€14.2k · mid ~€24.5k · senior ~€41.3k (from the €500k model). A 6-person steady team ≈ **€143k/yr**; ramped year-1 ≈ **~€110k**. Add **supervision** (the senior lead) + **training** (~€3–5k/yr) + **cover for leave** (CDI MA ≈ 18 days/yr + public holidays) — build ~10% slack into capacity, not headcount.

**Skills required:** Node/TS, dependency/SBOM tooling (CycloneDX/SPDX), EN16931/Factur-X, basic DevSecOps, French client communication. Juniors for report ops; mid for delivery; 1 senior for quality + client trust.

## §7 — P3 / P11 three-tier pricing (proposed; competitor-anchored)

### Competitor anchors (real, dated — SCA/SBOM TOOLS; ODG sells a done-for-you SERVICE)
- Snyk Team **$25/dev/mo** (some lists **$98/dev/mo** annual); Enterprise contact-sales ([Reintech 2026](https://reintech.io/blog/software-composition-analysis-sca-tools-comparison-2026)).
- Sonatype Lifecycle **$57.50/user/mo**; SBOM Manager separate; Pro from **$1,200/yr** ([CTO Club 2026](https://thectoclub.com/tools/best-sbom-software/)).
- Mend AppSec up to **$1,000/dev/yr** ([Guideflow 2026](https://www.guideflow.com/blog/software-composition-analysis-tools)).
- **Gap ODG fills:** these are self-serve tools; TPE/PME lack the time/expertise to turn them into **CRA-ready evidence**. ODG sells the **outcome** (readiness report + gate), not a seat licence.

### P3 — CRA / SBOM readiness
| Tier | For | Scope | Price HT | Human time | Delivery cost | Gross margin | Renewal |
|---|---|---|---|---|---|---|---|
| **Entry (TPE)** | ≤10 devs, 1 product | one-off SBOM + license audit + 1-page readiness report | **€1,500–2,500** | ~1 day | ~€150–250 | ~85% | optional annual re-check |
| **Pro (PME)** | 1–3 products | full SBOM (multi-eco) + vuln-hygiene + CRA obligation mapping + remediation list | **€5,000–9,000** | ~3–5 days | ~€600–1,000 | ~85% | **€300–600/mo continuous SBOM gate** |
| **Advanced** | larger/multi-team | above + CI-gate integration + quarterly reporting + 24h-reporting process design | **€15,000–30,000** + **€1,000–2,500/mo** | ~10–20 days + ongoing | ~€2–4k + recurring | ~80% | annual contract |
| CAC (est.) | | | €500–3,000/deal (content + outbound) | | | | |

### P11 — e-invoice validation & STP conformance
| Tier | For | Scope | Price HT | Human time | Delivery cost | Gross margin | Renewal |
|---|---|---|---|---|---|---|---|
| **Entry (TPE)** | receiving only | EN16931/Factur-X validation of a sample set + conformance report | **€1,500–3,000** | ~1–2 days | ~€200–400 | ~85% | optional |
| **Pro (PME)** | issue + receive | validation + round-trip CII/UBL conformance + mandatory-field/error playbook + STP routing design | **€8,000–15,000** | ~5–8 days | ~€1,000–1,600 | ~85% | **€500–1,000/mo** support |
| **Advanced** | integrators / volume | above + ERP integration spec + batch validation + audit trail; **PDP transmission stays owner/legal** | **€18,000–25,000** + **€1,000–2,000/mo** | ~12–20 days + ongoing | ~€2–4k + recurring | ~80% | annual |
| CAC (est.) | | | €800–3,000/deal | | | | |

**Margin note (honest):** the high gross margins reflect the **low Morocco delivery cost**; they do **not** include CAC, founder time, or the FR overhead — net margin is far lower (see the €500k model: ~€971k revenue ⇒ €500k net only at scale). **These prices are proposals to validate with 3 real quotes + 3–5 discovery calls before publishing.**

## §8 — Easiest TPE/PME wins with CURRENT demonstrated capability
1. **P3 Entry (SBOM + license readiness)** — ODG already produces this (485-component CycloneDX demo). Lowest delivery cost, clear CRA pull, fast to sell as a €1.5–2.5k audit.
2. **P11 Entry (receiving-side validation)** — the FR mandate forces **every** business to *receive* e-invoices from 2026-09-01; a cheap validation/conformance check is an easy entry.
Both are **done-for-you one-offs** that convert to recurring — the right wedge for month-1 TPE/PME, upgradable to grandes entreprises from month 2.

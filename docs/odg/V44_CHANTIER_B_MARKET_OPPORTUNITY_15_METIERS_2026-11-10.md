# V44 CHANTIER B — ODG Market Opportunity Validation (15 métiers P1–P15)

> CTO Directive V44, 2026-11-10. First-pass, **evidence-grounded** market study. Honesty rules observed: no capability is claimed beyond what ODG has demonstrated; **€500k/year-1 is NOT presented as a guarantee** — every assumption is stated and the prior commercial analysis (€500k NET ⇒ ~€1.49M gross, flagged INFEASIBLE_SOLO) is carried forward, not discarded. Live competitor prices and market sizes below are **directional and REQUIRE verification** before any commercial commitment.

## 0. What ODG actually is (capability grounding — not hype)
ODG's "15 métiers" are **technical software/platform-engineering domains**, each shipped as a PURE, fail-closed guard / decision-engine (not generic business verticals). The addressable market is therefore **B2B DevOps / platform / security / compliance engineering tooling & services**, sold to engineering orgs — not consumer or generic SMB.

| # | Métier (repo domain) | ODG demonstrated capability (in-repo, local-verified) |
|---|---|---|
| P1 | quality / semantic-regression | semantic-regression guard; mission verdict isolation |
| P2 | AI / reliability (pass@k) | reliability/pass@k guard; champion-challenger arbiter |
| P3 | security / supply-chain / dependency | **multi-ecosystem SBOM (8 ecosystems), supply-chain-attest, license-policy SPDX fail-closed, SSRF/ReDoS hardening** |
| P4 | data / distribution drift | drift guard |
| P5 | platform / progressive-delivery (canary) | read-only canary-candidate safety assessment |
| P6 | evaluation (precision/recall/F1) | eval-metrics engine |
| P7 | SRE / SLO / latency | SLO/p99 + availability guard |
| P8 | release / SemVer governance | SemVer rank/gate |
| P9 | finops / unit economics | cost/unit-economics guard |
| P10 | regulatory / serious-incident deadline | incident-deadline + compliance guards (AI-Act Art.113 dates wired) |
| P11 | document routing (STP) | **e-invoice validation hardening (DOCTYPE/ENTITY reject), straight-through-processing routing** |
| P12 | resilience / circuit-breaker | circuit-breaker guard |
| P13 | sustainability / software carbon | software-carbon-intensity guard |
| P14 | devex / golden-path scaffold | scaffold/golden-path |
| P15 | workflow / saga compensation | saga-compensation guard |

**Maturity caveat (honest):** capability-map rates these **L2** (composed, fail-closed, locally proven) — **not L3** (no paying-client production evidence). Every métier is a *demonstrator*, not a sold product. €0 clients to date.

## 1. Two REAL, deadline-driven demand wedges (verified)
These are the strongest near-term pulls because the demand is regulatory and time-boxed, and ODG already has a foothold:

- **WEDGE 1 — Supply-chain security / SBOM (P3 + P10).** EU **Cyber Resilience Act**: 24h actively-exploited-vuln reporting to ENISA from **2026-09-11**; machine-readable SBOM + secure-by-design + CE marking by **2027-12-11** ([Keysight](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything), [Finite State](https://finitestate.io/blog/eu-cra-sbom-technical-documentation-guide)). ODG asset: multi-ecosystem SBOM + attest + license policy. **Offer: "CRA SBOM & vuln-reporting readiness" audit + continuous SBOM/attestation gate.**
- **WEDGE 2 — B2B e-invoicing / document STP (P11 + P10).** France B2B e-invoicing **live 2026-09-01** (large/ETI issue + all receive; SMEs **2027-09-01**), via certified PDPs, Factur-X ([Avalara](https://www.avalara.com/blog/en/europe/2026/07/french-e-invoicing-mandate-readiness.html), [TrueCommerce](https://www.truecommerce.com/en-gb/blog/e-invoicing-in-france-a-guide-to-the-french-mandate/)). ODG asset: e-invoice validation hardening + STP routing. **Offer: "e-invoice validation & STP conformance" component/service for integrators and mid-market finance teams.**

## 2. Ranked opportunity table (all 15 kept; ranked, not pruned)
Score = f(demand pull, ODG capability evidence, delivery difficulty, acquisition difficulty). **Tier A** = pursue first; **B** = secondary; **C** = keep, not now.

| Rank | Métier | Demand pull | ODG evidence | Delivery difficulty | Acq. difficulty | Tier |
|---|---|---|---|---|---|---|
| 1 | **P3 supply-chain/SBOM** | HIGH (CRA deadline) | **strongest** (8-eco SBOM) | medium | medium | **A** |
| 2 | **P11 e-invoice/STP** | HIGH (FR mandate live) | strong (einvoice hardening) | medium | medium | **A** |
| 3 | **P10 regulatory/compliance** | HIGH (AI-Act/CRA/ViDA) | medium (guards, dates) | medium-high | medium | **A/B** |
| 4 | P7 SRE/SLO | MEDIUM (always-on) | medium | medium | medium-high | B |
| 5 | P2 AI reliability/eval | MEDIUM-HIGH (LLM boom) | medium (pass@k, eval) | medium | high | B |
| 6 | P6 evaluation metrics | MEDIUM | medium | low | high | B |
| 7 | P8 release/SemVer | MEDIUM | medium | low | medium | B |
| 8 | P1 quality/semantic-reg | MEDIUM | medium | medium | high | B |
| 9 | P9 finops | MEDIUM-HIGH | low-medium | medium | medium | B/C |
| 10 | P5 progressive-delivery | MEDIUM | low-medium (read-only) | medium | high | C |
| 11 | P12 resilience | MEDIUM | medium | medium | high | C |
| 12 | P4 data drift | MEDIUM (ML-ops) | medium | medium-high | high | C |
| 13 | P14 devex/scaffold | MEDIUM | medium | low | high | C |
| 14 | P15 workflow/saga | LOW-MEDIUM | medium | medium | high | C |
| 15 | P13 software-carbon | LOW-MEDIUM (ESG) | medium | medium | high | C |

**Why not just the popular ones:** P2/AI and P4/drift have the loudest market noise but the **highest acquisition difficulty** (crowded, enterprise sales) and only L2 ODG evidence — ranked B/C despite buzz. The regulatory wedges (P3/P11/P10) win because **demand is forced by law with a date** and ODG has the **strongest in-repo evidence** there.

## 3. €500k year-1 — 3 scenarios (NOT a guarantee; assumptions stated)
Prior honest finding (preserved): €500k **NET** ⇒ ~€1.49M **gross** at a 3× cost ratio ⇒ **NOT year-1-achievable solo**. The scenarios below target **gross revenue** and are explicit about what each requires.

Pricing anchors (directional, **verify before use**): a CRA/SBOM readiness audit ≈ €5–15k one-off; a continuous SBOM/attestation gate ≈ €1–3k/mo; an e-invoice validation/STP integration ≈ €8–25k + €0.5–2k/mo support. These imply the client counts below.

| Scenario | Logic | Clients / contracts | Approx. gross yr-1 | Key condition |
|---|---|---|---|---|
| **Prudent** | 2 wedges, audits only, no recurring scale | ~8–12 audits @ ~€8k | **~€70–100k** | 1 operator, no sales team; realistic for a demonstrator-stage solo system |
| **Central** | audits + early recurring (SBOM gate / e-invoice support) | ~15 audits + ~10 recurring @ ~€2k/mo | **~€250–350k** | needs 1–2 delivery partners + a repeatable demo + 6-mo ramp |
| **Ambitious** | productized gate sold to integrators + channel | ~25 projects + ~25 recurring + 1 channel deal | **~€500k+** | needs **a team (not solo), a reference client, and a certified/partner status** — the prior INFEASIBLE_SOLO constraint must be lifted |

**Honest conclusion:** €500k gross year-1 is reachable **only in the Ambitious scenario**, which **requires lifting the solo constraint** (hiring/partnering) and at least one paying reference — neither exists today. Prudent (~€70–100k) is the defensible solo baseline. **€500k is a stretch target conditioned on team + references, not a plan of record.**

## 4. Demonstrators — available vs missing
- **Available (in-repo, local-verified L2):** SBOM/supply-chain-attest (8 ecosystems), license-policy SPDX, e-invoice validation hardening, SLO/eval/SemVer/finops guards. These run locally and produce real verdicts.
- **Missing for a *sellable* demo (gap list):** (a) a **packaged CRA-SBOM readiness report** generated from a client repo (needs a client repo + authorization); (b) a **hosted e-invoice validation endpoint** with a Factur-X conformance sample set; (c) **one reference client** (the single biggest gap — €0 clients, no case study); (d) pricing/contract templates validated against a real buyer.

## 5. First commercial missions to PREPARE (not execute without owner go)
1. Package **P3 "CRA SBOM readiness"** demonstrator on a **public** reference repo (no client data) → reproducible report.
2. Package **P11 "e-invoice validation/STP"** demonstrator on **public Factur-X samples**.
3. Draft offer one-pagers + directional pricing for P3 and P11 (verify prices with 3 real quotes before publishing).
4. Identify 10 candidate buyers per wedge (ICP: EU product manufacturers for P3; French mid-market finance/integrators for P11).
5. **Client code only with explicit written authorization, isolated environment, data/IP protection** — none initiated here.

## 6. Risks & success conditions
- **Capability risk:** all métiers are L2, €0 clients — overclaiming is the top risk; sell "readiness/validation" (what's proven), not "full compliance guarantee".
- **Solo constraint:** delivery capacity caps revenue; Central/Ambitious need partners/team.
- **Verification debt:** competitor prices/market sizes above are directional — must be confirmed.
- **Regulatory timing is the tailwind:** CRA (2026-09/2027-12) and FR e-invoicing (2026-09/2027-09) create a 12–24 month window — the reason P3/P11 rank first.
- **Success condition for €500k:** team + ≥1 reference client + a certified/partner channel. Without these, plan to the Prudent/Central band and report honestly.

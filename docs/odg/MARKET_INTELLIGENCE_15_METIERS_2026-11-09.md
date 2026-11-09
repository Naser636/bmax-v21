# V12.4 — Market Intelligence: 15 Métiers (CTO Market Intelligence Campaign V1, 2026-11-09)

**Owner-authorized public web research.** All market figures are **`[OBSERVED]`** with dated 2026 sources (links below);
all volume/revenue figures are **`[ASSUMPTION]`** or **`[SCENARIO]`** — **a potential revenue is never presented as
acquired** (§4). Canonical P1–P15 from the repo (not a new list). No prospect contacted, no purchase. Sources are public
(freelance barometers, market-research summaries, legal/compliance guides); treat market-size numbers as vendor/analyst
estimates, pricing as observed ranges.

## Per-métier market data `[OBSERVED]` + proposed positioning

| Métier | Observed market demand (2026, sourced) | Observed price range (2026) | ODG proposed price `[ASSUMPTION]` (positioned vs observed) |
|---|---|---|---|
| **P3 Security** | PME cyber budgets €15–30k/yr; attack cost often >€50k (CESIN/Hiscox) | audit €1.5–4k; PME full audit €5.5–12k HT; pentest €6–20k (TJM €800–1200) | productized repo-scan report **€900–2,500**/engagement (below human-audit floor, automated) |
| **P6 Quality/AI-Eval** | LLM-observability market **$2.69B (2026) → $9.26B (2030), 36% CAGR**; Gartner adoption 18%→60% by 2028 | platform SaaS (Braintrust/Maxim tier); eval projects scarce | eval-run report **€1,200–4,000**/project; retainer **€500–1,500/mo** |
| **P1 Full-Stack** | most-demanded PME profile | TJM median **€550** (€450–650 by seniority) | fixed-scope refactor/reference-delivery **€2,000–6,000**/package (vs €550/day) |
| **P10 Regulatory/Assurance** | **AI-Act high-risk audit market France est. €1–3B (2026–28)**; DPO demand broad | DPO externalisé €500–1,500/mo (€6–18k/yr); RGPD compliance €3–15k HT; AIPD €2–5k | compliance-evidence-prep dossier **€1,500–5,000** (no cert claimed) |
| **P4 Data** | strong; BFSI/public digitization | Data Engineer TJM median **€590** (€500–680); Data freelance median €640 | data-quality/lineage report **€1,200–3,500**/project |
| **P2 AI/Agentic** | highest-demand tech profile | ML Engineer TJM median **€725** (€600–850) | agent build/hardening **€3,000–8,000**; injection-audit **€1,500–4,000** |
| **P8 API/Business (e-invoice)** | **mandate: receive Sept 2026, PME emit Sept 2027 — every VAT business** (Factur-X/UBL/CII) | PDP/software market (Cegid/Pennylane tier) | Factur-X conformance check + integration **€1,500–6,000** (billing provider owner-gated) |
| **P11 Document/IDP** | global **$3.62B (2026), +24% CAGR → $24.99B (2035)**; Europe $750M (2025); **France fastest-growing** | OCR/IDP SaaS tier | document-extraction pipeline **€2,000–8,000** setup + usage |
| **P15 Automation/Workflow** | global RPA **$35.27B (2026)**; FR demand rising; ROI −30–40% opex | projects: simple €5–25k, medium €20–75k, complex €50–150k; Make €10–32/mo, UiPath $420/robot/mo | workflow automation **€3,000–20,000**/process by complexity |
| **P5 Cloud/Platform** | continuous cloud migration demand | DevOps/cloud TJM median **€600** (€500–800) | golden-path/IDP setup **€3,000–10,000** (host owner-gated) |
| **P7 SRE/Performance** | reliability-critical | SRE/Platform TJM **€650–1,000** | SLO + chaos-recovery setup **€2,500–8,000** |
| **P9 FinOps** | cost-optimization demand (token/cloud) | FinOps consultant €600–950 (+€100–250 premium) | FinOps report + budget-stop **€1,500–5,000** |
| **P13 AI-Infra/GPU** | inference-hosting growth | infra TJM €650–1,000 (GPU owner-gated) | capacity/honesty assessment **€2,000–6,000** (hosting owner-gated) |
| **P14 DevEx** | platform-engineering demand | Platform TJM €650–1,000 | golden-path scaffolder setup **€2,500–8,000** |
| **P12 Streaming** | event-driven/real-time (niche) | senior backend TJM €600–850 | streaming-pipeline build **€4,000–15,000** |

## §4 — Economic analysis (observed prices → scenario revenue; volume is `[ASSUMPTION]`)

- **Delivery cost `[OBSERVED]`:** near-zero marginal software cost (existing VPS, free OSS, autonomous labor); only
  owner-enabled provider/API use adds variable cost (0 until enabled). **Margin is structurally high** on automated
  deliverables — a real advantage.
- **Capacity `[ASSUMPTION]`:** bounded by ODG throughput (measured CI ~246s/PR) + **owner review/sign-off time** (the real
  bottleneck, since the owner must validate client-facing deliverables). Realistic early cap: a few parallel engagements.
- **Revenue is SCENARIO-conditional, never acquired.** Formula per métier: `revenue = proposed_price × deliveries` where
  `deliveries` is `[ASSUMPTION]`. With **no client yet, revenue = €0 observed.** Illustrative scenarios (explicitly
  hypothetical, not forecasts of acquired income):

| Scenario `[SCENARIO]` | Deliveries/mo (all métiers) | Avg price | Illustrative monthly gross | Note |
|---|---|---|---|---|
| Prudent | 2 | €2,000 | €4,000 | first paid pilots |
| Central | 6 | €3,000 | €18,000 | steady small-client flow |
| Ambitious | 12 | €4,000 | €48,000 | at owner-review capacity |

> These are **arithmetic illustrations of the observed price points × assumed volume** — **not** a claim that any euro is
> earned. Actual revenue is €0 until a real paying client exists (owner-gated: contracts, billing, delivery).

## §5/§6 — Opportunity ranking (now WITH the market dimension)

Combining **observed market demand + pricing** with **ODG capability-readiness** (internal, proven) and **launch barrier**:

| Rank | Métier | Market pull (observed) | Capability | Barrier | Why |
|---|---|---|---|---|---|
| **1** | **P10 Regulatory/Assurance** | **very high** (€1–3B AI-Act audit wave + broad DPO/RGPD) | E3-proven, zero owner-gated dep | low | regulatory tailwind + ODG no-overclaim/source-cite fits exactly |
| **2** | **P8 API/E-invoicing** | **very high** (legal mandate 2026→2027, every VAT business) | covered (api-contract/einvoice) | billing owner-gated | deadline-driven forced demand |
| **3** | **P3 Security** | high (PME budgets €15–30k, forced by risk) | E3-proven, zero dep | low | automatable repo-scan undercuts human-audit floor |
| **4** | **P15 Automation/Workflow** | high ($35B, clear ROI) | E3-proven | low | strong ROI story, synthetic demos today |
| **5** | **P6 Quality/AI-Eval** | high + fastest-growing (36% CAGR) | E3-proven, zero dep | low | eval-first wave; ODG's honesty/eval-significance is differentiated |
| 6–15 | P4 Data · P2 AI · P11 IDP · P1 Full-Stack · P5 Cloud · P7 SRE · P9 FinOps · P14 DevEx · P13 AI-Infra · P12 Streaming | solid | proven/ALIGNED | varies | NOT abandoned; second wave |

**Top-5 for progressive start: P10, P8, P3, P15, P6** — each has observed market pull AND a buildable synthetic demo
today. (This refines the earlier capability-only ranking by adding the now-observed market pull: P10 and P8 rise on
regulatory forcing functions; P1 drops to the second wave as a commoditized TJM market.)

## What remains genuinely owner-decided (unchanged)

Pricing ratification, legal/business setup, billing provider (P8), willingness-to-pay validation, public exposure. The
market data is now sourced; the **decision to sell at these prices and to a real client is the owner's.**

## Sources (public, dated 2026)

Security: lafabriquedunet.fr, vectisec.fr, sicollab.com, ia-cyber-securite.fr · Full-Stack/IT TJM: blogdumoderateur.com,
freelanceradar.co, meaflow.com, freelance-solution.fr · Data/ML TJM: tjmetre.fr, travail-industrie.com · DevOps/SRE/FinOps
TJM: freelance-ou-cdi.fr, levstack.io, danstapoche.fr · RGPD/AI-Act: secureprivacy.ai, dpo-partage.fr, leto.legal,
rgpd-start.com · E-invoicing: cegid.com, salesforce.com, cleartax.com · IDP: gminsights.com, polarismarketresearch.com,
marketdataforecast.com · RPA: itsystemes.fr, noxcod.com, agencepoesis.com (Precedence Research) · AI-Eval/LLMOps:
researchandmarkets.com, getmaxim.ai, braintrust.dev, nhimg.org. *Market-size figures are analyst/vendor estimates;
pricing are observed public ranges — both cited as observed, neither fabricated.*

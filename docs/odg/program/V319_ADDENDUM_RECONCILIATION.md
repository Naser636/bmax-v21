# V319 Addendum (Speed Marketing × Native Autonomy) — §1/§2 canonical reconciliation

**Phase 0 + §2 gate deliverable (anti-duplication).** Single authority: V12.4 Boussole / ROADMAP. This maps the
addendum's requirement areas onto **existing** ODG modules so that, per §0, we **extend — never duplicate** (no second
CRM / marketing engine / Radar / orchestrator / primitive / métier). Status vocabulary: ALREADY_IMPLEMENTED (AI) /
PARTIAL (P) / IMPLEMENTED_BUT_UNVERIFIED (IBU) / MISSING (M) / DUPLICATE (D) / BLOCKED / NOT_APPLICABLE.

## Phase 0 — recovered live state (not historical; inspected 2026-11-18)
main `484791db`, in-sync with origin, **0 tracked mods, 0 open PRs**, closure **427** / ROADMAP **11** (contract v1.1.0),
single worktree, no active sandbox/mission procs, C6 probe intact (`e94280362e…`). V319 fully merged (PRs #685–#700);
**safe to attach this addendum.** 9 primitives / 20 métiers (P1–P15 + M1–M5) / 4 campaigns preserved.

## §6 Speed Marketing → existing modules (overwhelmingly ALREADY built + tested)
| Addendum area | Existing module(s) | Status | Next action (NOT a rebuild) |
|---|---|---|---|
| 6.1 Market & customer intelligence | `market-intelligence`, `odg-market-entry-decision`, `odg-knowledge-acquisition`, Radar (`odg-global-opportunity-radar` + collection adapter) | **AI** | verify provenance/freshness coverage vs the §6.1 field list |
| 6.2 Ideal Customer Profile | `odg-icp-segment-fit`, `odg-prospect-qualification` (verified≠inferred; market-size never qualifies) | **AI** | confirm "missing/outdated info" states |
| 6.3 Offer intelligence | `commercial-offer-builder`, `entry-diagnostic-offer`, `mid-market-offer`, `recurring-offer`, `odg-product-design-engine` | **AI** | add an offer-experimentation record if absent |
| 6.4 Positioning / brand | `odg-marketing-engine` (approved/forbidden claims, unproven-claim detector) | **P** | formalize a reusable brand-profile struct (approved claims/disclaimers/locale) |
| 6.5 Channel intelligence | `revenue-channels` | **P** | channel selection by economics (reuse revenue model) |
| 6.6 SEO & search visibility | `seo-strategy`, `seo-technical-audit`, `seo-structured-data-validator`, `seo-crawl-consistency/directives`, `seo-hreflang-reciprocity`, `seo-page-language-declaration`, `seo-page-signal-extractor` | **AI (strong)** | — (people-first; no thin pages/fake reviews already the posture) |
| 6.7 Content & creative | `odg-marketing-engine`, `odg-digital-distribution` (publishDecision OWNER_GATED), `odg-language-management` | **P** | content-asset lifecycle struct (audience/objective/evidence/CTA/status) |
| 6.8 Campaign orchestration | `campaign-engine`, `campaign-controller`, `campaign-loop`, `l4-campaign`, `odg-metier-campaign`, `prospection-send-gate` (dedup/frequency/opt-out) | **AI** | ensure idempotent/traceable + stop-conditions wired |
| 6.9 Customer journey | `client-journey-sim`, `customer-outcome-intelligence` | **P** | explicit entry/exit/suppression/timeout per journey |
| 6.10 Lead scoring | `enterprise-lead-grade`, `odg-prospect-qualification` (explainable, evidence-based) | **AI** | — |
| 6.11 CRM / revenue coordination | `commercial-pipeline`, `commercial-portfolio`, `client-intake`, `autonomous-commercial-cycle`, `revenue-*` | **AI** | **DO NOT build a 2nd CRM**; extend missing fields only (lead≠customer≠invoice≠cash preserved) |
| 6.12 Partner / referral | `partner-channel` | **P** | attribution + commission rules + fraud detection (payments OWNER_GATED) |
| 6.13 Paid advertising | `revenue-channels` (prep) | **P / OWNER_GATED** | measurement struct; **no live spend** without owner budget |
| 6.14 Attribution & marketing science (MMM, incrementality) | `odg-jetspeed-funnel-economics` (funnel only) | **MISSING** | **genuine gap** — Meridian/Robyn-style MMM + incrementality (research §3.9/§3.10) |
| 6.15 Retention & expansion | `customer-outcome-intelligence`, `odg-support-renewal-engine` | **P** | churn-risk + retention interventions |
| §15 Consent / privacy / legal | `prospection-compliance`, `prospection-registry`, `prospection-send-gate` (B2B/B2C, opt-out, frequency) | **AI** | verify FR/EU B2B-vs-B2C prospecting vs current official sources |
| §16 Financial measurement | `revenue-model`, `revenue-scenarios`, `revenue-dashboard`, `revenue-schedule`, `odg-jetspeed-funnel-economics`, `odg-economic-model` (COST SSOT) | **AI** | lead≠customer≠invoice≠cash≠MRR≠ARR≠gross≠net already enforced; no live spend |

Representative run this session: `odg-marketing-engine`, `prospection-send-gate`, `odg-prospect-qualification`,
`odg-speed-marketing-chain` → **4/4 PASS** (modules are real + tested, not stubs).

## §10 Native Autonomy → existing modules (built + MEASURED this session)
| Addendum area | Existing module(s) | Status |
|---|---|---|
| Mission lifecycle (receive→decompose→execute→test→repair→inspect→integrate) | `mission-decomposer`, `mission-priority-selector`, `mission-contract-factory`, `coding-mission-resolver`, `mission-scheduler`, `mission-ledger`, `mission-outcome-recorder`, `odg-open-mission-recovery` | **AI** |
| Native generation / repair | `odg-native-engineering` (deterministic), `generative-repair-adapter`→`ollama-provider`→`repair-workflow` (novel) | **INDEPENDENTLY_VERIFIED** (V317 bounded, V318 novel, V319 multi-module+stacktrace, V319b n=14 accept 0.786) |
| Role separation (generator≠evaluator≠inspector) | `evaluator-independence`, `generative-repair-eval`, deterministic `node --test` + distinct 3b model | **INDEPENDENTLY_VERIFIED** |
| Recovery / rollback | `repair-workflow` (fs snapshot + exact rollback), `odg-open-mission-recovery` | **AI** |
| Isolation | certified C6 bwrap sandbox | **ACCEPTED (C6 certified)** |
| Autonomy measurement | `autonomy-measure`, `autonomy-matrix`, `native-autonomy-scorecard`, `odg-native-autonomy-audit` | **AI** |

## Honest gap summary (what's genuinely MISSING vs ALREADY built)
- **Speed Marketing: ~80% ALREADY_IMPLEMENTED + TESTED.** The real build gaps are narrow: **§6.14 marketing science (MMM / incrementality)** = MISSING; brand-profile (§6.4), content-asset lifecycle (§6.7), partner attribution/commission (§6.12), channel/journey/retention structs = PARTIAL. Everything else = extend-and-verify, **not rebuild**.
- **Native Autonomy: built AND independently measured this session** (V317–V319b). The next step is the harder-task battery + the §4 twenty-reference adaptation decisions — not a new engine.
- **Research programs §3 (10 marketing refs) / §4 (20 autonomy refs):** NOT_RUN — the next phase, routed through the existing Radar (grant-V141 WebSearch), producing decisions not copies.

## Next prioritized missions (per §23 — decisions→missions, no duplication)
1. **§6.14 marketing-science brick** (the one clear MISSING): a deterministic MMM/attribution-uncertainty + incrementality-experiment model that **reports uncertainty and never claims last-click causality** — extends `odg-jetspeed-funnel-economics`, reuses `odg-economic-model`.
2. **§3/§4 research** through the Radar → one comparative matrix each → decisions.
3. Verify/close the PARTIALs (brand-profile, content-asset, partner-attribution) as small extensions to the named modules.
4. Harder autonomy battery (multi-step planning; §13 benchmark reconciliation with private holdouts).

Nothing here is a new CRM/marketing-engine/Radar/orchestrator/primitive/métier. No live spend, no deployment, no secrets.

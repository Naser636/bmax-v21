# V319 program → V12.4 canonical crosswalk (integration view, NOT a second roadmap)

**Single strategic reference: Boussole / ROADMAP V12.4** (`runtime/governance/ROADMAP.json`, contract v1.1.0, 11
missions; closure register 427). This document is a **read-only VIEW** that maps each V319 program requirement onto
**existing** V12.4 sections/modules/missions. It creates no second roadmap, registry, Radar, primitive, campaign or
métier. Status levels per §12: DOCUMENTED < BUILT < TESTED < INTEGRATED < INDEPENDENTLY_VERIFIED < ACCEPTED < DEPLOYED
< VERIFIED_IN_PRODUCTION. Statuses are the honest current state (inspected `7c0c2420`, 2026-11-18), not aspirations.

## A. Native Autonomy — §3 (P0)
| Requirement | Existing V12.4 module(s) | Status |
|---|---|---|
| Deterministic engineering cycle | `odg-native-engineering`, `native-engineering-cycle`, `odg-closed-executor` | **INDEPENDENTLY_VERIFIED** (V317, bounded class) |
| Novel code synthesis | `generative-repair-adapter → ollama-provider → repair-workflow` | **INDEPENDENTLY_VERIFIED** (V318, 3/3 novel, 7b; model-dependent) |
| Self-assessment / audit | `odg-native-autonomy-audit`, `native-autonomy-scorecard` | TESTED |
| Resume interrupted missions | `odg-open-mission-recovery` | TESTED |
| Independent evaluation | `evaluator-independence`, `generative-repair-eval` | TESTED |
**Honest level:** bounded + narrow-novel autonomy MEASURED; general multi-module autonomy = next (V319 §3 battery).

## B. Frontier Radar / Global Intelligence / Continuous Evolution — §4
| Requirement | Existing module(s) | Status |
|---|---|---|
| Frontier Radar (single entry) | `frontier-radar`, `frontier-radar-self-improvement`, `frontier-radar-store` | BUILT/TESTED |
| Collection adapter (deny-by-default) | `odg-radar-collection-adapter` | TESTED |
| Radar→mission loop | `odg-radar-to-mission-loop`, `odg-radar-gate-chain` | TESTED |
| Weekly cycle scheduler | `odg-weekly-radar-scheduler` | TESTED (real scheduled run NOT_MEASURED) |
| Global opportunity / research | `odg-global-opportunity-radar`, `research-radar`, `radar-gap-analysis` | BUILT |
| Video/transcript sources | `odg-radar-video-sources` | TESTED |
**Gap:** a REAL external research campaign (grant-V141 WebSearch) is **NOT_RUN this session** — the single next Radar action.

## C. Frontier Lab / Evolution-Loop / Compounding / Root-Cause — §2
| Requirement | Existing module(s) | Status |
|---|---|---|
| Frontier Lab experiments | `frontier-lab`, `frontier-lab-experiment` | TESTED |
| Evolution loop | `evolution-loop` | BUILT |
| Compounding loop | `compounding-loop`, `compounding-pattern-library`, `odg-compounding-transfer-demo` | **INDEPENDENTLY_VERIFIED** (V203) |
| Root-cause engineering | `rce-root-cause-intelligence`, `p2-flaky-root-cause` | TESTED |

## D. 20 métiers + 4 campaigns — §6
| Requirement | Existing module(s) | Status |
|---|---|---|
| 20-métier roster (P1–P15 / M1–M5) | `odg-program-metier-matrix` (ROSTER20/CLASS), `odg-primitive-metier-matrix`, `odg-metier-business-matrix` | BUILT (20/20 studied, V199) |
| 4 campaigns | `campaign-controller`, `campaign-closure-ledger`, `odg-campaign-lifecycle` | BUILT/TESTED |
**Gap:** per-métier **reference projects** (contract→env→data→baseline→tests→security→perf→cost→recovery→independent benchmark→limits→cross-métier transfer) are **NOT built** — the §6 deliverable; 9 primitives + P1–P15/M1–M5 distinction preserved.

## E. Market & Business Intelligence / Speed Marketing — §8
| Requirement | Existing module(s) | Status |
|---|---|---|
| Business-model families | `odg-business-model-families` (COST SSOT reuse) | BUILT (MODEL-ONLY) |
| ICP / funnel / prospect | `odg-icp-segment-fit`, `odg-jetspeed-funnel-economics`, `odg-prospect-qualification` | BUILT (MODEL-ONLY) |
| Speed marketing / commercial | `odg-marketing-engine` (unproven-claim detector), commercial operating system | BUILT |
**Rule:** real vs estimate vs simulation vs hypothesis kept strictly separate; no paid spend without explicit budget.

## F. BTP client product — §7
| Requirement | Existing module(s) | Status |
|---|---|---|
| Chantier costing chain | `chantier-profitability`, `parc-stock-engine`, `workforce-labour-engine`, `document-intelligence`, `odg-product-design-engine` | BUILT (engines) |
| Multilingual (FR/AR-RTL/EN/ES) client UX, voice/photo/PDF, guided journeys | `odg-language-management`, `accessibility-check/applicability` | PARTIAL / **largest unbuilt gap** |
**Honest level:** the costing/engine layer exists; the **multilingual mobile-first client product** (§7) is the largest unstarted build.

## G. Preproduction & Deployment — §11
| Requirement | Existing module(s) | Status |
|---|---|---|
| Qualification C1–C12 + gate matrix | `odg-deployment-qualification`, `odg-production-gate-matrix` (V205) | **INDEPENDENTLY_VERIFIED** (3/5 gates READY) |
| Artifact identity / package | `odg-artifact-identity`, `odg-deployable-package` | TESTED |
| Release 16.4.6 (staging + Blue/Green) | `scripts/odg-release.sh`, `deploy/*`, V315 dossier | **INDEPENDENTLY_VERIFIED** on isolated slot (C8/C9/C11; rollback drill) |
| Dashboard exposure | `dashboard-exposure-readiness`, Caddyfile, auth | 4/6 controls present; 2 owner-runtime |
**Production: OWNER_GATED — productionReady=false (NO_GO).** dashboard-exposure + iso-certification remain NOT_READY.

## H. Security / Compliance — §10
| Requirement | Existing module(s) | Status |
|---|---|---|
| OWASP Agentic matrix | `odg-owasp-agentic-matrix` (T1–T17) | BUILT (fresh 2026 review NOT_RUN) |
| ISO 27001 / 42001 crosswalks | `odg-iso27001-evidence-crosswalk`, `certification-readiness` | DOCUMENTED (gaps enumerated; external audit required) |
| Supply chain / secrets / isolation | v97 guard, `secret-rotation-hygiene`, C6 cert | TESTED/INDEPENDENTLY_VERIFIED |

## I. Benchmarks — §5/§6
| Requirement | Existing module(s) | Status |
|---|---|---|
| Sealed generative-repair corpus | `generative-repair-eval` (falseSuccess=0 by construction) | TESTED |
| Broad-IT eval harness | `odg-broad-it-eval-set` | HARNESS (BLOCKED on external corpus) |
**Gap:** GDPval / BrowseComp / τ-bench / WebArena / OSWorld / AgentBench / SWE-bench references — **NOT integrated** (require authorized Radar/WebSearch + private holdouts; never a single external judge).

## Next prioritized missions (P0 first)
1. **§3 (P0) harder native-autonomy battery:** multi-module / failing-stack-trace diagnosis, larger sealed corpus accept/abstain rate, 2nd distinct local model (generator≠evaluator both models).
2. **§4 real Radar external campaign** (grant-V141 WebSearch) → mission proposals.
3. **§6 per-métier reference projects** (lots of 3) with independent benchmarks.
4. **§7 BTP multilingual client product** (largest build) — staged after the costing engines are wired to a client UX.
5. **§11 production** — strictly OWNER_GATED pending dashboard-exposure + ISO + canonical GO.

No second roadmap/registry/Radar/memory created. V12.4 remains the single source; this view is recorded under `docs/odg/`.

# ODG — Portfolio Reconciliation: historical IT métiers ↔ current 8 domains

> **Provenance.** Authored 2026-10-29 @ `main` 8ef5fdb. Evidence-based reconstruction from the repo, canonical docs,
> roadmaps, `ODG_PROJECT_STATE.md`, the closure register, mission journals, git history and merged PRs. The cinema/film
> project is **excluded** by mandate. This is **documentation + provenance**, NOT a second source of truth for status —
> the closure register (`docs/odg/closure-register.json`) remains the SSOT for item state; rows here cite register ids.
> **No name, price, benchmark, certification or buyer is invented.** Where evidence is insufficient, the row says so.

## 1. The "three historical IT métiers" — evidence and the honest ambiguity

No document in the repo literally says "these are our three historical métiers" as a retrospective statement. Every
"three"/"five" grouping found is a **forward-looking planning artifact** from its own moment, not a backward inventory.
Two readings are each defensible on evidence; a third would be speculation and is not asserted:

- **Reading A — the literally-grouped PoC trio: O2 / O3 / O8.** The one place exactly three IT offerings were
  deliberately selected from a longer list (O1–O10) and PoC'd together in one dedicated document is
  `docs/odg-operational/ODG_POC_O2_O3_O8.md` (2026-10-17): **O2** SBOM/CRA/SLSA, **O3** AI-Act/ISO-42001 readiness
  matrix, **O8** IDP / golden-path scaffolder. This is the strongest *literal* match for "the three."
- **Reading B — the three lineages that became durable product code: P-01 / O2 / O3.** Tracing what actually survived
  into the running system: **P-01** Code Health Check (PR #137/#139, engine `runProjectHealthCheck` now `require()`d
  inside D1 `code-review-service.ts:157`), **O2** → `sbom-audit-service` (ACCEPTED, D2), **O3** →
  `ai-act-role-classifier` + `regulatory-dossier-service` (ACCEPTED, D5/D7). On this reading **O8 is the outlier** —
  it never left PoC and has no domain.

**Unresolved (flagged, not invented):** which exact three the CTO remembers cannot be pinned beyond these two readings.
If anchored to the earliest explicit grouping → **O2/O3/O8**; if anchored to "the ones that shipped real product code"
→ **P-01/O2/O3**. O8 is common to A but absent from B; P-01 is common to B but absent from A.

## 2. Canonical reconciliation matrix

Status vocabulary (mandate): INDEPENDENT_PRODUCT · TO_CONSOLIDATE · FEATURE_OF · SHARED_COMPONENT · PROTOTYPE ·
OBSOLETE_OR_REPLACED · IDENTITY_UNKNOWN.

| Historical | Reconciled status | Current home (domain) | Code path | Register id / state | Live tests today | Evidence |
|---|---|---|---|---|---|---|
| **P-01 Code Health Check** | FEATURE_OF (engine) + its product prep is TO_CONSOLIDATE | D1 (code-review) | `runtime/core/code-health-service.ts` (`runHealthCheck`, `runProjectHealthCheck`) | engine reused by `ese-code-review-service` (ACCEPTED); product prep: `p01-demand-experiment-prep` (ACCEPTED), `p01-demand-validation` (BLOCKED-ext), `p01-billing-sandbox` (BLOCKED-ext) | `code-health-service.test.ts` 16/16 | PR #137/#139 (`a034fea`,`2540db8`); `code-review-service.ts:157` require |
| **O2 SBOM / CRA / SLSA** | INDEPENDENT_PRODUCT (also SHARED_COMPONENT for D7) | D2 (cyber/supply-chain); composed into D7 | `runtime/core/sbom-audit-service.ts` (`auditProjectDir`, `auditManifests`) | `sbom-audit-service` (ACCEPTED) | `sbom-audit-service.test.ts` 11/11 | PoC `ODG_POC_O2_O3_O8.md`/`22800c3`; PR #193 (`fb984b8`), fix `4183523`; `ai-assurance-assessment.ts:21` require |
| **O3 AI-Act / ISO-42001 matrix** | TO_CONSOLIDATE (PoC) → lives via classifier+dossier (INDEPENDENT_PRODUCT) | D5 (regulatory); composed into D7 | `poc/o3-ai-act-matrix/generate.ts`; `runtime/core/ai-act-role-classifier.ts`; `runtime/core/regulatory-dossier-service.ts` | `regulatory-dossier-service` (ACCEPTED); classifier used by `product-ai-assurance-assessment-d7` (ACCEPTED) | `poc/o3…generate.test.ts` 10/10; `ai-act-role-classifier.test.ts` 11/11; dossier 8/8 | PoC `a55b4b3`; PR #62 (`dd583d0`); PR #196 (`19bad56`); `ai-assurance-assessment.ts:19` require |
| **O8 IDP / golden-path scaffolder** | PROTOTYPE (preserved, not productized, not obsolete) | none (no domain) | `poc/o8-golden-path/scaffold.ts` (`admit`, `scaffold`) | **was ORPHANED** → now reconciled as `golden-path-scaffolder-poc` (DEFERRED) | `poc/o8…scaffold.test.ts` 13/13 | built `f281846`; capability C07 = SPECIFICATION_ONLY (`ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md:32`) |

### Current 8 domains ↔ historical lineage (where applicable)
- **D1 software-engineering** ← P-01 Code Health engine (shipped as `ese-code-review-service`, PR #191).
- **D2 cybersecurity/supply-chain** ← O2 SBOM (`sbom-audit-service`).
- **D3 data-quality** — no historical O-series lineage (new; `data-quality-service` + conformance upgrade PR #225).
- **D4 financial-auditing** — no historical O-series lineage (new; `finance-ledger-service` PR #195).
- **D5 regulatory/compliance** ← O3 AI-Act lineage (`regulatory-dossier-service`).
- **D6 e-invoice** — new 3-product program (PRs #214/#216/#218/#226); no O-series lineage.
- **D7 AI-assurance** — **literal composition of O2+O3**: `ai-assurance-assessment.ts` requires both `sbom-audit-service.js` and `ai-act-role-classifier.js` (PRs #220/#222/#224).
- **D8 building-retrofit** — new greenfield (PR #224); no historical lineage.

## 3. O8 disposition — preserved, reconciled, not deleted

O8 is the single candidate with **zero continuity** into the current domains. It is **not** obsolete (13/13 tests still
pass; the `mission-contract-factory` substrate it demonstrates is live) and must not be deleted merely for looking
redundant. Correct disposition per governance: **PROTOTYPE, preserved**, now made visible in the register as a
`DEFERRED` item (`golden-path-scaffolder-poc`) so the portfolio has no silently-orphaned product. Productizing an IDP
(templated catalog, plugins, benchmarked golden path) remains a SPEC-level greenfield decision for the owner, explicitly
**not** selected by the later 3-product decision gate (which chose e-invoice / ai-assurance / building-retrofit).

## 5. Historical-domain lens H1 / H2 / H3 (per the 11-domain mandate)

The mandate requires the three historical lineages to keep **explicit roadmap visibility** even where their software is
shared with D2/D5/D7. Evidence-cited (read-only inventory @ `a11c09f`, cinema excluded):

| Hist. domain | Reconciled status | Current home (shared components) | Historical provenance | Register visibility |
|---|---|---|---|---|
| **H1 — Cybersecurity & supply chain** | SHARED_COMPONENT of D2 (+ D7) | `sbom-audit-service` (D2) → composed into `ai-assurance-assessment` (D7, `:21`) + `supply-chain-attest`, `license-policy`, `evidence-provenance` | O2 PoC (`ODG_POC_O2_O3_O8.md`); opportunities O2 (CRA/SBOM/SLSA) + O10 (AI supply-chain) in `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md` | `sbom-audit-service` ACCEPTED; D2/D7 items |
| **H2 — Legal/compliance & cert-readiness** | SHARED_COMPONENT of D5 (+ D7) | `regulatory-dossier-service` (D5) + `ai-act-role-classifier` → composed into D7 (`:19`); `iso-42001-readiness`, `iso-27001-clause-matrix`, `certification-readiness` | O3 PoC (`poc/o3-ai-act-matrix`); opportunity O3 (AI-Act/ISO-42001, **NOT certification**) | `regulatory-dossier-service` ACCEPTED; D7 slice items |
| **H3 — CRM / commercial relationship / sales automation** | **TO_CONSOLIDATE** — internal substrate, NOT a product | ~20 tested `runtime/core/*` modules (below) — internal, single-tenant, UI-less, self-referential (ODG's own sales) | **No CRM opportunity was ever scoped**; CRM/ERP explicitly **disclaimed**: `docs/market-research/30_BROADENED_DISCOVERY_AND_DELIVERY_TRUTH.md:19` (2026-10-22) "CRM/ERP (Dynamics/SAP/Salesforce) — NO — will not claim". Closest opportunity = O9 "B2B workflow automation" (connectors BLOCKED) | **Un-orphaned** here as `commercial-ops-substrate-h3` (DEFERRED) |

**H3 honest verdict (no invention).** There is **no sellable CRM product** and none was ever scoped as such — the repo
*explicitly disclaims* CRM capability (above). Yet a substantial, internally-coherent, **all-tests-passing commercial-ops
substrate** exists and implements most CRM *mechanics* for ODG's own B2B motion: lead lifecycle/grading (`client-intake`,
`enterprise-lead-grade`), pipeline/opportunities (`commercial-pipeline` 12-stage, `pipeline-ledger`, `pipeline-forecast`
— the forecast pattern adapted from HubSpot's pipeline-stage model, no outbound CRM write), outreach registry+compliance
(`prospection-registry`/`-send-gate`/`-compliance`, CNIL/GDPR B2B), proposal→pipeline (`proposal-generator`/`-pipeline`),
quote→invoice→payment (`quote`/`invoicing`/`payments`/`email-gateway`), dashboards (`revenue-dashboard`, `owner-console`),
and orchestration (`autonomous-commercial-cycle`, `first-cash-activation`, `opportunity-detector`/`-axis-router`).
**Missing for a product:** multi-tenant/customer-facing model + roles/permissions, any UI (none in `src/`), a
connector/integration layer (`opportunity-axis-router` returns NO_RESULTS without an authorized connector), and a
generic contact/account book with import/export. **Disposition:** TO_CONSOLIDATE as an internal substrate; productizing
it into an external CRM is an **owner decision** that must first reconcile the 2026-10-22 "will not claim" disclaimer —
not undertaken here. Reuse this substrate before building any new CRM mechanic. **Could not determine** whether the
disclaimer was revisited after 2026-10-22; no reversal was found (flagged, not asserted permanent).

## 4. Honest unknowns / limits
- The exact "three the CTO remembers" is not determinable beyond Readings A and B (§1); no third reading is invented.
- Competitive matrices (≤100 actors/domain) and competitor benchmarks are **not** done here (multi-cycle; refused to
  fabricate). This document reconciles identity/lineage only.
- Register state remains the SSOT; this matrix is provenance/documentation and must not be read as a status override.

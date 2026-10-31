# ELEVEN-DOMAIN COMPLETION MATRIX — ODG-NATIVE ENGINEERING RECOVERY

**Generated:** 2026-10-31 · **Baseline:** origin/main `cd90e10` · **Authority:** CTO (Technical Completion Campaign) · **Orchestrator:** ODG.

The canonical eleven domains are recovered VERBATIM from `ODG_MASTER_ROADMAP_EXCELLENCE_OPERATIONNELLE_RECONSTRUCTION_V1.md` §13–14 (D1–D8 + H1–H3) with transversal axes A/B/C (§15–17). No domain is invented or omitted. Per-domain state is grounded in the closure register (160 items, 146 ACCEPTED, 0 stale) by keyword bucketing (approximate attribution; a lot may serve several domains). **Truth-state ladder** (§22): UNKNOWN · PROPOSED · PRESENT · IMPLEMENTED · TESTED · VERIFIED · ACCEPTED · INTEGRATED · RELEASED · DEPLOYED · OPERATIONALLY_VERIFIED — never skipped on a green test alone.

**Scope note (CTO Technical Completion Campaign):** public TLS exposure, billing/payment, willingness-to-pay/commercial, company/banking, and public/production deployment are OUT OF SCOPE this phase and are NOT counted as technical blockers.

| Domain | Register items (ACCEPTED/total) | State | Notable gaps / remaining technical work |
|---|---|---|---|
| **D1 Software Engineering** | 33/34 | RELEASED (strong) | Only `new-language-families` BLOCKED on the external `hadolint` binary (toolchain) — ODG can harden the toolchain-absent fail-closed path; capability itself prepared. Core engineering (repo understanding, codegen, build, tsc, test, diagnose, repair, independent verify, CI) proven across this session's 9 merged lots. |
| **D2 Cybersecurity & Supply Chain** | 14/17 | RELEASED + active hardening | SSRF, ReDoS (regex-input-bound), secret redaction, path-traversal, SBOM, attestation trust-anchor, DTD/billion-laughs, confinement all ACCEPTED. **NEW:** audit-log keyed-HMAC + tip-anchor MECHANISM ACCEPTED (#326). Remaining: `p0e-audit-log-keyed-integrity` BLOCKED strictly on owner HMAC-key provisioning (mechanism shipped); `broad-it-independent-eval-set` needs an external labelled set. **In-scope follow-on:** apply the same keyed-HMAC to `evidence-provenance.ts` (parallel keyless weakness). |
| **D3 Data Quality** | 11/13 | RELEASED | dataset-quality (completeness/validity/uniqueness/conformance + ReDoS bound), fairness-eval ACCEPTED. `broad-it-corpus-grow` IN_PROGRESS (coverage measured ≥0.6 in later re-verify — status to reconcile); `broad-it-independent-eval-set` needs external dataset. |
| **D4 Financial Auditing** | 20/21 | RELEASED | finance-ledger, reconciliation, cost-accounting, budget-ledger, net-cash, economic-verification ACCEPTED. The only overlap item is the audit-log keyed-integrity (shared with D2, owner-key). No certification claimed (no référentiel). |
| **D5 Regulatory & Legal Compliance** | 3/3 mapped (+ ISO lots under H2) | ACCEPTED (scoped) | ai-act-role-classifier, CNIL/GDPR, prospection-compliance ACCEPTED. Honest distinction preserved: mechanism ≠ satisfied ≠ certified (no COFRAC/certification claimed). |
| **D6 Electronic Invoicing** | 13/13 | RELEASED | einvoice validator/parser/export, factur-x-extract, pdf-extract (bomb+streams caps), DTD reject, EN16931-core, UBL/CII all ACCEPTED. Real external operator transmission is out-of-scope (not sandbox). |
| **D7 AI Assurance & Governance** | 9/10 | RELEASED | agent-governance-harness (OWASP Agentic), third-party-agent-gate, agent-identity, governance-kernel, truth-lock, reality-gate, excellence/regulatory-assurance ACCEPTED. `p0-autonomy-measure-slice3-delegate-provenance` DEFERRED (measurement-only; current behaviour already honest). |
| **D8 Building Retrofit Intelligence** | 1/1 mapped | PRESENT/scoped | renovation-quote-normalize ACCEPTED. Smallest domain; estimations ≠ certified audits (honest). Further capability is PLANNED, no active defect. |
| **H1 Historical Cybersecurity** | 2/2 | RECONCILED | security-recon lots reconciled into D2; no orphaned historical security work. |
| **H2 Historical Legal/Cert** | ISO lots (27001 clause-matrix, 42001, operational-evidence, cert-pathway) ACCEPTED | RECONCILED | Obligation/preparation/certification kept distinct; 0 SATISFIED/CERTIFIED claimed. Rapprochés with D5/D7. |
| **H3 CRM & Commercial Workflow** | 3/5 | PRESERVED (not productized) | commercial-ops substrate implemented internally (all tests pass) but CRM/ERP explicitly DISCLAIMED as a product; `commercial-ops-substrate-h3` + productization DEFERRED = OWNER decision. `p0c3-frontdoor-vps-smoke` DEFERRED (env). Commercial topics OUT OF SCOPE this phase. |

## Transversal axes
- **Axe A (Orchestration/resilience):** campaign-controller (dep-aware selection, staleAcceptances, decomposition), campaign-loop lifecycle, checkpoint/resume, recovery drills — ACCEPTED. IDLE ≠ done (honored).
- **Axe B (Evaluation/learning/observability):** autonomy-measure (honest NON-MEASURABLE on legacy), k-eval, eval-metrics, learning-reuse-proof (crash-atomic), SLO/trust — ACCEPTED. Every metric carries definition/source/denominator/provenance.
- **Axe C (Normalization/reconciliation/independent verify):** closure-register SSOT, staleAcceptances fixpoint, cross-mission verdict isolation, the per-lot INDEPENDENT VALIDATOR (distinct agent context) — ACCEPTED and exercised this session (it REJECTED the first audit-log draft, forcing the NUL fix). Unknown never becomes success.

## Domain-acceptance posture (§21/§23)
D1–D8 all have states + evidence; H1–H3 preserved + reconciled; axes A/B/C demonstrated; 9 primitives frozen; independent verification exercised; autonomy measured honestly; learnings reused; security actively hardened. **Global closure (§23) is NOT declared** — remaining technical items (hadolint toolchain, evidence-provenance keyed-HMAC, corpus/status reconciliation) + owner-gated key provisioning remain; commercial/deploy items are out of scope this phase.

## Next in-scope technical missions (dependency-ready, non-owner-gated)
1. **evidence-provenance keyed-HMAC** (D2/D7) — mirror the audit-log mechanism; bounded, high-value security hardening.
2. **new-language-families toolchain-absent fail-closed** (D1) — declare BLOCKED_BY_TOOLCHAIN when `hadolint` absent (reuse confinement-suite pattern); low value.
3. **broad-it-corpus-grow / structured-roadmap-deps status reconciliation** (D3/Axe C) — register-only, reconcile to measured reality.

# ODG Three-Domain Commercial Offers (A / B / C) — shared core, sold once

**As of:** 2026-10-25 · **Realised revenue: €0** (0 contacts, 0 proposals sent, 0 contracts, 0 cash).
**Readiness is not equal across domains — stated honestly below.** Private sector only; public tenders excluded.

> Stage discipline: proposed price ≠ offer sent ≠ signed ≠ invoiced ≠ collected. Everything here is a DRAFT offer.
> GATE 5 (working demonstrator from a documented environment) is the bar to sell; only **C** clears it for a real
> client problem today. A and B have **internal** demonstrators that reuse the shared core but are not yet
> client-ready products.

---

## Offer C — Document & Financial Reconciliation Assurance  ·  **READINESS: DEMONSTRATOR PROVEN**

The lead offer. Full dossier in `ODG_COMMERCIAL_OFFER.md`; product readiness in `ODG_PRODUCT_READINESS.md`.
- **Ideal client / problem:** FR/EU private finance, accounting-services, e-commerce/marketplace, SaaS billing ops
  doing manual reconciliation; risk of believing a reconciliation is clean when it isn't.
- **Scope/deliverables:** structured ledger↔bank / invoice↔payment reconciliation; discrepancy detection +
  CERTAIN/REVIEW classification; independent verification; reproducible audit report (JSON+HTML); runbook.
- **Demo scenario:** `node run-pipeline.mjs` → 12 matched / 5 findings / independent verify PASS; tamper → FAIL;
  bad input → fail-closed STOP.
- **Acceptance:** 0 unhandled errors; verifier PASS or explained; recall=1 on agreed discrepancies; 100% traceable;
  byte-identical reproducibility.
- **Risks/exclusions:** unstructured PDF/scan extraction NOT implemented (interface+cost estimate only); no live
  ERP/bank integration; synthetic-data proof only to date.
- **Delivery cost / price:** pilot ≈ **€6k–12k** (6–10 person-days); recurring **€1.5k–4k/mo**. Compute ≈ €0.
- **Models:** pilot → recurring managed service → (later) connectors/extraction add-ons (priced only after a real
  provider quote).
- **Security/data:** local/deterministic, offline, minimal data model, no egress in implemented scope; DPA before
  real personal data.

## Offer B — AI Reliability, Evaluation & Governance Assurance  ·  **READINESS: INTERNAL DEMONSTRATOR**

Sell ODG's anti-false-success governance as a service: independent evaluation of an AI/automation system's claims.
- **Ideal client / problem:** companies deploying AI/agent features who must prove the system does what it claims
  (no false success), with reproducible evidence and a governance posture (NIST AI RMF / ISO 42001 / EU AI Act).
- **Scope/deliverables (proposed):** versioned golden/adversarial test sets; independent eval harness producing a
  confusion matrix (precision/recall/FP/FN) + calibration (Brier); a no-false-success gate; reproducible,
  exportable evidence packs; a governance-posture mapping (framework vs certifiable vs legal — see benchmark register).
- **Demo scenario (internal):** `node demo-eval.mjs` → a good SUT passes; an over-claiming SUT and a lazy SUT are
  **blocked** by the precision/recall threshold gate.
- **Acceptance:** evaluation is reproducible; metrics computed against ground truth; a false-success case is caught;
  evidence pack re-verifies (sha/provenance).
- **Reuses core:** `eval-metrics` (shared) + runtime `validation-engine`/`evidence-provenance`/`compliance-evidence-pack`.
- **Risks/exclusions:** today an internal demonstrator — NOT a packaged client product; needs a client-specific
  golden set; confidence calibration is new; no comparable-task benchmark vs LangSmith/Braintrust/Phoenix yet.
- **Pricing:** **NOT quoted** until a client-ready demonstrator passes the same GATE 5 bar as C.
- **Positioning:** differentiator is *independent, fact-based verdicts that block unsubstantiated success* — not a
  dashboard. Must not copy ELv2 code (Phoenix) into a hosted offer (see benchmark register red lines).

## Offer A — Complex Workflow Automation & Agent Reliability  ·  **READINESS: INTERNAL DEMONSTRATOR**

Sell reliable orchestration of multi-step automations with governance (deny-by-default, idempotence, safe-stop).
- **Ideal client / problem:** companies with brittle multi-step automations/agents that fail silently, double-act,
  or claim success on exit code 0.
- **Scope/deliverables (proposed):** dependency-ordered orchestration (parallel where independent); idempotent
  execution (no duplicate effects); fail-closed safe-stop (a failed step stops dependents); per-step evidence;
  human-approval gates for risky/irreversible actions; fact-based completion (no false success).
- **Demo scenario (internal):** `node demo-orchestration.mjs` → clean run SUCCESS; idempotent re-run (no re-exec);
  a failing step safe-stops dependents → PARTIAL, never false SUCCESS.
- **Acceptance:** dependency order respected; re-run produces no duplicate effects; failure never yields SUCCESS;
  every step carries evidence.
- **Reuses core:** `dep-planner` (shared) + runtime `capability-executors`/`idempotency-guard`/`action-gate`/
  `checkpoint-engine`/`mechanical-acceptance`.
- **Risks/exclusions:** internal demonstrator; real connectors/integrations not built; retry/backoff not generalised;
  needs client-specific workflow definitions.
- **Pricing:** **NOT quoted** until a client-ready demonstrator passes GATE 5.

## Shared-capability overlap (sell once)

All three offers rest on the **same** core (independent verification, provenance/evidence, idempotence/resume,
authorization, scheduling, eval metrics). A pilot in any domain partly de-risks the others. Commercial consequence:
lead with **C** (only proven demonstrator), use A/B as roadmap/credibility, and price A/B only after they clear GATE 5.

## Market & admin (shared)

- Buyer research / qualification framework + templates (prepared, nothing sent): `ODG_PRIVATE_BUYER_VALIDATION.md`.
- Revenue scenarios (prudent/central/favorable): `ODG_REVENUE_MODEL.md`.
- France B2B admin/legal/security checklist: `ODG_ADMIN_LEGAL_CHECKLIST_FR.md`.

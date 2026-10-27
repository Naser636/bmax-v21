# ODG — AI governance diagnostic & readiness offer (V1, 2026-10-27)

A **client-facing** offer to diagnose and prepare an organisation's AI governance posture (EU AI Act role + ISO/IEC
42001 AIMS principles + agent security). Generated/validated through `proposal-generator.ts` (fail-closed,
anti-overclaim). **ODG prepares evidence and readiness; it does NOT certify. No compliance, security or outcome is
guaranteed.**

## What the client gets (deliverables, with proof)
1. **AI-Act role classification** — prohibited / high-risk (Annex III) / limited-risk (Art. 50 transparency) / minimal,
   with the obligation list that attaches to their role. *Proof:* `regulatory-assurance` catalog + source citations
   (EUR-Lex / Commission timeline). Honesty: client-declared facts are marked declared-not-verified.
2. **ISO/IEC 42001 AIMS readiness (principle-level)** — mapped to the standard's publicly-documented scope.
   *Proof:* `iso-42001-readiness` self-assessment method (the same one ODG runs on itself:
   [ISO_42001_READINESS_ODG_V1.md](ISO_42001_READINESS_ODG_V1.md)).
3. **Agent-security review** — OWASP Agentic Top-10 (ASI01–10), principle-level. *Proof:* `third-party-agent-gate`.
4. **Evidence pack + prioritised remediation plan** — provenance-sealed, honest about gaps.

## Limits (stated up front — not fine print)
- **Principle-level**, not a legal opinion or an accredited audit. Clause-level ISO work needs the **licensed standard
  text** (ACCESS currently metadata-only; free AFNOR/ANS route eligibility TBV, else purchase).
- ODG **does not issue certification** and does not guarantee that any third-party audit/assessment will pass.
- Findings reflect **information the client supplies**; declared facts are not independently verified unless scoped.
- Production controls (KMS, prod monitoring/alerting, off-host backup, prod multi-tenant isolation) are **EXTERNAL**
  and out of scope unless separately engaged.

## Offer tiers (prices HYPOTHESIS — confirm per engagement)
| tier | scope | indicative price (HYP) | see |
|---|---|---|---|
| ENTRY diagnostic | role classification + agent-security review + gap list | €2.5–4k | [PROPOSAL_EXAMPLES_V1.md](PROPOSAL_EXAMPLES_V1.md) §ENTRY |
| B2B engagement | multi-framework (AI-Act + GDPR + ISO 27001/42001 principles) + evidence pack + roadmap | €6–18k | §B2B |
| Partnership / white-label | methodology + per-client dossiers + enablement | one-off + per-unit | §PARTNERSHIP |

## Why ODG (honest differentiators — no superlatives)
- The **same governance discipline is applied to ODG itself** and is testable: fail-closed gates, anti-overclaim
  controls, tamper-evident audit logs, provenance-sealed evidence — all under a CI gate.
- Readiness output is **reproducible** and **honest about gaps** (satisfied vs partial vs external vs not-consulted),
  which is exactly what enterprise security reviews and the AI Act ask for.

## Proof artefacts a prospect can be shown
`ISO_READINESS_ODG_V1.md`, `ISO_42001_READINESS_ODG_V1.md`, `EXCELLENCE_COVERAGE_MATRIX_V1.md`,
`REGULATORY_ASSURANCE_V1.md`, `demo-dossier` live render. All reflect ODG's real gated evidence.

## Not included / human-gated
Sending this offer to a real prospect, pricing sign-off, and any contract require **human authorisation + legal
review**. ODG never fabricates a signature or acceptance.

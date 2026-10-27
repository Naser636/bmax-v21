# ODG — AI-governance diagnostic checklist (executable, V1, 2026-10-27)

Operational checklist for running a real diagnostic mission. Scopes the offer in
`AI_GOVERNANCE_DIAGNOSTIC_OFFER_V1.md`. **ODG prepares evidence; it does NOT certify; no compliance/result guarantee.**
Each item maps to a real gated capability or is flagged EXTERNAL / CLIENT-INPUT.

## 0. Pre-engagement (fail-closed)
- [ ] Client + verified scope captured (no invented client). → `proposal-generator.buildProposal` (refuses missing limits/price).
- [ ] Proposal registered at PROPOSAL (no simulated signature). → `proposal-pipeline.registerProposal`.
- [ ] Engagement limits, exclusions, client obligations, dependencies written & agreed.

## 1. Information to request from the client
- [ ] Inventory of AI/LLM features shipped (what, since when, which model/provider).
- [ ] Role under EU AI Act (provider / deployer / GPAI) — client-declared, marked **declared-not-verified**.
- [ ] Data categories processed by the AI (personal? special? who are data subjects?).
- [ ] Existing security/privacy posture (ISMS? DPO? DPIAs? sub-processors/DPAs?).
- [ ] Target: which enterprise security reviews / deadlines (Art.50 2026-08-02 / Art.50(2) 2026-12-02)?

## 2. Controls to assess (principle-level — clause text NOT read)
- [ ] **AI-Act transparency** (Art.50): user-facing AI disclosure; synthetic-content marking plan. → `regulatory-assurance`
- [ ] **Agent security** OWASP ASI01–10 (prompt-injection, tool misuse, excessive agency, etc.). → `third-party-agent-gate`
- [ ] **ISO 27001 principle-level** themes (identity, logging, change, recovery, supplier). → `iso-readiness`
- [ ] **ISO 42001 principle-level** AIMS themes (policy, risk, impact, lifecycle, oversight). → `iso-42001-readiness`
- [ ] **GDPR** basis + notice + minimisation + records for the AI processing. → `regulatory-assurance` (GDPR module)

## 3. Evidence expected (per control)
- [ ] For each SATISFIED claim: a concrete artefact (doc, config, log sample, policy) — provenance-recorded.
- [ ] Gaps classified: SATISFIED / PARTIAL / GAP / EXTERNAL / NOT-VERIFIED (no false satisfaction).
- [ ] EXTERNAL items (KMS, prod monitoring, off-host backup, prod multi-tenant) flagged out-of-scope unless engaged.

## 4. Acceptance criteria (measurable)
- [ ] Every in-scope control has a status + cited evidence or an explicit gap.
- [ ] Remediation plan: each gap → action, owner, dependency, closure criterion.
- [ ] Deliverables produced: readiness dossier + evidence pack + prioritised plan (+ workshops if B2B tier).

## 5. Exclusions / dependencies (state up front)
- [ ] Not a legal opinion; not an accredited audit; no certification issued.
- [ ] Clause-level ISO work depends on licensed standard text (ACCESS currently metadata-only).
- [ ] Production controls EXTERNAL; implementation of fixes excluded unless separately scoped.
- [ ] Findings reflect client-supplied information unless a verification step is scoped.

## 6. Restitution & closure
- [ ] Readout (call/workshop) + written dossier delivered.
- [ ] Pipeline advanced only on real events: PILOT_SIGNED (human signature) → INVOICED → CASHED (`proposal-pipeline`).
- [ ] Invoice carries mandatory FR mentions (SIREN, "EI", "TVA non applicable art. 293 B du CGI" if franchise, B2B penalties + 40 €).
- [ ] Follow-up + satisfaction captured; learnings recorded with provenance.

## 7. Offer tiers (prices HYPOTHESIS until market+CTO validated)
ENTRY diagnostic (€2.5–4k) · B2B multi-framework (€6–18k) · Partnership/white-label (one-off + per-unit). See
`PROPOSAL_EXAMPLES_V1.md`. Each tier = demonstrated capability only; no unproven capability offered.

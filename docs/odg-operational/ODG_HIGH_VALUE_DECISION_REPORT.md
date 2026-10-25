# ODG_HIGH_VALUE_DECISION_REPORT — Private-market revenue, capability proof & roadmap
Date 2026-10-25 · Mission: evidence-based decision dossier (private sector only; public tenders excluded). No purchase, no outreach, no paid generation performed.

## 1. Executive summary & recommendation
ODG has a **genuine, demonstrated technical moat in agent reliability / no-false-success governance (domain B)** and can apply it to **high-volume data/document reconciliation (domain C)** — a large, audit-driven market. This session delivered a **real, reproducible end-to-end proof** (bank/ledger reconciliation + independent verification catching fabricated success, 10/10 tests, €0). ODG also has an evidence-backed **JS→TS migration/reliability** offer with real (unqualified) private leads.
**Recommendation — PRINCIPAL: "Governed, independently-verified automation of a costly finance/back-office process (reconciliation → document processing)."** SECONDARY: JS→TS migration & code-reliability (faster first revenue, crowded). VEILLE: standalone agent-eval platform (domain B product — crowded & well-funded; do not build).
**Binding constraint (both): buyer access + legal/commercial setup are UNPROVEN and HUMAN-gated** — contacts 0, contracts 0, collected €0. The gap is commercial access, not capability.

## 2. Truth Lock
HEAD `28c15a5` ≡ origin/main (0/0); branch `main`; 5 stashes intact; worktree = `ODG_PROJECT_STATE.md` modified + untracked `docs/` dirs. No commit/push/merge/deploy. Film work checkpointed (compass cxx) and untouched.

## 3. ODG capabilities — demonstrated / partial / unproven
Full detail: `ODG_CAPABILITY_BASELINE.md`. **DEMONSTRATED** (offline tests, €0, zero network/LLM): economic-verification (deny-by-default, adversarially confirmed 0 provider loads), mechanical-acceptance (facts-not-claims), autonomy-eval (false-success detection), self-diagnostic, checkpoint/resume, bounded build-recovery (false-success refusal), incident-recurrence, learning-chain (EFFECTIVE), + commercial rails (client-intake 22/22, quote 8/8, invoicing 18/18, payments-reconciler 14/14, finance-sim 15/15, commercial-journey 19/19). **Fresh proof:** reconciliation + independent verification (10/10). **PARTIAL/UNPROVEN:** unstructured-document extraction (OCR/LLM — NOT built), live ERP/bank/e-invoice/SMTP integrations (gated/disabled by design), large-repo migration at scale, economic/acceptance gates are opt-in.

## 4. Comparative study of the three domains
| Criterion | A: Agent automation | B: Reliability/governance | C: High-volume reconciliation/IDP |
|---|---|---|---|
| Demand evidence | high but crowded (ESN, consulting) | high & well-funded (vendors) | large & audit-driven (finance/BFSI) |
| ODG capability | PARTIAL (OSS commoditised) | **STRONG (moat)** | DEMONSTRATED (structured) + gap (unstructured) |
| Competition | very high | very high, VC-funded | high but fragmented; differentiation via governance |
| Buyer access | real leads, unqualified | hard (platform sale) | none yet; reachable via finance ops |
| Differentiation | low | sell as a *feature*, not a product | **governance = the differentiator** |
| First-revenue speed | fast (leads exist) | slow | medium |
**Conclusion:** B is the moat but not a standalone product (crowded/funded); A is fast but low-margin/crowded; **C delivered with B as the differentiator is the highest-value defensible path.**

## 5. Private-market map (dated sources)
- **Agent eval/governance (B):** crowded, funded — Braintrust ($249/mo; $80M Series B Feb-2026), LangSmith ($39/seat), Galileo ($100/mo, Luna models), Arize, Latitude. (arize.com, latitude.so, braintrust.dev, securityboulevard.com)
- **IDP / reconciliation (C):** global ~€2.8–4.3B (2026); **Europe ~€0.9–1.0B**, finance & accounting **38% share**, GDPR/audit-driven. (grandviewresearch.com, marketdataforecast.com, mordorintelligence.com, researchandmarkets.com)
- **AI automation consulting (A, pricing anchor):** FR/EU freelance **€800–1,880/day** (agencies €1,500–2,500); pilots €5–25k; implementations €40–250k; LLM integration £150–200/hr. (satoriml.com, tech-now.io, epinium.com, freelancedesk.online)
- **OSS landscape:** LangGraph, CrewAI, Microsoft Agent Framework — MIT-licensed orchestration (reuse; ODG's edge is the governance layer, not re-building orchestration). (langchain.com, pickaxe.co)

## 6. Competitors, pricing, OSS & gaps
Incumbents in B sell **observability/scoring dashboards**, not **fail-closed independent verification that blocks false success in the execution path** — that is ODG's documented gap-fill. In C, incumbents (UiPath IDP, Rossum, etc.) focus on extraction accuracy; **audit-grade "prove the result is correct, independently" is under-served** — plays to ODG's moat. OSS: reuse LangGraph/CrewAI (MIT) for orchestration; do not reinvent. Gap matrix (ODG-gap → existing-ODG → OSS → adopt-cost → risk → proof) lives in `ODG_CAPABILITY_BASELINE.md`.

## 7. Qualified private opportunities (reconciled from prior ODG runs)
Prior real, read-only collection (2026-10-19/20, HTTP 200 from job boards) produced dated **private-sector signals** (talent-need, NOT confirmed projects, no budgets, no contacts): **HIGH-fit (JS→TS/refactoring):** R&S TELECOM, BLOOMAYS, INSYCO, Sapiens Group, VISIAN, Ikigaï; **MED-fit:** INFOGENE, INOV, Amiltone, Webnet, JEMS, CAT-AMANIA, Reboot Conseil, +others. **Market demand classes (≥€500k gross, MEDIUM conf, NOT verified deals):** IDP (strongest anchor, ~$450–700k yr1 ref), CRA/SBOM compliance, AI-Act/ISO-42001, legacy migration, agentic-AI governance. **Reality:** 0 qualified buyers, 0 contacts — these are leads to validate, not pipeline.

## 8. Principal / secondary / watch — with triggers
- **PRINCIPAL — Governed reconciliation/finance-ops automation (C+B).** Why: large audit-driven market, the no-false-success moat is the differentiator, proven end-to-end this session.
- **SECONDARY — JS→TS migration & code-reliability (A+B).** Why: evidence-backed portfolio + real leads → fastest first revenue; but crowded ESN market, solo-capacity-limited.
- **WATCH — standalone agent-eval platform (B).** Why: crowded/VC-funded; revisit only via a narrow "independent-verification-as-a-service" wedge or a partnership.
- **Change trigger:** if a warm buyer appears for either A or C first, lead with that; if C's extraction step proves too costly/unreliable in a paid PoC, fall back to SECONDARY.

## 9. Offer for the principal domain
**"Reconciliation Assurance"** — a governed pipeline that reconciles two data sources (ledger↔bank, PO↔invoice, system-A↔system-B), classifies every discrepancy, and ships an **independently-verified, audit-traceable report** (no-false-success gate). **Buyer:** finance controller / FP&A / internal audit / shared-services lead. **Problem solved:** slow, error-prone manual reconciliation where a missed discrepancy is costly/regulatory. **Acceptance criteria:** recall of planted/known discrepancies = 1.0, precision high, independent verdict PASS, audit log. **Alternatives:** manual spreadsheets, UiPath/Rossum (extraction-first), in-house scripts. **Proof of value:** the Phase E PoC, re-run on the client's anonymized sample.

## 10. End-to-end proof (independent)
`ODG_END_TO_END_PROOF_REPORT.md` + `proof-reconciliation/`. Positive: 5/5 discrepancies caught, precision 1.0, independent verify PASS, <0.2s, €0. Negative/no-false-success: 10/10 (fail-closed input; hidden/inflated/spurious all rejected; idempotent; no-report⇒FAIL). The verifier even caught a miscomputed ground-truth key (robustness). **Independent verdict: PASS.**

## 11. Failures, causes, corrections
- Ground-truth `expectedMatchedCount` miscomputed (10 vs 12) → verifier FAILED a correct engine output → **corrected** the key (15−3 discrepant = 12) → PASS. Lesson: the no-false-success gate works and must have correct ground truth. (No regression; deterministic re-run green.)

## 12. Revenue model (prudent / central / favorable) — CONDITIONAL
Pricing (anchored to §5, all [EST], no sale made): **Pilot €5–8k** (fixed-scope PoC on anonymized sample) · **Implementation €25–60k** · **Managed €1.5–5k/mo**. Delivery cost: ODG labour + small LLM/OCR per-doc (only if unstructured) + human oversight; reconciliation engine marginal cost ≈ €0.
| Scenario (12 mo) | Qualified leads | Conv. | Signed € | Net (after setup/tax) | Assumptions |
|---|---|---|---|---|---|
| Prudent | 5 | ~20% → 1 pilot | €5–8k | low/≈break-even | cold start, no references |
| Central | 10 | 2 pilots + 1 impl | €40–90k | ≈€30–50k | 1 reference, authorized outreach |
| Favorable | 15 | 3 pilots + 2 impl | €80–150k signed | **delivery capped ≈€49–62k net/yr solo** | needs société + capacity |
**Honest caps:** solo ceiling ≈ €49–62k net/yr (prior ODG finding, tested); **€100k requires a société + added capacity**. Short-term (0–3 mo) realistic revenue = **€0 until buyer access + entity exist**.

## 13. Delivery cost, margin, cash, timeline
Gross margin high on the engine (CPU ≈ €0); variable cost = extraction LLM/OCR (small per-doc) + human acceptance time. Cash: pilots can be deposit-first (30%) to fund delivery. Timeline to first € = **gated by buyer access + legal setup**, not by capability (the PoC is ready now).

## 14. Roadmap (dependency-ordered) — see `ODG_HIGH_VALUE_ROADMAP` section below / compass
G1 (HUMAN) legal entity + invoicing/TVA + RC Pro → G2 (HUMAN) authorize bounded outreach/validation of the §7 leads (or warm intros) → G3 (ODG) extraction front-end PoC (OCR/LLM, small paid budget, separately authorized) + packaging (audit log, SLA) → G4 (ODG) client-sample PoC under NDA → G5 (HUMAN) first signed pilot → G6 (ODG) deliver + independently verify + invoice. ODG can do all non-transacting technical work (discover, build, verify, package); it **cannot transact**.

## 15. Missing capability / CTO decisions
- **CTO decision #1:** choose PRINCIPAL (recommended C+B) vs SECONDARY (A, faster).
- **CTO action:** create legal entity + enable invoicing path; authorize a **bounded outreach/validation** motion (currently forbidden) to qualify the §7 leads; decide a small paid budget for the extraction-PoC step.
- **Missing capability:** unstructured-document extraction (OCR/LLM) — proof needed under a separate paid authorization.

## 16. Risk register & stop conditions
Crowded B market (mitigate: sell governance as a feature, not a platform); no buyer access (mitigate: authorized outreach / partnership); extraction cost/accuracy unknown (mitigate: paid PoC gate); solo capacity cap (mitigate: société + partners); legal/GDPR/liability (HUMAN). **Stop** if a paid PoC shows extraction unreliable, or if no buyer engages after an authorized validation round.

## 17. Files produced (paths, reproduce)
- `docs/odg-operational/ODG_CAPABILITY_BASELINE.md`
- `docs/odg-operational/ODG_HIGH_VALUE_DECISION_REPORT.md` (this file)
- `docs/odg-operational/proof-reconciliation/{gen-fixtures,reconcile,verify-reconciliation,reconcile.test}.mjs`, `{ledger,bank}.csv`, `answer-key.json`, `reconciliation-report.json`, `PROOF_REPORT.md`
- Reproduce proof: `cd docs/odg-operational/proof-reconciliation && node gen-fixtures.mjs && node reconcile.mjs && node verify-reconciliation.mjs && node reconcile.test.mjs`
(Prior artifacts reconciled, not overwritten: ODG_OPPORTUNITY_DETECTOR_RESULTS, ODG_REVENUE_VALIDATION_PREP, ODG_HIGH_REVENUE_ANALYSIS, etc.)

## 18. Compass & next mission
Compass updated with this checkpoint. **Next recommended mission (needs CTO):** decide PRINCIPAL vs SECONDARY, create the legal/invoicing entity, and authorize a bounded outreach/validation of the qualified-lead list — then ODG executes the extraction-PoC + client-sample PoC. **No revenue is claimed; pipeline ≠ cash; contacts 0, contracts 0, collected €0.**

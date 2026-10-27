# ODG — Field execution dossier (V1, 2026-10-27)

Usable without improvised research. Backed by the testable engine `runtime/core/niche-scoring.ts` (`scoreNiche`,
`rankNiches`, `switchDecision`; gated suite 9/9) and wired to `revenue-model` / `pipeline-ledger` / `revenue-dashboard`
/ `launch-budget`. **€0, no outreach sent, no company/contact/budget invented.** Niche scores are **HYPOTHESIS** inputs
(1–5) grounded in cited facts; real prospect targets must be populated from public sources before any contact.

## 1. Multi-niche matrix (scored, HYPOTHESIS — re-score with real signals)
Criteria (1–5, weighted): urgency, public-need-signal, budget, decision-maker-access, time-to-cash, contract-value,
delivery-capacity, acquisition-cost/risk, reference/recurrence. Scores below are ODG's initial hypothesis; cited where a
public fact supports the signal.

| niche | key cited driver | score rationale (HYPOTHESIS) | initial rank |
|---|---|---|---|
| **B — AI governance / ISO 42001 / agent security** | EU AI Act Annex-III **2027-12-02**, GPAI enf. 2026-08-02 (ec.europa.eu); OWASP ASI 2026 | highest urgency + ODG's demonstrable OWASP-ASI differentiator + recurring runway | **1** |
| **A — Cybersecurity / ISO 27001 readiness** | Bpifrance Diag Cyber €4,400 net/50% (francenum.gouv.fr); ANSSI guides | strong public need + funding ecosystem; more competitors | 2 |
| **D — Partners / integrators / white-label** | — | high leverage but needs signed partners (slow) | 3 |
| **C — Automation / reliability** | — | real but diffuse urgency, weaker trust-pull | 4 |
| **E — Verticals (industry/construction/transport/finance)** | DORA only for financial entities (EUR-Lex) | finance=DORA-gated+heavy; others require vertical proof first | 5 (later) |
| **F — research-discovered** | — | keep open; re-score on evidence | n/a |
Ranking is reproduced deterministically by `rankNiches`. **Re-score from observed signals — do not treat this as validated demand.**

## 2. First-targets METHOD (no invented companies)
Build a **real** list from PUBLIC legal sources: company registries, public job posts mentioning "LLM/AI agent",
conference/community member pages, public tender portals (for A). For each, record **URL, verification date, targeting
reason, confidence**. Identify decision-maker *function* only where legally public. **ODG does not invent identities,
needs, budgets or contacts; no contact without CTO authorisation.** (This dossier intentionally contains **no** real
company names — they must be sourced + verified at execution, then stored with provenance.)

## 3. Field kit — priority niches B and A
**Value proposition (B):** "Prepare your LLM-agent product for AI-Act + customer security reviews with a reproducible
OWASP-ASI-mapped governance + readiness dossier — in weeks, not a consultancy quarter."
- **Entry offer (HYPOTHESIS €2.5–4k):** scoped readiness assessment + agent-security review + remediation plan.
- **Higher-value (HYPOTHESIS €6–18k):** multi-framework (AI-Act role + GDPR + ISO-principle) + evidence pack + follow-up.
- **30-sec pitch:** "We run a governed assessment that produces the security + AI-governance evidence your enterprise
  buyers and the AI-Act will ask for — reproducible, honest about gaps, not a certification claim."
- **First-call script:** confirm they ship an LLM agent → ask about upcoming security reviews / AI-Act exposure → offer
  a short scoped pilot + a live demo on a synthetic profile → qualify budget/decision-maker/timeline.
- **Written message:** see `SALES_KIT_V1.md` §6 (synthetic placeholders, UNSENT).
- **Discovery questions:** `SALES_KIT_V1.md` §5. **Objections/answers:** `SALES_KIT_V1.md` §4 (honest: not certified).
- **Qualify:** EU, ships an LLM agent, security-review/AI-Act pressure, reachable decision-maker, plausible €-budget.
  **Disqualify (for now):** bank/regulated-heavy (DORA), requires production SaaS hosting today, no budget.
- **Demo + trust:** `demo-dossier` live render + `ISO_READINESS_ODG_V1.md` (ODG's own posture) + trust dossier (GTM §AXE4).
- **Proposal + contract:** pilot template `SALES_KIT_V1.md` §3 **[LEGAL REVIEW REQUIRED]**.
- **Signature → invoice → cash → follow-up:** tracked in `pipeline-ledger` (signed≠invoiced≠cashed, fail-closed).
(Niche A field kit mirrors this with ISO-27001-readiness framing + the Bpifrance Diag Cyber funding angle; same scripts/objections.)

## 4. A/B/C/D switch engine (pre-set thresholds — `switchDecision`)
Fix BEFORE testing: **hypothesis, sample (e.g. minSample 20), max cost (€0 outreach), expected signals, success
threshold (e.g. ≥3 meetings or ≥1 signed), stop rate (e.g. qualified-reply < 10%)**.
- **A:** best niche+offer (currently B). **B:** adjust scope/price/segment/problem. **C:** partner/white-label or new
  channel. **D:** activate another niche/model.
- Rules (enforced in code): **never switch on a single refusal / too-small sample (HOLD_A)**; success met ⇒ **STAY_A**;
  signal present but no success ⇒ **CONTINUE_A** (refine); below stop rate after a full sample ⇒ escalate **B→C→D**.

## 5. €500k linkage (no double-count)
`revenue-model` (contracts×value + recurring) → `pipeline-ledger` (real signed/invoiced/cashed) → `revenue-dashboard`
(gap vs €500k, currently **NO_DATA ⇒ gap = full €500k**) → `launch-budget` (€10k cap / €5k reserve / stop-threshold).
Scenarios (prudent/central/ambitious) in `REVENUE_500K_PLAN_V1.md`; €500k-scale delivery may need subcontracting ⇒ a
separate budget authorisation. **Arithmetic possibility ≠ demonstrated probability.**

## 6. Remaining gaps / human decisions
Real verified prospect list (sourcing method ready; not yet populated); **authorise first outreach send + legal review**
(pilot/pricing/white-label); choose A/B/C/D emphasis; ISO text for clause-level work (free AFNOR/ANS eligibility TBV else
purchase); any spend; EXTERNAL production + certification deps. **The field kit is usable now; the missing piece is a
human go on contacting real, sourced prospects.**

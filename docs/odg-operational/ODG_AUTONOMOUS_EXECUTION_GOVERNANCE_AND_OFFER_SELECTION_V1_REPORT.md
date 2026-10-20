# ODG_AUTONOMOUS_EXECUTION_GOVERNANCE_AND_OFFER_SELECTION_V1 — Consolidated Report

**Attempt ID:** `AUTO_EXEC_GOV_OFFER_V1#2026-10-20` (first attempt). **Date:** 2026-10-20.
**Verdict:** LOT A **DONE (rule enforced in code)** · LOT B **DONE (audit + guards)** · LOT C **INSUFFICIENT_EVIDENCE** (ranked) · overall **PASS WITH BLOCKERS**.
No contact/spend/signature. Contacts/contracts = **0**.

## 1. Truth Lock & commits
Entry HEAD `fbdd910` (code `4fef731`), branch `main` synced, worktree clean, **5 stashes intact**, protected paths untouched. Commits: see tail.

## LOT A — Canonical rules modified + enforcing mechanism
**Rule (permanent), inscribed in `docs/odg-operational/ODG_MASTER_ROADMAP.md` §Z:**
1. ODG executes end-to-end everything it can technically+legally in scope. 2. ODG's work is never imputed to the CTO. 3. The CTO only does genuinely-human steps (authorization/approval/reserved-decision/signature/legal). 4. ODG flags automatable work needlessly left to a human. 5. Mandatory controls stay priority — the rule never bypasses an obligation (fail-safe to HUMAN on doubt).
**Enforced in code (not only documented):**
- NEW `runtime/core/autonomous-execution-policy.{js,ts}` — `classifyStep` (ODG | HUMAN | EXTERNAL_GATED, reusing `nl-objective-gateway.classifyObjective`; explicit `mandatory` ⇒ always HUMAN; empty/unclassifiable ⇒ HUMAN fail-safe) + `auditImputation` (time split + rule-4 `AUTOMATABLE_LEFT_TO_HUMAN` flags). No new classifier, no tenth primitive, no `runtime/governance/**` change.
- WIRED INTO `runtime/core/unit-economics.{js,ts}`: a per-step breakdown makes the policy **authoritative** — ODG-automatable work is costed as ODG's, the CTO's time is costed ONLY for genuinely-human steps, and mis-imputed human time is surfaced in warnings. The rule is therefore applied automatically by the economic calculator.

## LOT A — Tests proving the autonomous/residual-human distinction
- `autonomous-execution-policy.test.ts` (7): internal⇒ODG; requiresHuman⇒HUMAN; external⇒EXTERNAL_GATED; mandatory signature never downgraded; empty⇒HUMAN fail-safe; `auditImputation` flags automatable-left-to-human + splits time; JS/TS parity.
- `unit-economics.test.ts` (11) case 8: with a step breakdown, ODG steps (gen pack, verify) are NOT charged as human; only the signature is residual-human; a pack-generation step imputed to a human is FLAGGED and excluded from human time.
- Independent verification: on the worked €8,500 breakdown the module classified the 3 generation/verification steps as ODG (180 min) and only the signature as residual-human (60 min) — the CTO is costed for 1 h, not 4 h.

## LOT B — Audit of the €8,500 example (included / missing / unmeasured)
Re-run through the policy-enforced calculator:
| Component | Value | In contribution margin? | Basis |
|---|---|---|---|
| Sale price | €8,500.00 | + | hypothesis (no market validation) |
| Direct costs (compute/API €40 + tooling €10) | €50.00 | − | ESTIMATED |
| ODG active marginal (3 h @ €5/h) | €15.00 | − | ESTIMATED rate |
| **Contribution margin** | **€8,435.00** | = price − direct − ODG marginal | derived |
| Residual human (1 h signature @ €80/h) | €80.00 | reported SEPARATELY | ESTIMATED |
| Margin incl. human | €8,355.00 | − residual human | derived |

**What €8,435 INCLUDES:** price, direct compute/tooling, ODG marginal compute (not free). **What it does NOT include (so it is CONTRIBUTION, not NET PROFIT):** fixed-cost allocation (legal entity, RC-Pro insurance, accounting), **client-acquisition cost (CAC)**, rework/revision rounds, income tax + social charges on profit, VAT. **True net profit per engagement is therefore LOWER and currently UNKNOWN.** **Unmeasured:** every duration, both €/h rates, and the €8,500 price itself (no demonstrated demand across three missions). **Capacity** (4/day, human-gated; ODG alone could do 10/day) is derived from ESTIMATED durations ⇒ flagged `CAPACITY_UNPROVEN`, not a demonstrated SLA.
**Guards added (prevent the dishonest versions):** `OMITTED_COST` (a direct cost with no finite amount is flagged, never silent €0); `CAPACITY_UNPROVEN` (capacity from non-MEASURED durations); `AUTOMATABLE_LEFT_TO_HUMAN` (fictional human time); no-double-count (residual human subtracted exactly once, never also in direct costs) — all locked by `unit-economics.test.ts` cases 8–11. **Conclusion: the margin is NOT accepted as validated — the test passing proves the arithmetic, not the market.**

## LOT C — B2B offer ranking (evidence-based)
| Rank | Offer | ODG can deliver end-to-end? | Competition / differentiation | Demand evidence | Verdict |
|---|---|---|---|---|---|
| 1 | **Senior JS→TS migration / code-reliability service** | **YES** — demonstrated this very session (dual-port migration, tests, parity, autonomous execution with low residual-human) | ESN/freelance market; ODG's differentiator = autonomous execution ⇒ high margin/human-hour (LOT B) | chosen in `ODG_100K_REVENUE_ENGINE` on market research; **demand NOT validated** (Phase-3 outreach gated) | best ODG-fit; demand unproven |
| 2 | **CRA/SBOM technical evidence prep** | partial (produces SBOM+attestation) | **commoditized** by free CNCF Sigstore/cosign + incumbents (FOSSA/Finite State/ONEKEY) ship signed CRA packages | regulatory need-class only; **0 qualified buyers** (prior 2 missions) | WEAKENED |
| 3 | **EU AI-Act technical readiness prep** | **NO** — Annex IV needs ML-domain deliverables (bias assessment, dataset protocols, performance metrics) ODG cannot produce | crowded (Openlayer, sota.io, eicra…) + **Art 11(8) free EC simplified form for SMEs** undercuts willingness to pay | regulatory deadline only; no buyer signal | WORST fit |
Sources (consulted 2026-10-20): AI-Act Annex IV / Art 11(8) — ai-act-law.eu, openlayer.com, sota.io; CRA/Sigstore landscape — prior mission (fossa.com/partners, sbomify FAQ, finitestate.io). Evidence levels: #1 prior-mission research (MED); #2 primary-verified (HIGH) that it's commoditized; #3 primary-verified (HIGH) that ODG cannot deliver + free SME relief.

## LOT C — Recommendation (single) / blockage
**No offer has demonstrated willingness-to-pay ODG** — a regulatory obligation is not proof a client pays. Therefore the next *commercial* step is **INSUFFICIENT_EVIDENCE** to commit a priced experiment now. **Evidence-based single recommendation for a FUTURE CTO-gated step:** if any commercial experiment is authorized, prioritize **#1 (TS-migration/reliability)** — it is the only offer ODG can deliver end-to-end and where the autonomous-execution margin advantage is real; the experiment would be a **demand-validation** step (not a sale), which requires a human/legal + outreach decision that is **out of scope here**. Do NOT pursue provenance-as-a-product (prior verdict WEAKENED) or AI-Act Annex IV (ODG cannot deliver it).

## LOT D — Validation, metrics, learning
- Targeted tests: policy 7/7, unit-economics 11/11; tsc 0 across strict+dist+leaves; JS/TS parity on both dual modules. Full `npm test` run as the integration gate (result in tail).
- Independent verification: the policy demonstrably changes the economics (CTO costed for 1 h not 4 h on the €8,500 breakdown; automatable-left-to-human flagged) — proven by the worked run + case 8.
- Metrics: web sources consulted this mission = **1** (AI-Act); new modules = 1 (policy) + 1 modified (unit-economics); tests added = 7 + 4; contacts/contracts = 0.
- Learning (`learning-chain` = PERSISTED; **NOT EFFECTIVE** — the rule is newly enforced but no measured before/after *commercial* improvement): *"The autonomous-execution rule is now enforced in the economic calculator (CTO time only for genuinely-human steps); the €8,500 figure is a contribution margin under all-estimated inputs, not validated profit; across three missions no B2B offer shows demonstrated demand, and ODG's best-fit offer is TS-migration, not compliance."*

## Verdict
- **LOT A: DONE** — rule permanent (roadmap §Z) AND executable (policy module wired into unit-economics; tests prove the distinction).
- **LOT B: DONE** — €8,500 audited (contribution ≠ net profit; missing CAC/fixed/tax; all unmeasured); guards added against double-count/omitted-cost/fictional-human/unproven-capacity.
- **LOT C: INSUFFICIENT_EVIDENCE** — no offer has demonstrated demand; ranked analysis recommends TS-migration as the single best candidate for a future CTO-gated demand-validation experiment.
- **Overall: PASS WITH BLOCKERS** (blocker: commercial demand unproven; any real experiment needs a CTO/legal/outreach decision).

**STOP.** No prospection, no contact, no automatic next mission.

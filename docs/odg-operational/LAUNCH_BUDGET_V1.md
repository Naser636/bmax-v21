# ODG — Launch budget & 12-month cash plan (V1, 2026-10-27)

Enforced by the testable model `runtime/core/launch-budget.ts` (`cashBudget`, `breakEvenPilots`; gated suite 8/8), not
by prose. **No spend authorised; every euro figure is an ESTIMATE the CTO confirms via a real quote (TBV), or a
HYPOTHESIS.** Hard rule (modelled, fail-closed): **global cap €10,000**; **protected reserve €5,000**; founder pay €0
for the first 4 months (assumption). A plan over the cap is **refused by computation**; a plan that drops cash below
the reserve floor raises a **stop-spending signal**.

## Cap discipline (modelled — FACT of the model)
| scenario | initial spend | reserve left | cap ok? | reserve floor (€5k) ok? | admitted? |
|---|---|---|---|---|---|
| **Prudent** | €5,000 | €5,000 | yes | **yes** | yes |
| €7k alternative (option, NOT an authorisation) | €7,000 | **€3,000** | yes | **NO (floor breached)** | yes but flagged |
| Over-cap | >€10,000 | — | **no** | — | **REFUSED (fail-closed)** |
The €7k option is explicitly shown to leave only **€3,000** reserve (< €5,000 floor) — a consequence, not a plan.

## Recurring / fixed cost lines (ESTIMATES — confirm via quotes; sources official where cited)
| line | status | note (sourced 2026-10-27) |
|---|---|---|
| Company registration | **FACT (€0)** | **micro-entrepreneur immatriculation = gratuite** (bpifrance-creation.fr, economie.gouv.fr); SASU = paid + publication/advice fees |
| Legal form | **DECISION (human)** | micro-entreprise = simplest, €0 entry, **services ceiling €83,600** (2026); SASU = more deductions/evolution, costs more |
| Pro bank account | **ESTIMATE/TBV** | official per-month tariff not published on gov sources — obtain quotes |
| Accounting | **ESTIMATE/TBV** | micro = light obligations (possibly self-done); SASU = accountant recommended — quote |
| RC Pro insurance | **ESTIMATE/TBV** | depends on activity/turnover — obtain quotes |
| Domain/email/tooling | **ESTIMATE/TBV** | can be kept near-€0 initially |
URSSAF social contributions apply on **collected** turnover (micro) — to confirm with the official simulator
(mon-entreprise.urssaf.fr). **None of these are paid or committed; all are inputs to the model.**

## 12-month cash scenarios (model inputs = HYPOTHESIS; run via cashBudget)
- **No-sale (stress):** opening €5,000, modest monthly fixed ⇒ the model fires the **stop-spending signal** before the
  reserve is consumed and reports a finite runway. Action if reached: **halt discretionary spend, keep reserve**.
- **Prudent:** a few paid pilots (€2.5–4k each, GTM hypothesis) cover costs; break-even ≈ **2 pilots at €3k** to cover a
  €5k cost base (`breakEvenPilots(5000, 3000) = 2`).
- **Central/favourable:** see `GO_TO_MARKET_V1.md` (not re-asserted as validated).

## Working-capital & payment-timing (HYPOTHESIS)
Service delivery is labour (ODG time) ⇒ variable cash cost ≈ €0 external; the main working-capital risk is **payment
delay** between pilot delivery and cash-in — mitigate with **deposit-on-start** terms in the pilot template
(`SALES_KIT_V1.md`, **[LEGAL REVIEW REQUIRED]**).

## Stop / re-orient thresholds (modelled)
- cash < reserve floor ⇒ **stop discretionary spend** (model: `stopMonth`).
- cash < 0 within horizon ⇒ runway exhausted ⇒ **re-orient / pause** (model: `runwayMonths`).
- no qualified commercial signal after the authorised first outreach batch ⇒ **revisit segment/offer** before any spend.

## Human decisions (grouped — none taken)
Choose legal form (micro vs SASU); obtain + approve quotes (bank/accounting/insurance); authorise any spend within the
€10k cap (reserve €5k protected); confirm URSSAF/tax figures via the official simulator. **ODG commits nothing.**

# ODG Opportunity Portfolio — V2 (2026-10-26, budget €0)

Value-first comparative portfolio. Budget €0 (public sources + existing tools only; no paid call, no outreach).
Labels: `FAIT VÉRIFIÉ` / `OBSERVATION` (sourced, dated) / `ESTIMATION` / `HYPOTHÈSE` / `INCONNU`. Grounded ONLY in
capabilities ODG actually has (license-policy, supply-chain-attest/SBOM, governed patch-executor + validation-engine
+ evidence-provenance, unit-economics). Nothing invented; large market ≠ accessible market.

## §8 Discovery-method correction (measured, no generic code added)
V1's low discovery-relevance cause = **naive GitHub full-text query** (returned popular generic repos). Fix this cycle
= **targeted market research via WebSearch/WebFetch on market-specific questions** (competitors + published pricing +
demand). Measured gain: **0 relevant candidates (V1) → 4 sourced candidates with real pricing (V2)**. Cause corrected
at the method level (§2.5/§8 — not a generic code layer).

## Comparative candidates (sourced, dated 2026-10-26)
### C1 — Autonomous automated code-audit SERVICE (SMB entry tier)  ★ top risk-adjusted
- Need/segment: SMBs/startups wanting affordable code/security audits (OBSERVATION: "strong 2026 demand, esp. smaller
  companies seeking affordable entry-level"). Accessible, small-scale (§4E).
- Market pricing (OBSERVATION): automated scan <$1,300 (24-72h); entry fixed **$49-$1,500**; senior review $1,300-5,000;
  freelance $100-250/h / from €2,500.
- Competitors/alternatives: automated-scan tools, freelance auditors, audit firms (boutique $35-95k, Big Four
  $50-250k) — none profitably serve the $49-$500 tier with humans.
- ODG differentiation: delivers autonomously ⇒ **near-zero marginal cost** at a price tier humans can't profitably
  serve; governed patch-executor + validation-engine + evidence = audit-grade traceable findings.
- Economics (§5, prices OBSERVATION, costs HYPOTHÈSE): contribution margin €84/€289/€994 at $99/$299/$999; break-even
  ~6 audits/mo on ~€1,500 fixed. **Binding unknown = CAC + validated demand (INCONNU).**
- Feasibility: **HIGH** — ODG already produces real audit findings (FAIT VÉRIFIÉ: it found+fixed DEF-010 TOCTOU this
  very program). Technical capacity present.
- Risks: acquisition/demand unproven; credibility vs firms; liability/scope; quality variance on unseen codebases.
- Next experiment (defined, CTO-gated): list a $99 fixed automated audit on a dev marketplace + measure inquiry/
  conversion. **Cannot execute at €0 — needs CTO outreach/listing authorization.**

### C2 — AI code-review SaaS (governed autonomous FIX + evidence)
- Pricing (OBSERVATION): CodeRabbit $24/dev/mo (annual)/$30 mo; Greptile $30/seat (credits); Qodo ~$30/user.
- Demand: HIGH (hot category). Competitors: well-funded, fast (CodeRabbit/Greptile/Qodo/Copilot).
- ODG differentiation: governed autonomous FIX (not just review) + evidence/verification. Real but incremental vs
  funded incumbents.
- Feasibility: **LOW now** — needs a product, GHA/IDE integration, GTM, scale to beat incumbents. Capital HIGH.
- Label: potential HIGH, accessibility LOW at present.

### C3 — SCA / license + SBOM compliance SaaS (license-policy + supply-chain-attest)
- Pricing (OBSERVATION): Snyk free/$25/dev/mo; FOSSA free/from $20/project/mo; Mend up to $1,000/dev/yr.
- Market: MATURE, **free tiers + strong incumbents** (Snyk/FOSSA/Mend/Black Duck) ⇒ commoditized at low end.
- ODG position: nascent (license-policy is new; SBOM exists) ⇒ **weak differentiation**. Accessibility LOW.

### C4 — AI agent governance / eval / audit (ODG's deepest moat: evidence-gated, no-false-success harness)
- Pricing (OBSERVATION): eval $30-$249/mo (Langfuse/Arize/Braintrust/Confident AI); governance Arthur $0-IBM
  $6,450/mo; Datadog LLM-Obs $20-100K/yr. Enterprise ceiling HIGH.
- Market: **90+ vendors, consolidating** (Cisco→Galileo→Splunk, Apr 2026) ⇒ crowded + M&A.
- ODG differentiation: genuinely strong (fail-closed, evidence-gated, no-false-success verification) — but it's an
  internal runtime, not a product; no GTM; enterprise sales = long cycle.
- Label: highest CEILING + strongest tech moat, but feasibility LOW now (product + enterprise GTM + funding).

## §6 Risk-adjusted ranking (per-dimension, L/M/H; not hidden behind an average)
| Dim | C1 audit-service | C2 code-review | C3 SCA | C4 agent-gov |
|---|---|---|---|---|
| 1 Economic potential | M (per-job, volume-bound) | H | M | **H** (enterprise) |
| 2 Evidence strength | **H** (demand+pricing sourced) | H | H | H |
| 3 Identifiable demand | **H** | H | M | M (crowded) |
| 4 Feasibility (ODG now) | **H** (does it today) | L | L | L |
| 5 Competitive advantage | **H** (cost structure) | M | L | **H** (moat) |
| 6 Time-to-validation | **short** (a listing) | long | long | long |
| 7 Capital needed | **low** | high | med | high |
| 8 Risk / reversibility | **low** (service) | high | med | high |
| 9 Fit with current means | **H** | M | M | M |
| 10 Growth potential | M | H | M | **H** |
**Verdict:** **C1 is the best RISK-ADJUSTED candidate NOW** — not because it's cheap, but because it uniquely combines
documented demand + feasibility-today + a real cost-structure moat + low capital/risk + short time-to-validation. **C4
has the highest ceiling + the strongest moat but is gated on product+GTM+funding** (a longer-horizon bet worth
tracking). C2 potential-high/accessibility-low; C3 weakest (commoditized).

## §7 Experiments
- FEASIBILITY (C1): **PROVEN** (`RÉSULTAT EXPÉRIMENTAL`) — ODG produced a real audit-grade finding (DEF-010 TOCTOU,
  found+fixed+tested this program). It can generate credible automated audit deliverables at ~€0 marginal cost.
- DEMAND (C1): **NOT validated** — defined test (marketplace listing + inquiry/conversion) requires CTO outreach/
  listing authorization; `INCONNU` until run. Not simulated, not claimed.

## §11 Negatives / unknowns / external blocks
- No market/revenue/clients claimed; all unit economics rest on HYPOTHÈSE costs + INCONNU acquisition.
- All four product-markets (C2/C3/C4) are crowded with funded incumbents + free tiers — honest: no uncontested win.
- Demand validation, any outreach/listing, paid experiments = **CTO-gated** (budget €0; no contact authorization).
- WebSearch is US-only + summarized; figures are OBSERVATION from secondary comparison pages, not vendor-of-record
  contracts — re-verify on vendor pricing pages before any decision.

## Most important next decisions (for CTO)
1. **C1 demand test:** authorize a single low-risk listing (e.g. $99 fixed automated audit) + inquiry measurement —
   the one experiment that would move C1 from feasibility-proven to demand-validated. (Needs outreach authorization.)
2. **C4 watch:** track the consolidating agent-governance market; ODG's evidence-gate moat is real but needs a
   product+GTM decision + capital — not a €0 move.
3. No action warranted on C3 (commoditized); C2 only with a funded GTM commitment.

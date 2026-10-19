# ODG_100K_REVENUE_ENGINE — business roadmap (subordinate, non-protected)

> Dedicated commercial roadmap. Subordinate to Master/Constitution/`ROADMAP.json`. Revenue-creation campaign.
> **Nothing here is a sale, a client, or collected cash.** Tags: **[FACT]** sourced · **[EST]** estimation ·
> **[HYP]** hypothesis to test · **[UNK]** unknown. All € figures are ESTIMATIONS conditional on assumptions.

## 0. Truth Lock (entry) — 2026-10-19
Host `vps-6d919042` · `main` · HEAD=origin/main `2656c08` (verified) · worktree clean · 5 stashes intact · no
protected path touched. Research capability: **web search OPERATIONAL** (real, dated, multi-source — verified
live). ODG's *own* external egress stays gated/BLOCKED; this market research was executed by the bounded provider
(Claude Code) as a delegated read-only task, ODG retains the decision.

## 1. Market research (sources consulted 2026-10-19)
- **Freelance TS/Node day-rate (TJM), France 2026 [FACT]:** median ≈ 510–575 €/j; senior (6+ ans) 700–900 €/j;
  Next.js/TS/SSR premium 650–800 €/j. Paris ~595 €/j. Sources: Malt baromètre Node.js, lefreelance.fr, tjmetre.fr,
  codeur.com, meaflow (consultés 2026-10-19).
- **TS-migration / legacy modernisation demand 2026 [FACT]:** teams actively budgeting JS→TS migration; TS 7
  (native, ~10× faster) GA mid-2026 = upgrade trigger; explicit consulting wedge ("a consultant who's done this
  10+ times finishes in half the time, fewer regressions"). Sources: eduonix (2026-09), webgeneration.agency,
  codeminer, technspire (consultés 2026-10-19).
- **Niche saturation (France-specific productized migration offers) [HYP]:** search surfaced generic guides, few
  France-specific *productized* migration/reliability services → differentiation opening (to test, not proven).
- **Liquid freelance demand [FACT]:** active TS/Node mission boards (free-work.com) — a cash-floor channel exists.
- **[UNK]:** real per-lead conversion, our actual close rate, exact collectable pipeline — require real outreach
  (human-authorized) to measure. Not assumed.

## 2. Opportunities compared (ODG criteria: time-to-paid · urgency · willingness-to-pay · differentiation ·
margin · CAC · recurrence · regulatory risk · fit with PROVEN ODG capability)
| Opportunity | Time-to-paid | Differentiation | Margin | CAC | Fit (proven) | Verdict |
|---|---|---|---|---|---|---|
| **A. Productized senior TS migration + reliability/observability** | short–med | HIGH (repo = parity-proven full runtime migration) | high (service) | med (targeted outreach) | **HIGH** | **CHOSEN (primary)** |
| B. Generic senior freelance TS/Node | short | low (commodity) | high | low (platforms) | HIGH | **Fallback / cash-floor** |
| C. "AI autonomous maintenance" SaaS | long | crowded/hype | unknown | high | med | Rejected (slow, unproven) |
| D. Large public/private tenders (≥€500k) | long | needs refs/credentials ODG lacks | high | high | low | Deferred (slow cycle) |

## 3. ODG decision (autonomous, evidence-based)
**Primary: productized senior TypeScript/Node migration + reliability/observability service** — fixed-scope
outcome packages for French + remote-EU scale-ups/SMEs with JS tech debt. **Wedge:** "JS→TS migration + CI/
observability hardening, parity-proven zero-regression, by someone who migrated an entire runtime." Grounded in a
**real, demonstrable portfolio in this repo** (dual-port migration, parity harnesses, recovery, SLO/observability).
**Fallback:** generic senior freelance (liquid demand) as a cash floor while the productized pipeline ramps.
Invalidated if: no demand signal from real outreach, or close rate too low to beat the freelance floor.

## 4. Financial objective — metrics kept DISTINCT (never conflated)
CA facturé ≠ CA encaissé ≠ marge brute ≠ résultat net ≠ trésorerie ≠ revenu perso net. Modeled with the
`runtime/core/revenue-model.{ts,js}` tool (pure, 5/5 tested — outputs are ESTIMATIONS of inputs, no fabricated
revenue). Scenarios toward **100 000 € CA facturé / ~12 mois** (TJM from §1):
| Scénario | TJM | jours | CA facturé [EST] | net avant IR [EST] | 100k CA ? | dépasse plafond micro ? |
|---|---|---|---|---|---|---|
| Prudent (ramp, micro) | 550 | 120 | 66 000 € | ≈ 48 820 € | non | non (micro OK) |
| Central (productisé, société) | 670 | 150 | 100 500 € | ≈ 49 275 € | **oui** | **oui ⇒ société requise** |
| Favorable (pkgs premium + retainer) | 800 | 160 | 128 000 € | ≈ 62 400 € | oui | oui |

**Honnêteté clé [EST/FACT]:** 100 k€ **CA** à pleine utilisation senior est crédible ; **le revenu perso net
≈ 49–62 k€, PAS 100 k€** ; et 100 k€ CA **dépasse le plafond micro-entreprise BNC ≈ 77 700 € (2026)** ⇒ exige une
société (EURL/SASU) = **décision humaine/juridique + coût**. Confiance: capacité à LIVRER = HAUTE (prouvée) ;
contrainte liante = **acquisition** (clients payants), MED-LOW en confiance, dépend d'actions humaines autorisées.
Aucune date garantie.

## 5. First offer (minimal, sellable — spec only; not published)
- **Cible:** CTO/lead d'une scale-up/SME FR/EU (10–80 devs) avec dette JS + envie TS/CI fiable.
- **Problème→résultat:** migration JS→TS incrémentale sans régression + garde-fous parité/CI/observabilité.
- **Paquet 1 "Audit + plan de migration" (fixe, court):** diagnostic dette + plan incrémental + quick-wins.
- **Paquet 2 "Migration pilote d'un module + harnais parité":** valeur prouvée sur un périmètre borné.
- **Paquet 3 "Accompagnement récurrent" (retainer mensuel):** récurrence de revenu.
- **Prix [EST]:** indexés TJM senior (§1) ; fixés par paquet, pas à l'heure. Marge service élevée (coût ≈ temps).
- **Preuve de valeur:** le portfolio repo (migration runtime parité-prouvée) — démontrable en privé.
- **Livraison/support/remboursement:** périmètre+exclusions écrits ; jalons ; politique de reprise.

## 6. Demand-test & validation gates (honest — interest ≠ sale)
Gate ladder, each a DISTINCT proof: `INTÉRÊT` (réponse) → `INTENTION` (appel/brief) → `ENGAGEMENT` (devis signé) →
`FACTURÉ` → **`ENCAISSÉ`** (seule preuve de revenu). No "validation" claimed on clicks/replies/leads.
Répétabilité ≠ 1 vente : exige plusieurs résultats mesurés + marges positives + capacité de livraison démontrée.

## 7. Work executed this phase (€0, reversible, private)
- Market research (sourced, dated) — above.
- `runtime/core/revenue-model.{ts,js}` + test (pure rentability calculator, §6.C) — committed.
- This roadmap + opportunity decision — committed. No outreach, no publish, no spend.

## 8. Blocks requiring human/CTO authorization (prepared, not crossed)
- **Legal entity** (micro vs EURL/SASU; société mandatory for >77.7k CA) — decision + cost. [BLOCKED-human]
- **Real prospect outreach at scale** (emails/DMs) + any **personal-data processing** (RGPD base) — [BLOCKED-human]
- **Publishing** a site/offer/landing page (no public exposure without authorization) — [BLOCKED-human]
- **Any spend** (ads, platform fees, subscriptions) — €0 discretionary budget until confirmed — [BLOCKED-human]
- **Invoicing/collection/contract signature** in the CTO's name — [BLOCKED-human]

## 9. Next mission (ODG-selected, autonomous, €0)
Build the private sales materials for Paquet 1–2 (one-page offer spec + a prospection message *template*, unsent;
reuse the commercial-OS `quote`/`invoicing` modules to draft an example devis on FICTITIOUS data) and a private
portfolio/proof sheet drawn from the repo's real migration evidence. All private, reversible, no spend — then
present the outreach/legal/publish decisions (§8) to the CTO with costs/benefits/risks for a GO.

# HIGH_TICKET_ENTERPRISE_CONTRACT_ENGINE V1 — analysis & plan (sourced, private)

> **PRIVATE. No spend/contact/publish/signature.** Tags **[FACT]** sourced · **[EST]** · **[HYP]** · **[UNK]**.
> Dated **2026-10-19/20**. Signé ≠ facturé ≠ encaissé ≠ bénéfice ≠ récurrent. No invented budget/client/revenue.

## 1. Models vs reality
- **A** 2×50 k€/mois · **B** 3 clients→100 k€/mois · **C** 100 k€/10 j (~3 M€/an).
- **[FACT] Fractional/transformation retainer Europe 2026 = 4–12 k€/mois** (2 j/sem 8,6–19,7 k€) — 941consulting,
  highcircl, madgrowth. ⇒ **50 k€/mois pour UN client = 2,5–5× le haut de marché** : crédible seulement en
  programme de transformation quasi-plein-temps **value-priced** OU bundle avec sous-traitants. **Capacité solo =
  ~1 engagement premium** (≈10–20 k€/mois). 2–3 clients à 50 k€ ⇒ **plusieurs ETP** ⇒ capacité dépassée (prouvé
  `revenue-model.targetPlan`). **C (10 j)** incompatible avec le rythme d'encaissement retainer ET marché public.

## 2. Verified high-value opportunities (public sources, dated 2026)
Canal le plus **vérifiable** = marchés publics (BOAMP, acheteur identifié, budget publié, process officiel).
**[FACT]** 403 appels d'offres IT ouverts (349 FR / 54 BE), 130 clôturant ≤10 j (tendolio, 2026-10-19). Exemples réels :
| # | Acheteur | Objet | Budget publié | Échéance | Grade (§3) |
|---|---|---|---|---|---|
| 1 | CD Yvelines | TMA Microsoft CRM Dynamics | **250 k€/an max** | — | B |
| 2 | Min. Intérieur | AMO denrées+logiciels | **245 k€ HT** | 22/06 | B |
| 3 | (accord-cadre) | TMA BackOffice | **32,5 M€ max** (multi-fournisseurs) | — | B |
| 4 | Smals (BE) | Outil collaboratif prototypage | **2,4 M€ HT** | J-58 | B |
| 5 | Paris Habitat | Plateforme SIG (SaaS) | n.c. | J-25 | C |
| 6 | GRANDLYON | Solution IAM SaaS | n.c. | J-18 | C |
| 7 | Bordeaux Métropole Énergies | Cybersécu managée SOC/EDR | n.c. | J-7 | C |
Source: francemarches.com, tendolio.com, centraledesmarches.com (consultés 2026-10-19). Grades via
`runtime/core/enterprise-lead-grade` (A/B/C/REJECTED — budget publié ≠ confirmé ; cible ≠ acheteur acquis).
**Barrière honnête [FACT/EST] :** les marchés publics exigent **références + capacité financière (CA minimum) +
assurances/certifs + DUME** ⇒ un **solo sans track-record est très peu qualifiable** ; cycle **long** (mois) ;
paiement étalé (pas en 10 j). ⇒ Grade **B au mieux**, **probabilité de gain solo LOW**.

## 3. Top 3 priorities (ODG choice, evidence-based)
1. **Sous-traitance senior aux ESN qui gagnent ces marchés** — RETOURNEMENT du biais "ESN" de la phase 3A : les ESN
   (Webnet, CAT-AMANIA, JEMS, Syneam…) **recrutent** du TS/Node senior pour livrer TMA/migrations. Vendre sa
   capacité senior **en sous-traitance** = **barrière basse, cycle court, facturation récurrente** (TJM 600–900 €).
   Grade B. *Meilleur délai-au-cash parmi les pistes high-value.*
2. **Programme privé de fiabilité/migration (fractional)** auprès d'une scale-up — retainer **10–20 k€/mois**
   (marché-sourcé), value-priced sur réduction d'incidents/dette. Grade B (cibles #1–#6 phase 3A).
3. **Veille + réponse partenariale aux marchés publics TMA/migration** (en **groupement/co-traitance** avec une
   société établie, pas en solo) — accès aux 245 k€–2,4 M€ sans la barrière de qualification solo. Grade B.
**Verdict honnête :** aucune de ces pistes ne rend **A/B (100 k€/mois)** crédible **en solo** ; elles donnent le
**chemin le plus rapide vers un PREMIER encaissement high-value** et construisent les références + la trésorerie
nécessaires au levier (équipe/sous-traitance) requis pour viser 100 k€/mois.

## 4. Economics (reproducible, `revenue-model`)
- 1 engagement premium solo ≈ **15 k€/mois** (net ≈ 9–11 k€ après charges société+TVA). 
- 100 k€/mois ⇒ ~5–10 engagements OU sous-traitance de 4–6 seniors ⇒ **capital de roulement** (payer les
  sous-traitants avant encaissement client) + gestion = **GO capital/embauche**. `targetPlan` : à 50 k€/contrat,
  2 contrats/mois → livrables solo ≈1 → **capacité dépassée**.
- Risque impayé / BFR : la sous-traitance exige d'avancer la paie ⇒ **trésorerie de départ indispensable**.

## 5. Automated pipeline (design; reuse existing modules — nothing new built beyond the grader)
détection (feeds BOAMP/francemarches + job boards) → **qualification** (`opportunity-policy`) → **grade+anti-scam**
(`enterprise-lead-grade`, NEW, 5/5) → **estimation** (`revenue-model`) → **proposition** (`quote`, human-gated send)
→ suivi → livraison (**humain senior**) → QC → **facturation/paiement** (`invoicing`/`payments`).
**ODG peut automatiser :** détection, scoring/grade, estimation, brouillons de proposition, suivi. **Humain
obligatoire :** vérif registre officiel finale, décision d'engagement, **signature**, dépôt d'offre marché public,
**la livraison technique senior elle-même**, encaissement. *(Un détecteur d'opportunités automatisé = prochaine
mission technique, non construit ici.)*

## 6. Blocks / authorizations (prepared, not crossed)
A/B exigent (CTO) : **capital de roulement** (sine qua non sous-traitance), statut société+TVA, GO contact réel/
sous-traitance, contrats de co/sous-traitance (droit du travail/commercial), éventuelles certifs marchés publics.
Sans capital+levier ⇒ **A/B BLOCKED**. Pistes solo (sous-traitance 1 personne, fractional) = GO prospection/entité.

## 7. Verdict & next
**PASS (analyse sourcée, vérifiée, honnête).** **A/B 100 k€/mois = BLOCKED sans levier (capital+sous-traitance/
équipe)** — déclaré, non enjolivé. **Meilleure voie réalisable retenue : sous-traitance senior aux ESN + fractional
privé** (délai-au-cash le plus court, barrière basse, récurrent), finançant le levier ultérieur.
**Prochaine mission technique exacte :** construire un **détecteur d'opportunités automatisé** (feeds marchés
publics + job boards → `opportunity-policy`+`enterprise-lead-grade` → shortlist gradée A/B), lecture seule, €0,
réutilisable — puis dossier de GO prospection/sous-traitance au CTO.

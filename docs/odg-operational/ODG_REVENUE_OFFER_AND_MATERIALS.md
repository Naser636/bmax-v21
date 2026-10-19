# ODG_100K_REVENUE_ENGINE — private sales materials (phase 2)

> **PRIVATE — NOT PUBLISHED, NOT SENT.** Drafts only. Any outreach, publishing, invoicing, legal entity, spend
> or personal-data processing of REAL prospects requires explicit CTO authorization (see §8 of
> `ODG_REVENUE_ENGINE_100K.md`). Prices are **[EST]** indexed to researched senior TJM (510–900 €/j, 2026).

## 1. Offer one-pager (draft)
**Pour qui :** CTO / lead tech d'une scale-up ou PME (FR + remote EU) avec une base de code JavaScript et une
dette technique, qui veut passer à TypeScript **sans régression** et fiabiliser sa CI/observabilité.
**Pourquoi moi :** une migration JS→TS **complète d'un runtime entier déjà réalisée** avec harnais de **parité
prouvée** (zéro régression), récupération automatique bornée et observabilité/SLO — portfolio réel démontrable
(§3). Le diagnostic 2026 est clair : les équipes **budgètent** la migration TS (déclencheur TS 7), et un
spécialiste « qui l'a fait 10+ fois » livre en deux fois moins de temps avec moins de régressions.

| Paquet | Contenu | Résultat | Prix [EST] |
|---|---|---|---|
| **1 — Audit + plan de migration** | diagnostic dette JS, plan incrémental, quick-wins, estimation chiffrée | une feuille de route exécutable | ~3 500 € (forfait court) |
| **2 — Migration pilote d'un module + harnais de parité** | migration bornée d'un module réel + tests de parité JS↔TS + CI | **preuve de valeur** sur votre code | ~7 500 € (forfait) |
| **3 — Accompagnement récurrent** | migration continue + garde-fous parité/observabilité | récurrence, dette qui baisse chaque mois | ~2 500 €/mois (retainer) |

**Hors périmètre / exclusions :** refonte produit, nouvelles fonctionnalités, infra hors CI. **Livraison :**
jalons écrits, démonstration privée. **Support/reprise :** périmètre contractualisé, politique de reprise bornée.
Marge service élevée (coût ≈ temps). Prix **par forfait**, pas à l'heure (valeur, pas volume horaire).

## 2. Prospection message — DRAFT, UNSENT (template, à n'envoyer qu'après GO + base RGPD)
> Ne pas envoyer sans autorisation CTO + base légale RGPD + entité de facturation. Pas d'envoi de masse.
```
Objet : migration TS sans régression (parité prouvée) — {Entreprise}

Bonjour {Prénom},
Vous budgétez sûrement le passage de {stack JS} à TypeScript. Le risque habituel, c'est la régression pendant
la migration. J'ai migré un runtime complet JS→TS avec un harnais de parité qui garantit zéro régression, +
CI/observabilité. Je propose un audit court (plan chiffré) puis une migration pilote d'un module pour prouver
la valeur sur VOTRE code avant tout engagement plus large.
15 min pour voir si c'est pertinent ?
{Signature}
```

## 3. Portfolio / preuve (évidence RÉELLE de ce dépôt — vérifiable)
- Migration **JS→TS dual-port** d'un runtime entier (modules `.ts` compilés par défaut + rollback `.js`), avec
  **tests de parité** systématiques (ex. `reporters-dualport-parity` 7/7, parité par module).
- **Zéro-régression prouvée** par harnais (dual-tsconfig, closure dist, benches byte-identiques).
- **Fiabilité runtime** : auto-récupération bornée + rollback (P1 LIVE), détection vivant-mais-malade (P1b LIVE).
- **Observabilité/SLO** : compteur de missions, latence par-tentative vs durée totale par run, détecteurs
  exposition + maintenance sur timer privé, intégrés en lecture seule dans `odg health`.
- Suite de tests **451 fichiers** ; discipline anti-faux-succès (preuves, pas d'affirmations).
*(Tout est public dans l'historique git du dépôt — démontrable en entretien, sans exposer le service.)*

## 4. Example devis — generated via the commercial-OS pipeline (FICTITIOUS data, sandboxed)
Exécuté en bac-à-sable (aucune pollution du store réel) avec les modules **prouvés** `client-intake` + `quote` :
- Intake `CLIENT-001` (client FICTIF « ACME Scale-up ») — **consentement enregistré** (RGPD par construction ;
  champs sensibles jamais stockés).
- Devis **`QUOTE-001` DRAFT**, 3 lignes (les 3 paquets), **total 13 500 € HT**, validité 30 j.
- **`markSent` sans humain ⇒ REFUSÉ `HUMAN_AUTHORIZATION_REQUIRED`** : la gouvernance « pas d'envoi autonome »
  est **appliquée par le pipeline lui-même**, pas seulement par consigne. ODG rédige ; l'humain envoie/signe.

## 5. What remains — human/CTO decisions to open the paid phase (prepared, not crossed)
1. **Statut/entité** : micro (CA ≤ 77,7 k€) vs **société** (obligatoire pour viser 100 k€ CA) — coût + délai.
2. **GO prospection réelle** (liste ciblée, base RGPD, pas de masse) — sinon le pipeline reste en DRAFT.
3. **Publication** éventuelle d'une page d'offre (aucune exposition publique sans GO).
4. **Budget** (actuellement **0 €** discrétionnaire) pour d'éventuels frais plateforme/outils.
Chaque décision sera présentée avec coût / bénéfice attendu / risque / action exacte à approuver.

## 6. Next (ODG, €0, autonomous)
Phase 3 est **bloquée sur décision humaine** (statut + GO prospection). Travaux €0 encore possibles : affiner les
paquets/prix à partir de nouvelles sources, préparer 3–5 cibles-types (secteurs, pas de données personnelles
réelles), et un script de démonstration de migration-pilote (sur un repo fictif/open-source). À défaut de GO, la
campagne commerciale est **en attente de décision CTO** — l'état et l'action exacte sont dans la boussole.

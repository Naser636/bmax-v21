# V12.4 — PARTIE XXXII : COMMERCIALISATION & ACQUISITION (extension V50, §123–§130)

> **Extension de la V12.4** décidée par les audits V48 (I1/C7) + V49. **Elle COMPLÈTE la V12.4 ; elle ne réécrit aucune des 31 parties numérotées et ne modifie pas l'invariant §1–§122** (cette partie porte des §§ au-delà de §122, hors du périmètre du vérificateur de couverture). Elle **réutilise les mécanismes ODG canoniques** (pas de CRM/moteur commercial/base parallèle). **Toutes les valeurs commerciales restent des HYPOTHÈSES** jusqu'à preuve réelle ; 0 client observé ; aucune prospection/engagement sans autorisation.

## §123 — Objet & statut
Donner à la V12.4 — feuille de route de supériorité TECHNIQUE — son bras COMMERCIAL manquant (constat central V48 : 0/31 parties ne traitaient l'acquisition). Statut : **référentiel directeur proposé** ; exigence ≠ vente réalisée. Objectif de rattachement : la cible **5 M€ de CA 2027** (V47) — cible à démontrer, non acquise.

## §124 — Stratégie commerciale (réutilise V47.1 ranking + V45.2 pricing)
- Segments : TPE, PME, ETI, grands comptes, cabinets/experts-comptables, intégrateurs, éditeurs (V47.1).
- ICP : 10 profils/offre (V45_OFFERS_ONEPAGERS_AND_ICP).
- Positionnement des 15 métiers : têtes de pont **P3, P9, P10, P11, P15** (classement vendabilité V47.1) ; les 15 restent au périmètre.
- Portefeuille : offres E4 (voir C2) — entrée / pro / premium, + offres combinées (P3+P10+P9 programme entreprise).
- Prix & récurrence : grilles HYPOTHÈSE V45.2 (à valider par 3 devis réels).

## §125 — Acquisition (réutilise V47.1 §6)
Vente directe · partenaires/intégrateurs · experts-comptables (canal volume) · distribution indirecte · appels d'offres (documentaire) · marketing de contenu · stratégie grands comptes. **Le canal partenaire est pivot pour le volume** ; l'acquisition est le verrou P0.

## §126 — Machine commerciale (RÉUTILISE commercial-pipeline, PAS un nouveau CRM)
Réutiliser le module ODG existant **`commercial-pipeline`** (étapes gouvernées) + **`opportunity-intelligence`** : gestion d'opportunités, pipeline, qualification, devis/propositions, suivi, prévisions, KPI. **Séparation stricte préparé ≠ autorisé ≠ envoyé ≠ signé ≠ encaissé** (déjà démontrée dans le workflow e-invoice P11, gate humain `PROPOSAL_SENT`). Aucun second système de vérité.

## §127 — Gouvernance commerciale (réutilise les primitives POLICY/EVIDENCE)
Autorisations humaines deny-by-default (action-gate) ; traçabilité (evidence-provenance) ; RGPD ; contrôle des engagements ; **séparation simulation ↔ vente réelle** (une simulation n'est jamais présentée comme une vente). Aucune donnée personnelle traitée sans base légale.

## §128 — Pilotage économique (réutilise cost-engine + les modèles V45.3/V46)
CAC · panier moyen · marge · récurrence · capacité commerciale · objectifs mensuels/trimestriels · contribution au 5 M€. Modèles reproductibles : `odg-acquisition-model`, `odg-org-model` (Scénario C = org minimale pour €500k net ; €5M = org élargie, V47). **Toutes hypothèses étiquetées.**

## §129 — Dépendances & critères de validation
Dépend de : C2 (métiers→E4, offres vendables) + crédibilité (V49 cert-readiness) + **1 client référence** (verrou P0). Validé quand : offres E4 prêtes, prix validés (3 devis), canal défini, machine commerciale gouvernée opérationnelle en SIMULATION, et ≥1 conversion réelle prouvée (owner-gated).

## §130 — Interdictions (non négociables)
Aucune prospection réelle, aucun contact, aucun devis envoyé, aucun engagement/contrat, aucune dépense, aucune publication — sans autorisation CTO/propriétaire distincte. Le contrôleur indépendant statue ; aucun fournisseur ne se valide.

## Réutilisation (anti-doublon)
commercial-pipeline, opportunity-intelligence, cost-engine, action-gate (POLICY), evidence-provenance (EVIDENCE), O1/O2 (rapports d'offre), les modèles V45/V46/V47. **Aucun nouveau composant, aucune 10e primitive, aucun CRM parallèle.**

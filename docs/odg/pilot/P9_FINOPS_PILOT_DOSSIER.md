# P9 FinOps — Dossier du premier pilote (READINESS ONLY)

**CTO V53 · 2026-11-10 · LOCAL — préparation uniquement.**
ODG conserve l'autorité ; Claude Code = fournisseur technique ; contrôleur indépendant obligatoire.
Aucune prospection, aucun message externe, aucun contrat, aucune dépense, aucun push/merge/déploiement/VPS.
P9 reste **E4**. **E5 = NOT_STARTED** jusqu'à ce que toutes les conditions de §9 soient réunies.

> Ce dossier décrit comment un pilote *serait* mené. Aucun pilote n'est vendu, réalisé ni validé par un client.
> Toutes les figures du parcours simulé sont **ESTIMÉES** (coûts) ou **SIMULÉES** (économies) — jamais réelles.

Base réutilisée (aucun composant nouveau, aucun CRM) : guard P9 `cost-engine`
(`estimate / attribute / checkBudget / alerts / detectAnomalies / compareScenarios`),
couche rapport partagée **O1** (`shared-report-generator`) et preuves **O2** (`shared-evidence-wrapper` →
`evidence-provenance`). Démonstrateur E4 existant : `docs/odg/demonstrators/P9_FINOPS_READINESS.json`.

---

## 1. Profil du client pilote idéal
- **Taille** : PME/ETI ou scale-up SaaS, **dépense cloud mensuelle ~5 000–50 000 €** (assez grande pour des gains réels, assez simple pour un périmètre net).
- **Fournisseur** : un seul cloud principal (AWS/GCP/Azure) avec export de facturation détaillée disponible.
- **Maturité FinOps** : faible à moyenne — pas d'équipe FinOps dédiée, pas d'attribution par service/équipe en place.
- **Déclencheur** : facture en hausse non expliquée, ou préparation d'une levée/d'un budget.
- **Décideur accessible** : CTO / Head of Platform / DAF, capable d'**autoriser l'accès aux données** et de **valider par écrit**.
- **Contre-indications** : données sans base légale d'accès, multi-cloud très fragmenté sans export, attentes d'« économies garanties ».

## 2. Problème FinOps ciblé
« **Où part l'argent du cloud, qu'est-ce qui est anormal, et combien peut-on raisonnablement récupérer — avec preuve ?** »
Concrètement : **attribution** des coûts par service/ressource, **détection d'anomalies/dérives**, **alertes de dépassement** de budget, et **scénarios d'optimisation** chiffrés avec hypothèses explicites et traçables.

## 3. Données nécessaires et conditions d'accès
| Donnée | Usage | Condition d'accès |
|---|---|---|
| Export de facturation détaillé (CUR/BigQuery billing/Cost Mgmt) | attribution réelle (OBSERVED) | **base légale documentée**, périmètre minimal, lecture seule |
| Catalogue de tarifs appliqués | estimation / recoupement | fourni par le client |
| Métriques d'usage (utilisation compute, accès stockage, trafic egress) | valider les hypothèses d'optimisation | lecture seule, période convenue |
| Budgets par service/équipe | alertes de dépassement | déclarés par le client |

Principes : **minimisation** (seulement le nécessaire), **lecture seule**, **pas d'exfiltration**, **périmètre écrit**, suppression à la fin. Tant que ces données réelles ne sont pas fournies, le pilote reste **synthétique**.

## 4. Parcours complet d'audit
1. **Cadrage** — périmètre, comptes/services in/out, période, budgets déclarés (accord écrit).
2. **Ingestion** — chargement de l'export de facturation (réel → OBSERVED ; sinon synthétique → ESTIMATED).
3. **Attribution** — `cost-engine.attribute` : coût par mission/service/ressource + total.
4. **Contrôle budgétaire** — `cost-engine.alerts` (fail-closed) : services au-dessus du budget.
5. **Anomalies** — `cost-engine.detectAnomalies` : ressources hors-norme (z-score déterministe).
6. **Scénarios** — `cost-engine.compareScenarios` : courant vs optimisé, classés par coût puis coût/perf.
7. **Recommandations + chiffrage** — économies sous **hypothèses explicites** (SIMULATED tant que non mesuré).
8. **Livrable** — rapport O1 (JSON + markdown PME) + preuves O2 (digest vérifiable indépendamment).
9. **Revue indépendante** — contrôleur vérifie le digest et la cohérence ; owner valide.

## 5. Résultats et indicateurs mesurables
- **Couverture d'attribution** : % du coût total attribué à un service/ressource (cible 100 %).
- **Services en dépassement** : nombre et montant du dépassement (€).
- **Anomalies** : nombre de ressources hors-norme identifiées.
- **Économie identifiée** : € / mois et % du run-rate, **avec basis explicite** (SIMULATED → MEASURED en E5).
- **Reproductibilité** : digest de preuve stable sur ré-exécution.
- **Vérifiabilité indépendante** : `O2.verifyEvidence` = ok (un auditeur re-dérive le digest sans faire confiance au producteur).

## 6. Rapport O1 et dossier de preuves O2
- **O1** produit un rapport normalisé (statut, résumé, contrôles, constats avec severity+basis, recommandations, limites, conditions de validation) → JSON + markdown lisible PME. Champ manquant ⇒ « (not provided) », jamais inventé (fail-closed).
- **O2** attache à chaque preuve un **basis** (PROVEN|OBSERVED|ESTIMATED|SIMULATED|UNKNOWN, jamais sur-classé) et un digest via le primitif canonique `evidence-provenance` (non dupliqué). `verifyEvidence` re-dérive le digest indépendamment.
- Artefact de simulation : `docs/odg/demonstrators/P9_FINOPS_PILOT_SIM.json` (+ `.md`).

## 7. Responsabilités du client
- Autoriser l'engagement et l'accès aux données (base légale, périmètre).
- Fournir l'export de facturation, les tarifs, les budgets et, pour valider les hypothèses, les métriques d'usage.
- Désigner un interlocuteur décisionnaire.
- **Valider par écrit** les constats et, en E5, les résultats réellement mesurés.
- Décider et implémenter les changements d'optimisation (ODG recommande ; le client exécute côté infrastructure).

## 8. Critères objectifs d'acceptation / de rejet
**Acceptation** : attribution 100 % du périmètre ; dépassements et anomalies reproductibles ; chaque économie porte un basis explicite ; digest de preuve vérifiable ; revue contrôleur OK. **Rejet** : toute économie SIMULÉE présentée comme réelle ; accès hors base légale/périmètre ; absence de revue indépendante ; non-reproductibilité ; champs fabriqués. (Détail machine : `P9_E5_READINESS_CRITERIA.json`.)

## 9. Risques, limites et conditions de sécurité
- **Confidentialité** : données de facturation = sensibles → minimisation, lecture seule, pas d'exfiltration, suppression en fin de mission, pas d'accès réseau depuis l'outil.
- **Sur-promesse** : risque majeur ⇒ **jamais** présenter une économie estimée/simulée comme réalisée ; basis jamais sur-classé.
- **Base légale** : pas d'accès aux données sans autorisation écrite et périmètre défini.
- **Modèle ≠ autorité** : `cost-engine` est un **modèle** pur ; une figure synthétique/estimée n'est jamais une dépense réelle.
- **Maturité** : P9 = L2, **0 client payant**. Ce dossier est une **préparation E4**, pas une vente.
- **Gouvernance** : ODG garde l'autorité ; contrôleur indépendant obligatoire ; aucune action externe/irréversible sans autorisation explicite du propriétaire.

---

### Transition E4 → E5 (résumé)
P9 **reste E4**. Le passage à **E5** exige, cumulativement (voir `P9_E5_READINESS_CRITERIA.json`) :
client réel autorisé · données réelles légalement accessibles · accord explicite sur le périmètre ·
exécution réelle (OBSERVED) · résultats **mesurés** (pas simulés) · **validation écrite du client** · revue contrôleur.
Tant que ces conditions ne sont pas **toutes** réunies : **E5 = NOT_STARTED**.

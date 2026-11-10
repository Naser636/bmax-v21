# P10 AI Governance — Dossier du deuxième pilote (READINESS ONLY)

**CTO V54 · 2026-11-10 · LOCAL — préparation uniquement.**
Autorité : **ODG**. Fournisseur technique : **Claude Code** (rôle borné). Validation : **contrôleur indépendant obligatoire**.
Aucune prospection, aucun message externe, aucun contrat, aucune dépense, aucun recrutement, aucun push/merge/déploiement/VPS.
P10 reste **E4**. **E5 = NOT_STARTED** jusqu'à ce que toutes les conditions de §9 soient réunies.

> **Règle cardinale :** « P10 prêt à être testé avec un client » ne signifie **ni client acquis, ni conformité certifiée, ni E5**.
> ODG **prépare** des preuves de *readiness* ; il ne délivre **jamais** de certification, d'avis juridique ni de garantie de conformité.
> Dans le parcours simulé, toute classification/lacune/date est **SIMULÉE** sur données synthétiques — jamais une observation réelle.

Base réutilisée (aucun moteur nouveau, aucun registre parallèle) : guard P10 `ai-assurance-assessment.assessAISystem`
(classification de rôle AI-Act *deny-by-default* + évaluation de contrôles *fail-closed*, `INSUFFICIENT_EVIDENCE` jamais PASS,
`NOT_CERTIFIED`), le mappeur de dates `ai-act-in-force` (dates = **données injectées**, obligation non datée ⇒ `UNKNOWN_DATE`),
la couche rapport **O1** et les preuves **O2** (→ `evidence-provenance`). Démonstrateur E4 existant :
`docs/odg/demonstrators/P10_AIGOV_READINESS.json`.

---

## 1. Profil du client pilote idéal
- **Organisation** utilisant des systèmes d'IA **en production** (PME/ETI/scale-up ou direction métier).
- **Responsable identifié** : direction, conformité, **DPO**, **RSSI** ou responsable IA, habilité à autoriser l'accès et à **valider par écrit**.
- **Inventaire et documentation accessibles** : liste des systèmes d'IA, fiches techniques/fournisseur, usages.
- **Besoin concret** de gouvernance, traçabilité et maîtrise des risques (préparation AI-Act/RGPD, audit interne, exigence client/investisseur).
- **Contre-indications** : aucune base légale d'accès, attente d'une « certification » ou d'un « avis juridique » par ODG, périmètre non défini.

## 2. Problème ciblé
1. **Identifier** les systèmes d'IA et leurs usages (inventaire).
2. **Documenter les responsabilités** (rôle AI-Act : fournisseur / déployeur / GPAI / distributeur — *deny-by-default*).
3. **Évaluer les risques et les contrôles** existants (fail-closed ; un contrôle non testé = `INSUFFICIENT_EVIDENCE`, jamais PASS).
4. **Identifier les lacunes** documentaires et opérationnelles.
5. **Produire un dossier de preuves** (O1/O2) et un **plan de remédiation priorisé**.

## 3. Données et conditions d'accès
| Donnée | Usage | Condition d'accès |
|---|---|---|
| Inventaire des systèmes d'IA | périmètre + classification des rôles | fourni par le client |
| Fiches techniques / documentation fournisseur | évaluation des contrôles | lecture seule, périmètre défini |
| Usages, finalités, catégories de données | rôle + déclencheurs Art.50 + RGPD | **base légale documentée**, minimisation |
| Évaluations de risques et contrôles existants | gap-analysis | lecture seule |
| Documentation humaine/organisationnelle (oversight, logs, DPIA) | preuve de contrôle | strictement autorisée, documentée |

Principes : **autorisation écrite, minimisation, lecture seule, pas d'exfiltration, périmètre défini, suppression en fin de mission, pas d'accès réseau depuis l'outil.** Tant que ces données réelles ne sont pas fournies, le pilote reste **synthétique**.

## 4. Parcours pilote
1. **Cadrage et périmètre** (systèmes in/out, responsabilités, accord écrit).
2. **Inventaire des systèmes d'IA.**
3. **Classification des usages et responsabilités** — `classifyRole` (deny-by-default ; déclencheurs Art.50 par activité).
4. **Analyse des risques** — familles d'obligations applicables selon le rôle.
5. **Évaluation des contrôles existants** — `assessAISystem` (PASS uniquement si un contrôle réel a tourné + preuve vérifiée ; sinon `INSUFFICIENT_EVIDENCE`).
6. **Identification des lacunes** — contrôles `FAIL` / `INSUFFICIENT_EVIDENCE`.
7. **Plan de remédiation priorisé** (par type d'exigence, voir §Taxonomie).
8. **Rapport O1 + dossier de preuves O2** (empreinte vérifiable indépendamment).
9. **Contrôle indépendant et revue finale** (ODG autorité ; contrôleur obligatoire ; confirmation juridique qualifiée).

## 5. Exactitude réglementaire — taxonomie obligatoire
Chaque point est étiqueté sans ambiguïté (jamais présenté comme certifié) :
- **LEGAL_OBLIGATION** — obligation juridique applicable (en vigueur selon le registre de dates injecté ; ex. Art.50 transparence, application générale 2026-08-02).
- **CONDITIONAL_REQUIREMENT** — exigence conditionnelle / pas encore en vigueur (ex. haut-risque Annexe III, décalé Omnibus 2027-12-02).
- **GOOD_PRACTICE** — bonne pratique (ex. hygiène supply-chain / SBOM).
- **RECOMMENDATION** — recommandation ODG.
- **HYPOTHESIS** — hypothèse à confirmer.
- **NEEDS_LEGAL_EXPERTISE** — point nécessitant une expertise juridique qualifiée (obligation sans test automatisé ⇒ `INSUFFICIENT_EVIDENCE` ; date `UNKNOWN_DATE`).

Références présentes dans le dépôt et **réutilisées, non inventées** : AI-Act (rôles + familles d'obligations + Art.50, `ai-act-role-classifier` ; jalons documentés : pratiques interdites 2025-02-02, GPAI 2025-08-02, transparence/application générale 2026-08-02, haut-risque Annexe III décalé 2027-12-02, haut-risque Annexe I 2028-08-02) ; **RGPD** Reg (UE) 2016/679 ; **DORA** Reg (UE) 2022/2554 (entités financières uniquement). **Les dates sont des données** à confirmer par un conseil qualifié ; une obligation absente du registre reste `UNKNOWN_DATE` (fail-closed). **ODG ne reproduit aucun texte normatif** — seulement des principes autorisés ; une obligation sans source valide est **refusée** (contrôle anti-hallucination).

## 6. KPI, acceptation / rejet
- **KPI** : couverture d'inventaire (%), nb de rôles classifiés, nb de contrôles par statut (PASS/FAIL/INSUFFICIENT_EVIDENCE/NOT_APPLICABLE), nb de lacunes par type d'exigence, nb d'obligations IN_FORCE/NOT_YET/UNKNOWN_DATE, reproductibilité du digest, vérification O2 = ok.
- **Acceptation** : inventaire complet du périmètre ; chaque obligation tracée à une source valide ; statuts honnêtes (aucun `INSUFFICIENT_EVIDENCE` présenté comme PASS) ; digest reproductible et vérifiable ; revue contrôleur + confirmation juridique OK.
- **Rejet** : rapport présenté comme certification/avis juridique/garantie ; obligation affirmée en vigueur sans base datée+sourcée ; accès hors base légale/périmètre ; contrôle non testé présenté comme PASS ; absence de revue indépendante. (Détail machine : `P10_E5_READINESS_CRITERIA.json`.)

## 7. Responsabilités du client
- Autoriser l'engagement et l'accès (base légale, périmètre, responsabilités écrites).
- Fournir l'inventaire, les fiches techniques, les usages, les évaluations de risques et la documentation organisationnelle.
- Désigner un interlocuteur décisionnaire (direction/DPO/RSSI/responsable IA).
- Obtenir une **confirmation juridique qualifiée** pour toute conclusion de droit.
- **Valider par écrit** les constats et le plan de remédiation.

## 8. Risques, limites et conditions de sécurité
- **Sur-promesse réglementaire** (risque majeur) ⇒ jamais de certification, d'avis juridique ni de garantie ; statut jamais sur-classé.
- **Confidentialité** : documentation IA = sensible ⇒ minimisation, lecture seule, pas d'exfiltration, suppression en fin de mission.
- **Base légale** : pas d'accès sans autorisation écrite et périmètre défini.
- **Déclaré ≠ vérifié** : les rôles proviennent d'activités **déclarées** ; en E5, vérifier.
- **Dates = données** : à confirmer contre les textes faisant foi ; registre silencieux ⇒ `UNKNOWN_DATE`.
- **Maturité** : P10 = L2, **0 client payant**. Ce dossier est une **préparation E4**, pas une vente.
- **Gouvernance** : ODG autorité ; contrôleur indépendant obligatoire ; aucune action externe/irréversible sans autorisation explicite du propriétaire.

---

## 9. Transition E4 → E5 (résumé)
P10 **reste E4**. Passage à **E5** exige, cumulativement (voir `P10_E5_READINESS_CRITERIA.json`, 8 conditions, toutes `false`) :
client réel autorisé · périmètre et responsabilités écrits · base légale et accès établis · exécution sur contexte réel
(rôles **vérifiés**, non seulement déclarés) · résultats observés et vérifiables · **confirmation juridique qualifiée** ·
**validation écrite du client** · revue indépendante. Tant que ces conditions ne sont pas **toutes** réunies : **E5 = NOT_STARTED**.

# V14.4 — ADDENDUM STRATÉGIQUE — BOUSSOLE VIVANTE

> **Extension versionnée de V14.4** (`docs/odg/V14_4_ROADMAP.md`, ADOPTED V372). Texte du propriétaire, reproduit **mot pour mot** ci-dessous (§20–§31 et la règle finale), enregistré le 2026-11-24.
> **Statut : RECORDED** — enregistrement documentaire d'une directive du propriétaire. Ce fichier **n'adopte rien** formellement, ne modifie **pas** la Boussole V12.4 (référence canonique), ne modifie pas `V14_4_ROADMAP.md` (sauf un renvoi ajouté en fin de fichier), et ne change ni `runtime/governance/**`, ni `ROADMAP.json`, ni `v124-consolidated-roadmap.json`, ni `closure-register.json`.
> **Numérotation.** L'addendum commence au §20 : il prolonge un texte maître V14.4 en §1–§19. **Ce texte maître n'est pas présent dans le dépôt** (vérifié 2026-11-24 : `V14_4_ROADMAP.md` compte 5 sections, `V14_4_LOT_PLAN_AND_RADAR_AUDIT.md` 4 sections). La réconciliation section par section avec §1–§19 est donc **NOT_MEASURED** tant que le propriétaire ne fournit pas ce texte — voir `docs/odg/evidence/V169_V14_4_ADDENDUM_RECONCILIATION.json`.
> **Démarrage opérationnel** (texte du propriétaire) : « après clôture vérifiée de H ». H est clôturée et vérifiée : CLOSED_FAIL, NOT_ADOPTED (#946, #947, `docs/odg/evidence/V168_H_CRITERIA_VALIDATION.json`). Les phases 0 et 1 ont commencé : #948, #949.

---

**Nature :** enrichissement de la directive maître V14.4.
**Autorité :** propriétaire ODG.
**Référence canonique :** Boussole V12.4.
**Pilotage :** ODG.
**Exécution technique :** composants internes et fournisseurs autorisés sous contrôle d'ODG.
**Démarrage opérationnel :** après clôture vérifiée de H.
**Principe :** aucune suppression des objectifs, capacités, architectures ou exigences déjà définis dans V14.4.

## 20. OBJECTIF — UNE INTELLIGENCE QUI CONNAÎT SON PROPRE ÉTAT

ODG doit devenir capable de connaître en permanence :
- ce qu'il sait faire ;
- ce qu'il sait faire partiellement ;
- ce qu'il ne sait pas faire ;
- ce qui fonctionne réellement ;
- ce qui existe mais n'est pas raccordé ;
- ce qui est raccordé mais inutilisé ;
- ce qui échoue ;
- ce qui est bloqué ;
- ce qui dépend d'une autorisation ;
- ce qui doit être amélioré ;
- ce qui pourrait débloquer le plus de valeur.

Il doit transformer cette connaissance en missions concrètes, autorisées, mesurables et vérifiables.

L'objectif n'est pas d'accumuler des informations sur lui-même, mais d'utiliser ces informations pour prendre de meilleures décisions et améliorer ses capacités réelles.

## 21. BOUSSOLE VIVANTE ET ARCHITECTURE DE CONTINUITÉ

### 21.1. Rôle de la Boussole

La Boussole V12.4 demeure la référence directrice et le guide de gouvernance.

Elle conserve :
- les objectifs stratégiques ;
- les principes fondamentaux ;
- les décisions du propriétaire ;
- les exigences canoniques ;
- les orientations et priorités ;
- les références aux travaux et aux éléments restant à accomplir.

Elle ne doit pas devenir un journal contenant tous les détails techniques de chaque mission.

### 21.2. Répartition des responsabilités

Réutiliser les composants canoniques existants.

- Boussole : direction et gouvernance.
- Suivi canonique des missions : état opérationnel détaillé.
- Registre de clôture : résultats, références et éléments à reprendre.
- Journal des décisions : décisions, raisons et conséquences.
- Mémoire : connaissances, contexte et expériences réutilisables.
- Radar : recherche et qualification des connaissances externes.

Ces fonctions ne justifient pas la création de systèmes parallèles.

Chaque enregistrement opérationnel doit être relié à la référence correspondante dans la Boussole.

### 21.3. Continuité bidirectionnelle

La relation doit fonctionner dans les deux sens :

- La Boussole permet de retrouver les missions, les décisions et les éléments ouverts.
- Les missions actualisent le suivi opérationnel et proposent les changements nécessaires à la Boussole.
- La clôture d'une mission ne doit pas effacer ses limites, ses échecs ou ses dépendances.
- Une nouvelle mission doit pouvoir retrouver immédiatement le contexte utile des missions précédentes.

Toute modification de la Boussole canonique doit respecter son processus de gouvernance.

## 22. MÉMOIRE OPÉRATIONNELLE DES MISSIONS

Chaque mission doit posséder un identifiant stable et un état reprenable.

Conserver au minimum :

1. Identifiant et objectif.
2. Périmètre et critères d'acceptation.
3. Autorisation applicable et preuve.
4. Date de début et derniers checkpoints.
5. Commit et état du dépôt concernés.
6. Composants et fichiers touchés.
7. Dépendances et blocages.
8. Décisions et justifications synthétiques.
9. Tests exécutés et résultats.
10. Tests échoués ou non exécutés et raisons.
11. Inspections et résultats CI.
12. Empreintes et preuves.
13. Risques, incertitudes et limites.
14. Résultat final.
15. Prochaine action sûre et autorisée.

Chaque preuve doit préciser :
- ce qu'elle établit ;
- ce qu'elle n'établit pas ;
- sa provenance ;
- sa date ;
- son lien avec le commit et le contrat ;
- sa fraîcheur ;
- ses limites.

Conserver un historique append-only des événements importants : les corrections et changements de statut ajoutent de nouveaux événements sans effacer l'historique précédent.

## 23. STATUTS ET CLASSIFICATION

Conserver les classifications canoniques de V14.4.

Les statuts de résultat opérationnel doivent être distingués des statuts d'implémentation.

### Résultat d'une mission

- PASS : critères satisfaits et preuves suffisantes.
- PARTIAL : certains critères seulement sont satisfaits.
- FAIL : résultat non conforme aux critères.
- BLOCKED : dépendance, accès ou autorisation manquante.
- NOT_MEASURED : résultat non établi.

### État d'implémentation

Conserver les catégories déjà prévues :
- IMPLEMENTED_AND_VERIFIED ;
- IMPLEMENTED_NOT_VERIFIED ;
- DOCUMENTED_ONLY ;
- CONNECTED_AND_USED ;
- CONNECTED_NOT_USED ;
- DORMANT ;
- PARTIAL ;
- PROPOSED ;
- BLOCKED ;
- DEFERRED ;
- RETIRED ;
- NOT_MEASURED.

Ne pas confondre un module présent avec une capacité opérationnelle.

Ne jamais transformer une simulation en preuve d'exécution réelle.

Ne jamais supprimer un résultat négatif ou promouvoir un résultat sans nouvelle preuve.

## 24. CONTINUITÉ AUTOMATIQUE DE CHAQUE MISSION

Chaque mission doit alimenter le suivi canonique à toutes les étapes importantes.

### Avant

- Lire la Boussole et le contexte de mission.
- Retrouver les preuves existantes.
- Vérifier leur validité.
- Identifier les travaux déjà effectués.
- Vérifier les dépendances et permissions.
- Définir les critères avant l'exécution.

### Pendant

- Enregistrer les décisions significatives.
- Conserver les modifications et commits.
- Enregistrer les tests et leurs résultats.
- Conserver les rejets d'inspection.
- Actualiser les blocages et les dépendances.
- Préserver des checkpoints cohérents.

### À la clôture

- Établir le résultat réel.
- Enregistrer les preuves.
- Conserver les limites et les éléments non terminés.
- Identifier les prochaines actions.
- Mettre à jour le suivi opérationnel.
- Préparer les propositions de mise à jour de la Boussole.

### À la reprise

- Vérifier le HEAD et le contexte actuels.
- Revalider les preuves nécessaires.
- Retrouver le dernier checkpoint cohérent.
- Ne pas refaire les étapes encore valides.
- Reprendre exactement au premier travail réellement incomplet.

## 25. INTELLIGENCE DES DÉPENDANCES ET DE LA VALEUR

ODG doit comprendre les relations entre missions :

- dépend de ;
- débloque ;
- est bloquée par ;
- remplace ;
- invalide ;
- améliore ;
- nécessite une autorisation.

Il doit construire et maintenir une représentation des dépendances sans créer un deuxième système de pilotage.

Pour chaque amélioration envisagée, évaluer :
- valeur attendue ;
- nombre de missions débloquées ;
- importance stratégique ;
- autorisation disponible ;
- faisabilité ;
- délai ;
- coût ;
- risques ;
- réversibilité ;
- qualité des preuves ;
- incertitude.

ODG doit distinguer systématiquement :

A. Priorité stratégique globale.

B. Meilleure mission autorisée et réalisable maintenant.

Une mission stratégique bloquée ne doit pas empêcher une autre mission indépendante autorisée.

Une petite correction qui débloque plusieurs capacités peut être prioritaire devant un chantier beaucoup plus lourd.

Aucun score arbitraire ne doit remplacer une justification vérifiable.

## 26. AUTO-DIAGNOSTIC ET AUTO-AMÉLIORATION

ODG doit continuellement examiner ses propres capacités.

La boucle obligatoire :

1. Détecter une faiblesse.
2. Identifier les preuves de cette faiblesse.
3. Mesurer son impact.
4. Rechercher sa cause profonde.
5. Identifier les missions et capacités affectées.
6. Rechercher les solutions pertinentes avec le Radar.
7. Comparer les références et les options.
8. Choisir la solution proportionnée.
9. Vérifier les autorisations.
10. Construire ou corriger dans l'environnement autorisé.
11. Tester.
12. Faire inspecter indépendamment.
13. Mesurer le gain avant/après.
14. Enregistrer l'apprentissage.
15. Actualiser les priorités.

Chaque faiblesse doit avoir :
- une description ;
- une preuve ;
- un impact ;
- une cause connue ou inconnue ;
- une priorité ;
- une solution envisagée ;
- un état ;
- un résultat mesuré ;
- une prochaine action.

Une faiblesse inconnue ou non mesurée reste explicitement NOT_MEASURED.

Ne pas considérer qu'une faiblesse est corrigée simplement parce qu'un développeur a modifié du code.

## 27. RADAR ET INTELLIGENCE MONDIALE

Le Radar existant doit alimenter cette boucle d'amélioration.

Pour chaque faiblesse ou besoin :
- formuler une question de recherche ;
- identifier les meilleures références mondiales pertinentes ;
- privilégier les sources primaires ;
- rechercher des corroborations indépendantes ;
- identifier les contradictions ;
- vérifier les dates, méthodes, limites et conditions d'accès ;
- distinguer faits, hypothèses et recommandations ;
- enregistrer les découvertes avec provenance ;
- proposer une expérience adaptée à ODG.

Les références mondiales doivent servir à améliorer les méthodes d'ODG, pas à copier aveuglément leurs architectures.

Aucune découverte externe ne devient automatiquement une vérité ou une autorisation.

Le Radar respecte les grants, les allowlists, les quotas et les conditions d'accès existants.

Les résultats doivent alimenter les décisions et les expériences réelles, pas uniquement produire des rapports.

## 28. RAPIDITÉ INTELLIGENTE ET EFFICACITÉ

La rapidité devient une capacité transversale obligatoire.

Règle de travail :

COMPRENDRE → CHOISIR LE CHEMIN LE PLUS COURT → EXÉCUTER → VÉRIFIER → APPRENDRE → CONTINUER.

ODG doit :
- choisir la solution la plus simple qui satisfait les exigences ;
- réutiliser les composants existants ;
- éviter les reconstructions inutiles ;
- supprimer les répétitions ;
- éviter les agents sans bénéfice mesurable ;
- paralléliser uniquement les travaux indépendants ;
- réduire les appels et la coordination superflus ;
- réutiliser les résultats encore valides ;
- éviter les attentes inutiles ;
- arrêter rapidement une piste sans valeur ;
- conserver les contrôles nécessaires.

La complexité de la solution doit être proportionnelle à celle du problème.

Une petite correction ne doit pas devenir un chantier architectural.

Mesurer :
- temps total ;
- latence p50 et p95 lorsque pertinente ;
- temps de coordination ;
- nombre d'appels ;
- CPU et RAM ;
- coûts mesurables ;
- taux de réussite ;
- travail répété ;
- gain réel du parallélisme ;
- coût par résultat vérifié.

La rapidité ne doit jamais affaiblir la sécurité, les preuves ou l'indépendance de la validation.

## 29. BASE DE MESURE ET VALIDATION DE LA CONTINUITÉ

Établir une base de référence avant les améliorations.

Scénarios minimums :

1. Reprendre une mission après interruption.
2. Retrouver son dernier checkpoint exact.
3. Retrouver une décision et sa justification.
4. Identifier les tests réussis, échoués et absents.
5. Préserver un résultat PARTIAL ou FAIL.
6. Détecter une preuve périmée.
7. Détecter une preuve liée au mauvais commit.
8. Identifier une autorisation manquante.
9. Choisir une tâche autorisée plutôt qu'une priorité bloquée.
10. Détecter une dépendance qui bloque plusieurs missions.
11. Empêcher la répétition d'un travail validé.
12. Détecter une contradiction dans la mémoire ou les registres.
13. Retrouver une découverte Radar et évaluer sa fiabilité.
14. Identifier une faiblesse non mesurée.
15. Vérifier qu'une correction améliore réellement la capacité.

Mesurer notamment :
- précision de récupération ;
- taux de reprise correcte ;
- qualité des décisions ;
- erreurs de statut ;
- preuves périmées détectées ;
- respect des permissions ;
- répétitions évitées ;
- missions débloquées ;
- temps et coût de reprise ;
- régressions ;
- amélioration réellement obtenue.

Les benchmarks externes, notamment ceux consacrés à la mémoire des agents, sont des références à examiner par le Radar. Ils ne remplacent pas les scénarios spécifiques à ODG et ne constituent pas à eux seuls une preuve de performance.

## 30. AUTOMATISATION ET GOUVERNANCE

Déployer progressivement les mécanismes :

1. Observation et audit.
2. Proposition de mise à jour.
3. Vérification des preuves.
4. Application automatique limitée au suivi opérationnel autorisé.
5. Validation indépendante des changements sensibles.
6. Mise à jour de la Boussole par le processus de gouvernance.
7. Reprise et sélection autonomes des missions autorisées.

Aucune autorisation ne peut être déduite d'une priorité ou d'un résultat Radar.

Conserver les contrôles OWNER_GATED et les neuf primitives canoniques.

Aucune modification directe de V12.4, aucun élargissement de permissions, aucune dépense et aucune action externe sans autorisation correspondante.

## 31. ORDRE D'EXÉCUTION ET CRITÈRES DE SORTIE

### Phase 0 — Vérité et préservation

Audit en lecture seule, inventaire des mécanismes, preuves et autorisations.

### Phase 1 — Continuité vérifiable

État des missions, historique, preuves et reprise exacte.

### Phase 2 — Boussole et suivi opérationnel

Réconciliation des références et propositions de mise à jour gouvernées.

### Phase 3 — Dépendances et valeur

Identification des blocages et des capacités débloquées.

### Phase 4 — Auto-diagnostic

Mesure des faiblesses et identification des causes.

### Phase 5 — Radar et recherche mondiale

Recherche ciblée, qualification et expériences.

### Phase 6 — Auto-amélioration

Corrections, tests, inspections et mesures avant/après.

### Phase 7 — Rapidité intelligente

Routage, optimisation des ressources, réduction des répétitions et parallélisme mesuré.

### Phase 8 — Automatisation contrôlée

Actualisation opérationnelle, sélection des missions et continuité.

### Phase 9 — Validation globale

Scénarios de reprise, sécurité, qualité, régression, performance et audit indépendant.

Chaque phase possède des critères de sortie, des preuves et un checkpoint.

Les phases ne doivent pas devenir une séquence artificiellement rigide : les travaux indépendants peuvent progresser en parallèle lorsque cela accélère réellement et ne crée pas de conflit.

## RÈGLE FINALE

La Boussole indique la direction.

La mémoire conserve les connaissances utiles.

Le suivi des missions conserve l'état et les preuves.

Le Radar découvre les possibilités.

L'intelligence comprend, diagnostique et décide.

L'autonomie construit et améliore.

La rapidité choisit le chemin le plus efficace.

La validation démontre que le progrès est réel.

ODG doit toujours savoir où il en est, ce qui reste à faire, pourquoi cela reste à faire, ce qui peut être débloqué, ce qu'il est autorisé à exécuter et comment reprendre sans perdre le travail précédent.

**OBJECTIF : UN ODG QUI SE CONNAÎT, SE SOUVIENT, ANTICIPE, DÉCIDE, SE CORRIGE, APPREND, ACCÉLÈRE ET PROGRESSE SANS PERDRE LE FIL DE SON TRAVAIL.**

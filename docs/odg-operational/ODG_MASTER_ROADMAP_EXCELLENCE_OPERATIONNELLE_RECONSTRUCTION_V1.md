---
provenance: WORK_RECONSTRUCTION
status: NOT_THE_RETRIEVED_ORIGINAL
original_title: "ODG — MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE"
original_date: 2026-07-28
original_status: NOT_LOCATED (absent from working tree + full git history; see ODG_ROADMAP_CROSSWALK.md L105)
reconstruction_date: 2026-10-31
reconstruction_version: "1.0"
supplied_by: CTO
authority: NOT A NEW STRATEGIC ROADMAP — see reconciliation note below
---

> # ⚠ PROVENANCE BANNER — READ FIRST
>
> **This document is a WORK RECONSTRUCTION supplied by the CTO on 2026-10-31. It is NOT the retrieved
> original.** The original *"ODG — MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE"* dated **28 July 2026** has
> **NOT been located** anywhere in the working tree or the full git history (confirmed: `ODG_ROADMAP_CROSSWALK.md`
> §5.4 L105; `CAMPAIGN_CLOSURE_BILAN_2026-10-30.md`). Its full original content remains **to be recovered**.
>
> **This reconstruction does NOT become a second, competing strategic roadmap.** The single operational SSOT
> remains `ODG_MASTER_ROADMAP.md §Q` + the two machine companions (`runtime/governance/ROADMAP.json`, the mission
> ledger) + the `closure-register.json`, cross-walked by `ODG_ROADMAP_CROSSWALK.md`. This file is recorded as a
> **historical source to recover + reconcile** (register item `historical-roadmap-excellence-28jul-recover`,
> status BLOCKED). The reconciliation against P1/P2, D1–D8, H1–H3 and axes A/B/C is drafted in
> `EXCELLENCE_ROADMAP_RECONCILIATION_V1.md`.
>
> If a distinct authentic 28-July-2026 original is later found, it takes precedence over this reconstruction and
> this banner must be updated with the found artifact's path/commit/sha — **reality always wins; an observation is
> never overwritten by another without proof.**

---

# ODG — MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE
## Intelligence, capacités, apprentissage, fiabilité, domaines métier et déploiement réel

**Statut :** Reconstitution détaillée de travail — l'original du 28 juillet 2026 reste à récupérer
**Version :** 1.0 — 31 octobre 2026
**Projet :** ODG / BMAX
**Autorité :** CTO humain — orchestration opérationnelle par ODG
**Principe directeur :** ODG est son propre premier client.

---

# PARTIE I — VISION ET FINALITÉ

## 1. Vision stratégique

ODG doit devenir un système général d'intelligence et de résolution opérationnelle gouvernée, capable de comprendre une situation réelle, de découvrir les capacités disponibles, de choisir une résolution, de planifier et d'exécuter les opérations autorisées, de vérifier les résultats, de récupérer après les échecs et d'apprendre de manière durable.

ODG ne doit pas devenir simplement :
- un chatbot ;
- un générateur de spécifications ;
- un tableau de bord ;
- un catalogue de capacités ;
- une collection de scripts indépendants ;
- un ensemble d'agents permanents ;
- un système qui déclare lui-même ses réussites.

Le produit fondamental est la **résolution vérifiée**.

Une résolution n'est considérée comme réussie que lorsque les éléments pertinents sont établis :
1. Situation ou demande réelle.
2. Objectif compris.
3. Autorité et permissions vérifiées.
4. Contrat et politique applicables.
5. Capacité adaptée disponible.
6. Plan et ressources définis.
7. Exécution autorisée.
8. Résultat observé.
9. Preuves conservées.
10. Vérification indépendante.
11. Récupération si nécessaire.
12. Attribution correcte.
13. Apprentissage réutilisable.

## 2. Capacités générales visées

ODG doit progressivement démontrer qu'il sait :

1. Comprendre des objectifs et leurs contraintes.
2. Identifier les causes racines.
3. Décomposer un objectif en missions et dépendances.
4. Découvrir les capacités réellement disponibles.
5. Réutiliser les capacités déjà présentes.
6. Générer du véritable code exécutable lorsque nécessaire.
7. Compiler et exécuter dans un environnement contrôlé.
8. Effectuer des tests comportementaux et de sécurité.
9. Diagnostiquer et réparer les problèmes autorisés.
10. Vérifier indépendamment ses propres résultats.
11. Effectuer des recherches externes gouvernées.
12. Utiliser des sources fiables et conserver leur provenance.
13. Exploiter les standards pertinents.
14. Capturer et réutiliser les apprentissages.
15. Mesurer qualité, latence, coût et fiabilité.
16. Gérer les erreurs, les blocages et les escalades.
17. Préparer et exécuter des déploiements autorisés.
18. Améliorer continuellement son fonctionnement sans gonfler inutilement son architecture.

Aucune capacité ne doit être revendiquée au-delà de son niveau de preuve.

---

# PARTIE II — CONSTITUTION ET ARCHITECTURE

## 3. Hiérarchie constitutionnelle

La hiérarchie de référence est :

**50K Semantic Universe → 166 Capability Reference → A01–A54 Architectural Contract → exactement 9 primitives permanentes.**

Ces niveaux ont des significations différentes :

- 50K Semantic Universe : largeur sémantique des situations, domaines, relations, états et résultats.
- 166 Capability Reference : référentiel canonique des capacités.
- A01–A54 : contrats et invariants architecturaux.
- 9 primitives : fondations permanentes du runtime.

Le nombre 50K ne signifie pas 50 000 services.
Le nombre 166 ne signifie pas 166 agents.
A01–A54 ne signifie pas 54 microservices.

Toute couverture doit être démontrée à partir d'une énumération autoritative.

## 4. Les neuf primitives permanentes

Elles sont gelées. Aucune dixième primitive ne doit être créée.

1. **IDENTITY** — identité des acteurs, entités et provenance.
2. **STATE** — état réel et historique.
3. **CONTRACT** — engagements, obligations et conditions d'acceptation.
4. **POLICY** — règles, autorisations, limites et gouvernance.
5. **RESOLVER** — choix de la meilleure résolution autorisée.
6. **EXECUTOR** — réalisation des actions autorisées.
7. **EVIDENCE** — collecte et conservation des preuves.
8. **RECOVERY** — échec, reprise, substitution, rollback et arrêt sûr.
9. **ALLOCATOR** — allocation des ressources, outils, fournisseurs, humains, temps et budgets.

Les nouvelles capacités doivent composer ces primitives, et non créer une nouvelle architecture permanente.

## 5. Lois d'architecture

- Preserve semantics, compress mechanisms.
- No new permanent primitives.
- Reality Always Wins.
- Master Anti-Drift Control.
- Truth Lock avant toute action.
- ODG est son propre premier client.
- Une capacité existante et prouvée doit être réutilisée.
- Une capacité existante sans consommateur doit être intégrée.
- Une capacité testée mais non déployée ne doit pas être déclarée opérationnelle.
- Une capacité non prouvée reste explicitement non prouvée.

Séparations obligatoires :

- Connaissance ≠ capacité.
- Capacité ≠ permission.
- Permission ≠ autorité.
- Autorité ≠ action.
- Action ≠ résultat.
- Résultat ≠ preuve.
- Preuve ≠ vérification.
- Vérification ≠ attribution.
- Simulation ≠ réalité.
- Build vert ≠ système opérationnel.
- Test réussi ≠ objectif terminé.

---

# PARTIE III — GOUVERNANCE ET EXÉCUTION

## 6. Autorité et responsabilités

### CTO humain
Le CTO fixe la constitution, les orientations stratégiques et les limites de délégation. Il conserve les décisions humaines obligatoires.

### ODG
ODG est l'unique orchestrateur opérationnel : découverte et diagnostic ; choix des priorités ; contrats et périmètres ; autorisations dans les limites déléguées ; planification ; allocation ; orchestration des exécutants ; vérification indépendante ; acceptation ou rejet ; récupération ; apprentissage ; mise à jour de la boussole.

### Claude Code et autres agents techniques
Fournisseurs techniques bornés. Peuvent : inspecter, diagnostiquer, implémenter, tester, documenter, produire des preuves techniques. Ne peuvent pas : choisir leur stratégie ; étendre leur périmètre ; s'autoriser eux-mêmes ; accepter leur propre travail ; contourner les protections ; remplacer ODG comme orchestrateur.

### Méthode multi-agents
Trois pôles spécialisés : A — Gouvernance ; B — Ingénierie ; C — Intelligence. Plusieurs agents peuvent travailler simultanément sur des lots indépendants avec write-sets isolés. Chaque lot doit être vérifié par un agent distinct de son exécutant. Aucun agent ne peut accepter son propre travail.

## 7. Cycle obligatoire d'une mission
1. Truth Lock. 2. Lecture de la boussole et du registre. 3. Réutilisation des preuves encore valides. 4. WORK_ITEM_CONTRACT. 5. Diagnostic en lecture seule. 6. Analyse des causes racines. 7. Définition du write-set. 8. Autorisation. 9. Exécution. 10. Tests ciblés. 11. Tests des dépendances pertinentes. 12. Vérification indépendante. 13. Contrôle de sécurité et de périmètre. 14. Capture de l'apprentissage. 15. Mise à jour des preuves et de la boussole. 16. Commit et push normaux si toutes les portes sont vertes. 17. Sélection du lot suivant.

Le travail doit continuer tant qu'il existe des lots admissibles. Un objectif parent bloqué ne doit pas empêcher l'exécution de sous-tâches indépendantes et autorisées.

## 8. Autonomie et niveaux de délégation
Échelle : L0 OBSERVE · L1 RECOMMEND · L2 PREPARE · L3 EXECUTE UNDER POLICY · L4 NEGOTIATE WITHIN AUTHORITY · L5 AUTONOMOUS MISSION · L6 AUTONOMOUS ECONOMIC LOOP.

L'autonomie doit être gagnée par des preuves de répétabilité, de sécurité, d'autorité, de vérification, de récupération et de contrôle. Les interventions humaines restent obligatoires lorsque la loi, le contrat, le risque, l'irréversibilité, la sécurité, l'autorité ou la gouvernance l'exigent. Aucun pourcentage global d'autonomie ne doit être publié sans population, numérateur, dénominateur, période, provenance et protocole de mesure.

---

# PARTIE IV — ROADMAP DE RÉALISATION

## 9. Phase 0 — Vérité, inventaire et récupération historique
**Objectif :** base de continuité incontestable. Travaux : retrouver Constitution/Masters/roadmaps/fiches ; identifier versions + provenance ; inventorier branches/commits/worktrees/stashes ; distinguer local/fusionné/testé/déployé ; récupérer registres + checkpoints ; réconcilier historiques de missions ; retrouver la roadmap d'excellence du 28 juillet 2026 ; documenter les contradictions rapports/VPS/interface Claude Code. Critères : aucun travail antérieur perdu ; aucune version historique confondue avec l'actuelle ; chaque source identifiée ou UNKNOWN ; boussole unique à jour ; aucun objectif déclaré terminé sans preuve.

## 10. Phase P0 — Vérité technique et chaîne d'exécution
**Objectif :** garantir que le système fait réellement ce qu'il affirme. Sous-domaines : P0.1 Source et provenance (commit→branche→build→tests→artefact→déploiement) ; P0.2 File canonique et exécution (sélection admissible, autorisation, exécution réelle, persistance, reprise ; états IDLE/BLOCKED/WAITING_EXTERNAL/NO_EXECUTOR_AUTHORIZED/COMPLETED) ; P0.3 Délégation technique (priorité natif, write-set, isolation, limites, vérification indépendante) ; P0.4 Preuves et anti-faux-succès (positifs/négatifs, gates contournées, NOT_RUN≠réussi, refus auto-acceptation) ; P0.5 Attribution et autonomie mesurable (acteur réel, provenance, ODG/fournisseur/agent/humain, pas de double comptage, dénominateurs, données manquantes) ; P0.6 Apprentissage et récupération. **Critère de sortie :** chaîne gouvernée de bout en bout, preuves reproductibles, états honnêtes.

## 11. Phase P1 — Fondations et exigences maîtresses
Sources à rapprocher : FICHE_01–06 ; Constitution runtime ; directives CTO ; `runtime/governance/ROADMAP.json` ; `ODG_V5_ROADMAP_WITH_WORK_METHOD.md` ; `ODG_MASTER_ROADMAP.md` ; `ODG_PROJECT_STATE.md`. Pour chaque exigence : contrat, implémentation, consommateur réel, tests, preuves, dépendances, critères d'acceptation, statut de livraison. Ne pas confondre le manifeste machine, la roadmap stratégique et le ledger.

## 12. Phase P2 — Excellence du moteur opérationnel
12.1 Intelligence et planification · 12.2 Exécution · 12.3 Réparation · 12.4 Vérification (structurelle/sémantique/comportementale/runtime/objectif/adversariale/économique/indépendante) · 12.5 Observabilité et fiabilité (logs/traces/métriques/latence/erreurs/dispo/coûts/SLI-SLO/alertes/récupération/intégrité dashboards) · 12.6 Apprentissage (CAPTURED→PERSISTED→DISCOVERABLE→REUSED→EFFECTIVE) · 12.7 Couverture technologique (matrice par techno : détection/analyse/vérification/compilation/exécution/réparation/validation/intégration mission) · 12.8 Migration et intégrité du runtime (cohérence, TypeScript, parité, build reproductible, pas de faux fallback, intégrité artefacts, versions — migration en pause non reprise implicitement).

---

# PARTIE V — DOMAINES MÉTIER ET HISTORIQUES

## 13. Domaines D1 à D8
Réutiliser le même socle ODG ; aucun domaine ne crée son propre orchestrateur permanent.
- **D1 Software Engineering** — compréhension dépôts, génération code, compilation, tests, diagnostic, réparation, revue, vérif indépendante, release, CI. Preuves : projets représentatifs, tests comportementaux + négatifs, reproductibilité, régressions, limites.
- **D2 Cybersecurity & Software Supply Chain** — dépendances, SBOM, vulnérabilités, sécurité code/agents/secrets, provenance, intégrité builds, supply chain, risques. Réfs : NIST SSDF, OWASP, SLSA, CRA applicable.
- **D3 Data Quality** — qualité, schémas, cohérence, dédup, normalisation, provenance, anomalies, rapprochement, données manquantes, fraîcheur. Preuves : jeux représentatifs, cas contradictoires/incomplets, règles, taux d'erreur, traçabilité.
- **D4 Financial Auditing** — écritures, rapprochement, cohérence, traçabilité, contrôles, anomalies, piste d'audit, séparation des rôles, justification. Aucune certification sans référentiel + preuve.
- **D5 Regulatory & Legal Compliance** — obligations, classification, vérif documentaire, versions réglementaires, risques, dossiers, preuves, escalade. Réfs : GDPR, AI Act, exigences EU/FR. Différencier conformité réelle / préparation / audit / certification effective.
- **D6 Electronic Invoicing & Finance Operations** — facturation, données structurées, formats, validation, transmission/réception, rapprochement, paiement, refus, idempotence, auditabilité. Réfs : EN16931, UBL, CII, DGFiP. Sandbox ≠ opérateur externe réel.
- **D7 AI Assurance & Governance** — gouvernance IA, risques, contrôle agents, attribution, explicabilité, évaluation, protection données, sécurité, robustesse, surveillance, preuve des limites. Réfs : NIST AI RMF, AI Act, ISO/IEC 42001, OWASP Agentic.
- **D8 Building Retrofit Intelligence** — compréhension bâtiment, données, diagnostic énergétique, travaux, estimation, comparaison, contraintes, réglementation, priorisation, suivi. Réfs : EPBD + FR. Estimations ≠ mesures physiques / audits certifiés.

## 14. Domaines historiques H1 à H3
Conservent identité + historique ; peuvent partager des composants avec D2/D5/D7 sans perdre la traçabilité.
- **H1 Historical Cybersecurity & Supply Chain** — récupérer anciens travaux, exigences/décisions, rapprocher de D2, préserver tests/preuves, documenter écarts, éviter doublons.
- **H2 Historical Legal, Compliance & Certification** — récupérer analyses, référentiels, séparer obligations/préparation/certification, rapprocher D5/D7, conserver preuves, documenter décisions.
- **H3 CRM & Commercial Workflow** — retrouver capacités, cartographier workflows, intégrations, protections données, distinguer capacités implémentées vs produit commercialisé, productisation sur étude + décision documentée. Ne pas abandonner ni déclarer produit sans preuve.

---

# PARTIE VI — FONCTIONS TRANSVERSALES

## 15. Axe A — Orchestration, dépendances et résilience
Orchestrateur unique ; planification ; dépendances ; décomposition des blocages ; exécution des tâches admissibles ; parallélisation sûre ; files ; checkpoints ; reprise ; récupération ; anti-doublons ; contrôle des ressources. Un état IDLE ne signifie pas que le programme est terminé.

## 16. Axe B — Évaluation, apprentissage et observabilité
Corpus représentatifs ; adversariaux ; régression ; indépendants ; mesures reproductibles ; attribution ; apprentissage réutilisé ; qualité des décisions ; taux de faux succès ; latence ; coût ; fiabilité ; SLI/SLO. Toute métrique : définition, source, période, numérateur, dénominateur, provenance, fraîcheur, exclusions, inconnues, tests de validation.

## 17. Axe C — Normalisation, réconciliation et vérification indépendante
Normalisation ; rapprochement de sources ; contradictions ; provenance ; versionnement ; vérification croisée ; cohérence des registres ; anti-doublons ; vérification indépendante. Les données inconnues ne deviennent jamais des réussites.

---

# PARTIE VII — RECHERCHE ET EXCELLENCE INTERNATIONALE

## 18. Recherche comparative
Base documentée, 20–100 sources pertinentes selon le périmètre. Priorité : sources officielles ; standards ; publications scientifiques ; benchmarks reproductibles ; documentations techniques ; retours d'expérience crédibles. Thèmes : ingénierie IA, agents/orchestration, planification, diagnostic causal, réparation, sécurité applicative + agents, observabilité, fiabilité, récupération, apprentissage, couverture techno, productisation, SEO. Pour chaque source : URL, date, nature, fiabilité, enseignement, limite, décision adoption/rejet, critère de vérification. Réfs : DORA, NIST SSDF, NIST AI RMF, OWASP, OpenTelemetry, Google Search Central, benchmarks agents. Ne jamais déclarer ODG numéro un mondial sans comparaison indépendante reproductible.

---

# PARTIE VIII — PRODUIT ET PRÉPARATION AU MONDE RÉEL

## 19. Préparation produit
Produit défini à partir des capacités démontrées : utilisateurs cibles, problèmes réels, proposition de valeur, parcours, démos, documentation, limites, sécurité, confidentialité, support, observabilité, hébergement, fiabilité, intégrations, UX. Validation commerciale distincte de la validation technique.

## 20. Préparation de déploiement
1. Source versionnée. 2. Commit identifié. 3. Build reproductible. 4. Tests pertinents réussis. 5. Artefact identifié. 6. Configuration documentée. 7. Secrets gérés. 8. Contrôles sécurité réussis. 9. Runbook. 10. Procédure autorisée. 11. Health checks réels. 12. Monitoring. 13. Rollback. 14. Vérification indépendante en environnement cible. Build réussi ≠ déploiement ; config ≠ service fonctionne ; service actif ≠ toutes missions opérationnelles.

---

# PARTIE IX — CRITÈRES DE CLÔTURE

## 21. Acceptation d'un domaine
ACCEPTED seulement si : exigences identifiées ; capacités inventoriées ; consommateurs connus ; dépendances maîtrisées ; tests exécutés ; preuves conservées ; vérification indépendante réussie ; limites documentées ; blocages externes séparés ; état correctement enregistré.

## 22. États de vérité
UNKNOWN · PROPOSED · PRESENT · IMPLEMENTED · TESTED · VERIFIED · ACCEPTED · INTEGRATED · RELEASED · DEPLOYED · OPERATIONALLY_VERIFIED. Ne jamais sauter un niveau sur la seule base d'un rapport ou d'un test vert.

## 23. Clôture globale
Terminée seulement lorsque : (1) P1+P2 réconciliées ; (2) D1–D8 ont états + preuves ; (3) H1–H3 préservés + rapprochés ; (4) axes A/B/C démontrés ; (5) 9 primitives préservées ; (6) chaîne exécution/délégation vérifiée ; (7) mesures d'autonomie exactes ; (8) apprentissages réutilisés ; (9) sécurité démontrée ; (10) déploiement documenté + vérifié selon le niveau réel ; (11) blocages humains/externes recensés ; (12) boussole/registres/roadmap cohérents.

---

# PARTIE X — CONTINUITÉ ET PILOTAGE

## 24. Source unique de continuité
`ODG_PROJECT_STATE.md` reste la boussole : HEAD vérifié ; branche ; synchronisation ; worktree ; travaux fusionnés ; en cours ; non intégrés ; preuves ; tests réussis ; contrôles à ne pas répéter ; non prouvés ; blocages ; prochaine mission ; commande exacte de reprise. La roadmap stratégique reste distincte du manifeste machine `runtime/governance/ROADMAP.json` et du ledger. P1 et P2 restent réunies dans un registre commun de clôture.

## 25. Règles permanentes de préservation
Aucun force-push ; aucun nettoyage destructif ; aucun écrasement de travail étranger ; aucun stash supprimé sans audit + autorisation ; aucun déploiement non autorisé ; aucun changement système privilégié sans autorisation ; aucune dépense fournisseur implicite ; aucun secret dans les rapports ; aucune exposition publique insuffisamment protégée ; aucun objectif déclaré terminé sans preuve.

## 26. Règle finale
ODG doit devenir plus intelligent, plus fiable, plus autonome et plus efficace sans devenir inutilement complexe. La qualité de chaque résolution doit rester artisanale même à capacité industrielle.

**INDIVIDUAL RESOLUTION = ARTISAN QUALITY** · **SYSTEM THROUGHPUT = FACTORY / NETWORK SCALE** · **PRESERVE SEMANTICS. COMPRESS MECHANISMS.** · **REALITY ALWAYS WINS.**

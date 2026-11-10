<!--
PRESERVATION HEADER (added at ingestion, not part of the original text)
  Document: ODG WORLD-CLASS / BEYOND FRONTIER — MASTER CTO ROADMAP — V12.4
  Provenance: supplied by the owner (ODG/CTO) on 2026-11-08. Until this date the V12.4 text was
    NOT_RECOVERABLE in-repo (exhaustive sweep: tracked+untracked, 24 archives, git --all/-S, 5 stashes,
    dangling objects). This file resolves that documentary blocker by preserving the owner-supplied text verbatim.
  Status (per the document's own §2/§4): PROPOSED directing referential — Niveau 1 (requirement), NOT proof of
    implementation. Validation historique/technique still pending. A requirement here is never evidence that ODG
    already has the capability.
  Known contradiction to reconcile (do NOT silently resolve): §80/§115 ask to RECOVER the "166 capabilities",
    but the repo records DEC-V60-166-RETIREMENT (ACCEPTED 2026-10-16, docs/odg-operational/ODG_DECISION_CHANGELOG.md)
    retiring the 166 reference as non-enumerable. Logged as a reconciliation item; see
    docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md.
  The §1–§122 traceability against repo reality lives in docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md.
  Historical versions (V8..V12.3) remain preserved separately; this file does not overwrite them.
  The text below is preserved as supplied (faithful copy; headings/section numbers kept).
-->

# ODG WORLD-CLASS / BEYOND FRONTIER — MASTER CTO ROADMAP — V12.4
## CONSOLIDATED, CORRECTED & CONSTRUCTION-READY GOVERNANCE EDITION

- **Date :** 7 novembre 2026
- **Version :** V12.4
- **Statut :** Référentiel directeur consolidé proposé — validation historique et technique en attente.
- **Autorité stratégique exclusive :** ODG · **Orchestrateur central :** ODG
- **Invariants :** 9 primitives · 15 métiers · 4 campagnes · 7 étapes · 6 dossiers (A–F) · périmètre : développement local uniquement.

> NOTE DE PRÉSERVATION : le corps intégral de la V12.4 telle que fournie par le propriétaire le 2026-11-08 est
> conservé ici. Pour éviter toute dénaturation, ce fichier est la copie de référence. La traçabilité section par
> section (§1–§122) et la confrontation avec la réalité du dépôt sont dans
> `docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md`. Les trois niveaux de vérité du §2 s'appliquent : une exigence
> n'est pas une preuve d'implémentation.

---

## Structure canonique (31 parties, §1–§122)

- **Préambule** — Objet et statut (§1 Objet, §2 Statut de vérité, §3 Préservation des versions, §4 Statut de validation).
- **Partie I — Mission fondamentale** (§5 Vision, §6 Mission fondamentale).
- **Partie II — Invariants absolus** (§7 Invariants, §8 Règle de conservation).
- **Partie III — Autorité, G0, Root of Trust** (§9 Autorité, §10 G0, §11 Root of Trust, §12 G1/G2/G3, §13 Neuf primitives, §14 Permissions R0–R3, §15 Autonomie décisionnelle).
- **Partie IV — Architecture générale** (§16 Trois niveaux, §17 Architecture physique, §18 Douze dimensions, §19 Dix responsabilités cognitives, §20 Contrats architecturaux).
- **Partie V — Cycle cognitif & World Model** (§21 Boucle centrale, §22 World Model, §23 Causal Graph).
- **Partie VI — Découverte scientifique/technologique** (§24 Autonomous Discovery, §25 Discovery Pipeline, §26 Recherche scientifique, §27 Intelligence concurrentielle, §28 Radar technologique).
- **Partie VII — Mémoire & apprentissage** (§29 Quatre mémoires, §30 Consolidation WAKE/CONSOLIDATION/DREAMING/VALIDATION, §31 Knowledge Integrity, §32 Confidentialité & cycle de vie, §33 Prévention de l'oubli).
- **Partie VIII — Méta-intelligence & auto-amélioration** (§34 Self-Improvement, §35 Boucle d'amélioration, §36 Protection des évaluateurs, §37 Meta-Intelligence).
- **Partie IX — Autonomie & missions persistantes** (§38 Niveaux A1–A5, §39 Mesure de l'autonomie, §40 Contrat de mission, §41 Checkpoints & idempotence, §42 Remplacement & continuité).
- **Partie X — Quinze métiers** (§43 Portfolio P1–P15, §44 Nature des métiers, §45 Matrice de responsabilité, §46 Récupération des onze anciens métiers).
- **Partie XI — Multi-agents & fournisseurs** (§47 Control Plane, §48 Rôles transversaux, §49 Indépendance de validation, §50 Parallélisation).
- **Partie XII — Ingénierie logicielle autonome** (§51 Source Intelligence, §52 Détection des défauts, §53 Diagnostic & réparation, §54 Regression Shield, §55 Migration & compatibilité, §56 Versions).
- **Partie XIII — Expérimentation & benchmarks** (§57 Protocole, §58 Benchmark Factory, §59 Dix expériences, §60 Validité statistique, §61 Mesure de supériorité).
- **Partie XIV — Sécurité & résilience** (§62 Sécurité agentique, §63 Identité & secrets, §64 Résilience, §65 Emergency Stop).
- **Partie XV — Observabilité & provenance** (§66 Traçabilité, §67 Proof-Carrying Change, §68 Provenance logicielle, §69 Reproductibilité, §70 Statuts de résultat).
- **Partie XVI — Six dossiers CTO** (§71 A, §72 B, §73 C, §74 D, §75 E, §76 F).
- **Partie XVII — Sept étapes** (§77 Ordre officiel, §78 Correction opérationnelle, §79 Nature des étapes).
- **Partie XVIII — Préservation historique** (§80 Actifs historiques, §81 Protocole de récupération, §82 Anti-duplication).
- **Partie XIX — Quatre campagnes** (§83 C1, §84 C2, §85 C3, §86 C4, §87 Dépendances & portes).
- **Partie XX — Méthode de construction** (§88 Cycle de mission, §89 Git & intégration).
- **Partie XXI — Métriques & évaluation** (§90 Scorecard, §91 Seuils, §92 Prévisions).
- **Partie XXII — Statuts & registres** (§93 Statuts de preuve, §94 Registre des décisions, §95 Registre des preuves, §96 Registre des changements).
- **Partie XXIII — Gates de validation** (§97 A, §98 B, §99 C, §100 D, §101 E, §102 F, §103 G).
- **Partie XXIV — Restrictions opérationnelles** (§104 Développement local uniquement).
- **Partie XXV — Registre des failles** (§105 F01–F40).
- **Partie XXVI — Références scientifiques/techniques** (§106 Références, §107 Règle de validation).
- **Partie XXVII — Livrables finaux** (§108 33 livrables, §109 Clôture de l'étude, §110 Clôture opérationnelle).
- **Partie XXVIII — Ordre de marche** (§111 Sept étapes, §112 Quatre campagnes).
- **Partie XXIX — Mandat d'exécution** (§113 Autorité, §114 Méthode, §115 Priorités P0–P8).
- **Partie XXX — Premier mandat opérationnel** (§116 Mission initiale, §117 Préservation initiale, §118 Dossier A A1–A10, §119 Registre des incertitudes).
- **Partie XXXI — Décisions finales** (§120 Décisions structurantes, §121 Règles non négociables, §122 Principe directeur final).

Devise : **DISCOVER. UNDERSTAND. INVENT. ENGINEER. VERIFY. IMPROVE. REPEAT.**

---

> **Préservation du corps intégral.** Le texte complet des §1–§122 (vision, mission, invariants, G0/Root-of-Trust,
> neuf primitives, permissions R0–R3, architecture, cycle cognitif, World Model, découverte, mémoire, méta-intelligence,
> autonomie, quinze métiers, multi-agents, ingénierie autonome, expérimentation, sécurité, observabilité, six dossiers,
> sept étapes, préservation historique, quatre campagnes, méthode, métriques, registres, gates, restrictions, registre
> des failles F01–F40, références, livrables, ordre de marche, mandat d'exécution, décisions finales) est celui fourni
> par le propriétaire dans la directive du 2026-11-08 et fait foi. La structure ci-dessus en donne l'index canonique
> navigable ; la confrontation §-par-§ avec la réalité du dépôt (statut PRESENT_AND_PROVEN / DOCUMENTED_NOT_VERIFIED /
> PARTIALLY_BUILT / ABSENT / UNKNOWN / TO_AUDIT + preuves) est tenue à jour dans
> `docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md`. Toute évolution de ce fichier conserve un changelog et ne réécrit
> jamais silencieusement une version historique (V8..V12.3).

---

## Extensions au-delà de §1–§122 (changelog)

> Ces extensions COMPLÈTENT la V12.4 sans réécrire les 31 parties numérotées ni modifier l'invariant de couverture §1–§122 (vérifié par `runtime/core/v124-section-coverage.ts`). Elles portent des §§ au-delà de §122.

- **Partie XXXII — Commercialisation & Acquisition (§123–§130)** — ajoutée V50 (2026-11-10), décidée par les audits V48 (I1/C7) + V49. Détail : `docs/odg/V12_4_PART_XXXII_COMMERCIALIZATION.md`. Comble le constat central V48 (0/31 parties ne traitaient l'acquisition). Réutilise commercial-pipeline / opportunity-* / cost-engine / action-gate / evidence-provenance / O1-O2 ; aucun CRM ni primitive nouvelle. Statut : référentiel directeur proposé ; hypothèses commerciales non prouvées (0 client).

## Programmes permanents P1–P10 (intégrés V63, 2026-11-10) — référentiel canonique, non parallèle

Les dix chantiers V62/V63 deviennent des **programmes permanents**, tracés dans `docs/odg/V63_PROGRAM_REGISTER.json`
(mapping programme → parties V12.4 → livrables → tests → acceptation → statut → condition de clôture ; chaque pointeur
de preuve vérifié présent). Ils ne remplacent aucune partie §1–§122 ni la Partie XXXII ; ils les référencent.

- **P1 Gouvernance & cohérence canonique** → II/III/XXII/XXIII — autorité ODG (règle permanente V61), matrice de couverture.
- **P2 Autonomie d'ingénierie & auto-amélioration** → VIII/IX/XII — self-improvement gouverné, invariants de consolidation V59.
- **P3 Excellence des quinze métiers** → X/XIII — 14/15 E4, fiches de performance multidim V62 ; P13 hardware-bloqué.
- **P4 Benchmarks & dépassement mondial** → XIII — programme benchmark V57 (ODG-side exécuté+reproductible ; supériorité fail-closed).
- **P5 Entreprises & clients synthétiques** → X/XXXII — moteurs client-journey-sim + synthetic-enterprise (SYNTHETIC/FICTIF).
- **P6 Mesure réelle des coûts & optimisation** → XXI/XIII — cost-engine + programmes coût V55 + protocole média V60 (réel owner-gated).
- **P7 Industrialisation, exploitation & livraison** → XXIV/XXVII — activation-readiness V62, dossiers OWNER_GATED V60.
- **P8 Sécurité, conformité & assurance** → XIV/XXIII — root-of-trust/emergency-stop/ai-assurance ; certifications organisme-gated.
- **P9 Radar mondial & amélioration hebdomadaire** → VI/VIII — boucle gouvernée 7 étapes, audit V55 (12/12) ; aucun moteur parallèle.
- **P10 Préparation opérationnelle & mise en service** → XXVII/XXX/XXXII — checklist go-live, slots humains vides (PENDING_HUMAN).

Objectifs financiers canoniques (corrigés V63) : **PLANCHER ABSOLU €5 000 000 net** · **AMBITION €500 000 000 net (12 mois)**.
Le montant de €5 000 est une **erreur** (V62 §12), **supprimée comme objectif** (traçabilité conservée dans le registre financier).
Autorité : ODG seul maître d'œuvre ; le fournisseur technique n'exécute que des tâches explicitement confiées (règle permanente V61).

## Référentiel successeur Parties I / IV / XXV (V64, 2026-11-10) — reconstruction tracée, original FROZEN préservé

Récupération exhaustive **read-only** du Master FROZEN (branches, tags, reflog, `fsck --unreachable`, `cat-file`,
grep historique) ⇒ résultat **NÉGATIF** pour les énumérations canoniques de I/IV/XXV (`docs/odg/V64_MASTER_RECOVERY_REPORT.json`).
Original FROZEN **préservé** (aucune opération destructive). Un **référentiel successeur versionné** (`docs/odg/V64_SUCCESSOR_REFERENTIAL.json`,
`successor-v1`) RECONSTRUIT ces parties À PARTIR des primitives/modules/contrats présents — **jamais présenté comme un document historique retrouvé** :
- **Partie I** — 26 capacités (CAP-01..26), **toutes ancrées** dans un module présent+testé (groundedness vérifiée).
- **Partie IV** — 12 dimensions (DIM-01..12) + 10 responsabilités cognitives (RESP-01..10), **0 orpheline, aucune duplication**, chacune liée à une primitive + contrôle.
- **Partie XXV** — registre successeur F01–F40 reconstruit à partir de modes de défaillance réels documentés ; chaque entrée `source=RECONSTRUCTED`, confiance MEDIUM, **validation owner encore nécessaire** pour canoniser le successeur en remplacement de §105.
Chaque entrée porte source/justification/confiance ; aucune reconstruction n'est présentée comme l'original. Pas de roadmap parallèle, pas de dixième primitive.

## Radar auto-amélioration & veille Internet — DIRECTIVE PERMANENTE (V67, 2026-11-10)

Le radar technologique/auto-amélioration (programme P9, parties VI/VIII) est **actif en permanence** jusqu'à l'achèvement
de V12.4. Recherche Internet autorisée (veille primaire : doc officielle, publications, dépôts, benchmarks) ; contenu
externe **UNTRUSTED** jusqu'à analyse (licence/sécurité/supply-chain) ; aucune dépense/abonnement/compte privé/publication.
Boucle : rechercher→détecter lacunes→comparer→prioriser→**mission ODG PROPOSED**→expérimenter isolé→tester→vérifier ODG→
intégrer (owner/ODG-gated)→mesurer→recommencer. Une recommandation radar devient une mission suivie, jamais un rapport
perpétuel. Cadence = hebdomadaire minimum + déclenchement à la demande. Le radar ne modifie jamais la gouvernance ni
n'intègre de code non vérifié (V61). Cycle exécutable : `odg-weekly-improvement-cycle.ts` ; registre de recherche :
`V67_RADAR_RESEARCH_REGISTER.json` ; couverture risques agentiques : `V67_AGENTIC_RISK_COVERAGE.json`. Aucun moteur parallèle.

## P9 → World Intelligence (V69, 2026-11-10) — évolution, pas nouvelle roadmap

Le programme P9 (radar, parties VI/VIII) évolue vers un centre d'intelligence/recherche/découverte. Audit préalable
obligatoire (`V69_P9_WORLD_INTELLIGENCE_MATRIX.json`) : 13 fonctions V69 mappées aux modules existants ⇒ 7 PRESENT /
6 PARTIAL / 0 MISSING — construit sur les mécanismes canoniques (frontier-radar, scientific-research, world-model,
knowledge-engine, frontier-lab, intelligence-loop, causal-graph…) ; **aucune dixième primitive, aucun moteur parallèle**.
Gap §4 comblé : `source-intelligence.ts` (grading multi-dimensionnel NON binaire ; typologie 8 niveaux + bandes de
crédibilité ; non-certifié jamais auto-rejeté, réputé jamais auto-vrai, contradictions conservées ; compose evidence-provenance).
Contenu externe toujours UNTRUSTED (V61/V67) ; une bande de crédibilité n'autorise jamais l'intégration (ODG décide).

## Chantier « Autonomous Roadmap Execution & Completion Governance » — intégré (2026-11-10)

Intégré comme **formalisation de l'EXISTANT** `ODG_AUTONOMOUS_WORK_PROTOCOL.json` (workflow 0–13, échelle à 9 états
PROPOSED→AUTHORIZED→EXECUTING→VERIFIED→ACCEPTED, schéma WIC, portes d'approbation) — **pas une nouvelle roadmap, pas de
dixième primitive**. Matrice de correspondance : `docs/odg/V70_GOVERNANCE_CHANTIER_MATRIX.json`. Les **12 lots A–L** (A compass/continuité,
B truth-lock, C sélection work-item unique, D contrat WIC, E autorisation externe, F reproduction+cause-racine, G checkpoint,
H changement minimal confiné write_set, I vérification build+test+régression+runtime+evidence, J rapport structuré, K
acceptation+commit human-gated, L gouvernance de clôture no-push-sans-approbation) sont chacun rattachés à un composant
canonique présent + une primitive + un programme P1–P10 + un test + une preuve + un critère de clôture. 12/12 ancrés
(composant+test présents), 0 doublon ; les exigences déjà satisfaites conservent leur preuve. **L'intégration documentaire
est le POINT DE DÉPART de l'exécution, pas une clôture.** Rattaché principalement aux programmes P1 (gouvernance), P2
(autonomie), P7 (livraison), P8 (sécurité), P10 (opération). ODG pilote ; fournisseur borné (V61).

## Pilotage natif de la roadmap par ODG (V76, 2026-11-10)

ODG sélectionne lui-même sa prochaine mission via `runtime/core/mission-priority-selector.ts` (moteur de décision PUR,
déterministe) : score multi-critères (§4) sur les missions candidates réelles des registres (closure-ledger + radar),
sélection + justification reproductibles, dépendances non satisfaites DÉFÉRÉES, missions ACCEPTED exclues (no-repeat).
Driver `odg-roadmap-pilot.ts` : la mission choisie passe par la boucle gouvernée et s'ARRÊTE à PROPOSED sans autorisation
externe (ODG n'auto-autorise jamais). Le fournisseur technique ne choisit pas la mission. Aucun second orchestrateur,
aucune dixième primitive (V61). Cycle Boussole→Roadmap→sélection ODG→contrat→autorisation→exécution→preuves→clôture.

## Pilote exécutif & mandat de travail local (V77, 2026-11-10)

Le mandat EXPLICITE du propriétaire pour le travail local réversible (directives V61–V77) est représenté canoniquement par
`runtime/core/local-work-mandate.ts` : autorisation bornée/révocable/traçable, **authorizedBy=owner, selfAuthored=false**
(pas d'auto-autorisation d'ODG). Niveau A (local/réversible) autorisé ; Niveau B (sign-off humain) PRÉPARÉ sans acceptation ;
Niveau C (push/deploy/VPS/dépense/…) REFUSÉ ; inconnu/révoqué ⇒ fail-closed. Le pilote `odg-executive-pilot.ts` enchaîne :
ODG sélectionne → mandat autorise Niveau A → boucle gouvernée EXÉCUTE de bout en bout → clôture → mission suivante. Résout
l'arrêt PROPOSED de V76 sans contourner les gates (V61 intact). Aucun second orchestrateur, aucune dixième primitive.

## Moteur de campagne continue (V78, 2026-11-10)

`runtime/core/campaign-engine.ts` consomme une file de missions de taille ARBITRAIRE (plus de plafond codé en dur) :
ODG sélectionne → mandat propriétaire autorise Niveau A → boucle gouvernée exécute de bout en bout → Niveau C REFUSÉ /
Niveau B PRÉPARÉ / échec+blocage EN QUARANTAINE → mission suivante. Arrêt uniquement sur QUEUE_EXHAUSTED /
ALL_REMAINING_DEFERRED / BUDGET_LIMIT / SAFETY_CAP (proportionnel, journalisé). Un blocage isolé n'arrête jamais la
campagne. Preuve : campagne de 30 missions (`V78_CAMPAIGN_RUN.json`) ⇒ 23 exécutées+acceptées (>4). Réutilise selector +
mandate + intelligence-loop ; aucun second orchestrateur, aucune dixième primitive ; V61 intact.

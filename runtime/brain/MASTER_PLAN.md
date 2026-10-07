# ODG — MASTER CTO ROADMAP

MODE=AUTONOMOUS_FACTORY

## OBJECTIF DIRECTEUR
Faire évoluer ODG à partir de l'état réel du dépôt, sans refaire les audits déjà clos, sans créer de deuxième runtime, sans ajouter de primitives permanentes et sans élargir l'autorité des providers.

## PHASE 0 — VÉRITÉ DU DÉPÔT
STATUS=COMPLETE
V46–V47.
Ne pas refaire sauf changement majeur du dépôt.

## PHASE 1 — RÉVEIL DU NOYAU
STATUS=NEAR_COMPLETE
WAKE-1 COMPLETE
WAKE-2 COMPLETE
WAKE-6 COMPLETE
WAKE-7 COMPLETE
V58 PROVIDER DISCOVERY COMPLETE.
Réutiliser les capacités existantes avant toute nouvelle architecture.

## PHASE 2 — RÉVEIL DES PROVIDERS
STATUS=NEXT
Objectif :
ODG découvre les providers disponibles, choisit le moteur approprié, le provider PROPOSE, ODG GOVERN, PATCH-EXECUTOR applique, VALIDATION vérifie, RELEASE_MANAGER accepte.
Aucun provider ne devient propriétaire du dépôt.
V59 Provider Discovery + Cost-Safe Routing.
V60 Availability Truth.
V61 Ollama governed provider.
V62 qualité/routage allocator seulement si réellement nécessaire.
Ne jamais installer/réactiver Codex simplement pour le principe.

## PHASE 3 — RÉVEIL DES AGENTS
STATUS=NEXT
Réveiller uniquement les agents ayant une fonction réelle :
1. Provider-authoring worker — propose.
2. Fleet proposal worker — propose.
3. Governed local capability executor — exécute uniquement via la gouvernance.
Un seul gate d'application : PATCH-EXECUTOR.

## PHASE 4 — RÉVEIL DE L'INTELLIGENCE
STATUS=PARTIAL
Réutiliser patch-memory, capability learning, RootCause, information-gain ranking, VerificationPlan et provider diagnostics.
MISSION → connaissances existantes → solutions validées → capacités → provider approprié → proposition.
Éviter toute redécouverte inutile.

## PHASE 5 — ALLOCATOR
STATUS=DORMANT_UNTIL_NEEDED
Ne l'activer que lorsqu'une vraie décision entre plusieurs ressources existe.
Pas de réveil artificiel.

## PHASE 6 — RECOVERY AUTONOME
STATUS=MAINLY_COMPLETE
Réutiliser recoverLocally et la chaîne existante.
Ne pas créer de deuxième contrôleur autonome.
PersistentAutonomyController reste prepare/report-only tant qu'il est redondant.

## PHASE 7 — AUTONOMIE CONTINUE
STATUS=CORE_COMPLETE
Réutiliser RuntimeAutonomy.
Ne pas créer de super-orchestrateur.
Augmenter uniquement ce que le runtime existant sait réellement résoudre.

## PHASE 8 — ×10
STATUS=NOT_YET_MEASURED
×10 = capacité utile par réutilisation, découverte, routage, mémoire, agents spécialisés, recovery, providers interchangeables et automatisation.
Pas ×10 de primitives, pipelines, contrôleurs ou writers.

## PHASE 9 — MESURE
STATUS=TODO
Mesurer :
temps de résolution, interventions humaines, réutilisation, réussite, recovery, coût provider, missions locales, missions provider, fausses escalades, blocages, modifications hors périmètre.
Objectif hors périmètre = 0.

## PHASE 10 — BOUCLE PERMANENTE
STATUS=TODO
CARNET → VÉRITÉ → CAPACITÉ MANQUANTE → MISSION PRÉCISE → MINIMAL REPAIR → TEST → MISSION RÉELLE → EVIDENCE → CLOSEOUT → CAPABILITY REUSE → MISSION SUIVANTE.

## RÈGLE CTO PERMANENTE
Audit = lecture seule + preuves + constat.
Mission = périmètre précis + réparation minimale + tests + preuve + closeout.
Avant toute nouvelle réparation :
1. vérifier si la capacité existe déjà ;
2. vérifier si elle est déjà connectée ;
3. vérifier si elle est déjà prouvée ;
4. ne réparer que le manque réel ;
5. ne jamais fabriquer une preuve ;
6. ne jamais s'auto-accorder une autorité ;
7. ne jamais créer un deuxième système lorsqu'un composant existant suffit.

## PROCHAINE PRIORITÉ
Commencer par PHASE 2 — V59.
Si V59 est déjà satisfaite dans l'état réel du dépôt, la fermer sans modification et passer à V60.
Continuer dans l'ordre jusqu'à rencontrer une capacité réellement non satisfaite.
S'arrêter uniquement sur un blocage réel nécessitant une décision de gouvernance.

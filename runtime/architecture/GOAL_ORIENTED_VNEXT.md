# ODG Runtime — Goal-Oriented VNext (compatible, additive)

> État de départ : Runtime **CONVERGED** (référence). Aucun ré-audit, aucune réécriture.
> Base réutilisée : le pipeline typé `src/runtime/*.ts`, le `provider-port` /
> `provider-failover-engine`, la Constitution figée et les Policies existantes.
> Résultat : Runtime **toujours CONVERGED**, aucun fichier existant modifié.

Ce document est le livrable de la mission « ODG Runtime Evolution (VNext) ». Il ne décrit **que**
ce qui a réellement été fait et les points d'extension créés.

---

## 0. Principe directeur

Le pipeline actuel démarre à la **Mission** :

```
Mission → Intent → Context → Plan → Capabilities → Execution → Evidence → Memory
(runtime-executor.ts)
```

La cible Goal-Oriented ajoute **deux étages au-dessus** (Goal, Intent explicite), rend la Strategy
comparable, généralise le Provider en **Resource**, et ajoute un vérificateur d'invariants
(**Constitution Engine**). Tout cela est livré **par extension**, dans un namespace dédié
`src/runtime/vnext/`, sans toucher au Kernel ni aux composants existants.

Pipeline cible (réalisé par composition, pas par remplacement) :

```
Goal → Intent → Runtime Context → Strategy → Capability Resolution → Policy Evaluation →
Resource Allocation → Execution → Validation → Evidence → Memory → Knowledge
```

`Mission` devient un **artefact généré** depuis `Goal + Strategy` (`synthesizeMission`).

---

## 1. Modifications réellement réalisées

**Aucun fichier existant n'a été modifié.** Le Kernel, l'Executor, les Capabilities, le Provider
Orchestrator, les Policies, le Ledger, le Dashboard, la Queue, le Lifecycle et l'Evidence restent
strictement inchangés (`git status` : uniquement des fichiers ajoutés).

Fichiers **ajoutés** (additifs, sans effet de bord à l'import) :

| Fichier | Rôle |
|---|---|
| `src/runtime/vnext/goal.ts` | Étages Goal + Intent ; `deriveIntent()`, `synthesizeMission()` |
| `src/runtime/vnext/strategy-engine.ts` | Interfaces Strategy + `SingleStrategyEngine` (défaut iso-comportement) |
| `src/runtime/vnext/resource.ts` | Abstraction `Resource` + adaptateur `ProviderResource` |
| `src/runtime/vnext/constitution-engine.ts` | Vérificateur d'invariants **uniquement** |
| `src/runtime/vnext/goal-oriented-pipeline.ts` | Composition du pipeline cible (seams injectables) |
| `src/runtime/vnext/index.ts` | Surface d'export unique |
| `src/runtime/vnext-goal-oriented.test.ts` | 33 assertions, offline, `npm test` |

Validation du **périmètre modifié uniquement** : `tsc --noEmit` propre sur `vnext/`, ESLint sans
warning, `vnext-goal-oriented.test.ts` = ALL PASS, et la suite runtime complète (`npm test --
src/runtime/*.test.ts`) reste **exit 0** (aucune régression).

---

## 2. Nouvelles interfaces introduites

- **Goal** (`goal.ts`) — `Goal`, `MissionDraft` ; `deriveIntent(goal) → MissionIntent` (réutilise le
  contrat figé `MissionIntent`), `synthesizeMission(goal, strategy) → MissionDraft`.
- **Strategy** (`strategy-engine.ts`) — `Strategy`, `StrategyCandidate`, `StrategyEngine`
  (`propose` / `select`). **Interfaces + contrat seulement**, pas d'algorithme de comparaison ;
  le défaut `SingleStrategyEngine` reproduit le comportement mono-plan actuel.
- **Resource** (`resource.ts`) — `Resource`, `ResourceKind`, `ResourceRequest`,
  `ResourceAllocation`, `RuntimeContextView`, et l'adaptateur `ProviderResource`.
- **Constitution** (`constitution-engine.ts`) — `RuntimeDecision`, `ConstitutionVerdict`,
  `ConstitutionViolation`, classe `ConstitutionEngine` (**une seule méthode d'action** : `verify()`).
- **Pipeline** (`goal-oriented-pipeline.ts`) — `PipelineSeams`, `PipelineTrace`,
  `runGoalOriented(goal, seams)`.

---

## 3. Points d'extension créés

1. **Goal → Intent** : `deriveIntent()` est la couture entre le nouvel étage Goal et tout ce que le
   Runtime comprend déjà (part du `createMissionIntent()` figé, n'enrichit que les champs légitimes).
2. **Mission générée** : `synthesizeMission(goal, strategy)` produit une `MissionDraft` compatible
   avec les champs mission existants (`id/name/objective/priority/mode`). La **persistance /
   autorisation** d'une mission synthétisée reste au Lifecycle existant (non touché).
3. **Strategy seam** : `StrategyEngine` est injectable dans le pipeline — un moteur cost-first /
   risk-first / appris est un remplacement *drop-in* au même point.
4. **Resource seam** : `ProviderResource` fait des providers existants des implémentations de
   `Resource` **sans éditer** `provider-port.ts` ni `provider-failover-engine.ts` — il ré-exprime
   seulement le verdict d'availability déjà calculé.
5. **Constitution seam** : `ConstitutionEngine.verify()` est consulté après les étages de *décision*
   (sélection de stratégie, allocation de ressource) ; il **n'altère jamais** le flux.
6. **Pipeline seams** : `buildContext`, `resolveCapabilities`, `evaluatePolicy`, `resources`,
   `execute`, `validate`, `recordEvidence` — chacun a un défaut **hors-ligne et inoffensif**. Le
   point d'intégration production documenté est `RuntimeExecutor` (l'étage `execute` y déléguera).

Séparation des responsabilités respectée : le Constitution Engine **ne décide jamais, n'exécute
jamais, ne choisit jamais de stratégie** (garanti structurellement : pas de méthode `execute`/`select`).

---

## 4. Incompatibilités détectées

**Aucune incompatibilité bloquante.** Deux points d'attention, traités de façon compatible :

- **Étage `execute` réel.** Le brancher directement sur `RuntimeExecutor.execute()` déclenche
  `SystemLoader.load()` + effets système. Pour préserver *Economy First* et le zéro-régression, le
  défaut est un `execute` **no-op (SKIPPED)** : aucun appel provider, aucune mutation. Le câblage
  réel se fera via le seam `execute`, sans modifier l'Executor.
- **Autorisation des missions synthétisées.** `Policy` (`allowAutomaticExecution: false`) impose
  qu'une mission générée reste **non-exécutée** tant qu'elle n'est pas autorisée par le Lifecycle
  existant. `synthesizeMission()` produit donc un *draft* et ne touche ni Ledger ni Queue — invariant
  préservé.

Si une évolution s'avérait incompatible avec un invariant (Constitution / Policy), la règle appliquée
est : **ne pas l'implémenter**, et documenter l'invariant concerné + l'alternative compatible.

---

## 5. Recommandations pour une future évolution

1. **Câbler l'étage `execute`** sur `RuntimeExecutor` via le seam (adaptateur additif), en gardant le
   défaut no-op pour les runs de planification/health.
2. **Brancher Evidence → Memory → Knowledge** : router `recordEvidence` vers `ExecutionMemory` puis le
   `knowledge-engine`, plutôt que la trace en mémoire (aujourd'hui suffisante pour les tests).
3. **Premier vrai StrategyEngine** : commencer par un tri déterministe sur `estimatedCost` (Economy
   First) avant tout moteur appris — reste *drop-in* au seam.
4. **Fournisseurs comme Resources** : instancier `ProviderResource` depuis les probes réelles de
   `provider-availability` pour que l'allocation de ressource consomme le verdict provider existant.
5. **Étendre la Constitution par les données** : ajouter un principe mappé dans `INVARIANT_CHECKS`
   étend automatiquement la vérification (pas de changement de flux).
6. **Migration progressive** : exposer `runGoalOriented` derrière une commande `odg goal` optionnelle,
   le Runtime `odg`/`odg autonomy` actuel restant l'entrée de production inchangée.

---

### Invariant de sortie

Runtime **CONVERGED** conservé, comportement existant inchangé, évolutions **additives** et
**compatibles**, périmètre modifié seul revalidé (suite runtime exit 0).

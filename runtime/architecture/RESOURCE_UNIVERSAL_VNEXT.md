# ODG Runtime — Préparation Universelle des Ressources d'Exécution (VNext)

> État de départ : Runtime **CONVERGED**. Aucun audit global, aucune réanalyse. Réutilisation du
> Snapshot et des artefacts existants (couche `src/runtime/vnext/`, `provider-*`, `runtime/config/`).
> Résultat : Runtime **toujours CONVERGED**, aucun fichier suivi (tracked) modifié, aucun provider
> réel connecté, aucune clé créée, aucun appel réseau.

Livrable de la mission « Préparation Universelle des Ressources d'Exécution ». Décrit **uniquement**
ce qui a réellement été fait.

---

## 0. Réutilisation (Reuse First)

La couche `Resource` avait déjà été introduite (mission VNext précédente) :
`src/runtime/vnext/resource.ts` (`Resource`, `ResourceKind`, `ProviderResource`) et l'allocation
triviale `allocateFirst()` dans le pipeline. Cette mission **complète** cette base par un Registry,
un catalogue de configuration, et un Allocation Engine explicite — sans rien réécrire.

---

## 1. Modifications réellement réalisées

**Aucun fichier suivi n'a été modifié.** Le Kernel, l'Executor, les Capabilities, le Provider
Orchestrator (`provider-port.ts`, `provider-failover-engine.ts`), les Policies, le Ledger, le
Dashboard, la Queue, le Lifecycle et l'Evidence sont **intacts**.

| Fichier | Nature | Rôle |
|---|---|---|
| `src/runtime/vnext/resource.ts` | edit (fichier vnext non suivi) | `ResourceKind` **étendu** avec `"TOOL"` (OCR/recherche/compilateur/scripts). Union **élargie**, jamais rétrécie ⇒ rétro-compatible |
| `src/runtime/vnext/resource-registry.ts` | **ajout** | Registry config-driven + `ConfiguredResource` |
| `src/runtime/vnext/resource-config.ts` | **ajout** | Catalogue des ressources supportées + loader résilient |
| `src/runtime/vnext/resource-allocation-engine.ts` | **ajout** | Sélection par Policies/contraintes/stratégie |
| `src/runtime/vnext/goal-oriented-pipeline.ts` | edit (fichier vnext non suivi) | seam `allocator` optionnel (défaut = comportement actuel) |
| `src/runtime/vnext/index.ts` | edit (fichier vnext non suivi) | exports des nouveaux modules |
| `runtime/config/resources.json` | **ajout** | Config déclarative : 8 ressources, **toutes désactivées**, clés par NOM d'env |
| `src/runtime/vnext-resource-universal.test.ts` | **ajout** | 34 assertions, offline, `npm test` |

> `git status` : uniquement des fichiers non suivis / ajoutés. La couche `vnext/` entière n'est
> pas encore committée ⇒ **aucun composant fonctionnel existant n'a été touché**.

Validation du **périmètre modifié uniquement** : `tsc --noEmit` propre sur `vnext/`, ESLint sans
warning, les deux tests VNext = ALL PASS, et la suite runtime complète reste **exit 0**.

---

## 2. Nouveaux points d'extension ajoutés

1. **Resource Registry** (`resource-registry.ts`) — déclare une ressource par **configuration**
   (`ResourceDescriptor`), pas par code. Méthodes `register` / `replace` / `enable` / `disable` /
   `remove` / `resolveEnabled`. Une ressource s'active, se désactive ou se remplace **sans toucher
   le Kernel**. Fabriques par `type` (`registerFactory`), défaut = `ConfiguredResource`.
2. **ConfiguredResource** — `Resource` générique, disponibilité **déterministe et hors-ligne** :
   `disabled` → refusée ; `enabled` + `apiKeyEnv` absent → refusée en **nommant la variable d'env
   manquante** (jamais sa valeur) ; sinon → accordée. **Aucun appel réseau, aucune lecture de secret.**
3. **Resource Allocation Engine** (`resource-allocation-engine.ts`) — `allocate()` sélectionne selon
   (1) contraintes → (2) préférence de la stratégie → (3) Policies (Local First / offlineOnly) →
   (4) priorité. Renvoie la décision **+** l'ensemble des candidats considérés (evidence). **La
   Resource ne décide jamais** : elle ne fait que rapporter sa disponibilité via `allocate()`.
4. **Seam `allocator`** dans le pipeline Goal-Oriented — branche l'Allocation Engine sans modifier
   le flux ; défaut = « premier accordé » (comportement inchangé).

---

## 3. Ressources désormais supportées par configuration

Déclarées dans `runtime/config/resources.json` — **toutes `enabled: false`** (Local First / activation
manuelle, aligné sur `runtime/config/runtime-mode.json`) :

| id | kind | type | credential (NOM d'env) |
|---|---|---|---|
| `anthropic` | PROVIDER | anthropic | `ANTHROPIC_API_KEY` |
| `openai` | PROVIDER | openai | `OPENAI_API_KEY` |
| `gemini` | PROVIDER | gemini | `GOOGLE_API_KEY` |
| `mistral` | PROVIDER | mistral | `MISTRAL_API_KEY` |
| `azure-openai` | PROVIDER | azure-openai | `AZURE_OPENAI_API_KEY` |
| `ollama` | LOCAL | ollama | — (baseUrl locale) |
| `local` | LOCAL | local | — (command) |
| `internal` | TOOL | internal | — (command) |

`TOOL` couvre les ressources non-LLM listées par la mission (OCR, moteur de recherche, compilateur,
scripts internes) : elles se déclarent comme n'importe quelle autre ressource. **Aucun service n'est
connecté, aucune clé n'existe, aucun appel réseau n'est effectué** — seuls des NOMS de variables
d'environnement sont référencés.

---

## 4. Incompatibilités détectées

- **Résiduelle corrigée (dans le périmètre) :** la mission VNext précédente avait laissé une erreur
  de typage latente — les implémentations `SingleStrategyEngine.propose` / `ProviderResource.allocate`
  avaient perdu un paramètre (pour supprimer un warning ESLint) alors que le test les appelait encore
  avec cet argument. `tsx` ne type-checke pas, donc le test passait ; `tsc --noEmit` la révèle.
  - **Root Cause :** arité d'implémentation < arité des sites d'appel concrets, non détectée faute de
    type-check dans le harnais de test.
  - **Correction minimale :** aligner les 4 sites d'appel concrets sur l'arité des implémentations
    (l'interface conserve l'arité complète pour l'Engine/pipeline polymorphes) + `?? undefined` sur
    un champ optionnel de l'Allocation Engine. `tsc` désormais propre sur `vnext/`.
- **Aucune autre incompatibilité.** Aucune solution risquée n'a été implémentée.

---

## 5. Confirmation — le Runtime reste CONVERGED

- Aucun fichier suivi modifié ; Kernel et composants fonctionnels intacts (`git status` : ajouts seuls).
- Aucun code de production n'importe `vnext/` (couche isolée) ⇒ zéro effet de bord runtime.
- `tsc --noEmit` propre (vnext), ESLint 0 warning, 2 tests VNext = ALL PASS.
- **Suite runtime complète : exit 0, 0 FAIL** (aucune régression).
- Posture par défaut : toutes ressources externes **désactivées**, aucune clé, aucun réseau.

> **Runtime CONVERGED conservé.** Aucun développement hors périmètre.

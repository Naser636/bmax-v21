# ODG Runtime — Intégration Finale VNext (activation déclarative, dormante)

> État de départ : Runtime **CONVERGED**. Couches déjà validées : Runtime v1.0, Goal-Oriented VNext
> ([GOAL_ORIENTED_VNEXT.md](GOAL_ORIENTED_VNEXT.md)), Universal Resource VNext
> ([RESOURCE_UNIVERSAL_VNEXT.md](RESOURCE_UNIVERSAL_VNEXT.md)). Ce document **complète** (ne réécrit
> pas) la doc VNext pour décrire l'activation future. Aucun audit global, réutilisation du Snapshot.

Cette mission rend les couches VNext **officiellement reconnues** par le Runtime tout en les
laissant **totalement inactives** jusqu'à activation explicite. Le comportement actuel du Runtime
reste **strictement identique**.

---

## 1. Isolation — vérifiée par preuve (aucun écart, aucune modification)

Preuves collectées (Snapshot/Evidence First), **aucun fichier existant modifié** en conséquence :

| Invariant | Preuve | Verdict |
|---|---|---|
| Le Runtime n'importe pas VNext | `grep -rn vnext src` hors `vnext/` + tests → **NONE** | ✓ |
| Aucune dépendance circulaire | Le Runtime n'important jamais VNext, aucun cycle possible | ✓ |
| Pas d'import involontaire | Imports VNext→Runtime : `mission-intent` (fns pures), `CapabilityRegistry` (classe pure), 2× `import type` (effacés à la compilation) | ✓ |
| Aucun effet de bord à l'import | `grep` effets top-level (`fs.`/`execSync`/`console.`) dans `vnext/` → **NONE** | ✓ |
| Policies inchangées | Aucun `runtime/policies/*` touché | ✓ |
| Providers existants inchangés | `provider-port.ts` / `provider-failover-engine.ts` non touchés | ✓ |
| Capabilities inchangées | Aucun changement de comportement d'une capability existante | ✓ |

Conclusion : **aucun écart démontré** ⇒ conformément aux règles, sections « Vérifier les points
d'intégration » et « Vérifier l'isolation » n'ont entraîné **aucune modification de code**.

---

## 2. Mécanisme d'activation créé (point d'entrée unique, déclaratif)

**Reconnaissance par la donnée, pas par un import.** Les extensions sont déclarées dans
`runtime/config/vnext.json` (manifeste `extensions[]`, statut `RECOGNIZED_INACTIVE`). Le Kernel
n'importe donc jamais VNext — l'isolation est préservée.

**Point d'entrée unique** : `src/runtime/vnext/activation.ts`.

- `loadVNextActivation(cwd?, file?)` — lit le JSON, résilient (fichier absent/invalide ⇒ défaut
  totalement inactif), **ne jette jamais**, aucun réseau.
- `isVNextEnabled(activation, feature)` — **gating maître** : une feature n'est active que si
  `enabled === true` **ET** son propre drapeau est vrai.
- `withVNext(activation, feature, active, inactive?)` — **le seam d'intégration** : exécute
  `active()` seulement si la feature est activée, sinon `inactive()` (chemin comportement-actuel /
  no-op par défaut retournant `undefined`). Une future intégration enveloppe le nouveau chemin dans
  `withVNext(...)` : il reste dormant tant que le drapeau n'est pas basculé — **sans modifier le
  Kernel**.

Features activables (liste de la mission, ordre pipeline) : `goalAnalysis`, `goal`, `intent`,
`strategy`, `resourceAllocation`, `constitution`.

**État livré** — `runtime/config/vnext.json` : `enabled: false` + toutes les features `false`.
Rien n'est activé. Aucun composant du Runtime n'appelle ce module aujourd'hui ⇒ comportement
identique.

### Comment activer plus tard (déclaratif, sans code)

```jsonc
// runtime/config/vnext.json
{ "enabled": true, "features": { "strategy": true } }   // n'active QUE la Strategy
```

Puis une future intégration lira `loadVNextActivation()` et gardera chaque étage derrière
`withVNext(activation, "<feature>", () => <nouveau chemin>, () => <chemin actuel>)`.

---

## 3. Garanties de compatibilité

- **Default-OFF + master-gated** : sans le commutateur maître, aucun drapeau n'a d'effet.
- **Dormant** : le Runtime n'appelle pas encore `activation.ts` ; seams préparés uniquement.
- **Isolé** : le Kernel n'importe pas VNext ; VNext n'écrit rien au chargement.
- **Additif** : `git status` = fichiers ajoutés uniquement ; aucun fichier suivi modifié.
- **Validé (périmètre modifié seul)** : `tsc --noEmit` propre (vnext), ESLint 0 warning,
  `vnext-activation.test.ts` = 16/16 ALL PASS, suite runtime complète **exit 0 / 0 FAIL**.

---

## 4. Recommandations restantes (documentées, NON implémentées)

Améliorations détectées mais **non appliquées** (règle « ne pas implémenter automatiquement ») :

| # | Recommandation | Preuve | Bénéfice | Coût estimé | Risque |
|---|---|---|---|---|---|
| R1 | Câbler `withVNext` dans un futur `odg goal` optionnel (jamais dans le chemin `odg`/`odg autonomy` actuel) | seams `execute`/`allocator` déjà prêts | active VNext sans toucher le Kernel | ~1 petite commande CLI | Faible (garde-fou par flag OFF) |
| R2 | Router `recordEvidence` du pipeline vers `ExecutionMemory` + `knowledge-engine` | trace en mémoire aujourd'hui | Evidence/Memory/Knowledge réels | ~1 adaptateur additif | Faible |
| R3 | Alimenter le Registry depuis les probes réelles de `provider-availability` | `ProviderResource`/`ConfiguredResource` prêts | allocation basée sur la vraie dispo provider | ~1 fabrique | Faible ; ne PAS connecter de clé sans autorisation |
| R4 | Valider `runtime/config/vnext.json` par un schéma au chargement | loader résilient déjà tolérant | rejet précoce d'une config malformée | ~1 validateur | Très faible |

Aucune de ces améliorations n'est implémentée dans cette mission.

---

## 5. Confirmation — le Runtime reste CONVERGED

Isolation prouvée sans changement de code, activation purement déclarative et **inactive** par
défaut, Kernel/Policies/Providers/Capabilities intacts, build/TypeScript/tests impactés **verts**,
`git status` **additif**. **Runtime CONVERGED conservé.** Aucun développement hors périmètre.

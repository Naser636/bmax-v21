# Final Report — Industrialisation des contrats de mission (Contract On Demand)

Branch: `runtime/mission-context-builder` · Left entirely in the working tree, **not committed**.

## Objectif

Le Runtime peut désormais exécuter **toute nouvelle mission sans contrat pré-écrit**. Une mission
inconnue est matérialisée à la demande (contrat complet, valide, gouverné) puis l'exécution normale
reprend — sans intervention humaine et sans liste fermée de contrats.

Deux capacités Runtime sont ajoutées, enregistrées et gouvernées comme les autres :
`DYNAMIC_MISSION_CONTRACT_FACTORY` et `AUTONOMOUS_CONTRACT_EVOLUTION`.

## Patch (le plus petit possible — extensions uniquement, aucune réécriture)

| Fichier | Nature | Détail |
| --- | --- | --- |
| `runtime/core/mission-contract-factory.js` | extension | `generateForMission()` (on-demand, id arbitraire), `isOnDemandEnabled()` (gate policy/env), `buildContract` enrichi (`permissions`, `lifecycle`, `policies`, `evidence`). |
| `runtime/core/mission-loader.js` | extension | Mission inconnue → génère → valide → **reprend** ; STOP strict conservé si désactivé. |
| `src/runtime/autonomy-runtime-adapter.ts` | extension | `materialiseOnDemand()` ; `generateContract` + `readCorrectiveQueue` ne bloquent plus sur une mission inconnue autorisée. |
| `runtime/bin/odg-verify.js` | extension | Vérifie les contrats générés (`generatedContracts` + `generatedContractsValid`), additif. |
| `runtime/bin/odg-generate-contracts.js` | extension | Étape 1 de `converge` : audite/gate les contrats générés (preuves Runtime normales). |
| `runtime/policies/runtime-policies.json` | extension | Bloc `contractOnDemand` (enabled + capacités enregistrées). |
| `runtime/governance/ROADMAP.json` | extension | 2 capacités inscrites, gouvernées/ordonnées comme les autres. |
| `runtime/missions/DYNAMIC_MISSION_CONTRACT_FACTORY.json` + `.evidence.md` | ajout | Contrat + preuve. |
| `runtime/missions/AUTONOMOUS_CONTRACT_EVOLUTION.json` + `.evidence.md` | ajout | Contrat + preuve. |
| `runtime/core/mission-contract-factory.test.js` | extension | 23 → 39 assertions (on-demand, réutilisation, forme complète, gate policy/env). |

## Correspondance avec le travail demandé

1. **Factory évoluée** → `generateForMission` génère un contrat complet pour une mission inconnue. ✅
2. **Dépendance à une liste fermée supprimée** → n'importe quel id est matérialisable (plus seulement la ROADMAP). ✅
3. **Mode "Contract On Demand"** → objectifs, lifecycle, permissions, engineering mode, evidence, policies, authorized paths produits, contrat enregistré, exécution reprise. ✅
4. **Compatibilité totale** → contrat existant réutilisé byte-for-byte, jamais écrasé ; suite complète verte. ✅
5–6. **Capacités ajoutées** `DYNAMIC_MISSION_CONTRACT_FACTORY` + `AUTONOMOUS_CONTRACT_EVOLUTION`, enregistrées (policy + ROADMAP + contrats), utilisables par delegate/autonomy/futures missions. ✅
7. **Mission Loader adapté** → inconnu → génération → validation → reprise, sans humain. ✅
8. **Autonomy adaptée** → mission inconnue autorisée ne bloque plus (matérialisation on-demand). ✅
9. **Verify adapté** → valide les contrats générés automatiquement. ✅
10. **Converge adapté** → les nouveaux contrats deviennent des preuves Runtime normales (audit/gate en Step 1 + file d'attente runtime-model). ✅
11–14. **Conservation** → Kernel, Gouvernance, Ledger, Evidence, Runtime & Mission Lifecycle, Provider Architecture intacts ; réutilisation de l'architecture ; Provider Routing non modifié ; capacités existantes réutilisées avant d'en créer. ✅
15–19. Patch minimal, aucun scan complet, aucune ré-analyse des parties validées, appels LLM nuls (déterministe), artefacts Runtime réutilisés. ✅

## Preuves

- `node runtime/core/mission-contract-factory.js` (génération idempotente, no-op) puis
  `node runtime/core/mission-contract-factory.test.js` → **39 assertions passed**.
- `npx tsc --noEmit` → clean.
- `npm test` (suite complète `src/tests` + `src/runtime`) → **exit 0, aucune régression**.
- E2E Mission Loader : mission inconnue → `CONTRACT ON DEMAND` → contrat synthétisé → `mission-plan.json`
  écrit (Status `READY_FOR_EXECUTION`) ; `ODG_CONTRACT_ON_DEMAND=0` → STOP strict conservé.
- `computeRuntimeModel()` : les 2 capacités apparaissent dans la file forward, `roadmapResolves=true`.

## Statut de convergence (non exécuté, par consigne)

Les commandes `verify`, `converge`, `freeze`, `status`, `system-ready` **n'ont pas été lancées**. Les
deux nouvelles capacités sont donc, à ce stade, `executable-unproven` (présentes dans la file, non
encore prouvées au ledger) — l'état honnête attendu tant que la campagne n'a pas été exécutée. Elles
deviendront des capacités prouvées via `odg autonomy` / `odg converge` (le pipeline existant les traite
comme des missions normales, sans code supplémentaire).

## Restant dans le working tree

Toutes les modifications sont laissées non committées, conformément à la consigne. Aucun artefact de
démonstration résiduel (contrats DEMO_ nettoyés).

# RUNTIME COMPLETION — CHECKPOINT DE REPRISE

_Mis à jour en continu. Permet de reprendre exactement au même point après arrêt/crash/déconnexion._

## Mission en cours
Terminer le Runtime ODG de A à Z : nettoyer le code mort/doublons, raccorder les composants,
terminer les implémentations incomplètes, corriger les erreurs, nettoyer le dépôt, builds+tests au vert.

Branche : `runtime/mission-context-builder`

## État objectif observé (baseline)
- `npx tsc --noEmit` → **PASS (exit 0)**
- `npm test` → 223 fichiers de test, exécution série via tsx (lent) — run complet en cours d'évaluation
- `npm run build` → à mesurer
- `odg health` → self-report SYSTEM_READY / 100% (55 capacités, 0 manquante, 510 missions)
- Arbre git : 34 fichiers modifiés (churn certificates/passports connu) + artefacts non suivis

## Baseline VERTE confirmée
- `npm run build` → PASS (exit 0)
- `npx tsc --noEmit` → PASS (exit 0)
- `npm test` → 223 fichiers, exit 0, 0 assertion échouée
- Commandes odg health/state/status/verify → OK

## Décisions prises
- **Chemin vivant** = `runtime/bin/*` (bash+node) → `runtime/core/*.js`. `src/runtime/*.ts` atteint
  uniquement via tsx (mission-cli/autonomy-cli) + autonomy-runtime-adapter. `src/core/*.ts` = moteur
  app séparé. Trois runtimes parallèles ; seul `runtime/core` JS est sur le chemin CLI live.
- **Supprimer code mort src/runtime** (25 stubs orphelins, 0 importateur) : ladder pass-through
  runtime-demo→…→mission-dispatcher (16), clusters context/plugin/facade, index.ts (barrel mort),
  runtime-events.ts. Filet de sécurité = tsc + build + suite complète après chaque cluster.
- **Supprimer doublons** : runtime/core/fleet-bridge.js.bak.*, runtime/core/mission-loader.next.js.
- **Supprimer scratch root** : ODG_*.txt (scans), rapport_complet.txt (vide), tsconfig.json.backup,
  PATCH_PLAN_*, R0001_*, ODG_FOUNDATION/HEALTH_REPORT — aucun référencé par code vivant.
- **Corriger odg-verify.js** : remplacer le mensonge `gitClean=true` (TEMP PATCH) par un vrai
  `git status --porcelain` avec le MÊME jeu d'exclusions que mse (evidence régénérée).
- **Untrack evidence régénérée** mission-standard/{certificates,passports,generated,reports} :
  gitignore + git rm --cached (même précédent que history/ déjà gitignoré ; mse les exclut déjà de
  la gouvernance). Rend l'arbre réellement propre → gitClean honnête vrai.
- **NE PAS supprimer** les backups DR (runtime/backup, archive, local-recovery, releases, baselines) :
  non créés par moi, préservés sur disque par design (mémoire + .gitignore). Signalés seulement.

## Fichiers modifiés (ce run)
- MODIF `runtime/bin/odg-verify.js` — TEMP PATCH gitClean remplacé par vrai check scopé (excl. mse)
- MODIF `.gitignore` — untrack evidence régénérée mission-standard {generated,passports,reports,certificates}
- SUPPR 27 stubs morts src/runtime (ladder + context/plugin/facade + index.ts + runtime-events.ts)
- SUPPR runtime/core/fleet-bridge.js.bak.* + runtime/core/mission-loader.next.js
- SUPPR 8 scratch root (ODG_*.txt, PATCH_PLAN, R0001, tsconfig.json.backup) + rapport_complet.txt
- git rm --cached 740 fichiers evidence (préservés sur disque, désormais gitignorés)

## Tâches — TOUTES TERMINÉES
- [x] Phase A : odg-verify honnête + untrack evidence + gitignore
- [x] Phase B : supprimer 27 stubs morts src/runtime
- [x] Phase C : supprimer .bak/.next dans runtime/core
- [x] Phase D : supprimer scratch root
- [x] Phase E : re-vérifier — tsc ✅ / build ✅ / tests 223 exit 0, 0 échec / odg health+verify OK
- [x] Phase F : README documenté + arbre propre + commit

## Résultat final (post-nettoyage)
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
- `npm test` → 223 fichiers, exit 0, 0 assertion échouée
- `odg health` → SYSTEM_READY, 55 capacités, 0 manquante
- `odg verify` → build/typescript true ; gitClean désormais HONNÊTE (vrai après commit)
- `git status` porcelain (hors evidence régénérée) → propre après commit

## Blocage externe (phase nettoyage)
Aucun. Runtime cohérent, stable, propre, documenté, tests au vert. Commit 4db663b.

---

# PHASE 2 — AUTONOMIE DE BOUT EN BOUT (en cours)

## Mission en cours
Terminer complètement l'autonomie du Runtime. Vérifier en conditions RÉELLES (pas juste tests unitaires)
que les blocages missions ODG sont corrigés : missions bloquantes, pipeline d'exécution, mode autonome,
providers, reprise après erreur, missions d'ingénierie, missions enfants, autonomie end-to-end.

## État de départ (connu)
- `odg autonomy` → PLAN_COMPLETE, Cycles 0 (queue vide, toutes missions roadmap prouvées)
- Chemin : odg mission <N> → mission-cli.ts → route provider (engineering) OU locale (exit 3 → mse)
- Mémoire signale : "provider-route demo hangs" → à investiguer sérieusement
- Route locale + intégration : tests verts

## Décisions / Tâches restantes
- [ ] T1 : exécuter une mission LOCALE de bout en bout (pipeline déterministe → evidence → RELEASE)
- [ ] T2 : exécuter une mission ENGINEERING (route provider) et diagnostiquer le hang
- [ ] T3 : tester la reprise après erreur (recovery) réelle
- [ ] T4 : tester les missions enfants
- [ ] T5 : autonomie end-to-end avec une mission réelle à exécuter (Cycles > 0 → RELEASE)
- [ ] T6 : corriger chaque cause trouvée, vérifier, itérer jusqu'à stabilisation

## BLOCAGE #1 TROUVÉ + CORRIGÉ (bug interne majeur)
- **Symptôme** : `odg mission PROVIDER_ENABLED_SMOKE_V1` → EXECUTION_FAILED ; provider rapporté
  `claude-code: UNAVAILABLE — executable claude on PATH` ALORS QUE claude est à /usr/local/bin/claude
  et ANTHROPIC_API_KEY est SET.
- **Cause racine** : `src/providers/provider-factory.ts` `defaultAvailabilityEnv.hasBinary` faisait
  `runner("command", ["-v", bin])`. `command` est un BUILTIN shell, pas un exécutable → spawnSync
  ENOENT → hasBinary retourne TOUJOURS false → provider Claude jamais disponible → route provider
  morte. (C'est très probablement le "provider-route hangs/blocks" de la mémoire.)
- **Fix** : `runner("sh", ["-c", \`command -v ${bin}\`])` — résolution PATH via shell.
- **Vérifié** : sonde directe → `claude available: true`, resolveEngineeringProvider sélectionne
  claude-code ; tsc vert ; tests provider (registry/orchestrator/canonical/enabled/adapter/
  integration/runtime-autonomy) tous OK.

## Environnement (conditions réelles)
- `claude` présent (/usr/local/bin/claude) + ANTHROPIC_API_KEY SET → provider Claude EXÉCUTABLE en vrai
- OPENAI_API_KEY absent, codex absent → failover OpenAI indisponible (blocage externe attendu, normal)

## Prochaines actions
1. Commit du fix hasBinary
2. Test end-to-end RÉEL : supprimer le marker existant → mission smoke → claude crée le fichier →
   validation → RELEASE → evidence (certificat/passport/ledger)
3. Observer un éventuel hang (aucun timeoutMs sur le spawn provider) → ajouter garde si besoin

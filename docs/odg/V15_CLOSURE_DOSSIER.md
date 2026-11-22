# Dossier de clôture technique V15 — 2026-11-22

Rédigé par l'exécutant (Claude Code). Ce dossier n'est **pas** une certification : aucun contrat n'est passé VERIFIED. Les états VERIFIED et ACCEPTED exigent une signature du propriétaire ancrée dans `TRUST_ANCHORS.json`, aujourd'hui vide.

Sources de ce dossier :
- l'historique de `main` ;
- les tests nommés ;
- les fichiers de preuve sous `docs/odg/evidence/` ;
- les verdicts d'inspection indépendante (sous-agents en lecture seule) rapportés dans les PR.

Le verdict d'un sous-agent est une information. **Il ne vaut pas inspection propriétaire.**

## 1. État du dépôt
- `main` = `origin/main` = HEAD final, indiqué dans le rapport de fin de session.
- Arbre propre ; seuls des worktrees éphémères existent pendant le travail.
- 5 stashes historiques préservés.
- Truth Lock : `verify-historical.sh` → 928 vérifiés, 0 manquant, 0 modifié.

## 2. PR intégrées (session V15)

| PR | Objet | Inspection indépendante |
|---|---|---|
| #864 | lanceur confiné en deux phases | REJECT → ACCEPT |
| #865 | expérience mesurée par le portail | REJECT → ACCEPT |
| #866 | recommandation SLO, dossier L1 | ACCEPT |
| #867 | maturité KI ancrée sur la signature du propriétaire | ACCEPT |
| #868 | trace écrite par le lanceur de confiance | ACCEPT (LOW) |
| #869 | outil de signature hors ligne du propriétaire, avec procédure | ACCEPT (MED documenté) |
| #870 | interrupteur d'egress Radar ; audit des ancres de confiance | REJECT ×2 → ACCEPT |
| #871 | attestations : ancres lues sur `origin/main`, revue liée au candidat | REJECT ×2 → ACCEPT |
| #873 | durcissement du lanceur : 7 constats, puis 2 MED | ACCEPT avec MED → ACCEPT |
| #872 | définitions SLI fail-closed : statuts en liste blanche, grille de créneaux, CI au premier essai | REJECT → ACCEPT |

## 3. Truth Lock
928/928 vérifiés à chaque checkpoint. Aucun fichier préservé n'a été modifié. Aucune opération destructive : pas de push forcé, pas de `reset --hard`, pas de `clean`.

## 4. Portail — expérience RUN4 (`docs/odg/evidence/V15_GATE_EXPERIMENT_RESIDENT_CONFINEMENT_RUN4.json`)
- **Candidat :** `3a88de01`, c'est-à-dire `main` après #873. Le code mesuré est `git archive` de ce commit.
- **Verdict :** `RETURN_TO_EXPERIMENT`, **10/12**, aucune violation dure.
- **Conditions mesurées et réussies (10/12) :**
  - lien V12.4 ;
  - besoin démontré ;
  - isolement ;
  - baseline : 7 sondes ouvertes sans confinement ;
  - tests fonctionnels : L0, arrêt d'urgence, repli tsx ;
  - CI requise verte sur le candidat ;
  - surface retirée 7 → 0 ;
  - dépôt réel inchangé ;
  - sécurité sur les 7 sondes, et **uniquement** ces sondes ;
  - rollback.
- **Conditions manquantes (2/12) :** `codeAndDepsReviewed` et `independentInspection`. La raison mesurée est `RECORD_NOT_BOUND_TO_CANDIDATE (subjectCommit null)`. Ces deux conditions ne se satisfont **que** par un enregistrement d'inspection signé par le propriétaire, lié au commit candidat et à l'expérience. Les mesures fournies par un appelant pour ces deux conditions sont ignorées (#871).

## 5. Intégrité des traces L0
**Garanties du lanceur** (#868 et #873) :
- le tick confiné n'a aucun chemin inscriptible sur l'hôte ;
- seul le lanceur ajoute **une** ligne : format strict, ASCII imprimable, horodatage du lanceur ;
- une sortie non conforme produit `INVALID_TRACE` ; plus de 64 Kio produit `INVALID_TRACE … truncated=1` ;
- un dépassement du délai produit `state=TIMEOUT` ;
- un lien symbolique sur le journal est refusé.

**Garanties de la sandbox** (#873) :
- descripteurs hérités au-delà de 2 fermés ; stdin `/dev/null` ;
- stderr borné et assaini ;
- tmpfs dimensionnés ; racine et `/dev` en lecture seule ;
- `ulimit -n 256 -p 128`, plus `-v` sur le chemin précompilé ;
- filtre seccomp x86_64 : memfd et SysV shm refusés ;
- `timeout -k` et `pdeathsig` : aucun processus orphelin.

Tests : `odg-resident-driver-confined.test.ts` passe 35/35. Les nouveaux contrôles échouent contre l'ancien lanceur.

**Ce qui reste une autodéclaration :** le contenu de la ligne, par exemple `writes=0`. Ce n'est jamais une preuve indépendante d'absence d'écriture. Le tick peut aussi imprimer une ligne `TIMEOUT` ou `INVALID_TRACE` imitant celles du lanceur (LOW).

## 6. Qualification du resident driver
- L0 reste le seul niveau opérationnel.
- Qualification détaillée et risques résiduels : `L1_QUALIFICATION_DOSSIER_RESIDENT_DRIVER.md`, §4d.
- Le lanceur normal installé (`odg-resident-driver-run.sh`) partage la vérification de fraîcheur. Il a été vérifié en copie jetable par l'inspection, et le tick réel suivant #873 est rapporté dans le rapport final.

## 7. Dossier L1 — décision technique motivée
**Recommandation de l'exécutant : ne pas activer L1.** C'est le propriétaire qui décide. Les motifs :
- aucune revue ancrée par le propriétaire ;
- le drop-in n'a jamais tourné sous l'unité réelle ;
- moins d'un jour de disponibilité après la correction ;
- fiabilité des missions NOT_MEASURED.

Critères de refus et procédure d'essai à blanc du drop-in : dossier L1, §4d.

## 8. Proposition SLO (`docs/odg/PROPOSAL_SLO_TARGETS_V15.json`, PROPOSED, **non appliquée** ; `slo-targets.ts` inchangé)

| Dimension | Définition (r2) | Mesure | Proposition |
|---|---|---|---|
| Disponibilité, signal de vivacité | créneaux de 15 min alignés sur l'epoch ; un créneau est bon s'il contient ≥ 1 ligne et que toutes ses lignes sont disponibles ; les lignes en trop n'ajoutent jamais de créneau | après correction, 64/65 = 0,9846, Wilson [0,918 ; 0,997] ; volume insuffisant (≈ 215 créneaux bons de plus pour 98 %, vers le 2026-11-25) ; avant correction 0,5599 ; résidu non organisationnel 15/1417, dont 10 glissements d'horloge du timer | 98 %, provisoire |
| CI, push sur `main` | conclusion de la première tentative ; tout ce qui n'est ni succès ni annulé compte comme mauvais | 841/846 = 0,9941, Wilson [0,986 ; 0,998], 0 relance, sur 27,9 jours ; 97 / 98 / 98,5 % déjà soutenus | 99 % (cible, non démontrée) |
| Fiabilité des missions | PASS / exécutions, avec POLICY_REFUSED séparé | 1 pass, 0 fail, 2 refus de politique ; n = 3 < 20 | garder la cible CTO 0,95, NOT_MEASURED |

Les seuils d'alerte et les règles de gel sont seulement PROPOSÉS : rien n'est câblé.

**À savoir avant de resserrer la cible :** la dérive naturelle du timer compte comme créneaux perdus, environ 0,7 %. Elle consomme environ un tiers du budget d'erreur à 98 % et l'essentiel du budget à 99 %.

L'absence de mission n'est jamais comptée comme une réussite. IDLE est hors du dénominateur de fiabilité.

## 9. Audit des ancres et des signatures
**Ancres :**
- `TRUST_ANCHORS.json` est vide pour les 4 usages. La vérification sur `main` donne `NO_ANCHORS_PINNED`, avec 3 changements historiques à +0/−0.
- Les ancres sont lues **uniquement** depuis `origin/main` (`git show`, `GIT_*` retirés, objets de remplacement désactivés).
- Une modification locale non commitée n'a aucun effet.

**Outil d'audit** (`odg-trust-anchor-audit`) :
- il parcourt la chaîne first-parent ;
- il attribue chaque épingle à son commit et à sa PR ;
- une épingle n'est signée par le propriétaire que si la signature est bonne (G), que la clé figure dans `--signer-keys`, et que le diff propre de ce commit ajoute l'empreinte ;
- une fusion non signée qui résout un conflit compte comme auteur.

**Revue :** liée à `subjectCommit`, au verdict `ACCEPT` et à l'expérience. Instantané avant contrôle, horloge réelle uniquement.

**Maturité :** la signature lie aussi le fichier contrat (chemin et sha256).

**Limite non fermable dans le dépôt :** la référence locale `origin/main` et le magasin d'objets restent modifiables par qui contrôle ce clone. **Un verdict local n'est jamais la décision de confiance.** Le propriétaire revérifie sur son propre clone (`OWNER_SIGNING_PROCEDURE.md`, §5). L'inscription d'une ancre n'est contrôlée que par revue, car l'exécutant et le propriétaire fusionnent avec le même compte.

## 10. Orchestration multi-agents — mesures réelles
Environnement : Claude Code 2.1.323, 8 CPU, 22 Gio de RAM. Agents en arrière-plan, worktrees git isolés, au plus 6 agents actifs simultanément.

- **Audits en éventail (4 agents en lecture seule) :** environ 200 s de temps réel pour 662 s d'agent cumulées, soit un gain de 3,3×.
- **Deux lots de correction déléguées,** lanceur et SLO, menés en parallèle de deux lots menés par l'orchestrateur, Radar-ancres et attestations. Un seul propriétaire par fichier, aucun conflit de fusion.
- **Inspections :**
  - 4 inspecteurs neufs, puis des ré-inspections différentielles par le même inspecteur (56 à 192 s chacune, contre 199 à 463 s pour la première) ;
  - 7 REJECT et ACCEPT avec MED, tous suivis d'une correction et d'une ré-inspection ;
  - les inspections ont trouvé de vrais défauts HIGH, par exemple une ré-épingle par fusion non signée, ou une valeur en chaîne lue comme vide.
- **Coût :** pas de CI parallèle par PR. La protection stricte de branche impose de remettre la branche à jour puis d'attendre une CI de plus (environ 5 min) avant chaque fusion.
- **Défaut d'orchestration observé :** un agent est passé en `completed` sans livrer son rapport final. Son travail était commité et poussé, donc rien n'a été perdu, et la reprise s'est faite depuis le dernier commit.

## 11. Recherche via le Radar
- Audit des capacités (lecture seule) : les connecteurs, l'allowlist (5 hôtes), les contrôles SSRF, les quotas, la déduplication et la provenance sont décrits dans le rapport d'audit.
- Aucun hôte de documentation Claude Code ou Anthropic n'est autorisé. Une recherche Radar sur Claude Code exigerait d'étendre l'allowlist et l'autorisation de recherche, ce qui relève d'une **décision du propriétaire**. Aucune recherche externe n'a donc été lancée.
- Défaut trouvé et corrigé (#870) : l'interrupteur `ODG_RADAR_LIVE` n'était vérifié qu'à chaque point d'entrée. Il est désormais appliqué dans le client HTTP.
- Autres chemins d'egress hors de cet interrupteur, documentés, aucun sous minuterie installée : `finance-data-connector`, `capability-executors`, IMAP et `gh`.

## 12. Registre des défauts corrigés (cause racine → correctif)
- Écriture de la trace possible depuis la sandbox → le lanceur de confiance écrit la trace (#868).
- Descripteurs, stderr, mémoire, délai, processus orphelins, fraîcheur → durcissement (#873).
- Ancres lues dans l'arbre de travail ; revue affirmable par l'appelant ; revue non liée au candidat ; horloge fournie par l'appelant ; contrat non lié ; lecture d'arbres et de liens symboliques ; getter TOCTOU ; mesure de l'arbre de travail ; `GIT_DIR` et `git replace` → #871.
- Interrupteur d'egress appliqué par point d'entrée → appliqué dans le client (#870).
- Audit des ancres (simplification d'historique, chaîne lue comme vide, attribution de PR, « G » sans clé de propriétaire, fusion qui blanchit une épingle, épingle portée par l'historique) → #870.
- SLI :
  - statut inconnu ou intégrité compté disponible ;
  - lignes au lieu de créneaux ;
  - CI qui mélange PR et push ;
  - conclusions non décisives ignorées ;
  - relances qui masquent les échecs.
  Correctif : #872.

## 13. Risques et limites résiduels
- Référence locale `origin/main` modifiable par qui contrôle le clone (voir §9).
- Inscription d'ancre contrôlée par revue seulement, avec un compte partagé.
- Repli tsx sans plafond de mémoire virtuelle.
- Filtre seccomp x86_64 uniquement.
- Interaction bwrap ⇄ `RestrictAddressFamilies` non reproduite.
- `runtime/dist/package.json` planté par un processus non confiné : déni de service (LOW).
- Contenu de la trace autodéclaré.
- `IC.run` et `GATE.decide` acceptent toujours des booléens affirmés par l'appelant ; seule l'interface mesurée est honnête.
- Disponibilité après correction mesurée sur moins d'un jour.

## 14. Décisions réservées au propriétaire
1. Générer sa clé, inscrire son empreinte dans `TRUST_ANCHORS.json` par une PR qu'il relit, renseigner `subjectCommit` et `verdict` dans `V15_RESIDENT_CONFINEMENT_INSPECTION.json`, signer avec `odg-owner-sign`, puis revérifier sur son propre clone. C'est la seule voie vers 12/12.
2. Décider d'un contrôle qui fasse réellement respecter l'inscription des ancres : un compte distinct pour l'exécutant avec protection de branche, ou des commits signés GPG par le propriétaire.
3. Faire un essai à blanc du drop-in confiné sous systemd utilisateur, puis décider de l'installer ; `MemoryMax`, `MemorySwapMax` et `TasksMax` sont requis.
4. Choisir les SLO (proposition au §8).
5. Décider de L1 (recommandation : non, pour l'instant).
6. Étendre ou non l'allowlist du Radar pour la recherche sur Claude Code.

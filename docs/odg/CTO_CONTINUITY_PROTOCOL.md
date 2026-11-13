# ODG — PROTOCOLE PERMANENT DE CONTINUITÉ CTO (Livrable D, V183)

> Document autonome. Source machine-vérifiable : `runtime/core/odg-cto-continuity-protocol.ts` (+ test).
> **Un ancien rapport ne remplace jamais une vérification actuelle.** Toute reprise commence par la réconciliation (§11).

## 1. Identité de l'unique ODG
Il existe **un seul ODG** : l'application principale dans le dépôt `bmax-v21` (origin `git@github.com:Naser636/bmax-v21.git`). Ne jamais créer une 2ᵉ application/instance/gouvernance/registre/mémoire/scheduler/radar/moteur économique/moteur documentaire.

## 2. Roadmap maîtresse
**V12.4** est l'unique Master Roadmap. L'extension V12.4 est une **réserve stratégique PARKED** rattachée à V12.4 — pas une roadmap parallèle.

## 3. Sources canoniques (PROTÉGÉES)
- `docs/odg/closure-register.json` — **427 items** (415 ACCEPTED / 6 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED), dernier commit **@V123 `2382665`**. Ne pas muter sans autorisation propriétaire.
- `runtime/governance/ROADMAP.json` — **11 missions gouvernées**, dernier commit **@V123 `2382665`**. **OWNER_GATED**.
- `ODG_PROJECT_STATE.md` — Boussole (bannière LATEST + checkpoint EOF).
- `MEMORY.md` + fichiers-sujets — mémoire.

## 4. Neuf primitives
IDENTITY, STATE, CONTRACT, POLICY, RESOLVER, EXECUTOR, EVIDENCE, RECOVERY, ALLOCATOR. **Aucune 10ᵉ.**

## 5. Vingt métiers (15 principaux + 5 commerciaux)
**15 principaux :** P1 Fullstack · P2 AI/ML · P3 Security · P4 Data · P5 Cloud/DevOps · P6 Eval · P7 SRE · P8 API · P9 FinOps · P10 Regulatory · P11 Document · P12 Streaming · P13 AI-Infra · P14 DevEx · P15 Workflow.
**5 commerciaux (réconciliés depuis V151) :** M1 CRA/SBOM · M2 BTP/TP · M3 FinOps · M4 Data-engineering · M5 Accessibility.
Total **20**. Voir **Livrable A** (matrice business), **Livrable B** (9×15) et le **complément V183** (9×20 = 180 intersections, `odg-commercial-metier-matrix.ts`). Les 5 commerciaux ne sont ni des primitives ni une 2ᵉ architecture métier.

## 6. Composants existants (réutiliser avant de construire)
audit-log · odg-mission-scheduler · odg-campaign-lifecycle · odg-closure-register-ops · document-intelligence · odg-global-opportunity-radar + odg-weekly-radar-scheduler · delegate-isolation + provider-sandbox · evidence-provenance · truth-lock · memory-trust-gate · modules V180–V183.

## 7. Campagnes terminées (ne pas relancer)
V180 (#546) · V180-A (#547) · V181 (#548) · V182 (#549) · extension V12.4 PARKED (#550). Preuves : `docs/odg/V18*.json`, `V124_EXTENSION_PARKED_ROADMAP.json`, `V183_GOVERNANCE_VIEWS.json`.

## 8. Missions ouvertes / bloquées / différées
Registre : 6 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED (@V123). **BMAX HFT/AO** = `BLOCKED_ASSET_ABSENT` (actifs non fournis).

## 9. État de l'extension V12.4
**PARKED** (`started=false`). 9 programmes enregistrés + mappés sur les composants existants. Intégration `ROADMAP.json` = **OWNER_GATED, non effectuée**.

## 10. Restrictions & owner-gates
Pas de VPS/root/sudo/systemd/déploiement/exposition publique/TLS/domaine ; pas de secret/DB prod/paiement/trading/pub/contact commercial/signature ; pas de 2ᵉ système canonique ; `closure-register.json` + `ROADMAP.json` OWNER_GATED. En attente propriétaire : intégration ROADMAP.json, runtime résident, exécution paiement, certification légale, fourniture actifs BMAX.

## 11. Procédure obligatoire de réconciliation avant reprise
1. `git rev-parse HEAD` + branche + `git status` (attendu : `main` propre).
2. Vérifier `closure-register.json` (427) + `ROADMAP.json` dernier commit **@V123**, byte-stables.
3. Confirmer la présence des dossiers + modules V180–V183 + extension.
4. Lire la bannière LATEST de `ODG_PROJECT_STATE.md` + l'index `MEMORY.md`.
5. **Un ancien rapport ne remplace jamais une vérification actuelle** — revérifier avant d'agir.

## 12. Règle anti-duplication
Réutiliser une capacité existante avant de l'améliorer ; améliorer un partiel avant de construire ; construire uniquement sur **absence démontrée** avec tests anti-duplication. Ne jamais reconstruire une capacité présente ni créer un second ODG.

---

### §6 — Proposition d'intégration dans V12.4 (préparée, OWNER_GATED, NON appliquée)
- **Emplacement recommandé** : une note de doctrine **référencée par** V12.4 (dossier `docs/odg/` + pointeur Boussole) — **pas** une nouvelle roadmap, **pas** une édition de `ROADMAP.json`.
- **Règles fixées** : identité ODG unique · réutilisation-avant-construction · vérifier VPS/runtime avant toute évolution qui en dépend · pas d'architectures parallèles · distinguer code ≠ tests ≠ intégration ≠ runtime ≠ autorisation · protocole de reprise inter-conversations · exigences de preuve et de clôture · préservation des restrictions de sécurité et owner-gates.
- **`ROADMAP.json`** : action **NONE**, statut **OWNER_GATED** (chemin protégé ; proposition prête, non appliquée).
- **Contrôle d'intégrité** : à l'approbation, préserver les 11 missions gouvernées + l'identité byte-à-byte du registre 427 ; n'ajouter qu'une référence de doctrine ; ne rouvrir aucune mission close.

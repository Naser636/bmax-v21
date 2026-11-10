# P3 CRA / SBOM — Dossier du troisième pilote (READINESS ONLY)

**CTO V55 · 2026-11-10 · LOCAL — préparation uniquement.**
Autorité : **ODG**. Fournisseur technique : **Claude Code** (rôle borné). Validation : **contrôleur indépendant obligatoire**.
Aucune prospection, aucun message externe, aucun contrat, aucune dépense, aucun recrutement, aucun push/merge/déploiement/VPS.
P3 reste **E4**. **E5 = NOT_STARTED** jusqu'à ce que toutes les conditions de §9 soient réunies.

> ODG **prépare** des preuves de *readiness* CRA/SBOM ; il ne délivre **ni conformité CRA, ni certification, ni avis juridique**.
> Le guard **n'effectue PAS de scan CVE** (`cveScan=NOT_PERFORMED`) ; dans la simulation, vulnérabilités, incidents et délais sont **explicitement SIMULATED**.

Base réutilisée (aucun moteur nouveau) : guard P3 `cra-evidence-demonstrator.runCraEvidence`
(→ `sbom-audit-service` + `compliance-evidence-pack` + `golden-path-evidence-bundle` + `evidence-pack-export`),
`verifyCraEvidence` (tamper-evidence), couche rapport **O1** et preuves **O2** (→ `evidence-provenance`).
Démonstrateur E4 existant : `docs/odg/demonstrators/P3_CRA_SBOM_READINESS.json`.

---

## 1. Client idéal et décideur
- **Fabricant / éditeur de produits numériques** avec composant logiciel (IoT, firmware, SaaS embarqué, device connecté) soumis au **CRA** (Reg. (UE) 2024/2847).
- **Décideur** : CISO/RSSI, VP Engineering, responsable produit/qualité ou responsable conformité, habilité à autoriser l'accès et à **valider par écrit**.
- **Inventaire logiciel et documentation accessibles** (manifestes de dépendances, lockfiles, documentation technique).
- **Déclencheur** : échéances CRA (signalement depuis 2026-09-11 ; obligations principales 2027-12-11), exigence client/distributeur, audit de supply-chain.
- **Contre-indications** : pas de base légale d'accès au code/manifestes ; attente d'une « certification CRA » par ODG (hors périmètre).

## 2. Périmètre produit et responsabilités
- **ODG** : produit l'inventaire logiciel (SBOM machine-lisible), l'audit de politique de licences (gate CI), le pack de preuves scellé (tamper-evident) et l'export interopérable (OSCAL-shape) — **preuves/readiness**.
- **Client/fabricant** : opère le **processus de signalement** (duty légal), le fichier technique complet, le marquage CE et la déclaration de conformité, et les décisions de remédiation.
- **Contrôleur indépendant** : revue de l'engagement ; **conseil juridique qualifié** pour toute conclusion de droit.

## 3. Inventaire logiciel, SBOM et provenance
- Lecture des manifestes/lockfiles (npm `package-lock.json`, pnpm, yarn, pypi `requirements.txt`, cargo `Cargo.lock`, go `go.sum`, gem, composer) — **8 écosystèmes reconnus**.
- SBOM machine-lisible (CycloneDX-like) + licences lues **uniquement là où le manifeste les enregistre** (sinon `UNKNOWN`, jamais présumé sûr — fail-closed).
- Provenance/intégrité via **pack scellé** (golden-path bundle) + attestation ; ré-vérifiable indépendamment (`verifyCraEvidence`).

## 4. Vulnérabilités et gestion des dépendances
- **Important** : le guard réalise l'audit de licences, **PAS un scan CVE**. Une revendication de vulnérabilité exige un **scan CVE réel contre un flux hors-ligne** (owner/E5).
- Dans la simulation, les vulnérabilités sont **SIMULATED** (illustratives) pour exercer la priorisation et la remédiation.
- Gestion des dépendances : licences non-adoptables ⇒ gate CI `ciGate=1` (le build **doit** échouer) ; licences `UNKNOWN`/conditionnelles ⇒ `needsReview` (jamais présumé sûr).

## 5. Processus de traitement et remédiation
Scoring de risque déterministe (sévérité × exploité) → priorisation → plan de remédiation (basis `SIMULATED`). Une vulnérabilité **activement exploitée** déclenche la **répétition** du processus de signalement (voir §Obligations) — opéré par le fabricant.

## 6. Traçabilité et preuves
- Livrable **O1** (JSON + markdown PME) ; preuves **O2** avec basis explicite (`PROVEN`/`ESTIMATED`/`SIMULATED`, jamais sur-classé) + digest `evidence-provenance` ré-vérifiable.
- Pack scellé tamper-evident : le digest du bundle golden-path **se ré-vérifie** (`verifyCraEvidence`) ; la signature du pack est **owner-gated** (nécessite un signataire — absent en run synthétique).

## 7. Obligations de signalement (dates = données ; à confirmer par un conseil)
| Obligation | Délai | Applicable depuis | Type | Responsable |
|---|---|---|---|---|
| Alerte précoce (vuln activement exploitée) à l'ENISA/CSIRT | **24 h** | 2026-09-11 | LEGAL_OBLIGATION | fabricant (processus owner) |
| Notification de vulnérabilité | **72 h** | 2026-09-11 | LEGAL_OBLIGATION | fabricant |
| Rapport final | **14 jours** | 2026-09-11 | LEGAL_OBLIGATION | fabricant |
| SBOM machine-lisible dans la doc technique + obligations principales CRA | — | **2027-12-11** | LEGAL_OBLIGATION | fabricant |
| Marquage CE + déclaration de conformité | — | 2027-12-11 | NEEDS_LEGAL_EXPERTISE | fabricant/juridique |

**ODG fournit l'inventaire/les preuves, PAS le dépôt légal.** Ne jamais transformer une recommandation en obligation juridique. Vérifier les textes officiels et leurs évolutions.

## 8. Critères d'acceptation / de rejet
- **Acceptation** : SBOM complet du périmètre ; gate de licences honnête (`UNKNOWN` jamais présumé sûr) ; pack scellé ré-vérifiable ; scan CVE **réel** exécuté (en E5) ; digest reproductible ; revue contrôleur + conseil juridique OK.
- **Rejet** : rapport présenté comme conformité/certification/avis juridique ; vulnérabilité affirmée sans scan CVE réel ; recommandation présentée comme obligation ; accès hors base légale ; absence de revue indépendante. (Détail machine : `P3_E5_READINESS_CRITERIA.json`.)

## 9. Transition E4 → E5 (résumé)
P3 **reste E4**. Passage à **E5** exige, cumulativement (voir `P3_E5_READINESS_CRITERIA.json`, 8 conditions, toutes `false`) :
client réel autorisé · périmètre produit + responsabilités écrits · base légale et accès (code/manifestes) établis ·
exécution réelle (manifestes réels + **scan CVE réel**) · résultats observés et vérifiables · confirmation juridique qualifiée ·
validation écrite du client · revue indépendante. Tant que ces conditions ne sont pas **toutes** réunies : **E5 = NOT_STARTED**.

# Preuves reproductibles — démonstrations techniques ODG

Ces fichiers sont les **démonstrations techniques synthétiques** référencées sur `../proofs.html`.
Ce ne sont **pas** des projets clients. Chaque élément indique : le code publié, la commande de test, le
résultat **réellement constaté** (exécution du 2026-10-08), les prérequis et les limites.

Prérequis communs : Node.js (v22 utilisé) et `tsx` (via `npx tsx`). Aucune dépendance externe pour les
trois premières démonstrations. Depuis ce dossier `site/proofs/` :

---

## 1. Parseur CSV → JSON
- **Code publié / vérifiable :** `csv2json.ts` (implémentation), `csv2json.test.ts` (tests).
- **Test exécuté :** `npx tsx csv2json.test.ts`
- **Résultat constaté :** `CSV2JSON prototype — 7 assertions passed.`
- **Prérequis :** Node + tsx. Aucune dépendance.
- **Limites :** bibliothèque de parsing isolée ; pas un produit ; non éprouvée à grande échelle.

## 2. Cœur de plateforme de données
- **Code publié / vérifiable :** `platform.ts`, `platform.test.ts`.
- **Test exécuté :** `npx tsx platform.test.ts`
- **Résultat constaté :** `Data-platform vertical slice — 14 assertions passed.`
- **Prérequis :** Node + tsx. Aucune dépendance.
- **Limites :** stockage en mémoire, sans interface ni persistance ; démonstration du noyau, pas une solution complète.

## 3. Cœur de télémétrie IoT
- **Code publié / vérifiable :** `iot.ts`, `iot.test.ts`.
- **Test exécuté :** `npx tsx iot.test.ts`
- **Résultat constaté :** `IoT telemetry vertical slice — 17 assertions passed.`
- **Prérequis :** Node + tsx. Aucune dépendance.
- **Limites :** sans intégration matérielle ni mise à l'échelle ; démonstration du traitement, pas du déploiement.

## 4. Tests ajoutés à un projet open-source (contribution préparée)
- **Code publié / vérifiable :** `literest-sanitizers.test.ts` (les tests que nous avons écrits).
- **Projet visé :** le projet open-source public **outerbase/starbasedb** (nous ne republions pas son code).
- **Test exécuté :** dans une copie locale du dépôt public, placer le fichier dans `src/literest/`, puis
  `npm install` et `node_modules/.bin/vitest run src/literest/sanitizers.test.ts`.
- **Résultat constaté :** `Test Files 1 passed (1)` / `Tests 10 passed (10)`, tests existants non régressés.
- **Prérequis :** cloner le dépôt public starbasedb + ses dépendances (vitest).
- **Limites :** contribution **préparée, non soumise** ; l'intégration dépend des mainteneurs du projet.

---

Toutes les valeurs ci-dessus ont été obtenues par exécution réelle, non recopiées d'une exécution ancienne.

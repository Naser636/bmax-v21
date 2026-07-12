# METHODE DE TRAVAIL OFFICIELLE ODG

## Objectif

Développer ODG de manière industrielle, reproductible et sans retour en arrière sur les fondations.

---

## 1. Règles d'or

- Une seule source de vérité.
- Aucun développement hors feuille de route.
- Aucun doublon.
- Aucun code mort.
- Aucune dette technique volontaire.
- Une étape validée avant la suivante.
- Une preuve avant toute validation.

---

## 2. Cycle obligatoire de chaque session

1. Lire METHODE_DE_TRAVAIL.md.
2. Lire FEUILLE_DE_ROUTE.md.
3. Identifier le bloc courant.
4. Vérifier l'état Git.
5. Vérifier les dépendances.
6. Auditer la zone à modifier.
7. Évaluer les impacts.
8. Préparer le plan.
9. Exécuter le bloc.
10. Valider.
11. Documenter.
12. Mettre à jour la feuille de route.

---

## 3. Préparation obligatoire

Avant toute modification :

- audit de la zone concernée ;
- audit des dépendances ;
- audit des contrats ;
- audit du workflow ;
- analyse des impacts.

Si un risque important est identifié :

STOP.

Le plan est revu avant toute modification.

---

## 4. Principe du Bloc Maximum Validable (BMV)

Chaque bloc doit être le plus grand possible tout en restant :

- cohérent ;
- auditable ;
- validable ;
- réversible.

On ne découpe un bloc que pour réduire un risque technique.

---

## 5. Exécution

Toujours dans cet ordre :

Explication

↓

Commande

↓

Exécution

↓

Contrôle

↓

Correction si nécessaire

Jamais plusieurs objectifs dans un même bloc.

---

## 6. Validation technique

Chaque bloc est validé par :

- Build
- TypeScript
- Tests
- Démonstration
- Audit ciblé
- Vérification des contrats
- Vérification des dépendances

---

## 7. Validation finale

Quand le bloc est validé :

- rapport de clôture ;
- mise à jour de la feuille de route ;
- changement d'état (⬜ → 🟨 → ✅) ;
- commit si le bloc est terminé ;
- tag si jalon ;
- baseline si nécessaire.

---

## 8. Règle de communication

Pendant le développement :

Toujours :

Explication → Commande

Jamais :

Commande seule.

Jamais :

Explication seule.

Une seule étape à la fois.

---

## 9. Objectif permanent

Chaque modification doit rendre ODG :

- plus simple ;
- plus propre ;
- plus robuste ;
- plus documenté ;
- plus facilement maintenable.


---

## 10. Fin d'un bloc

À la fin de chaque commande :

1. analyser le résultat ;
2. confirmer la validation ou expliquer l'échec ;
3. ne jamais réexécuter une commande déjà validée ;
4. préparer le bloc suivant.

Une commande validée est considérée comme terminée et ne doit plus être relancée sauf si un nouveau problème est identifié.

---

## 11. Idempotence

Avant de proposer une commande :

- vérifier si elle a déjà été exécutée ;
- si oui, contrôler son résultat ;
- ne jamais la reproposer ;
- passer directement au bloc suivant.

---

## 12. Mémoire de session

Chaque réponse doit tenir compte :

- des commandes déjà exécutées ;
- des validations obtenues ;
- des documents créés ;
- des décisions prises ;
- de l'état réel du projet.

L'IA ne repart jamais d'un état supposé.


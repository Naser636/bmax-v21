# Mission : APPLY_FLEET_CHATGPT_INTEGRATION

OBJECTIF

Intégrer effectivement ChatGPT comme second agent Fleet dans ODG Runtime.

PRINCIPE

ODG doit réaliser cette mission de manière autonome.

Il doit :
- privilégier ses propres mécanismes et connaissances ;
- réutiliser au maximum l'architecture existante (Reuse Before Create) ;
- utiliser Claude uniquement lorsque cela est nécessaire pour produire ou valider une implémentation ;
- utiliser toutes les capacités Fleet déjà disponibles sans en créer de nouvelles inutilement.

CONTRAINTES OBLIGATOIRES

- Sécurité maximale.
- Aucun refactoring.
- Patch minimal.
- Aucun comportement existant modifié.
- Aucune régression.
- Compatibilité complète avec l'architecture Runtime.
- Compatibilité complète avec Fleet.
- Compatibilité complète avec Claude.
- Préserver l'intégralité des fonctionnalités existantes.
- Rollback complet garanti.
- Validation systématique avant toute modification.
- Ne casser aucun composant existant.
- Réutiliser tous les composants existants avant d'en créer de nouveaux.

OBJECTIFS TECHNIQUES

- Ajouter ChatGPT comme agent Fleet.
- Étendre le registre Fleet existant.
- Ajouter uniquement les composants indispensables.
- Adapter le Dispatcher uniquement si nécessaire.
- Permettre le routage vers Claude ou ChatGPT.
- Conserver la compatibilité avec toutes les missions existantes.

VALIDATION

Avant de terminer :

- vérifier que Claude fonctionne toujours ;
- vérifier que ChatGPT est enregistré ;
- vérifier que les deux agents répondent correctement ;
- vérifier que tous les tests Fleet passent ;
- vérifier que le Runtime reste entièrement compatible.

La priorité absolue est la sécurité, la stabilité et la préservation de l'architecture ODG existante.

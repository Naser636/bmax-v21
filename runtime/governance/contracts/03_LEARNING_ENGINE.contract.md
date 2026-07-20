# CONTRACT 03 — LEARNING ENGINE

ContractId: 03_LEARNING_ENGINE
ExecutionOrder: 3
Status: ACTIVE

MISSION

Construire une mémoire permanente du Runtime.

OBJECTIVES

- Enregistrer les découvertes importantes.
- Ne jamais apprendre deux fois la même chose.
- Réutiliser les connaissances des missions précédentes.
- Conserver uniquement les informations utiles.

LEARNING CYCLE

Mission
↓
Analysis
↓
Knowledge
↓
Validation
↓
Persistent Memory
↓
Reuse

MEMORY RULES

Toujours mémoriser :

- composants critiques
- hotspots
- dépendances
- architecture
- décisions validées
- règles de gouvernance
- erreurs déjà rencontrées
- solutions validées

Ne jamais mémoriser :

- données temporaires
- logs
- fichiers intermédiaires
- erreurs non validées

INPUTS

runtime/generated/*.json

OUTPUTS

runtime/generated/runtime-memory.json

SUCCESS

Le Runtime réutilise automatiquement les connaissances
des missions précédentes avant toute nouvelle analyse.

NEXT_CONTRACT

04_RUNTIME_QUALITY


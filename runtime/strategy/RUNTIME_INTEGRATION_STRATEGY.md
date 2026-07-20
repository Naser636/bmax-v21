# Runtime Integration Strategy

## Global
Project files : 513
Runtime files : 17

## Critical Components
- src/runtime/capability-registry.ts
- src/runtime/event-bus.ts
- src/runtime/execution-memory.ts
- src/runtime/execution-planner.ts
- src/runtime/index.ts
- src/runtime/mission-loader.ts
- src/runtime/mission-orchestrator.ts
- src/runtime/runtime-service.ts

## Orphans
- src/runtime/runtime-demo.ts

## Extension Points
- src/runtime/capability-registry.ts
- src/runtime/event-bus.ts
- src/runtime/execution-memory.ts
- src/runtime/execution-planner.ts
- src/runtime/index.ts
- src/runtime/mission-loader.ts
- src/runtime/mission-orchestrator.ts
- src/runtime/plugin-registry.ts
- src/runtime/runtime-events.ts
- src/runtime/runtime-executor.ts
- src/runtime/runtime-facade.ts
- src/runtime/runtime-health.ts
- src/runtime/runtime-reporter.ts
- src/runtime/runtime-service.ts
- src/runtime/runtime-state.ts
- src/runtime/runtime-types.ts

## CTO Decision
Aucun composant existant ne sera supprimé.
Toute évolution devra passer par extension.
Les composants existants sont considérés comme prioritaires.

# ODG Runtime Dependency Audit

Generated : 2026-07-12T12:12:27+00:00

## Build Status
- Build      : OK
- TypeScript : OK
- Git        : OK

==================================================
COMPONENT : capability-registry.ts
--------------------------------------------------
src/core/decision-runner.ts:2:import { capabilities } from "@/core/capability-registry";
src/core/dashboard-adapter.ts:1:import { capabilities } from "@/core/capability-registry";
src/tests/integration.test.ts:1:import { capabilities } from "@/core/capability-registry";
src/tests/regression.test.ts:1:import { capabilities } from "@/core/capability-registry";
src/tests/capability-registry.test.ts:1:import { capabilityRegistry } from "@/core/capability-registry";
src/runtime/index.ts:5:export * from "./capability-registry";
src/demo/demo.ts:1:import { capabilities } from "@/core/capability-registry";

==================================================
COMPONENT : event-bus.ts
--------------------------------------------------
src/runtime/runtime-service.ts:5:import {EventBus} from "./event-bus";
src/runtime/runtime-executor.ts:5:import {EventBus} from "./event-bus";
src/runtime/index.ts:10:export * from "./event-bus";

==================================================
COMPONENT : execution-memory.ts
--------------------------------------------------
src/runtime/runtime-service.ts:4:import {ExecutionMemory} from "./execution-memory";
src/runtime/runtime-executor.ts:4:import {ExecutionMemory} from "./execution-memory";
src/runtime/index.ts:4:export * from "./execution-memory";

==================================================
COMPONENT : execution-planner.ts
--------------------------------------------------
src/runtime/runtime-service.ts:3:import {ExecutionPlanner} from "./execution-planner";
src/runtime/runtime-executor.ts:3:import {ExecutionPlanner} from "./execution-planner";
src/runtime/index.ts:9:export * from "./execution-planner";

==================================================
COMPONENT : index.ts
--------------------------------------------------
Referenced by : NONE

==================================================
COMPONENT : mission-loader.ts
--------------------------------------------------
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/index.ts:7:export * from "./mission-loader";
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";

==================================================
COMPONENT : mission-orchestrator.ts
--------------------------------------------------
src/runtime/runtime-service.ts:2:import {MissionOrchestrator} from "./mission-orchestrator";
src/runtime/runtime-executor.ts:2:import {MissionOrchestrator} from "./mission-orchestrator";
src/runtime/index.ts:8:export * from "./mission-orchestrator";
src/runtime/execution-planner.ts:4:} from "./mission-orchestrator";

==================================================
COMPONENT : plugin-registry.ts
--------------------------------------------------
src/runtime/index.ts:6:export * from "./plugin-registry";

==================================================
COMPONENT : runtime-demo.ts
--------------------------------------------------
Referenced by : NONE

==================================================
COMPONENT : runtime-events.ts
--------------------------------------------------
src/runtime/index.ts:3:export * from "./runtime-events";

==================================================
COMPONENT : runtime-executor.ts
--------------------------------------------------
src/runtime/runtime-demo.ts:1:import { RuntimeExecutor } from "./runtime-executor";

==================================================
COMPONENT : runtime-facade.ts
--------------------------------------------------
src/runtime/index.ts:14:export * from "./runtime-facade";

==================================================
COMPONENT : runtime-health.ts
--------------------------------------------------
src/runtime/runtime-facade.ts:3:import {RuntimeHealth} from "./runtime-health";
src/runtime/index.ts:11:export * from "./runtime-health";

==================================================
COMPONENT : runtime-reporter.ts
--------------------------------------------------
src/runtime/runtime-facade.ts:2:import {RuntimeReporter} from "./runtime-reporter";
src/runtime/index.ts:12:export * from "./runtime-reporter";

==================================================
COMPONENT : runtime-service.ts
--------------------------------------------------
src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/runtime/runtime-facade.ts:1:import {RuntimeService} from "./runtime-service";
src/runtime/index.ts:13:export * from "./runtime-service";

==================================================
COMPONENT : runtime-state.ts
--------------------------------------------------
src/runtime/index.ts:2:export * from "./runtime-state";

==================================================
COMPONENT : runtime-types.ts
--------------------------------------------------
src/runtime/index.ts:1:export * from "./runtime-types";
src/runtime/runtime-state.ts:1:import {RuntimeStatus} from "./runtime-types";

==================================================
RULE

Cette mission est en lecture seule.
Aucun fichier du dépôt n'a été modifié.
==================================================

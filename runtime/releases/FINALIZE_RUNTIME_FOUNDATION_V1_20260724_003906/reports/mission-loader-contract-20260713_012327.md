# MissionLoader Contract

Generated: 2026-07-13T01:23:27+00:00

## Responsibility
- Transform a mission request into a RuntimeMission.
- Nothing else.

## Inputs
- mission id
- mission name
- ProjectContext provider

## Outputs
- RuntimeMission

## Must NOT
- Read documentation
- Analyze repository
- Choose capabilities
- Build execution plan
- Execute mission

## Dependencies
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-service.ts:9:readonly loader=new MissionLoader();
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:9:  private readonly loader=new MissionLoader();
src/runtime/mission-loader.ts:9:export class MissionLoader {
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";
src/runtime/mission-orchestrator.ts:16:    private readonly loader = new MissionLoader()

## Validation
- Public API unchanged
- One responsibility
- Backward compatible
- Build green
- TypeScript green

## CTO Decision
Patch only after this contract is validated.

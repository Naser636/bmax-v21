# MissionLoader Minimal Patch

Generated: 2026-07-13T01:24:47+00:00

## Current API
import fs from "node:fs";

export interface RuntimeMission {
  id: string;
  name: string;
  projectContext: unknown;
}

export class MissionLoader {
  constructor(
    private readonly projectContextPath =
      "runtime/generated/project-context.json"
  ) {}

  load(id: string, name: string): RuntimeMission {
    const projectContext = JSON.parse(
      fs.readFileSync(this.projectContextPath, "utf8")
    );

    return {
      id,
      name,
      projectContext
    };
  }
}

## Components using MissionLoader
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-service.ts:9:readonly loader=new MissionLoader();
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:9:  private readonly loader=new MissionLoader();
src/runtime/mission-loader.ts:9:export class MissionLoader {
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";
src/runtime/mission-orchestrator.ts:16:    private readonly loader = new MissionLoader()

## Runtime Decision
- Responsibility unchanged
- Public API unchanged
- Extend only internals
- Reuse MissionContext
- Reuse RuntimeContext
- Reuse Knowledge Service
- No duplicate
- No rewrite

## Patch Scope
MODIFY : src/runtime/mission-loader.ts
KEEP    : all public methods
KEEP    : RuntimeExecutor
KEEP    : RuntimeService
KEEP    : RuntimeFacade

## Exit Criteria
- Build = OK
- TypeScript = OK
- Runtime = READY
- Existing behaviour preserved

# Runtime Patch Plan

Generated: 2026-07-13T01:15:22+00:00

## Current reusable components
src/core/workflow-recovery.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-recovery.ts:5:  context: MissionContext
src/core/knowledge-engine.ts:2:import { Knowledge } from "@/contracts/knowledge";
src/core/knowledge-engine.ts:3:import { addKnowledge } from "@/core/knowledge-registry";
src/core/knowledge-engine.ts:6:export function createKnowledge(decision: Decision): Knowledge {
src/core/knowledge-engine.ts:7:  const knowledge: Knowledge = {
src/core/knowledge-engine.ts:17:  addKnowledge(knowledge);
src/core/knowledge-registry.ts:1:import { Knowledge } from "@/contracts/knowledge";
src/core/knowledge-registry.ts:3:const knowledgeBase: Knowledge[] = [];
src/core/knowledge-registry.ts:5:export function addKnowledge(knowledge: Knowledge): void {
src/core/knowledge-registry.ts:9:export function getKnowledge(): Knowledge[] {
src/core/workflow-connector.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-connector.ts:4:  context: MissionContext
src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/core/decision-engine.ts:12:import { createKnowledge } from "@/core/knowledge-engine";
src/core/decision-engine.ts:23:  const runtime = getRuntimeContext();
src/core/decision-engine.ts:78:  createKnowledge(decision);
src/core/workflow-scheduler.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-scheduler.ts:5:  context: MissionContext
src/core/memory-engine.ts:1:import { Knowledge } from "@/contracts/knowledge";
src/core/memory-engine.ts:5:export function createMemory(knowledge: Knowledge): Memory {
src/core/workflow-maintenance.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-maintenance.ts:5:  context: MissionContext
src/core/trace-service.ts:5:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/trace-service.ts:15:    knowledge: getKnowledgeBase(),
src/core/runtime-context.ts:3:export interface RuntimeContext {
src/core/runtime-context.ts:10:export const runtimeContext: RuntimeContext = {
src/core/runtime-service.ts:3:export function getRuntimeContext() {
src/core/workflow-demo.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-demo.ts:4:export async function workflowDemo(): Promise<MissionContext> {
src/core/workflow-demo.ts:5:  const context: MissionContext = {
src/core/workflow-http.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-http.ts:4:  context: MissionContext
src/core/knowledge-runner.ts:2:import { createKnowledge } from "@/core/knowledge-engine";
src/core/knowledge-runner.ts:4:export function runKnowledge(decision: Decision) {
src/core/knowledge-runner.ts:5:  return createKnowledge(decision);
src/core/workflow-health.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-health.ts:4:  context: MissionContext
src/core/knowledge-service.ts:1:import { getKnowledge } from "@/core/knowledge-registry";
src/core/knowledge-service.ts:3:export function getKnowledgeBase() {
src/core/knowledge-service.ts:4:  return getKnowledge();
src/core/workflow-engine.ts:10:import { MissionContext } from "@/core/mission-context";
src/core/workflow-engine.ts:21:  async execute(context: MissionContext): Promise<MissionContext> {
src/core/mission-context.ts:32:export interface MissionContext {
src/core/dashboard-adapter.ts:4:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/dashboard-adapter.ts:19:    knowledge: getKnowledgeBase(),
src/core/workflow-qualification.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-qualification.ts:4:  context: MissionContext
src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"

## Current MissionLoader
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

## Current RuntimeService
import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";

export class RuntimeService{

readonly loader=new MissionLoader();
readonly orchestrator=new MissionOrchestrator();
readonly planner=new ExecutionPlanner();
readonly memory=new ExecutionMemory();
readonly events=new EventBus();

}

## Runtime self recommendation
Mission:
- Reuse existing MissionContext.
- Reuse existing RuntimeContext.
- Reuse Knowledge Service.
- Do not create a second ProjectContext.
- Do not modify RuntimeExecutor yet.

## Patch target
1. Extend MissionLoader.
2. Extend RuntimeService.
3. Keep RuntimeExecutor unchanged.
4. Preserve public API.

## Safety Gate
- No rewrite
- No duplicate
- One Runtime
- Existing architecture only
- Build must stay green
- TypeScript must stay green

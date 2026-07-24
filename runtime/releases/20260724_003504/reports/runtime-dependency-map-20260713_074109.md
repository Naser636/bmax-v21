# Runtime Dependency Mission
Generated: 2026-07-13T07:41:09+00:00

MISSION
Identify the safest extension point before any patch.

=== MissionLoader ===
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-service.ts:9:readonly loader=new MissionLoader();
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:9:  private readonly loader=new MissionLoader();
src/runtime/mission-loader.ts:9:export class MissionLoader {
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";
src/runtime/mission-orchestrator.ts:16:    private readonly loader = new MissionLoader()

=== RuntimeService ===
src/runtime/runtime-service.ts:7:export class RuntimeService{
src/runtime/runtime-facade.ts:1:import {RuntimeService} from "./runtime-service";
src/runtime/runtime-facade.ts:7:private readonly runtime=new RuntimeService();
src/runtime/runtime-facade.ts:15:runtimeService(){

=== MissionContext ===
src/core/workflow-recovery.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-recovery.ts:5:  context: MissionContext
src/core/workflow-connector.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-connector.ts:4:  context: MissionContext
src/core/workflow-scheduler.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-scheduler.ts:5:  context: MissionContext
src/core/workflow-maintenance.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-maintenance.ts:5:  context: MissionContext
src/core/workflow-demo.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-demo.ts:4:export async function workflowDemo(): Promise<MissionContext> {
src/core/workflow-demo.ts:5:  const context: MissionContext = {
src/core/workflow-http.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-http.ts:4:  context: MissionContext
src/core/workflow-health.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-health.ts:4:  context: MissionContext
src/core/workflow-engine.ts:10:import { MissionContext } from "@/core/mission-context";
src/core/workflow-engine.ts:21:  async execute(context: MissionContext): Promise<MissionContext> {
src/core/mission-context.ts:32:export interface MissionContext {
src/core/workflow-qualification.ts:1:import { MissionContext } from "@/core/mission-context";
src/core/workflow-qualification.ts:4:  context: MissionContext
src/tests/mission-context.test.ts:1:import type { MissionContext } from "@/core/mission-context";
src/tests/mission-context.test.ts:3:const context: MissionContext = {

=== RuntimeContext ===
src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/core/decision-engine.ts:23:  const runtime = getRuntimeContext();
src/core/runtime-context.ts:3:export interface RuntimeContext {
src/core/runtime-context.ts:10:export const runtimeContext: RuntimeContext = {
src/core/runtime-service.ts:1:import { runtimeContext } from "@/core/runtime-context";
src/core/runtime-service.ts:3:export function getRuntimeContext() {
src/core/runtime-service.ts:4:  return runtimeContext;
src/core/audit-engine.ts:6:import { runtimeContext } from "@/core/runtime-context";
src/core/audit-engine.ts:19:    runtime: `${runtimeContext.systemState}/${runtimeContext.operationMode}`,

=== KnowledgeService ===
src/core/trace-service.ts:5:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/trace-service.ts:15:    knowledge: getKnowledgeBase(),
src/core/knowledge-service.ts:3:export function getKnowledgeBase() {
src/core/dashboard-adapter.ts:4:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/dashboard-adapter.ts:19:    knowledge: getKnowledgeBase(),

=== ProjectContext ===
src/runtime/mission-loader.ts:6:  projectContext: unknown;
src/runtime/mission-loader.ts:11:    private readonly projectContextPath =
src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
src/runtime/mission-loader.ts:16:    const projectContext = JSON.parse(
src/runtime/mission-loader.ts:17:      fs.readFileSync(this.projectContextPath, "utf8")
src/runtime/mission-loader.ts:23:      projectContext
src/runtime/mission-orchestrator.ts:25:        { id: "LOAD", name: "Load ProjectContext", status: "PENDING" },
runtime/backup/20260713_011959/mission-loader.ts:6:  projectContext: unknown;
runtime/backup/20260713_011959/mission-loader.ts:11:    private readonly projectContextPath =
runtime/backup/20260713_011959/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/backup/20260713_011959/mission-loader.ts:16:    const projectContext = JSON.parse(
runtime/backup/20260713_011959/mission-loader.ts:17:      fs.readFileSync(this.projectContextPath, "utf8")
runtime/backup/20260713_011959/mission-loader.ts:23:      projectContext

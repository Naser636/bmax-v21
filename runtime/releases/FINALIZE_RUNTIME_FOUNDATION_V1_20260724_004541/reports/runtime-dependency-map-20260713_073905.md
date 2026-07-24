# Runtime Dependency Mission
Generated: 2026-07-13T07:39:05+00:00

MISSION
Before any code patch, discover the real dependency graph.

QUESTIONS
1. Which components depend on MissionLoader?
2. Which components depend on RuntimeService?
3. Which components depend on MissionContext?
4. Which components depend on RuntimeContext?
5. Which components depend on KnowledgeService?
6. If MissionLoader changes, what is the complete impact?
7. Which component is the safest extension point?
8. Which components must never be modified?
9. What is the smallest possible patch?

RULES
- Evidence only.
- Reuse before create.
- Extend before rewrite.
- No implementation.
- No code.
- One recommendation only.

EVIDENCE
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-service.ts:9:readonly loader=new MissionLoader();
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:9:  private readonly loader=new MissionLoader();
src/runtime/mission-loader.ts:9:export class MissionLoader {
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";
src/runtime/mission-orchestrator.ts:16:    private readonly loader = new MissionLoader()

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

src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/core/decision-engine.ts:23:  const runtime = getRuntimeContext();
src/core/runtime-context.ts:3:export interface RuntimeContext {
src/core/runtime-context.ts:10:export const runtimeContext: RuntimeContext = {
src/core/runtime-service.ts:1:import { runtimeContext } from "@/core/runtime-context";
src/core/runtime-service.ts:3:export function getRuntimeContext() {
src/core/runtime-service.ts:4:  return runtimeContext;
src/core/audit-engine.ts:6:import { runtimeContext } from "@/core/runtime-context";
src/core/audit-engine.ts:19:    runtime: `${runtimeContext.systemState}/${runtimeContext.operationMode}`,

src/core/trace-service.ts:5:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/trace-service.ts:15:    knowledge: getKnowledgeBase(),
src/core/knowledge-service.ts:3:export function getKnowledgeBase() {
src/core/dashboard-adapter.ts:4:import { getKnowledgeBase } from "@/core/knowledge-service";
src/core/dashboard-adapter.ts:19:    knowledge: getKnowledgeBase(),

src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/end-session/SPRINT14_MANIFEST.json:11:    "project-context.json",
runtime/bin/odg-status.js:4:const ctx=JSON.parse(fs.readFileSync("runtime/generated/project-context.json","utf8"));
runtime/core/mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/preflight/PREFLIGHT_20260712_112558.md:23:runtime/generated/project-context.json
runtime/executive/EXECUTION_BOARD.md:8:- project-context.json
runtime/passports/F13.03.passport.md:7:- runtime/generated/project-context.json
runtime/passports/F13.02.passport.md:7:Sortie : runtime/generated/project-context.json
runtime/backup/20260712_202759/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_204200-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_204318-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_205205-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_205033-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260713_011959/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-mission-20260713_013656.md:313:project-context.json
runtime/reports/runtime-final-gate-20260713_011659.md:97:      "runtime/generated/project-context.json"
runtime/reports/s13-code-patch-20260713_011355.md:15:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-patch-plan-20260713_011522.md:54:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-patch-plan-20260713_011522.md:68:      "runtime/generated/project-context.json"
runtime/reports/mission-loader-patch-20260713_012447.md:17:      "runtime/generated/project-context.json"
runtime/reports/s13-runtime-extension-20260713_011221.md:17:      "runtime/generated/project-context.json"
runtime/generated/export/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/mission-plan.json:5:    "id": "project-context",
runtime/generated/business-capability-index.txt:610:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/generated/runtime-architecture-plan.json:1269:          "project-context.json",
runtime/generated/source-review/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/execution-board.json:9:      "project-context.json",
runtime/generated/source-dump/odg-run.txt:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/project-context.json:2:  "id": "project-context",
runtime/generated/runtime-inventory.txt:59:runtime/generated/project-context.json
runtime/generated/runtime-execution.json:6:      "id": "project-context",

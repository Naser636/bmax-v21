# MissionLoader Analysis

Date : Wed Jul 15 22:49:01 UTC 2026

## 1. MissionLoader
src/runtime/mission-loader.ts:14:export class MissionLoader {

## 2. ProjectContext
src/runtime/project-context.ts:4:export class ProjectContext {
src/runtime/business-context.ts:9:import { ProjectContext } from "./project-context";
src/runtime/business-context.ts:15:  build(project: ReturnType<ProjectContext["generate"]>): BusinessContextModel {
src/runtime/mission-orchestrator.ts:34:        { id: "LOAD", name: "Load ProjectContext", status: "PENDING" },
src/runtime/context-engine.ts:1:import { ProjectContext } from "./project-context";
src/runtime/context-engine.ts:8:  private readonly context = new ProjectContext();
src/runtime/capability-registry.ts:29:      missing: ["ProjectContext Engine","BusinessContext","Capability Registry","Plugin Manager","Event Bus","Reporter","Documentation Engine","Release Manager","Knowledge Engine","Learning Engine"]

## 3. MissionContext
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

## 4. RuntimeContext
src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/core/decision-engine.ts:23:  const runtime = getRuntimeContext();
src/core/runtime-context.ts:3:export interface RuntimeContext {
src/core/runtime-context.ts:10:export const runtimeContext: RuntimeContext = {
src/core/runtime-service.ts:3:export function getRuntimeContext() {
src/runtime/runtime-context.ts:5:export class RuntimeContext {
src/runtime/runtime-context.ts:6:  private static instance: RuntimeContext;
src/runtime/runtime-context.ts:16:  static get(): RuntimeContext {
src/runtime/runtime-context.ts:17:    if (!RuntimeContext.instance) {
src/runtime/runtime-context.ts:18:      RuntimeContext.instance = new RuntimeContext();
src/runtime/runtime-context.ts:19:      RuntimeContext.instance.engine.bootstrap();
src/runtime/runtime-context.ts:22:    return RuntimeContext.instance;
src/runtime/runtime-executor.ts:7:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-executor.ts:16:  private readonly context = RuntimeContext.get();
src/runtime/mission-controller.ts:2:import { RuntimeContext } from "./runtime-context";
src/runtime/mission-controller.ts:11:  private readonly context = RuntimeContext.get();
src/runtime/runtime-kernel.ts:3:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-kernel.ts:8:  private readonly context = RuntimeContext.get();
src/runtime/runtime-autopilot.ts:2:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-autopilot.ts:12:  private readonly context = RuntimeContext.get();
src/runtime/runtime-supervisor.ts:2:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-supervisor.ts:12:  private readonly context = RuntimeContext.get();
src/runtime/runtime-bootstrap.ts:2:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-bootstrap.ts:11:  private readonly context = RuntimeContext.get();
src/runtime/runtime-governor.ts:2:import { RuntimeContext } from "./runtime-context";
src/runtime/runtime-governor.ts:12:  private readonly context = RuntimeContext.get();
src/runtime/implementation-engine.ts:4:import { RuntimeContext } from "./runtime-context";
src/runtime/implementation-engine.ts:35:  private readonly context = RuntimeContext.get();
src/runtime/mission-dispatcher.ts:1:import { RuntimeContext } from "./runtime-context";
src/runtime/mission-dispatcher.ts:5:  private readonly context = RuntimeContext.get();

## 5. KnowledgeService

## 6. Lecture directe de project-context.json
src/runtime/project-context.ts:13:  generate(output = "runtime/generated/project-context.json") {
runtime/end-session/SPRINT14_MANIFEST.json:11:    "project-context.json",
runtime/bin/odg-status.js:4:const ctx=JSON.parse(fs.readFileSync("runtime/generated/project-context.json","utf8"));
runtime/core/mission-loader.next.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/core/mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/preflight/PREFLIGHT_20260712_112558.md:23:runtime/generated/project-context.json
runtime/executive/EXECUTION_BOARD.md:8:- project-context.json
runtime/passports/F13.03.passport.md:7:- runtime/generated/project-context.json
runtime/passports/F13.02.passport.md:7:Sortie : runtime/generated/project-context.json
runtime/backup/20260715_121649/mission-loader.js.before:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_202759/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_204200-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_204318-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_205205-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260715_133903/mission-loader.js.before:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260715_132444/mission-loader.js.before:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260712_205033-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260715_132354/mission-loader.js.before:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/backup/20260713_011959/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_074109.md:67:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_074109.md:74:runtime/backup/20260713_011959/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-mission-20260713_013656.md:313:project-context.json
runtime/reports/runtime-final-gate-20260713_011659.md:97:      "runtime/generated/project-context.json"
runtime/reports/s13-code-patch-20260713_011355.md:15:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-patch-plan-20260713_011522.md:54:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-patch-plan-20260713_011522.md:68:      "runtime/generated/project-context.json"
runtime/reports/mission-loader-patch-20260713_012447.md:17:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:74:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:75:runtime/end-session/SPRINT14_MANIFEST.json:11:    "project-context.json",
runtime/reports/runtime-dependency-map-20260713_073905.md:76:runtime/bin/odg-status.js:4:const ctx=JSON.parse(fs.readFileSync("runtime/generated/project-context.json","utf8"));
runtime/reports/runtime-dependency-map-20260713_073905.md:77:runtime/core/mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:78:runtime/preflight/PREFLIGHT_20260712_112558.md:23:runtime/generated/project-context.json
runtime/reports/runtime-dependency-map-20260713_073905.md:79:runtime/executive/EXECUTION_BOARD.md:8:- project-context.json
runtime/reports/runtime-dependency-map-20260713_073905.md:80:runtime/passports/F13.03.passport.md:7:- runtime/generated/project-context.json
runtime/reports/runtime-dependency-map-20260713_073905.md:81:runtime/passports/F13.02.passport.md:7:Sortie : runtime/generated/project-context.json
runtime/reports/runtime-dependency-map-20260713_073905.md:82:runtime/backup/20260712_202759/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:83:runtime/backup/20260712_204200-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:84:runtime/backup/20260712_204318-odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:85:runtime/backup/20260712_205205-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:86:runtime/backup/20260712_205033-mission-loader.js:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:87:runtime/backup/20260713_011959/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:88:runtime/reports/runtime-mission-20260713_013656.md:313:project-context.json
runtime/reports/runtime-dependency-map-20260713_073905.md:89:runtime/reports/runtime-final-gate-20260713_011659.md:97:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:90:runtime/reports/s13-code-patch-20260713_011355.md:15:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:91:runtime/reports/runtime-patch-plan-20260713_011522.md:54:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:92:runtime/reports/runtime-patch-plan-20260713_011522.md:68:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:93:runtime/reports/mission-loader-patch-20260713_012447.md:17:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:94:runtime/reports/s13-runtime-extension-20260713_011221.md:17:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:95:runtime/generated/export/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:97:runtime/generated/business-capability-index.txt:610:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/reports/runtime-dependency-map-20260713_073905.md:98:runtime/generated/runtime-architecture-plan.json:1269:          "project-context.json",
runtime/reports/runtime-dependency-map-20260713_073905.md:99:runtime/generated/source-review/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:100:runtime/generated/execution-board.json:9:      "project-context.json",
runtime/reports/runtime-dependency-map-20260713_073905.md:101:runtime/generated/source-dump/odg-run.txt:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/reports/runtime-dependency-map-20260713_073905.md:102:runtime/generated/project-context.json:2:  "id": "project-context",
runtime/reports/runtime-dependency-map-20260713_073905.md:103:runtime/generated/runtime-inventory.txt:59:runtime/generated/project-context.json
runtime/reports/s13-runtime-extension-20260713_011221.md:17:      "runtime/generated/project-context.json"
runtime/generated/export/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/runtime-health-report.md:28:runtime/generated/project-context.json
runtime/generated/engineering-order-integration.txt:1:runtime/bin/odg-status.js:const ctx=JSON.parse(fs.readFileSync("runtime/generated/project-context.json","utf8"));
runtime/generated/engineering-order-integration.txt:5:runtime/core/mission-loader.js:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:16:runtime/backup/20260712_202759/odg-run.js:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:17:runtime/backup/20260712_204200-odg-run.js:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:18:runtime/backup/20260712_204318-odg-run.js:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:23:runtime/backup/20260712_205205-mission-loader.js:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:39:runtime/backup/20260712_205033-mission-loader.js:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:48:runtime/generated/export/odg-run.js:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/engineering-order-integration.txt:49:runtime/generated/source-review/odg-run.js:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/build-contract.json:13:    "runtime/generated/project-context.json",
runtime/generated/business-capability-index.txt:610:src/runtime/mission-loader.ts:12:      "runtime/generated/project-context.json"
runtime/generated/runtime-architecture-plan.json:1269:          "project-context.json",
runtime/generated/source-review/odg-run.js:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/execution-board.json:9:      "project-context.json",
runtime/generated/runtime-files.txt:275:runtime/generated/migration/project-context.json.before
runtime/generated/runtime-files.txt:303:runtime/generated/project-context.json
runtime/generated/runtime-files.txt:304:runtime/generated/project-context.json.before
runtime/generated/runtime-files.txt:305:runtime/generated/project-context.json.fix.before
runtime/generated/source-dump/odg-run.txt:4:fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/migration/mission-loader.ts.before:12:      "runtime/generated/project-context.json"
runtime/generated/migration/project-context.engine.before:6:  generate(output = "runtime/generated/project-context.json") {
runtime/generated/migration/mission-loader.js.bak:13:    fs.readFileSync("runtime/generated/project-context.json","utf8")
runtime/generated/migration/mission-loader.projectcontext.before:17:      "runtime/generated/project-context.json",
runtime/generated/migration/project-context.B4.before:6:  generate(output = "runtime/generated/project-context.json") {
runtime/generated/migration/project-context.fix.before:6:  generate(output = "runtime/generated/project-context.json") {
runtime/generated/migration/project-context.B5.before:13:  generate(output = "runtime/generated/project-context.json") {
runtime/generated/next-capability.json:9:    "runtime/generated/project-context.json"
runtime/generated/runtime-inventory.txt:59:runtime/generated/project-context.json
runtime/generated/runtime-ts-full.txt:226:      "runtime/generated/project-context.json"

## 7. RuntimeService
src/runtime/runtime-service.ts:8:export class RuntimeService{
src/runtime/runtime-facade.ts:1:import {RuntimeService} from "./runtime-service";
src/runtime/runtime-facade.ts:7:private readonly runtime=new RuntimeService();

## 8. Dépendances MissionLoader
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:1:import { MissionLoader } from "./mission-loader";
src/runtime/index.ts:7:export * from "./mission-loader";
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";

## 9. TODO / FIXME

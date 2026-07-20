# ODG Runtime Responsibility Audit

Generated : 2026-07-12T12:17:23+00:00

==================================================
COMPONENT : capability-registry.ts
--------------------------------------------------
Exports :
export interface Capability{
export class CapabilityRegistry{

Imports :
None

Used by :
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
Exports :
export interface RuntimeEvent<T = unknown> {
export type RuntimeEventHandler<T = unknown> =
export class EventBus {

Imports :
None

Used by :
src/runtime/runtime-service.ts:5:import {EventBus} from "./event-bus";
src/runtime/runtime-executor.ts:5:import {EventBus} from "./event-bus";
src/runtime/index.ts:10:export * from "./event-bus";

==================================================
COMPONENT : execution-memory.ts
--------------------------------------------------
Exports :
export interface ExecutionRecord {
export class ExecutionMemory {

Imports :
None

Used by :
src/runtime/runtime-service.ts:4:import {ExecutionMemory} from "./execution-memory";
src/runtime/runtime-executor.ts:4:import {ExecutionMemory} from "./execution-memory";
src/runtime/index.ts:4:export * from "./execution-memory";

==================================================
COMPONENT : execution-planner.ts
--------------------------------------------------
Exports :
export interface TechnicalStep {
export interface TechnicalPlan {
export class ExecutionPlanner {

Imports :
import {

Used by :
src/runtime/runtime-service.ts:3:import {ExecutionPlanner} from "./execution-planner";
src/runtime/runtime-executor.ts:3:import {ExecutionPlanner} from "./execution-planner";
src/runtime/index.ts:9:export * from "./execution-planner";

==================================================
COMPONENT : index.ts
--------------------------------------------------
Exports :
None

Imports :
None

Used by :
None

==================================================
COMPONENT : mission-loader.ts
--------------------------------------------------
Exports :
export interface RuntimeMission {
export class MissionLoader {

Imports :
import fs from "node:fs";

Used by :
src/runtime/runtime-service.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/runtime-executor.ts:1:import {MissionLoader} from "./mission-loader";
src/runtime/index.ts:7:export * from "./mission-loader";
src/runtime/mission-orchestrator.ts:1:import { MissionLoader, RuntimeMission } from "./mission-loader";

==================================================
COMPONENT : mission-orchestrator.ts
--------------------------------------------------
Exports :
export interface ExecutionStep {
export interface ExecutionPlan {
export class MissionOrchestrator {

Imports :
import { MissionLoader, RuntimeMission } from "./mission-loader";

Used by :
src/runtime/runtime-service.ts:2:import {MissionOrchestrator} from "./mission-orchestrator";
src/runtime/runtime-executor.ts:2:import {MissionOrchestrator} from "./mission-orchestrator";
src/runtime/index.ts:8:export * from "./mission-orchestrator";
src/runtime/execution-planner.ts:4:} from "./mission-orchestrator";

==================================================
COMPONENT : plugin-registry.ts
--------------------------------------------------
Exports :
export interface Plugin{
export class PluginRegistry{

Imports :
None

Used by :
src/runtime/index.ts:6:export * from "./plugin-registry";

==================================================
COMPONENT : runtime-demo.ts
--------------------------------------------------
Exports :
None

Imports :
import { RuntimeExecutor } from "./runtime-executor";
import fs from "node:fs";

Used by :
None

==================================================
COMPONENT : runtime-events.ts
--------------------------------------------------
Exports :
export enum RuntimeEventType{

Imports :
None

Used by :
src/runtime/index.ts:3:export * from "./runtime-events";

==================================================
COMPONENT : runtime-executor.ts
--------------------------------------------------
Exports :
export class RuntimeExecutor{

Imports :
import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";

Used by :
src/runtime/runtime-demo.ts:1:import { RuntimeExecutor } from "./runtime-executor";

==================================================
COMPONENT : runtime-facade.ts
--------------------------------------------------
Exports :
export class RuntimeFacade{

Imports :
import {RuntimeService} from "./runtime-service";
import {RuntimeReporter} from "./runtime-reporter";
import {RuntimeHealth} from "./runtime-health";

Used by :
src/runtime/index.ts:14:export * from "./runtime-facade";

==================================================
COMPONENT : runtime-health.ts
--------------------------------------------------
Exports :
export class RuntimeHealth{

Imports :
None

Used by :
src/runtime/runtime-facade.ts:3:import {RuntimeHealth} from "./runtime-health";
src/runtime/index.ts:11:export * from "./runtime-health";

==================================================
COMPONENT : runtime-reporter.ts
--------------------------------------------------
Exports :
export class RuntimeReporter{

Imports :
None

Used by :
src/runtime/runtime-facade.ts:2:import {RuntimeReporter} from "./runtime-reporter";
src/runtime/index.ts:12:export * from "./runtime-reporter";

==================================================
COMPONENT : runtime-service.ts
--------------------------------------------------
Exports :
export class RuntimeService{

Imports :
import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";

Used by :
src/core/decision-engine.ts:5:import { getRuntimeContext } from "@/core/runtime-service";
src/runtime/runtime-facade.ts:1:import {RuntimeService} from "./runtime-service";
src/runtime/index.ts:13:export * from "./runtime-service";

==================================================
COMPONENT : runtime-state.ts
--------------------------------------------------
Exports :
export class RuntimeState{

Imports :
import {RuntimeStatus} from "./runtime-types";

Used by :
src/runtime/index.ts:2:export * from "./runtime-state";

==================================================
COMPONENT : runtime-types.ts
--------------------------------------------------
Exports :
export type RuntimeStatus="READY"|"RUNNING"|"FAILED"|"DONE";
export interface RuntimeMetadata{

Imports :
None

Used by :
src/runtime/index.ts:1:export * from "./runtime-types";
src/runtime/runtime-state.ts:1:import {RuntimeStatus} from "./runtime-types";

==================================================
SUMMARY

Mission READ ONLY.
No source file modified.

Build      : OK
TypeScript : OK
Git        : OK

#!/usr/bin/env node
/*
 * Truth Lock (src/runtime facade) — the pure policy now lives in the node-requirable canonical home
 * `runtime/core/truth-lock` so the ODG_RUN pipeline (plain node) and this tsx/Next app share ONE
 * implementation (no second control). This module RE-EXPORTS that single policy; every historical importer
 * (migrate-ts-cli, validation-orchestrator, tests) is unchanged — they still import from "./truth-lock".
 *
 * WHY: `evaluateTruthLock` was unreachable from the odg-run execution path (src/runtime is TS/ESM, odg-run is
 * plain node) — the Day-1 autonomy-campaign "IDENTITY declared-only" gap. Relocating the leaf (not copying it)
 * lets the pre-execution Truth-Lock gate (runtime/core/truth-lock-gate) reuse the exact same policy.
 */
"use strict";

export { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY } from "../../runtime/core/truth-lock";
export type { TruthLock, GitState, TruthLockPolicy } from "../../runtime/core/truth-lock";

export {};

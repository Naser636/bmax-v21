/*
 * Mission execution migration registry (UNIFY_RUNTIME_EXECUTION, OBJ-003 / OBJ-004).
 *
 * Single source of truth deciding which local (non-provider) missions are executed
 * end-to-end by the TypeScript Runtime (src/runtime) versus which are still delegated
 * to the legacy Mission-Standard engine (the `mse` fallback).
 *
 * The migration is deliberately progressive: only deterministic, read-only / audit
 * missions — which the Runtime's in-memory execution reproduces faithfully with no
 * side effects — are migrated first. Engineering / repair / autonomous missions that
 * genuinely need code work stay on the fallback until they are migrated in turn, so
 * no functional behaviour regresses.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Local missions now executed by the TypeScript Runtime instead of the Mission-Standard
 * fallback. These are deterministic AUDIT-class missions whose behaviour is fully
 * reproduced by the Runtime's read-only plan/report pipeline.
 */
export const MIGRATED_MISSIONS: readonly string[] = [
  "M0000",
  "M0001",
  "M0002",
  "RUNTIME_SELF_AUDIT",
  "UNIFY_RUNTIME_EXECUTION",
  // Read-only / audit / analyze missions (same class as RUNTIME_SELF_AUDIT): their contracts
  // declare no code modification and no provider, so the Runtime's deterministic plan/report
  // pipeline reproduces them faithfully with no side effects. Verified green via LocalMissionRunner.
  "FIX_CORRECTIVE_QUEUE_INTAKE",
  "PROVIDER_ORCHESTRATOR_ROOT_CAUSE",
  "PREPARE_ENGINEERING_BRIEF",
  "RUNTIME_KERNEL_ROOT_CAUSE_ANALYSIS",
];

/** True when a mission is executed locally by src/runtime (i.e. must NOT fall back to mse). */
export function isMigratedMission(mission: string): boolean {
  return MIGRATED_MISSIONS.includes(mission);
}

export interface MigrationReport {
  runtime: "src/runtime";
  migrated: string[];
  remaining: string[];
  total: number;
}

/** Best-effort, read-only discovery of every mission id declared under runtime/missions. */
export function discoverMissions(dir = path.join("runtime", "missions")): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".json.bak"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Best-effort, read-only set of missions the Runtime has already executed to a validation-PROVEN
 * state, per the Mission Ledger (runtime/generated/mission-ledger.json). The ledger is the
 * authoritative record of what the Runtime actually owns end-to-end: a proven mission has been run
 * locally by the Runtime, so the migration report must count it as migrated rather than staying
 * frozen on the initial static registry. Tolerant of shape drift, matching the contract the
 * convergence CLI's proven-count already relies on.
 */
export function provenMissions(
  ledgerPath = path.join("runtime", "generated", "mission-ledger.json"),
): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
      entries?: Array<{ mission?: unknown; proven?: unknown }>;
    };
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    return [
      ...new Set(
        entries
          .filter((e) => e && e.proven === true && typeof e.mission === "string")
          .map((e) => e.mission as string),
      ),
    ].sort();
  } catch {
    return [];
  }
}

/**
 * Build the migration report (OBJ-004): the list of migrated missions and the list of
 * missions still to migrate. A mission counts as migrated when it is in the static registry
 * OR the Mission Ledger records it as PROVEN (the real execution state) — so the report advances
 * as the Runtime actually executes missions instead of staying pinned to the initial registry.
 * Any migrated id that is not (yet) present on disk is still reported as migrated so the registry
 * stays the authoritative source of truth.
 */
export function buildMigrationReport(
  missions = discoverMissions(),
  proven = provenMissions(),
): MigrationReport {
  const known = new Set(missions);
  const provenSet = new Set(proven);
  const isMigrated = (m: string): boolean => isMigratedMission(m) || provenSet.has(m);
  const migrated = [...new Set([...MIGRATED_MISSIONS, ...proven, ...missions.filter(isMigrated)])].sort();
  const remaining = missions.filter((m) => !isMigrated(m)).sort();
  return {
    runtime: "src/runtime",
    migrated,
    remaining,
    total: known.size,
  };
}

/** Human-readable rendering of the migration report for CLI output / evidence. */
export function renderMigrationReport(report: MigrationReport = buildMigrationReport()): string {
  return [
    "MIGRATION REPORT — UNIFY_RUNTIME_EXECUTION",
    `Runtime         : ${report.runtime}`,
    `Migrated  (${report.migrated.length})   : ${report.migrated.join(", ") || "(none)"}`,
    `Remaining (${report.remaining.length})   : ${report.remaining.join(", ") || "(none)"}`,
  ].join("\n");
}

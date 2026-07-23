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
 * Build the migration report (OBJ-004): the list of migrated missions and the list of
 * missions still to migrate. Any migrated id that is not (yet) present on disk is still
 * reported as migrated so the registry stays the authoritative source of truth.
 */
export function buildMigrationReport(missions = discoverMissions()): MigrationReport {
  const known = new Set(missions);
  const migrated = [...new Set([...MIGRATED_MISSIONS, ...missions.filter(isMigratedMission)])].sort();
  const remaining = missions.filter((m) => !isMigratedMission(m)).sort();
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

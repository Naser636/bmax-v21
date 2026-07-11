import type { ObservabilityState } from "@/core/observability-state";

export type MissionState =
  | "CREATED"
  | "SCHEDULED"
  | "RUNNING"
  | "RECOVERING"
  | "QUALIFYING"
  | "CONNECTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface MissionMetrics {
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
}

export interface MissionContext {
  missionId: string;
  state: MissionState;

  metrics: MissionMetrics;

  health?: unknown;
  recovery?: unknown;
  qualification?: unknown;
  connector?: unknown;
  http?: unknown;
  maintenance?: unknown;
  observability?: ObservabilityState;

  results: unknown[];

  logs: string[];

  errors: string[];
}

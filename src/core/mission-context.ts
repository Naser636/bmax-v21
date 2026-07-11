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

  results: unknown[];

  logs: string[];

  errors: string[];
}

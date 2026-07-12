import type { ObservabilityState } from "@/core/observability-state";
import type { DiscoveryResult } from "@/contracts/discovery";
import type { Opportunity } from "@/contracts/opportunity";
import type { Decision } from "@/contracts/decision";
import type { Explanation } from "@/contracts/explanation";
import type { FusionResult } from "@/core/fusion-engine";
import type { DecisionResult } from "@/core/decision-pipeline";
import type { SourceDefinition } from "@/core/source-registry";
import type { ConnectorSelection } from "@/core/connector-manager";
import type { SystemHealth } from "@/contracts/system-health";
import type { RecoveryState } from "@/core/recovery-state";
import type { MaintenanceState } from "@/core/maintenance-state";
import type { HttpResponse } from "@/core/http-response";

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

  health?: SystemHealth;
  recovery?: RecoveryState;
  qualification?: { qualified: boolean };
  connector?: ConnectorSelection;
  http?: HttpResponse<{ success: boolean }>;
  maintenance?: MaintenanceState;
  observability?: ObservabilityState;

  discovery?: DiscoveryResult;
  fusion?: FusionResult;
  opportunities?: Opportunity[];
  decision?: DecisionResult;
  sources?: SourceDefinition[];
  explanation?: Explanation;
  decisionEngine?: Decision;

  results: object[];

  logs: string[];

  errors: string[];
}

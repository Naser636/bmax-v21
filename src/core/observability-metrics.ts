export interface ObservabilityMetrics {
  workflowDurationMs: number;
  schedulerDurationMs: number;
  healthDurationMs: number;
  qualificationDurationMs: number;
  connectorDurationMs: number;
  httpDurationMs: number;
  maintenanceDurationMs: number;
  totalSteps: number;
  totalErrors: number;
}

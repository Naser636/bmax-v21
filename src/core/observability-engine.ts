import { ObservabilityState } from "@/core/observability-state";

export class ObservabilityEngine {
  execute(): ObservabilityState {
    return {
      enabled: true,
      metrics: {
        workflowDurationMs: 0,
        schedulerDurationMs: 0,
        healthDurationMs: 0,
        qualificationDurationMs: 0,
        connectorDurationMs: 0,
        httpDurationMs: 0,
        maintenanceDurationMs: 0,
        totalSteps: 0,
        totalErrors: 0,
      },
    };
  }
}

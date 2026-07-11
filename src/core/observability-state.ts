import { ObservabilityMetrics } from "@/core/observability-metrics";

export interface ObservabilityState {
  enabled: boolean;
  metrics: ObservabilityMetrics;
}

import type { Clock } from "./clock";
import type { Logger } from "./logger";
import { ErrorCode } from "./errors";
import type { Result } from "./result";
import { createValidationReport, type ValidationReport } from "./validation";

export interface CoreConfig {
  readonly version: string;
  readonly debug: boolean;
  readonly thresholds: Readonly<Record<string, number>>;
}

export type MetricType =
  | "performance"
  | "security"
  | "governance";

export interface MetricPayload {
  readonly id: string;
  readonly timestamp: number;
  readonly type: MetricType;
  readonly value: number;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface RuntimeDependencies {
  readonly clock: Clock;
  readonly logger: Logger;
}

export class BMaxCore {
  private readonly metrics = new Map<string, MetricPayload>();

  constructor(
    private readonly config: CoreConfig,
    private readonly deps: RuntimeDependencies
  ) {}

  registerMetric(metric: MetricPayload): Result<void> {
    if (!metric.id) {
      return {
        success: false,
        error: ErrorCode.INVALID_METRIC,
        message: "Metric id is required"
      };
    }

    this.metrics.set(metric.id, {
      ...metric,
      timestamp: this.deps.clock.now()
    });

    return {
      success: true,
      value: undefined
    };
  }

  getMetrics(): readonly MetricPayload[] {
    return [...this.metrics.values()];
  }

  calculateScore(): number {
    if (this.metrics.size === 0) {
      return 100;
    }

    const total = [...this.metrics.values()]
      .reduce((sum, metric) => sum + metric.value, 0);

    return Math.round(total / this.metrics.size);
  }

  validate(): ValidationReport {
    const errors: string[] = [];

    for (const metric of this.metrics.values()) {
      const threshold =
        this.config.thresholds[metric.type] ?? 0;

      if (metric.value < threshold) {
        errors.push(
          `${metric.id} below threshold`
        );
      }
    }

    return createValidationReport(
      this.calculateScore(),
      errors
    );
  }

  purge(): void {
    this.metrics.clear();
  }
}

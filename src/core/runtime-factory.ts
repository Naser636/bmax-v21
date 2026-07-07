import type { Clock } from "./clock";
import type { Logger } from "./logger";

export interface RuntimeDependencies {
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface RuntimeFactory<TConfig, TRuntime> {
  create(
    config: TConfig,
    dependencies: RuntimeDependencies
  ): TRuntime;
}

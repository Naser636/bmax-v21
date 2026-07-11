import { RecoveryAction } from "@/core/recovery-action";
import { RecoveryCheck } from "@/core/recovery-check";
import { RecoveryState } from "@/core/recovery-state";

export class RecoveryEngine {
  constructor(
    private readonly check: RecoveryCheck,
    private readonly action: RecoveryAction
  ) {}

  async execute(): Promise<RecoveryState> {
    const healthy = await this.check.execute();

    if (healthy) {
      return {
        healthy: true,
        recovered: false,
        message: "System healthy",
      };
    }

    await this.action.execute();

    return {
      healthy: true,
      recovered: true,
      message: "Recovery completed",
    };
  }
}

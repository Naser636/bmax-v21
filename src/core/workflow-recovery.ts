import { MissionContext } from "@/core/mission-context";
import { recoveryDemo } from "@/core/recovery-demo";

export async function executeRecovery(
  context: MissionContext
): Promise<void> {
  context.state = "RECOVERING";

  const recovery = await recoveryDemo();

  context.recovery = recovery;

  context.logs.push(
    `Recovery: ${recovery.message}`
  );

  context.results.push(recovery);
}

import { MissionContext } from "@/core/mission-context";
import { schedulerDemo } from "@/core/scheduler-demo";

export async function executeScheduler(
  context: MissionContext
): Promise<void> {
  context.state = "SCHEDULED";

  const scheduler = await schedulerDemo();

  context.logs.push(
    `Scheduler executed: ${scheduler.mission}`
  );

  context.results.push(scheduler);
}

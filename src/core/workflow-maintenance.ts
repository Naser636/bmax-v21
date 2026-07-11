import { MissionContext } from "@/core/mission-context";
import { maintenanceDemo } from "@/core/maintenance-demo";

export async function executeMaintenance(
  context: MissionContext
): Promise<void> {
  const maintenance = await maintenanceDemo();

  context.maintenance = maintenance;

  context.logs.push(
    `Maintenance completed (${maintenance.tasks.length} tasks)`
  );

  context.results.push(maintenance);
}

import { MaintenanceTask } from "@/core/maintenance-task";
import { MaintenanceState } from "@/core/maintenance-state";

export class MaintenanceEngine {
  constructor(private readonly tasks: MaintenanceTask[]) {}

  async execute(): Promise<MaintenanceState> {
    for (const task of this.tasks) {
      await task.execute();
    }

    return {
      completed: true,
      tasks: this.tasks.map(task => task.name),
    };
  }
}

import { SchedulerEngine } from "@/core/scheduler-engine";

const job = {
  mission: "Daily Opportunity Scan",
  async execute() {
    // Simulation d'une exécution planifiée
  },
};

export async function schedulerDemo() {
  return new SchedulerEngine(job).execute();
}

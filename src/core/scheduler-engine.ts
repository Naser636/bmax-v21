import { SchedulerJob } from "@/core/scheduler-job";
import { SchedulerState } from "@/core/scheduler-state";

export class SchedulerEngine {
  constructor(private readonly job: SchedulerJob) {}

  async execute(): Promise<SchedulerState> {
    await this.job.execute();

    return {
      scheduled: true,
      executed: true,
      mission: this.job.mission,
    };
  }
}

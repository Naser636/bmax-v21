export interface SchedulerJob {
  mission: string;
  execute(): Promise<void>;
}

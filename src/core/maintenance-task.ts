export interface MaintenanceTask {
  name: string;
  execute(): Promise<void>;
}

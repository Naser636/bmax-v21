export interface ExecutionRecord {
  missionId: string;
  event: string;
  timestamp: string;
  payload?: unknown;
}

export class ExecutionMemory {

  private readonly records: ExecutionRecord[] = [];

  append(
    missionId: string,
    event: string,
    payload?: unknown
  ): void {
    this.records.push({
      missionId,
      event,
      timestamp: new Date().toISOString(),
      payload
    });
  }

  history(missionId?: string): ExecutionRecord[] {
    if (!missionId) {
      return [...this.records];
    }

    return this.records.filter(r => r.missionId === missionId);
  }

  all(): ExecutionRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }

}

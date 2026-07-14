export type MissionExecutionMode =
  | "ANALYZE"
  | "PLAN"
  | "IMPLEMENT"
  | "VALIDATE"
  | "LEARN"
  | "UNKNOWN";

export interface MissionIntent {
  mission: string;
  type: string;
  objective: string;
  priority: string;
  mode: MissionExecutionMode;
}

export function createMissionIntent(
  mission: string
): MissionIntent {
  return {
    mission,
    type: "GENERIC",
    objective: "Generic mission",
    priority: "NORMAL",
    mode: "UNKNOWN"
  };
}

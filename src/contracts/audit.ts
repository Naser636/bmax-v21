export interface Audit {
  id: string;
  decisionId: string;
  action: string;
  actor: string;
  timestamp: number;
}

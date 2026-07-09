export interface Audit {
  id: string;
  decisionId: string;
  action: string;
  actor: string;
  policy: string;
  risk: string;
  runtime: string;
  timestamp: number;
}

export interface Risk {
  id: string;
  decisionId: string;
  level: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  limit: number;
  reason: string;
  createdAt: number;
}

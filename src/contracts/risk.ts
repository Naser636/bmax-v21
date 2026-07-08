export interface Risk {
  id: string;
  decisionId: string;
  level: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  createdAt: number;
}

import { Verification } from "@/contracts/verification";

export function createVerification(
  source: string,
  confidence: number
): Verification {
  return {
    id: crypto.randomUUID(),
    source,
    confidence,
    verified: confidence >= 0.8,
    createdAt: Date.now(),
  };
}

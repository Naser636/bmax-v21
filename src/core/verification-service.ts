import { createVerification } from "@/core/verification-engine";
import { addVerification } from "@/core/verification-registry";

export function initializeVerification(
  source: string,
  confidence: number
) {
  const verification = createVerification(source, confidence);
  addVerification(verification);
  return verification;
}

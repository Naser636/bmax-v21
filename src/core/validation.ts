import { createFingerprint } from "./fingerprint";

export interface ValidationReport {
  readonly isValid: boolean;
  readonly score: number;
  readonly errors: readonly string[];
  readonly fingerprint: string;
}

export function createValidationReport(
  score: number,
  errors: readonly string[]
): ValidationReport {
  return {
    isValid: errors.length === 0,
    score,
    errors,
    fingerprint: createFingerprint({ score, errors }),
  };
}

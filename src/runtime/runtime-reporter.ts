export interface RuntimeReport {
  generatedAt: string;
  mission?: string;
  logicalSteps?: number;
  technicalSteps?: number;
  capabilities?: number;
  status: "SUCCESS" | "FAILED";
  reason?: string;
  result: unknown;
}

export class RuntimeReporter {

  report(input: any): RuntimeReport {

    const gate = this.evaluate(input);

    return {
      generatedAt: new Date().toISOString(),
      mission: input?.mission,
      logicalSteps: input?.logicalSteps,
      technicalSteps: input?.technicalSteps,
      capabilities: Array.isArray(input?.capabilities)
        ? input.capabilities.length
        : 0,
      status: gate.proven ? "SUCCESS" : "FAILED",
      reason: gate.reason,
      result: input
    };

  }

  // ROOT CAUSE #2 gate. SUCCESS is permitted ONLY when the mission's objective
  // execution is recorded (every planned objective executed) AND every required
  // verification/postcondition passed AND a valid, non-failing proof is present.
  // Default-deny: any absent/failed/invalid element blocks SUCCESS.
  private evaluate(input: any): { proven: boolean; reason?: string } {

    if (!input || typeof input !== "object") {
      return { proven: false, reason: "no-report-input" };
    }

    // Objective coverage: every planned objective must be recorded as executed.
    const total = input.objectivesTotal;
    const executed = input.objectivesExecuted;
    if (!Number.isFinite(total) || total <= 0) {
      return { proven: false, reason: "objective-coverage-absent" };
    }
    if (!Number.isFinite(executed) || executed < total) {
      return { proven: false, reason: "objective-coverage-incomplete" };
    }

    // Verification / postconditions: when declared, all required must have passed.
    const verification = input.verification;
    if (verification !== undefined && verification !== null) {
      const required = verification.required;
      const passed = verification.passed;
      if (!Number.isFinite(required) || required < 0 ||
          !Number.isFinite(passed) || passed < required) {
        return { proven: false, reason: "verification-failed" };
      }
    }

    // Proof: must be a valid, non-null, non-array object whose verdict is not FAIL.
    const proof = input.proof;
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
      return { proven: false, reason: "proof-absent-or-invalid" };
    }
    if (proof.verdict === "FAIL") {
      return { proven: false, reason: "proof-failed" };
    }

    return { proven: true };

  }

}

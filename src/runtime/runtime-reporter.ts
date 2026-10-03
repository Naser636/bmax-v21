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

  report(input: unknown): RuntimeReport {

    const gate = this.evaluate(input);
    const o: Record<string, unknown> =
      input && typeof input === "object" ? (input as Record<string, unknown>) : {};

    return {
      generatedAt: new Date().toISOString(),
      mission: o.mission as string | undefined,
      logicalSteps: o.logicalSteps as number | undefined,
      technicalSteps: o.technicalSteps as number | undefined,
      capabilities: Array.isArray(o.capabilities)
        ? o.capabilities.length
        : 0,
      status: gate.proven ? "SUCCESS" : "FAILED",
      reason: gate.reason,
      result: input
    };

  }

  // ROOT CAUSE #2 gate. SUCCESS is permitted ONLY when the mission's objective
  // execution is recorded (every planned objective executed) AND every required
  // verification/postcondition passed AND a valid proof carrying an explicit
  // PASS verdict is present.
  // Default-deny: any absent/failed/invalid/non-PASS element blocks SUCCESS.
  private evaluate(input: unknown): { proven: boolean; reason?: string } {

    if (!input || typeof input !== "object") {
      return { proven: false, reason: "no-report-input" };
    }

    const o = input as Record<string, unknown>;

    // Objective coverage: every planned objective must be recorded as executed.
    const total = o.objectivesTotal as number;
    const executed = o.objectivesExecuted as number;
    if (!Number.isFinite(total) || total <= 0) {
      return { proven: false, reason: "objective-coverage-absent" };
    }
    if (!Number.isFinite(executed) || executed < total) {
      return { proven: false, reason: "objective-coverage-incomplete" };
    }

    // Verification / postconditions: when declared, all required must have passed.
    const verification = o.verification as { required?: unknown; passed?: unknown } | null | undefined;
    if (verification !== undefined && verification !== null) {
      const required = verification.required as number;
      const passed = verification.passed as number;
      if (!Number.isFinite(required) || required < 0 ||
          !Number.isFinite(passed) || passed < required) {
        return { proven: false, reason: "verification-failed" };
      }
    }

    // Proof: must be a valid, non-null, non-array object carrying an EXPLICIT passing verdict.
    // Default-deny (matching this gate's contract): a missing verdict, a FAIL, or any other non-PASS
    // value (PENDING / BLOCKED / …) each blocks SUCCESS. Only an affirmative "PASS" is proof of
    // success — treating merely "not FAIL" as sufficient let a verdict-less or pending proof
    // masquerade as proven, the inverse of the default-deny stance applied to objective coverage above.
    const proof = o.proof;
    if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
      return { proven: false, reason: "proof-absent-or-invalid" };
    }
    if ((proof as { verdict?: unknown }).verdict !== "PASS") {
      return { proven: false, reason: "proof-not-pass" };
    }

    return { proven: true };

  }

}

export interface RuntimeReport {
  generatedAt: string;
  mission?: string;
  logicalSteps?: number;
  technicalSteps?: number;
  capabilities?: number;
  status: "SUCCESS" | "FAILED";
  result: unknown;
}

export class RuntimeReporter {

  report(input: any): RuntimeReport {

    return {
      generatedAt: new Date().toISOString(),
      mission: input?.mission,
      logicalSteps: input?.logicalSteps,
      technicalSteps: input?.technicalSteps,
      capabilities: Array.isArray(input?.capabilities)
        ? input.capabilities.length
        : 0,
      status: "SUCCESS",
      result: input
    };

  }

}

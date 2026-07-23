export interface ExecutionPlannerModel {
  generatedAt: string;
  steps: string[];
  status: string;
}

export class ExecutionPlannerContext {

  build(): ExecutionPlannerModel {
    return {
      generatedAt: new Date().toISOString(),
      steps: [],
      status: "READY"
    };
  }

}

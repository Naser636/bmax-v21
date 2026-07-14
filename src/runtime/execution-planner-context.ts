export interface ExecutionPlannerModel {
  generatedAt: string;
  steps: string[];
  status: string;
}

export class ExecutionPlannerContext {

  private model?: ExecutionPlannerModel;

  build(): ExecutionPlannerModel {
    this.model = {
      generatedAt: new Date().toISOString(),
      steps: [],
      status: "READY"
    };

    return this.model;
  }

  current(): ExecutionPlannerModel | undefined {
    return this.model;
  }

}

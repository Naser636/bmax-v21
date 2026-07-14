export interface AutonomousPlanningModel {
  generatedAt: string;
  selectedObjective: string;
  roadmap: string[];
  status: string;
}

export class AutonomousPlanner {

  private model?: AutonomousPlanningModel;

  build(): AutonomousPlanningModel {

    this.model = {
      generatedAt: new Date().toISOString(),
      selectedObjective: "",
      roadmap: [],
      status: "READY"
    };

    return this.model;
  }

  current(): AutonomousPlanningModel | undefined {
    return this.model;
  }

}

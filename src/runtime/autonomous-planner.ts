export interface AutonomousPlanningModel {
  generatedAt: string;
  mission: string;
  selectedObjective: string;
  roadmap: string[];
  validations: string[];
  status: string;
}

export class AutonomousPlanner {

  private model?: AutonomousPlanningModel;

  build(
    mission = "",
    selectedObjective = "",
    roadmap: string[] = [],
    validations: string[] = []
  ): AutonomousPlanningModel {

    this.model = {
      generatedAt: new Date().toISOString(),
      mission,
      selectedObjective,
      roadmap,
      validations,
      status: "READY"
    };

    return this.model;
  }

  current(): AutonomousPlanningModel | undefined {
    return this.model;
  }

}

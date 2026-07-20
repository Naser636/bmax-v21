import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";

export class RuntimeExecutor{

  private readonly loader=new MissionLoader();
  private readonly orchestrator=new MissionOrchestrator();
  private readonly planner=new ExecutionPlanner();
  private readonly memory=new ExecutionMemory();
  private readonly events=new EventBus();

  execute(id:string,name:string){

    this.events.publish("MissionStarted",{id,name});

    const mission=this.loader.load(id,name);

    const plan=this.orchestrator.buildPlan(id,name);

    const technical=this.planner.create(id,name);

    this.memory.append(id,"MissionStarted",{name});
    this.memory.append(id,"PlanCreated",{steps:plan.steps.length});
    this.memory.append(id,"TechnicalPlanCreated",{steps:technical.steps.length});

    this.memory.append(id,"CapabilityAnalysis",{
      logicalSteps:plan.steps.length,
      technicalSteps:technical.steps.length,
      capabilities:technical.steps.map(s=>s.capability)
    });

    this.events.publish("MissionCompleted",{id});

    return{
      mission,
      logicalSteps:plan.steps.length,
      technicalSteps:technical.steps.length,
      history:this.memory.history(id)
    };

  }

}

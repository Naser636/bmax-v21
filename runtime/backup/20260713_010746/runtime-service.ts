import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";

export class RuntimeService{

readonly loader=new MissionLoader();
readonly orchestrator=new MissionOrchestrator();
readonly planner=new ExecutionPlanner();
readonly memory=new ExecutionMemory();
readonly events=new EventBus();

}

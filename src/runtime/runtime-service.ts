import {MissionLoader} from "./mission-loader";
import {MissionOrchestrator} from "./mission-orchestrator";
import {ExecutionPlanner} from "./execution-planner";
import {ExecutionMemory} from "./execution-memory";
import {EventBus} from "./event-bus";
import {CapabilityRegistry} from "./capability-registry";

export class RuntimeService{

readonly loader=new MissionLoader();
readonly orchestrator=new MissionOrchestrator();
readonly planner=new ExecutionPlanner();
readonly memory=new ExecutionMemory();
readonly events=new EventBus();
readonly registry=new CapabilityRegistry();

capabilities(){
return this.registry.all();
}

}

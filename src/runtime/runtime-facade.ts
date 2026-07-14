import {RuntimeService} from "./runtime-service";
import {RuntimeReporter} from "./runtime-reporter";
import {RuntimeHealth} from "./runtime-health";

export class RuntimeFacade{

private readonly runtime=new RuntimeService();
private readonly reporter=new RuntimeReporter();
private readonly health=new RuntimeHealth();

status(){
return this.health.check(true, this.runtime.capabilities().length);
}

runtimeService(){
return this.runtime;
}

report(data:unknown){
return this.reporter.report({ health: this.health.check(true, this.runtime.capabilities().length), result: data });
}

}

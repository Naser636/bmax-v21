import { MissionDispatcher } from "./mission-dispatcher";
import { RuntimeContext } from "./runtime-context";

export interface MissionRequest {
  id: string;
  name: string;
}

export class MissionController {
  private readonly dispatcher = new MissionDispatcher();
  private readonly context = RuntimeContext.get();

  execute(request: MissionRequest) {
    const { id, name } = request;

    this.context.state.currentMission = id;

    return this.dispatcher.dispatch(id, name);
  }
}

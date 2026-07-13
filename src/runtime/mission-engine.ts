import { SystemLoader } from "./system-loader";
import { RuntimeState } from "./runtime-state";

export class MissionEngine {
  private readonly loader = new SystemLoader();
  private readonly state = new RuntimeState();

  bootstrap(): RuntimeState {
    if (!this.state.isInitialized()) {
      this.state.initialize(this.loader.load());
    }

    return this.state;
  }
}

import { RuntimeState } from "./runtime-state";
import { MissionEngine } from "./mission-engine";
import { SystemLoader, RuntimeSystem } from "./system-loader";

export class RuntimeContext {
  private static instance: RuntimeContext;

  readonly state = new RuntimeState();
  readonly engine = new MissionEngine();
  readonly system: RuntimeSystem;

  private constructor() {
    this.system = new SystemLoader().load();
  }

  static get(): RuntimeContext {
    if (!RuntimeContext.instance) {
      RuntimeContext.instance = new RuntimeContext();
      RuntimeContext.instance.engine.bootstrap();
    }

    return RuntimeContext.instance;
  }
}

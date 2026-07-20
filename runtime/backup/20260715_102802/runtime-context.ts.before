import { RuntimeState } from "./runtime-state";
import { MissionEngine } from "./mission-engine";

export class RuntimeContext {
  private static instance: RuntimeContext;

  readonly state = new RuntimeState();
  readonly engine = new MissionEngine();

  private constructor() {}

  static get(): RuntimeContext {
    if (!RuntimeContext.instance) {
      RuntimeContext.instance = new RuntimeContext();
      RuntimeContext.instance.engine.bootstrap();
    }

    return RuntimeContext.instance;
  }
}

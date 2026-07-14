export interface RuntimeEvent<T = unknown> {
  type: string;
  timestamp: string;
  payload: T;
}

export type RuntimeEventHandler<T = unknown> =
  (event: RuntimeEvent<T>) => void;

export class EventBus {

  private readonly handlers =
    new Map<string, RuntimeEventHandler[]>();

  private readonly history: RuntimeEvent[] = [];

  subscribe(
    type: string,
    handler: RuntimeEventHandler
  ): void {

    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);

  }

  publish<T>(
    type: string,
    payload: T
  ): void {

    const event: RuntimeEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      payload
    };

    this.history.push(event);

    const handlers = this.handlers.get(type) ?? [];

    for (const handler of handlers) {
      handler(event);
    }

  }

  events(): RuntimeEvent[] {
    return [...this.history];
  }

  clear(): void {
    this.history.length = 0;
  }

}

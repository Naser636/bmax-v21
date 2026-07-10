import { ConnectorInterface } from "@/contracts/connector-interface";

export class ConnectorManager {
  private readonly connectors: ConnectorInterface[] = [];

  register(connector: ConnectorInterface): void {
    this.connectors.push(connector);
  }

  async connectAll(): Promise<boolean[]> {
    return Promise.all(
      this.connectors.map(c => c.connect())
    );
  }

  async healthAll(): Promise<boolean[]> {
    return Promise.all(
      this.connectors.map(c => c.health())
    );
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      this.connectors.map(c => c.disconnect())
    );
  }
}

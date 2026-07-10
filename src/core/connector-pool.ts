import { ConnectorInterface } from "@/contracts/connector-interface";

export class ConnectorPool {
  constructor(
    private readonly connectors: ConnectorInterface[]
  ) {}

  getAll(): ConnectorInterface[] {
    return this.connectors;
  }

  size(): number {
    return this.connectors.length;
  }
}

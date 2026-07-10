import { ConnectorInterface } from "@/contracts/connector-interface";

export class ConnectorRuntime {
  constructor(
    public readonly connector: ConnectorInterface,
    public readonly name: string
  ) {}
}

import { ConnectorInterface } from "@/contracts/connector-interface";
import { ConnectorState } from "@/core/connector-state";

export class ConnectorSession {
  constructor(
    public readonly connector: ConnectorInterface,
    public state: ConnectorState = "INIT"
  ) {}
}

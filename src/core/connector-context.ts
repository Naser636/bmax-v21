import { ConnectorInterface } from "@/contracts/connector-interface";
import { ConnectorState } from "@/core/connector-state";

export interface ConnectorContext {
  name: string;
  connector: ConnectorInterface;
  state: ConnectorState;
}

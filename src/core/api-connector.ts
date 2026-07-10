import { ConnectorInterface } from "@/contracts/connector-interface";

export class ApiConnector implements ConnectorInterface {
  async connect(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    return;
  }

  async health(): Promise<boolean> {
    return true;
  }
}

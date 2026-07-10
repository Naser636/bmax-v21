export interface ConnectorEvent {
  connector: string;
  timestamp: number;
  status: "UP" | "DOWN";
}

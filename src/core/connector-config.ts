export interface ConnectorConfig {
  name: string;
  type: "API" | "WEB";
  enabled: boolean;
  timeout: number;
}

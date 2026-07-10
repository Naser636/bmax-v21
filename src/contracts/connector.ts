export interface Connector {
  id: string;
  name: string;
  type: "API" | "WEB";
  enabled: boolean;
  createdAt: number;
}

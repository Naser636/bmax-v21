export interface ConnectorSelection {
  name: string;
  available: boolean;
}

export class ConnectorManager {
  select(): ConnectorSelection {
    return {
      name: "BOAMP",
      available: true,
    };
  }
}

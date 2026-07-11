export interface SourceDefinition {
  id: string;
  name: string;
  category: string;
  priority: number;
  available: boolean;
  version: string;
  health: string;
}

export const sourceRegistry: SourceDefinition[] = [
  {
    id: "boamp",
    name: "BOAMP",
    category: "PUBLIC",
    priority: 1,
    available: true,
    version: "1.0",
    health: "OK",
  },
];

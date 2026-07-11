export interface CapabilityDefinition {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

/*
 * Bootstrap de compatibilité.
 * Le registre sera rempli dynamiquement au Sprint 12,
 * mais une capacité minimale est conservée pour les composants existants.
 */
export const capabilityRegistry: CapabilityDefinition[] = [
  {
    id: "workflow",
    name: "Workflow",
    version: "2.0",
    enabled: true,
  },
];

export const capabilities = capabilityRegistry;

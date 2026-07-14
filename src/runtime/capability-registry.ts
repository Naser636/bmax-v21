export interface Capability {
  id: string;
  name: string;
}

export interface CapabilityRegistryModel {
  generatedAt: string;
  available: Capability[];
  missing: string[];
}

export class CapabilityRegistry {

  private readonly capabilities: Capability[] = [];

  register(capability: Capability): void {
    this.capabilities.push(capability);
  }

  all(): Capability[] {
    return this.capabilities;
  }

  build(): CapabilityRegistryModel {
    return {
      generatedAt: new Date().toISOString(),
      available: this.capabilities,
      missing: []
    };
  }

}

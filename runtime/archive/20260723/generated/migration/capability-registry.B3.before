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
  private model?: CapabilityRegistryModel;

  register(capability: Capability): void {
    this.capabilities.push(capability);
  }

  all(): Capability[] {
    return this.capabilities;
  }

  build(): CapabilityRegistryModel {
    this.model = {
      generatedAt: new Date().toISOString(),
      available: this.capabilities,
      missing: []
    };

    return this.model;
  }

  current(): CapabilityRegistryModel | undefined {
    return this.model;
  }

}

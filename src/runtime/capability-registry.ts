export interface Capability {
  id: string;
  name: string;
}

export class CapabilityRegistry {

  private readonly capabilities: Capability[] = [];

  register(capability: Capability): void {
    this.capabilities.push(capability);
  }

  all(): Capability[] {
    return this.capabilities;
  }

}

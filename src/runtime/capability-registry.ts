export interface Capability {
  id: string;
  name: string;
}

export class CapabilityRegistry {

  private readonly capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    this.capabilities.set(capability.id, capability);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  count(): number {
    return this.capabilities.size;
  }

  all(): Capability[] {
    return [...this.capabilities.values()];
  }

}

export interface Plugin {
  id: string;
  version: string;
}

export class PluginRegistry {

  private readonly plugins = new Map<string, Plugin>();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  count(): number {
    return this.plugins.size;
  }

  all(): Plugin[] {
    return [...this.plugins.values()];
  }

}

import { PluginRegistry, Plugin } from "./plugin-registry";

export interface PluginManagerModel {
  generatedAt: string;
  plugins: Plugin[];
  status: string;
}

export class PluginManager {

  private readonly registry = new PluginRegistry();

  build(): PluginManagerModel {
    return {
      generatedAt: new Date().toISOString(),
      plugins: this.registry.all(),
      status: "READY"
    };
  }

}

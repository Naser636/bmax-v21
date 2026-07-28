/*
 * VNext — Resource Registry (ADDITIVE extension point)
 *
 * Lets the Runtime declare an execution resource by CONFIGURATION rather than by code. Every
 * resource (LLM provider, local LLM, OCR, search engine, compiler, internal script, …) is described
 * by a `ResourceDescriptor` and turned into a `Resource` by a per-`type` factory. A resource can be
 * enabled / disabled / replaced purely through the registry — the Kernel is never touched.
 *
 * Hard rules honoured here (mission "Préparation Universelle des Ressources") :
 *   - NO real service is connected, NO API key is created, NO network call is made.
 *   - A descriptor references a secret only by ENV VAR NAME (`apiKeyEnv`), never by value. The
 *     registry reads at most the PRESENCE of that env var (via an injectable `env`) to report
 *     availability — exactly the pattern the existing provider-availability layer uses. It never
 *     reads, stores, logs or transmits the value.
 *   - Everything defaults to DISABLED (Local First / manual activation), matching
 *     runtime/config/runtime-mode.json (`providerActivation: MANUAL_ONLY`).
 */

import type { Resource, ResourceAllocation, ResourceKind } from "./resource";

export const RESOURCE_REGISTRY_VERSION = "RESOURCE_REGISTRY_V1";

/** Non-secret configuration for a declared resource. Secrets appear ONLY as an env-var NAME. */
export interface ResourceConfigBlock {
  /** NAME of the env var holding the credential (e.g. "OPENAI_API_KEY"). Never the value. */
  apiKeyEnv?: string;
  /** Optional endpoint/base URL (declared, never called). */
  baseUrl?: string;
  /** Optional pinned model id (declared, never called). */
  model?: string;
  /** For TOOL/LOCAL resources: the command/binary to invoke (declared, never executed here). */
  command?: string;
  /** Free-form, non-secret extra config a factory may read. */
  [key: string]: unknown;
}

/** A declarative description of one execution resource. Pure data — safe to serialize to JSON. */
export interface ResourceDescriptor {
  /** Stable id, unique within the registry (e.g. "openai", "local-llm", "internal-ocr"). */
  id: string;
  /** The resource kind (PROVIDER for hosted LLMs, LOCAL for local LLMs, TOOL for OCR/search/…). */
  kind: ResourceKind;
  /** Concrete type used to pick the factory (e.g. "openai", "ollama", "ocr"). */
  type: string;
  /** Whether this resource participates in allocation. DEFAULT-DISABLED policy. */
  enabled: boolean;
  /** Higher wins when the allocation engine breaks ties. Optional. */
  priority?: number;
  /** Non-secret configuration. */
  config?: ResourceConfigBlock;
}

/** Minimal environment view — only membership/presence is ever consulted. Injectable for tests. */
export type EnvView = Readonly<Record<string, string | undefined>>;

/** Builds a `Resource` from a descriptor. Registered per `type`. MUST NOT perform I/O or network. */
export type ResourceFactory = (descriptor: ResourceDescriptor, env: EnvView) => Resource;

/**
 * A generic, config-driven `Resource`. Its availability is deterministic and offline:
 *   - disabled                 → not granted ("resource disabled")
 *   - requires an env key that is absent → not granted, naming the missing env VAR (not its value)
 *   - otherwise                → granted
 * It performs NO network call and never reads a secret value.
 */
export class ConfiguredResource implements Resource {
  constructor(
    private readonly descriptor: ResourceDescriptor,
    private readonly env: EnvView,
  ) {}

  get id(): string {
    return this.descriptor.id;
  }

  get kind(): ResourceKind {
    return this.descriptor.kind;
  }

  allocate(): ResourceAllocation {
    const base = { resourceId: this.descriptor.id, kind: this.descriptor.kind };
    if (!this.descriptor.enabled) {
      return { ...base, granted: false, reason: "resource disabled", nextAction: `enable '${this.descriptor.id}' in the resource config` };
    }
    const keyEnv = this.descriptor.config?.apiKeyEnv;
    // Presence check only — never the value.
    if (keyEnv && !(keyEnv in this.env && this.env[keyEnv])) {
      return { ...base, granted: false, reason: `missing credential env var ${keyEnv}`, nextAction: `set ${keyEnv} in the environment` };
    }
    return { ...base, granted: true, reason: null, nextAction: null };
  }
}

/** Default factory used for every declared type — the config-driven `ConfiguredResource`. */
export const defaultResourceFactory: ResourceFactory = (descriptor, env) => new ConfiguredResource(descriptor, env);

/**
 * The Resource Registry. Declares resources by configuration and lets them be enabled, disabled,
 * or replaced without any Kernel change. It holds descriptors (data) and builds `Resource`
 * instances on demand via per-type factories (default: `ConfiguredResource`).
 */
export class ResourceRegistry {
  private readonly descriptors = new Map<string, ResourceDescriptor>();
  private readonly factories = new Map<string, ResourceFactory>();

  constructor(private readonly env: EnvView = {}) {}

  /** Register (or overwrite) a factory for a resource `type`. */
  registerFactory(type: string, factory: ResourceFactory): this {
    this.factories.set(type, factory);
    return this;
  }

  /** Declare a resource. Throws only on a duplicate id (use `replace` to override intentionally). */
  register(descriptor: ResourceDescriptor): this {
    if (this.descriptors.has(descriptor.id)) {
      throw new Error(`ResourceRegistry: duplicate resource id '${descriptor.id}' (use replace())`);
    }
    this.descriptors.set(descriptor.id, descriptor);
    return this;
  }

  /** Replace a declared resource (or add it if absent) — the "swap without code" seam. */
  replace(descriptor: ResourceDescriptor): this {
    this.descriptors.set(descriptor.id, descriptor);
    return this;
  }

  /** Remove a declared resource. Returns true if it existed. */
  remove(id: string): boolean {
    return this.descriptors.delete(id);
  }

  /** Enable a declared resource. Returns true if it existed. */
  enable(id: string): boolean {
    return this.setEnabled(id, true);
  }

  /** Disable a declared resource. Returns true if it existed. */
  disable(id: string): boolean {
    return this.setEnabled(id, false);
  }

  private setEnabled(id: string, enabled: boolean): boolean {
    const d = this.descriptors.get(id);
    if (!d) return false;
    this.descriptors.set(id, { ...d, enabled });
    return true;
  }

  /** The descriptor for an id, or undefined. */
  descriptor(id: string): ResourceDescriptor | undefined {
    return this.descriptors.get(id);
  }

  /** All declared descriptors, in declaration order. */
  list(): ResourceDescriptor[] {
    return [...this.descriptors.values()];
  }

  /** Only the enabled descriptors. */
  listEnabled(): ResourceDescriptor[] {
    return this.list().filter((d) => d.enabled);
  }

  /** Build a `Resource` for one id via its type factory (default factory when none registered). */
  resource(id: string): Resource | undefined {
    const d = this.descriptors.get(id);
    if (!d) return undefined;
    const factory = this.factories.get(d.type) ?? defaultResourceFactory;
    return factory(d, this.env);
  }

  /** Build `Resource` instances for every ENABLED descriptor — the input to the allocation engine. */
  resolveEnabled(): Resource[] {
    return this.listEnabled().map((d) => (this.factories.get(d.type) ?? defaultResourceFactory)(d, this.env));
  }

  /** Declare many resources from a plain config array (idempotent via replace). */
  loadDescriptors(descriptors: ResourceDescriptor[]): this {
    for (const d of descriptors) this.replace(d);
    return this;
  }
}

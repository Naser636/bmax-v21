/*
 * VNext — Activation entry point (ADDITIVE, declarative, DORMANT by default)
 *
 * The SINGLE mechanism through which the VNext extensions (Goal-Oriented + Universal Resource)
 * become officially RECOGNIZED by the Runtime while staying totally INACTIVE until explicitly
 * enabled. Recognition is by DATA (runtime/config/vnext.json + the manifest below), not by a code
 * import from the Runtime — so the isolation invariant holds: the Kernel never imports VNext.
 *
 * Guarantees (mission "Intégration Finale VNext") :
 *   - Purely declarative: activation is a config flag, never a code change. The Kernel is untouched.
 *   - Default-OFF and master-gated: a feature is active ONLY when `enabled === true` AND its own
 *     flag is true. With the shipped config (all false), everything is inactive.
 *   - No side effects, no network. `loadVNextActivation()` reads one JSON file and never throws.
 *   - Nothing in the Runtime calls this module today; it is the prepared seam for a FUTURE wiring.
 *     Present behavior is therefore strictly identical.
 */

import fs from "node:fs";
import path from "node:path";

export const VNEXT_ACTIVATION_VERSION = "VNEXT_ACTIVATION_V1";

/** The activatable VNext capabilities (mission's list), in pipeline order. */
export type VNextFeature =
  | "goalAnalysis"
  | "goal"
  | "intent"
  | "strategy"
  | "resourceAllocation"
  | "constitution";

/** All features, in order — the canonical set the loader normalizes against. */
export const VNEXT_FEATURES: readonly VNextFeature[] = [
  "goalAnalysis",
  "goal",
  "intent",
  "strategy",
  "resourceAllocation",
  "constitution",
];

/** One recognized-but-inactive extension (data-only registry entry). */
export interface VNextExtensionManifest {
  name: string;
  version: string;
  entry: string;
  status: "RECOGNIZED_INACTIVE" | "ACTIVE";
}

/** The resolved activation state. `enabled` is the master switch gating every feature. */
export interface VNextActivation {
  version: number;
  enabled: boolean;
  features: Record<VNextFeature, boolean>;
  extensions: VNextExtensionManifest[];
}

/** Default location of the declarative activation config (repo-relative). */
export const DEFAULT_VNEXT_CONFIG_PATH = "runtime/config/vnext.json";

/** The fully-inactive default — master off, every feature off, no extensions marked active. */
export const DEFAULT_VNEXT_ACTIVATION: VNextActivation = {
  version: 1,
  enabled: false,
  features: {
    goalAnalysis: false,
    goal: false,
    intent: false,
    strategy: false,
    resourceAllocation: false,
    constitution: false,
  },
  extensions: [],
};

/** Normalize an arbitrary parsed object into a complete, safe VNextActivation. */
function normalize(parsed: Partial<VNextActivation> | null | undefined): VNextActivation {
  const featuresIn = (parsed?.features ?? {}) as Partial<Record<VNextFeature, boolean>>;
  const features = {} as Record<VNextFeature, boolean>;
  for (const f of VNEXT_FEATURES) features[f] = featuresIn[f] === true;
  return {
    version: typeof parsed?.version === "number" ? parsed!.version : 1,
    enabled: parsed?.enabled === true,
    features,
    extensions: Array.isArray(parsed?.extensions) ? parsed!.extensions! : [],
  };
}

/**
 * Load the activation state from disk. Resilient: an absent/unreadable/invalid file yields the
 * fully-inactive default. Never throws, performs no network I/O.
 */
export function loadVNextActivation(
  cwd: string = process.cwd(),
  file: string = DEFAULT_VNEXT_CONFIG_PATH,
): VNextActivation {
  try {
    const raw = fs.readFileSync(path.resolve(cwd, file), "utf8");
    return normalize(JSON.parse(raw) as Partial<VNextActivation>);
  } catch {
    return { ...DEFAULT_VNEXT_ACTIVATION };
  }
}

/**
 * The single predicate every future call site uses. A feature is active ONLY when the master
 * switch is on AND that feature's flag is true. With the shipped config, always false.
 */
export function isVNextEnabled(activation: VNextActivation, feature: VNextFeature): boolean {
  return activation.enabled === true && activation.features[feature] === true;
}

/**
 * The activation GUARD — the prepared integration seam. Runs `active()` only when the feature is
 * enabled; otherwise returns `inactive()` (the current-behavior / no-op path). This is how a future
 * wiring turns a VNext stage on without a Kernel change: wrap the new path in `withVNext(...)` and it
 * stays dormant until the flag flips. Default `inactive` is a no-op returning undefined.
 */
export function withVNext<T>(
  activation: VNextActivation,
  feature: VNextFeature,
  active: () => T,
  inactive: () => T = (() => undefined as unknown as T),
): T {
  return isVNextEnabled(activation, feature) ? active() : inactive();
}

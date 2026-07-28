/*
 * VNext Activation — deterministic unit test.
 *
 * Run directly with tsx (no network, no repository writes):
 *   node_modules/.bin/tsx src/runtime/vnext-activation.test.ts
 *
 * Asserts the ADDITIVE activation contract:
 *   - The shipped config recognizes the extensions but keeps everything INACTIVE (default-OFF).
 *   - A feature is active ONLY when the master switch AND its own flag are true (master gating).
 *   - The `withVNext` guard runs the inactive/no-op path by default ⇒ current behavior preserved.
 *   - The loader is resilient (absent/invalid file ⇒ fully-inactive default; never throws).
 */

import {
  DEFAULT_VNEXT_ACTIVATION,
  VNEXT_FEATURES,
  isVNextEnabled,
  loadVNextActivation,
  withVNext,
  type VNextActivation,
} from "./vnext/activation";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

// 1. Default is fully inactive.
{
  console.log("Default activation (fully inactive)");
  check(DEFAULT_VNEXT_ACTIVATION.enabled === false, "master switch off by default");
  check(VNEXT_FEATURES.every((f) => DEFAULT_VNEXT_ACTIVATION.features[f] === false), "every feature off by default");
  check(VNEXT_FEATURES.every((f) => isVNextEnabled(DEFAULT_VNEXT_ACTIVATION, f) === false), "no feature is enabled by default");
}

// 2. Shipped on-disk config recognizes the extensions but stays inactive.
{
  console.log("Shipped runtime/config/vnext.json");
  const cfg = loadVNextActivation();
  check(cfg.enabled === false, "shipped config keeps the master switch off");
  check(VNEXT_FEATURES.every((f) => cfg.features[f] === false), "shipped config keeps every feature off");
  check(cfg.extensions.length >= 2, "both VNext extensions are recognized (data manifest)");
  check(cfg.extensions.every((e) => e.status === "RECOGNIZED_INACTIVE"), "extensions are RECOGNIZED_INACTIVE, not ACTIVE");
}

// 3. Master gating — a feature flag alone does NOT activate; the master switch must be on too.
{
  console.log("Master gating");
  const flagOnMasterOff: VNextActivation = {
    ...DEFAULT_VNEXT_ACTIVATION,
    enabled: false,
    features: { ...DEFAULT_VNEXT_ACTIVATION.features, strategy: true },
  };
  check(isVNextEnabled(flagOnMasterOff, "strategy") === false, "feature flag on + master off ⇒ still inactive");

  const both: VNextActivation = {
    ...DEFAULT_VNEXT_ACTIVATION,
    enabled: true,
    features: { ...DEFAULT_VNEXT_ACTIVATION.features, strategy: true },
  };
  check(isVNextEnabled(both, "strategy") === true, "master on + feature flag on ⇒ active");
  check(isVNextEnabled(both, "goal") === false, "only the flipped feature activates (others stay off)");
}

// 4. The guard runs the inactive/no-op path by default (current behavior preserved).
{
  console.log("withVNext guard (dormant by default)");
  let activeRan = false;
  let inactiveRan = false;
  const r = withVNext(
    DEFAULT_VNEXT_ACTIVATION,
    "resourceAllocation",
    () => {
      activeRan = true;
      return "ACTIVE";
    },
    () => {
      inactiveRan = true;
      return "INACTIVE";
    },
  );
  check(r === "INACTIVE" && inactiveRan && !activeRan, "disabled feature runs the inactive path only");

  const r2 = withVNext(DEFAULT_VNEXT_ACTIVATION, "goal", () => "X");
  check(r2 === undefined, "default inactive path is a no-op returning undefined");

  const on: VNextActivation = { ...DEFAULT_VNEXT_ACTIVATION, enabled: true, features: { ...DEFAULT_VNEXT_ACTIVATION.features, goal: true } };
  check(withVNext(on, "goal", () => "ACTIVE", () => "INACTIVE") === "ACTIVE", "enabled feature runs the active path");
}

// 5. Resilient load — a missing file yields the fully-inactive default, never throws.
{
  console.log("Resilient load");
  let threw = false;
  let cfg: VNextActivation | null = null;
  try {
    cfg = loadVNextActivation(process.cwd(), "runtime/config/does-not-exist.json");
  } catch {
    threw = true;
  }
  check(!threw, "loading a missing config does not throw");
  check(cfg !== null && cfg.enabled === false && VNEXT_FEATURES.every((f) => cfg!.features[f] === false), "missing config ⇒ fully-inactive default");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

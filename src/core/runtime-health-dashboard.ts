/*
 * Runtime Health Dashboard — Capability implementation
 *
 * Industrialization layer. Deterministically aggregates the readiness of the Runtime's
 * governance/industrialization components into one snapshot:
 *   - HEALTHY  : every component ready,
 *   - DOWN     : no component ready (or none supplied),
 *   - DEGRADED : some ready, some not.
 * Pure, no I/O, error-as-data. Output ordering is stable (components sorted by name) so the same
 * signals always render the same snapshot.
 *
 * Single responsibility: aggregate + classify. It performs no health checks itself — it consumes
 * readiness signals produced elsewhere.
 */

import {
  RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION,
  type RuntimeComponentSignal,
  type RuntimeHealthDashboardDescription,
  type RuntimeHealthDashboardError,
  type RuntimeHealthDashboardErrorCode,
  type RuntimeHealthDashboardResult,
  type RuntimeHealthInputs,
  type RuntimeHealthSnapshot,
  type RuntimeHealthStatus,
} from "@/contracts/runtime-health-dashboard";

const CAPABILITY_NAME = "Runtime Health Dashboard";

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export class RuntimeHealthDashboard {
  describe(): RuntimeHealthDashboardDescription {
    return {
      name: CAPABILITY_NAME,
      class: "capability",
      owner: "Governance",
      runtimeHealthDashboardContractVersion: RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION,
      status: "READY",
    };
  }

  initialize(): { ready: true } {
    return { ready: true };
  }

  /**
   * Build the snapshot (deterministic):
   *   1. structural validation   → INPUTS_MALFORMED
   *   2. contract version gate    → RUNTIME_HEALTH_DASHBOARD_CONTRACT_INCOMPATIBLE
   *   3. aggregate + classify
   */
  build(inputs: RuntimeHealthInputs): RuntimeHealthDashboardResult {
    const received =
      inputs && typeof inputs.runtimeHealthDashboardContractVersion === "string"
        ? inputs.runtimeHealthDashboardContractVersion
        : "";

    const malformed = this.validateStructure(inputs, received);
    if (malformed) return { ok: false, error: malformed };

    const incompatible = this.checkContractVersion(received);
    if (incompatible) return { ok: false, error: incompatible };

    const components: RuntimeComponentSignal[] = [...inputs.components]
      .map((c) => (c.detail !== undefined ? { name: c.name, ready: c.ready, detail: c.detail } : { name: c.name, ready: c.ready }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const total = components.length;
    const ready = components.filter((c) => c.ready).length;
    const degraded = components.filter((c) => !c.ready).map((c) => c.name);

    const overall: RuntimeHealthStatus =
      total === 0 || ready === 0 ? "DOWN" : ready === total ? "HEALTHY" : "DEGRADED";

    const snapshot: RuntimeHealthSnapshot = {
      runtimeHealthDashboardContractVersion: RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION,
      overall,
      total,
      ready,
      degraded,
      components,
    };
    return { ok: true, snapshot };
  }

  // --- validation ---------------------------------------------------------

  private validateStructure(
    inputs: RuntimeHealthInputs,
    received: string,
  ): RuntimeHealthDashboardError | null {
    const bad = (message: string) => this.error("INPUTS_MALFORMED", received, message);

    if (!inputs || typeof inputs !== "object") return bad("RuntimeHealthInputs is missing or not an object.");
    if (typeof inputs.runtimeHealthDashboardContractVersion !== "string") return bad("runtimeHealthDashboardContractVersion is missing or not a string.");
    if (!Array.isArray(inputs.components)) return bad("components is missing or not an array.");

    const seen = new Set<string>();
    for (let i = 0; i < inputs.components.length; i++) {
      const c = inputs.components[i];
      const at = `components[${i}]`;
      if (!c || typeof c !== "object") return bad(`${at} is missing or not an object.`);
      if (typeof c.name !== "string" || c.name.length === 0) return bad(`${at}.name is missing or empty.`);
      if (typeof c.ready !== "boolean") return bad(`${at}.ready is missing or not a boolean.`);
      if (c.detail !== undefined && typeof c.detail !== "string") return bad(`${at}.detail is present but not a string.`);
      if (seen.has(c.name)) return bad(`duplicate component name "${c.name}" — names must be unique for a deterministic snapshot.`);
      seen.add(c.name);
    }
    return null;
  }

  private checkContractVersion(received: string): RuntimeHealthDashboardError | null {
    const supported = this.parseSemVer(RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION);
    const got = this.parseSemVer(received);
    if (!got) {
      return this.error("INPUTS_MALFORMED", received, "runtimeHealthDashboardContractVersion is not a valid MAJOR.MINOR.PATCH version.");
    }
    if (got.major !== supported!.major) {
      return this.error(
        "RUNTIME_HEALTH_DASHBOARD_CONTRACT_INCOMPATIBLE",
        received,
        `Incompatible Runtime Health Dashboard Contract Version: supported ${RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION}, received ${received}.`,
      );
    }
    return null;
  }

  private parseSemVer(value: string): SemVer | null {
    if (typeof value !== "string") return null;
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
  }

  private error(
    code: RuntimeHealthDashboardErrorCode,
    received: string,
    message: string,
  ): RuntimeHealthDashboardError {
    return { code, supported: RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION, received, message };
  }
}

export { CAPABILITY_NAME };

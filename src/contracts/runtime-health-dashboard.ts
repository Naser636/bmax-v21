/*
 * Runtime Health Dashboard — Contracts
 *
 * Frozen contract surface for the Runtime Health Dashboard capability (Contract Version 1.0.0),
 * part of the Runtime industrialization layer.
 *
 * It aggregates the readiness of the Runtime's governance/industrialization components into a single
 * deterministic snapshot (HEALTHY / DEGRADED / DOWN). Pure, no I/O — the Runtime supplies the
 * component signals and persists/renders the snapshot. Distinct from the low-level SystemHealth
 * dashboard (which counts service checks); this one reports the Runtime capability layer.
 */

export const RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION = "1.0.0";

export interface RuntimeComponentSignal {
  name: string;
  ready: boolean;
  detail?: string;
}

export interface RuntimeHealthInputs {
  runtimeHealthDashboardContractVersion: string;
  components: RuntimeComponentSignal[];
}

export type RuntimeHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN";

export interface RuntimeHealthSnapshot {
  runtimeHealthDashboardContractVersion: string;
  overall: RuntimeHealthStatus;
  total: number;
  ready: number;
  /** Names of components that are NOT ready, in ascending order. */
  degraded: string[];
  /** All components, ordered by name, for a stable render. */
  components: RuntimeComponentSignal[];
}

export type RuntimeHealthDashboardErrorCode =
  | "INPUTS_MALFORMED"
  | "RUNTIME_HEALTH_DASHBOARD_CONTRACT_INCOMPATIBLE";

export interface RuntimeHealthDashboardError {
  code: RuntimeHealthDashboardErrorCode;
  supported: string;
  received: string;
  message: string;
}

export type RuntimeHealthDashboardResult =
  | { ok: true; snapshot: RuntimeHealthSnapshot }
  | { ok: false; error: RuntimeHealthDashboardError };

export interface RuntimeHealthDashboardDescription {
  name: string;
  class: "capability";
  owner: "Governance";
  runtimeHealthDashboardContractVersion: string;
  status: "READY";
}

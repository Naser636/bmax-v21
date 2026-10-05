/*
 * ON_DEMAND_MODEL_ROUTING_V2 — opt-in mission-path hook (OFF by default).
 *
 * Surfaces the Ollama Control Plane's DETERMINISTIC routing decision for a mission as gitignored evidence,
 * WITHOUT changing execution, provider selection, or making Ollama primary/preferred. When the feature flag
 * ODG_OLLAMA_CONTROL_PLANE is absent/OFF this is a strict NO-OP ({ enabled:false }) and the governed mission
 * path is byte-for-byte unchanged. Best-effort: never throws (observability must not break a mission).
 *
 * Reuses runtime/core/ollama-control-plane.js (decidePolicy + routeModel) — no new policy, no new provider.
 * Fail-closed is preserved: a HIGH-risk / LARGE decision with no large model configured is recorded as a
 * refusal (no silent downgrade). Models come from ODG_OLLAMA_SMALL_MODEL / ODG_OLLAMA_LARGE_MODEL.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const requireCjs = createRequire(import.meta.url);

interface RawMissionLike {
  mode?: string;
  requiresEngineering?: boolean;
  authorizedPaths?: unknown;
  authorized_paths?: unknown;
  risk?: string;
  criticality?: string;
  control?: { economic?: boolean } | undefined;
}

interface ControlPlane {
  isEnabled: () => boolean;
  decidePolicy: (task: unknown) => { tier: string; reason: string; risk: string; complexity: string; policyVersion: string };
  routeModel: (decision: unknown, models: unknown) => { ok: boolean; tier: string; model: string | null; reason: string; policyVersion: string };
}

function controlPlane(cwd: string): ControlPlane | null {
  try {
    return requireCjs(`${cwd}/runtime/core/ollama-control-plane.js`) as ControlPlane;
  } catch {
    return null;
  }
}

/** Deterministic mission → task profile. Engineering/code ⇒ LARGE-leaning; audit/read ⇒ SMALL-leaning. */
export function mapMissionToTask(spec: RawMissionLike | null | undefined): { kind: string; risk: "HIGH" | "LOW"; contextTokens: number } {
  const s = (spec ?? {}) as RawMissionLike;
  const paths = Array.isArray(s.authorizedPaths) ? s.authorizedPaths : Array.isArray(s.authorized_paths) ? s.authorized_paths : [];
  const engineering = (Array.isArray(paths) && paths.length > 0) || s.requiresEngineering === true;
  const mode = typeof s.mode === "string" ? s.mode.toUpperCase() : "";
  const audit = mode === "AUDIT" || mode === "ANALYZE" || mode === "READ";
  const highRisk = s.risk === "HIGH" || s.criticality === "HIGH" || s.criticality === "CRITICAL" || !!s.control?.economic;
  const kind = engineering && !audit ? "code" : "classify";
  return { kind, risk: highRisk ? "HIGH" : "LOW", contextTokens: 0 };
}

export interface OllamaRoutingRecord {
  enabled: boolean;
  tier?: string;
  model?: string | null;
  reason?: string;
  routed?: boolean;
  risk?: string;
  policyVersion?: string;
  evidencePath?: string;
}

/**
 * recordOllamaRouting(mission, spec, opts) — OFF-by-default NO-OP. When the control-plane flag is ON (or
 * opts.force for tests), compute the deterministic routing decision for this mission and write it to
 * runtime/generated/ollama-routing-decision.json (gitignored evidence). Never changes execution. Never throws.
 */
export function recordOllamaRouting(
  mission: string,
  spec: RawMissionLike | null | undefined,
  opts: { cwd?: string; force?: boolean; write?: boolean } = {},
): OllamaRoutingRecord {
  const cwd = opts.cwd ?? process.cwd();
  try {
    const cp = controlPlane(cwd);
    if (!cp) return { enabled: false };
    if (!cp.isEnabled() && opts.force !== true) return { enabled: false };

    const decision = cp.decidePolicy(mapMissionToTask(spec));
    const models = { small: process.env.ODG_OLLAMA_SMALL_MODEL, large: process.env.ODG_OLLAMA_LARGE_MODEL };
    const routed = cp.routeModel(decision, models);
    const record: OllamaRoutingRecord = {
      enabled: true,
      tier: decision.tier,
      model: routed.model,
      routed: routed.ok, // false ⇒ fail-closed (no model for the required tier); NEVER a silent downgrade
      reason: routed.ok ? decision.reason : routed.reason,
      risk: decision.risk,
      policyVersion: decision.policyVersion,
    };
    if (opts.write !== false) {
      const abs = path.join(cwd, "runtime", "generated", "ollama-routing-decision.json");
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify({ mission, ...record }, null, 2));
      record.evidencePath = "runtime/generated/ollama-routing-decision.json";
    }
    return record;
  } catch {
    return { enabled: false }; // best-effort: observability must never break the mission path
  }
}

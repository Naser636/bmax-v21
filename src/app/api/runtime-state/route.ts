/*
 * GET /api/runtime-state — READ-ONLY HTTP endpoint exposing the governed runtime snapshot the BMAX
 * dashboard renders (WI-2 REPAIR_BMAX_DASHBOARD_REAL_DATA_V1). It reflects the REAL artifacts
 * materialised under runtime/generated/ by the ODG state writer (runtime/bin/odg-state.js) and the
 * cockpit model — it NEVER invents data. Missing or unreadable artifacts degrade gracefully to
 * explicit nulls / present:false (honest unknowns), never fabricated zeros or placeholder data.
 *
 * STRICTLY READ-ONLY: it only parses JSON artifacts; it writes nothing, spawns no process, opens no
 * network, and exposes no secrets. Node runtime, request-time (never cached/prerendered) — mirrors the
 * existing read-only pattern of src/app/api/health/route.ts.
 *
 * `readRuntimeSnapshot()` is the single reader; the dashboard server page (src/app/page.tsx) imports it
 * directly (no HTTP round-trip needed server-side), and this GET exposes the same snapshot to external
 * consumers. One reader ⇒ the page and the API can never diverge.
 *
 * Next 16 Route Handler — node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; reflect current artifacts, never cached

const GENERATED = "runtime/generated";
const ARTIFACT_PATHS = {
  state: `${GENERATED}/runtime-state.json`,
  autonomy: `${GENERATED}/autonomy-rate.json`,
  queue: `${GENERATED}/runtime-mission-queue.json`,
  capabilities: `${GENERATED}/capability-registry.json`,
} as const;

export interface RuntimeSnapshotSource {
  path: string;
  present: boolean;
}

export interface RuntimeSnapshot {
  /** True when the authoritative runtime-state.json was present and readable. */
  present: boolean;
  generatedAt: string | null;
  health: {
    status: string | null;
    runtime: string | null;
    foundation: string | null;
    pipeline: string | null;
    brain: string | null;
    converged: boolean | null;
  };
  missions: {
    last: string | null;
    next: string | null;
    lastRun: { mission: string | null; status: string | null; validated: boolean | null } | null;
    outstanding: string[];
  };
  autonomy: {
    present: boolean;
    /** When false, autonomyPercent MUST be null and `reason` explains why (never a fabricated number). */
    measurable: boolean;
    autonomyPercent: number | null;
    reason: string | null;
    counts: Record<string, number> | null;
    total: number | null;
  };
  queue: Array<{
    mission: string;
    objective: string | null;
    goal: string | null;
    priority: string | null;
    status: string | null;
    requiresEngineering: boolean | null;
  }>;
  queueCount: number;
  capabilities: { present: boolean; total: number | null; missing: number | null };
  /** Provenance: which governed artifacts were found (honest about what backs the display). */
  sources: RuntimeSnapshotSource[];
}

// --- defensive narrowers (artifacts are external JSON; never trust shape) -------------------------
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Read + parse a governed artifact (best-effort). Returns null when absent/unreadable/invalid JSON. */
function readArtifact(relPath: string): unknown {
  try {
    return JSON.parse(readFileSync(resolvePath(process.cwd(), relPath), "utf8"));
  } catch {
    return null; // honest unknown — never a fabricated empty object
  }
}

/**
 * Build the governed runtime snapshot from the real artifacts. Pure w.r.t. the filesystem it reads;
 * performs NO writes. Honest by construction: unavailable data ⇒ null / present:false, and a
 * non-measurable autonomy signal ⇒ autonomyPercent:null with its reason preserved.
 */
export function readRuntimeSnapshot(): RuntimeSnapshot {
  const state = readArtifact(ARTIFACT_PATHS.state);
  const autonomy = readArtifact(ARTIFACT_PATHS.autonomy);
  const queueDoc = readArtifact(ARTIFACT_PATHS.queue);
  const caps = readArtifact(ARTIFACT_PATHS.capabilities);

  const sources: RuntimeSnapshotSource[] = [
    { path: ARTIFACT_PATHS.state, present: state !== null },
    { path: ARTIFACT_PATHS.autonomy, present: autonomy !== null },
    { path: ARTIFACT_PATHS.queue, present: queueDoc !== null },
    { path: ARTIFACT_PATHS.capabilities, present: caps !== null },
  ];

  const s = isObj(state) ? state : {};
  const lastRunRaw = isObj(s.lastRun) ? s.lastRun : null;
  const outstandingRaw = Array.isArray(s.outstanding) ? s.outstanding : [];

  const a = isObj(autonomy) ? autonomy : {};
  const measure = isObj(a.measure) ? a.measure : {};
  const measurable = asBool(measure.measurable) === true;
  const description = isObj(a.description) ? a.description : {};
  const counts = isObj(description.counts)
    ? Object.fromEntries(
        Object.entries(description.counts).map(([k, v]) => [k, asNum(v) ?? 0]),
      )
    : null;

  const queueArr = isObj(queueDoc) && Array.isArray(queueDoc.queue) ? queueDoc.queue : [];
  const queue = queueArr
    .filter(isObj)
    .map((q) => ({
      mission: asStr(q.mission) ?? "(unnamed)",
      objective: asStr(q.objective),
      goal: asStr(q.goal),
      priority: asStr(q.priority),
      status: asStr(q.status),
      requiresEngineering: asBool(q.requiresEngineering),
    }));

  const capsObj = isObj(caps) ? caps : null;
  const capabilitiesTotal = capsObj && Array.isArray(capsObj.capabilities) ? capsObj.capabilities.length : null;
  const capabilitiesMissing = capsObj && Array.isArray(capsObj.missingCapabilities) ? capsObj.missingCapabilities.length : null;

  return {
    present: state !== null,
    generatedAt: asStr(s.generatedAt),
    health: {
      status: asStr(s.status),
      runtime: asStr(s.runtime),
      foundation: asStr(s.foundation),
      pipeline: asStr(s.pipeline),
      brain: asStr(s.brain),
      converged: asBool(s.converged),
    },
    missions: {
      last: asStr(s.lastMission),
      next: asStr(s.nextMission),
      lastRun: lastRunRaw
        ? {
            mission: asStr(lastRunRaw.mission),
            status: asStr(lastRunRaw.status),
            validated: asBool(lastRunRaw.validated),
          }
        : null,
      outstanding: outstandingRaw.filter((x): x is string => typeof x === "string"),
    },
    autonomy: {
      present: autonomy !== null,
      measurable,
      // Honest invariant: never surface a percentage unless the measure is actually measurable.
      autonomyPercent: measurable ? asNum(measure.autonomyPercent) : null,
      reason: asStr(measure.reason),
      counts,
      total: asNum(description.total),
    },
    queue,
    queueCount: queue.length,
    capabilities: {
      present: capsObj !== null,
      total: capabilitiesTotal,
      missing: capabilitiesMissing,
    },
    sources,
  };
}

export async function GET(): Promise<Response> {
  let snapshot: RuntimeSnapshot;
  try {
    snapshot = readRuntimeSnapshot();
  } catch {
    // Fail-honest: an unexpected read error becomes an explicit "no data" snapshot, never a crash and
    // never fabricated values. 200 because the endpoint itself worked; availability is in the body.
    snapshot = {
      present: false,
      generatedAt: null,
      health: { status: null, runtime: null, foundation: null, pipeline: null, brain: null, converged: null },
      missions: { last: null, next: null, lastRun: null, outstanding: [] },
      autonomy: { present: false, measurable: false, autonomyPercent: null, reason: null, counts: null, total: null },
      queue: [],
      queueCount: 0,
      capabilities: { present: false, total: null, missing: null },
      sources: Object.values(ARTIFACT_PATHS).map((p) => ({ path: p, present: false })),
    };
  }
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

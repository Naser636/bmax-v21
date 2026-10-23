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
import { resolve as resolvePath, join as joinPath } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // request-time only; reflect current artifacts, never cached

const GENERATED = "runtime/generated";
// DISPLAY labels (provenance) — stable, repo-relative; the ACTUAL read base is resolved at request time below.
const ARTIFACT_PATHS = {
  state: `${GENERATED}/runtime-state.json`,
  autonomy: `${GENERATED}/autonomy-rate.json`,
  queue: `${GENERATED}/runtime-mission-queue.json`,
  capabilities: `${GENERATED}/capability-registry.json`,
  verify: `${GENERATED}/runtime-verify.json`,
  report: `${GENERATED}/mission-report.json`,
} as const;
const ARTIFACT_FILES = {
  state: "runtime-state.json",
  autonomy: "autonomy-rate.json",
  queue: "runtime-mission-queue.json",
  capabilities: "capability-registry.json",
  verify: "runtime-verify.json",
  report: "mission-report.json",
} as const;

/**
 * Resolve the PERSISTENT runtime-artifacts directory at REQUEST TIME. Prefer the explicitly-configured absolute
 * location `ODG_RUNTIME_STATE_DIR` (the durable fix: the standalone server chdir's to its own build dir, which is
 * mutable/deletable, so reading `process.cwd()/runtime/generated` binds the dashboard to a build-time snapshot).
 * Fallback to `process.cwd()/runtime/generated` preserves the prior behaviour when the env is unset (backward
 * compatible; dev/test/CLI). Resolved per call (never cached) so the dashboard reflects the live persistent state.
 */
function generatedBase(): string {
  const env = process.env.ODG_RUNTIME_STATE_DIR;
  if (typeof env === "string" && env.trim() !== "") return resolvePath(env.trim());
  return resolvePath(process.cwd(), GENERATED);
}

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
  capabilities: {
    present: boolean;
    total: number | null;
    missing: number | null;
    provenMissions: number | null;
    wiredExecutors: number | null;
    wiredProbes: number | null;
  };
  /**
   * Canonical RELEASE visibility. The five release gates come straight from the runtime's own evidence
   * (runtime-verify.json + the independent validation verdict in mission-report.json) — NEVER inferred from
   * a green build/test alone. `decision` is produced by the FROZEN Release Manager (src/core/release-manager.ts),
   * reused, never re-implemented; it is "UNAVAILABLE" (with a reason) when the release-time provenance the
   * Release Manager requires (source commit, documentation-proof hash, artifacts) is not present in the
   * snapshot — the honest state, since no standalone release decision is persisted for the dashboard to read.
   * `gatesReady` is the plain AND of the five gates — a gate-readiness signal, explicitly NOT a release claim.
   */
  release: {
    present: boolean;
    mission: string | null;
    gates: {
      build: boolean | null;
      typescript: boolean | null;
      gitClean: boolean | null;
      documentationProofPresent: boolean | null;
      missionPipeline: boolean | null;
    };
    gatesReady: boolean;
    decision: "RELEASE" | "NO_RELEASE" | "UNAVAILABLE";
    reason: string | null;
    evidenceComplete: boolean;
  };
  /** Provenance: which governed artifacts were found (honest about what backs the display). */
  sources: RuntimeSnapshotSource[];
}

/** The honest "no release evidence" view (used on fallback + when runtime-verify.json is absent). */
const RELEASE_ABSENT: RuntimeSnapshot["release"] = {
  present: false,
  mission: null,
  gates: { build: null, typescript: null, gitClean: null, documentationProofPresent: null, missionPipeline: null },
  gatesReady: false,
  decision: "UNAVAILABLE",
  reason: "no runtime-verify.json — release gate evidence absent",
  evidenceComplete: false,
};

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

/** Read + parse a governed artifact (best-effort) from the persistent base. Returns null when absent/unreadable/invalid JSON. */
function readArtifact(file: string): unknown {
  try {
    return JSON.parse(readFileSync(joinPath(generatedBase(), file), "utf8"));
  } catch {
    return null; // honest unknown — never a fabricated empty object
  }
}

/**
 * Canonical RELEASE visibility, honest-by-construction. Reads the five release gates from the runtime's OWN
 * evidence — runtime-verify.json (build / typescript / gitClean / documentationProofPresent) and the
 * INDEPENDENT validation verdict in mission-report.json (missionPipeline = validated && SUCCESS for the SAME
 * mission) — so the surface can NEVER infer RELEASE from a green build/test alone. The decision itself is
 * delegated to the FROZEN Release Manager (reused, not re-implemented); with the release-time provenance it
 * requires (source commit, documentation-proof inputsHash, artifacts) absent from the snapshot, it returns
 * UNAVAILABLE with the Release Manager's own reason — the honest state. `gatesReady` is the plain AND of the
 * five gates (gate-readiness, NOT a release claim).
 */
function buildReleaseView(): RuntimeSnapshot["release"] {
  const verify = readArtifact(ARTIFACT_FILES.verify);
  const report = readArtifact(ARTIFACT_FILES.report);
  const v = isObj(verify) ? verify : null;
  const r = isObj(report) ? report : null;
  if (!v) return { ...RELEASE_ABSENT, mission: r ? asStr(r.mission) : null };

  const mission = asStr(v.mission) ?? (r ? asStr(r.mission) : null);
  const build = asBool(v.build);
  const typescript = asBool(v.typescript);
  const gitClean = asBool(v.gitClean);
  const documentationProofPresent = asBool(v.documentationProofPresent);
  // missionPipeline is the INDEPENDENT validation verdict for the SAME mission — never inferred from build/tsc.
  const missionPipeline =
    r && asStr(r.mission) === mission ? asBool(r.validated) === true && asStr(r.status) === "SUCCESS" : null;
  const gates = { build, typescript, gitClean, documentationProofPresent, missionPipeline };
  // gatesReady = the exact five-gate AND the canonical Release Manager's allGreen() evaluates
  // (src/core/release-manager.ts:evaluateGates/allGreen). A green build/test ALONE is never enough — all
  // five must hold, including the INDEPENDENT missionPipeline verdict and gitClean.
  const gateEntries: Array<[string, boolean | null]> = [
    ["build", build], ["typescript", typescript], ["gitClean", gitClean],
    ["documentationProofPresent", documentationProofPresent], ["missionPipeline", missionPipeline],
  ];
  const gatesReady = gateEntries.every(([, g]) => g === true);
  const failing = gateEntries.filter(([, g]) => g === false).map(([k]) => k);
  const unknown = gateEntries.filter(([, g]) => g === null).map(([k]) => k);

  // The dashboard surfaces the canonical gates + an HONEST decision; it never asserts RELEASE itself (the
  // authoritative RELEASE is the frozen Release Manager's, made in the autonomy loop with release-time
  // provenance — commit, documentation-proof hash, artifacts — which is NOT persisted in this snapshot).
  let decision: "RELEASE" | "NO_RELEASE" | "UNAVAILABLE";
  let reason: string;
  if (failing.length > 0) {
    decision = "NO_RELEASE";
    reason = `release gate(s) not satisfied: ${failing.join(", ")}`;
  } else if (unknown.length > 0) {
    decision = "UNAVAILABLE";
    reason = `release gate evidence incomplete — unknown: ${unknown.join(", ")}`;
  } else {
    decision = "UNAVAILABLE";
    reason =
      "all five release gates green; the authoritative RELEASE is decided by the Release Manager at release time with full provenance (commit, documentation-proof hash, artifacts), which is not persisted in this snapshot";
  }
  return { present: true, mission, gates, gatesReady, decision, reason, evidenceComplete: false };
}

/**
 * Build the governed runtime snapshot from the real artifacts. Pure w.r.t. the filesystem it reads;
 * performs NO writes. Honest by construction: unavailable data ⇒ null / present:false, and a
 * non-measurable autonomy signal ⇒ autonomyPercent:null with its reason preserved.
 */
export function readRuntimeSnapshot(): RuntimeSnapshot {
  const state = readArtifact(ARTIFACT_FILES.state);
  const autonomy = readArtifact(ARTIFACT_FILES.autonomy);
  const queueDoc = readArtifact(ARTIFACT_FILES.queue);
  const caps = readArtifact(ARTIFACT_FILES.capabilities);

  const sources: RuntimeSnapshotSource[] = [
    { path: ARTIFACT_PATHS.state, present: state !== null },
    { path: ARTIFACT_PATHS.autonomy, present: autonomy !== null },
    { path: ARTIFACT_PATHS.queue, present: queueDoc !== null },
    { path: ARTIFACT_PATHS.capabilities, present: caps !== null },
    { path: ARTIFACT_PATHS.verify, present: readArtifact(ARTIFACT_FILES.verify) !== null },
    { path: ARTIFACT_PATHS.report, present: readArtifact(ARTIFACT_FILES.report) !== null },
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
  // NOTE: `total`/`missing` are PROVEN-MISSION counts (achievements), kept for back-compat. The distinct
  // real capability census (wired executors + verification probes) is surfaced SEPARATELY below so the
  // dashboard never presents a proven-mission count as the number of distinct capabilities.
  const capabilitiesTotal = capsObj && Array.isArray(capsObj.capabilities) ? capsObj.capabilities.length : null;
  const capabilitiesMissing = capsObj && Array.isArray(capsObj.missingCapabilities) ? capsObj.missingCapabilities.length : null;
  const wired = capsObj && isObj(capsObj.wiredCapabilities) ? capsObj.wiredCapabilities : null;
  const wiredExecutors = wired && typeof wired.executors === "number" ? wired.executors : null;
  const wiredProbes = wired && typeof wired.probes === "number" ? wired.probes : null;

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
      provenMissions: capabilitiesTotal,
      wiredExecutors,
      wiredProbes,
    },
    release: buildReleaseView(),
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
      capabilities: { present: false, total: null, missing: null, provenMissions: null, wiredExecutors: null, wiredProbes: null },
      release: RELEASE_ABSENT,
      sources: Object.values(ARTIFACT_PATHS).map((p) => ({ path: p, present: false })),
    };
  }
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

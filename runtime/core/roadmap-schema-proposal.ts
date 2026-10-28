#!/usr/bin/env node
/**
 * roadmap-schema-proposal — the realizable, NON-MUTATING decomposition of `structured-roadmap-deps`. It produces an
 * authorization-READY PREVIEW of the structured-dependencies schema change to the GOVERNED runtime/governance/ROADMAP.json
 * WITHOUT writing it (ROADMAP.json is a protected path; the actual amendment is owner-authorization-gated).
 *
 * It reads the live roadmap + the NON-protected companion docs/odg/roadmap-dependencies.json (whose edges each carry a
 * cited provenance), proposes `dependsOn: string[]` on each mission, and VALIDATES the proposal with ODG5 dep-planner
 * (acyclic + layerable) — a 3rd real dep-planner consumer. Fail-closed: unknown references or a cycle ⇒ non-VALID
 * verdict. No edge without a provenance citation is ever proposed (no fabricated dependencies).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const DEP = require("./dep-planner.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }

/** provenanceKey(dependent, dep): the companion's provenance map key convention. */
function provenanceKey(dependent: string, dep: string): string { return `${dependent}<-${dep}`; }

/**
 * buildProposal({ roadmap, deps }): pure. roadmap = { missions:[{id,...}] }; deps = { dependencies:{id:[...]}, provenance:{} }.
 * Returns { verdict, proposed, edgesApplied, unknownRefs, uncitedEdges, planError, layers, diff }.
 * verdict = VALID | INVALID_REFERENCES | UNCITED_EDGE | CYCLE_OR_PLAN_ERROR | INVALID_INPUT.
 */
function buildProposal(input: any = {}): any {
  const roadmap = input.roadmap;
  const deps = input.deps;
  if (!isObj(roadmap) || !Array.isArray(roadmap.missions) || roadmap.missions.length === 0) return { verdict: "INVALID_INPUT", reason: "roadmap.missions[] required" };
  if (!isObj(deps) || !isObj(deps.dependencies)) return { verdict: "INVALID_INPUT", reason: "deps.dependencies{} required" };

  const ids = roadmap.missions.map((m: any) => m.id);
  const idset = new Set(ids);
  const depMap: Record<string, string[]> = deps.dependencies;
  const provenance = isObj(deps.provenance) ? deps.provenance : {};

  // (1) every edge must reference real roadmap missions.
  const unknownRefs: any[] = [];
  for (const [dependent, arr] of Object.entries(depMap)) {
    if (!idset.has(dependent)) unknownRefs.push({ mission: dependent, issue: "dependent not in roadmap" });
    for (const d of (Array.isArray(arr) ? arr : [])) if (!idset.has(d)) unknownRefs.push({ mission: dependent, dep: d, issue: "dep not in roadmap" });
  }
  // (2) every edge must carry a cited provenance (no fabricated dependency ever proposed).
  const uncitedEdges: string[] = [];
  for (const [dependent, arr] of Object.entries(depMap)) {
    for (const d of (Array.isArray(arr) ? arr : [])) {
      const cite = provenance[provenanceKey(dependent, d)];
      if (!(typeof cite === "string" && cite.trim().length > 0)) uncitedEdges.push(provenanceKey(dependent, d));
    }
  }
  // (3) propose dependsOn[] on each mission and validate acyclic/layerable via dep-planner.
  const proposedMissions = roadmap.missions.map((m: any) => ({ ...m, dependsOn: Array.isArray(depMap[m.id]) ? depMap[m.id] : [] }));
  const work = proposedMissions.map((m: any) => ({ id: m.id, deps: (m.dependsOn || []).filter((d: string) => idset.has(d)) }));
  let layers: string[][] = []; let planError: string | null = null;
  try { layers = DEP.planLayers(work); } catch (e: any) { planError = (e && e.message) || String(e); }

  const edgesApplied = Object.values(depMap).reduce((n: number, a: any) => n + (Array.isArray(a) ? a.length : 0), 0);
  const diff = proposedMissions.filter((m: any) => (m.dependsOn || []).length > 0).map((m: any) => ({ mission: m.id, addsDependsOn: m.dependsOn }));

  let verdict = "VALID";
  if (unknownRefs.length) verdict = "INVALID_REFERENCES";
  else if (uncitedEdges.length) verdict = "UNCITED_EDGE";
  else if (planError) verdict = "CYCLE_OR_PLAN_ERROR";

  const proposed = {
    "//": "PROPOSED PREVIEW — NOT the governed file. Each mission gains a structured dependsOn[] sourced (with citation) from docs/odg/roadmap-dependencies.json. Applying this to runtime/governance/ROADMAP.json is owner-authorization-gated.",
    schemaChange: "add optional `dependsOn: string[]` to each roadmap mission",
    missions: proposedMissions,
  };
  return { verdict, proposed, edgesApplied, unknownRefs, uncitedEdges, planError, layers, diff };
}

/** proposeFromRepo(repoRoot?): read the live governed roadmap + companion and build the proposal. */
function proposeFromRepo(repoRoot: string = process.cwd()): any {
  const roadmap = readJson(path.join(repoRoot, "runtime", "governance", "ROADMAP.json"));
  const deps = readJson(path.join(repoRoot, "docs", "odg", "roadmap-dependencies.json"));
  if (!roadmap) return { verdict: "INVALID_INPUT", reason: "governed ROADMAP.json not readable" };
  if (!deps) return { verdict: "INVALID_INPUT", reason: "companion roadmap-dependencies.json not readable" };
  // normalise: roadmap may store missions under .missions
  const normalized = Array.isArray(roadmap.missions) ? roadmap : { missions: roadmap.roadmap || [] };
  const r = buildProposal({ roadmap: normalized, deps });
  return { ...r, missionCount: normalized.missions.length, depsVersion: deps.version || null };
}

export { provenanceKey, buildProposal, proposeFromRepo };
module.exports = { provenanceKey, buildProposal, proposeFromRepo };

if (require.main === module) {
  process.stdout.write(JSON.stringify(proposeFromRepo(), null, 2) + "\n");
}

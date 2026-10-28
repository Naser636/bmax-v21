#!/usr/bin/env node
/**
 * roadmap-dep-check — Phase B: the first REAL consumer of ODG5 `dep-planner` (was orphan). It validates that the
 * governed `runtime/governance/ROADMAP.json` mission ORDER is consistent with the declared inter-mission dependencies,
 * using `dep-planner.planLayers` (topological layering; throws on cycle / missing dep). The dependency edges come from
 * the NON-PROTECTED companion `docs/odg/roadmap-dependencies.json` (structured encoding of the prose deps in the mission
 * contracts) — this NEVER modifies the protected ROADMAP.json. Read-only; fail-closed.
 *
 * Verdict:
 *   OK                — every dependency edge resolves, no cycle, and each mission appears AFTER all its deps in the roadmap order.
 *   ORDER_VIOLATION   — a mission is listed before a dependency it requires.
 *   CYCLE / UNKNOWN_DEPENDENCY / DUPLICATE — surfaced from dep-planner (fail-closed).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const DEP = require("./dep-planner.js");

function readJsonSafe(file: string): any { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }

/**
 * checkRoadmapOrder({ roadmap, deps }): pure validator. roadmap = ROADMAP.json object; deps = {dependencies:{id:[...]}}.
 * Returns { verdict, layers?, violations?, reason? }.
 */
function checkRoadmapOrder(input: any = {}): any {
  const roadmap = input.roadmap;
  const depsDoc = input.deps || { dependencies: {} };
  if (!roadmap || !Array.isArray(roadmap.missions)) return { verdict: "INVALID_INPUT", reason: "roadmap.missions[] required" };
  const order: string[] = roadmap.missions.map((m: any) => m && m.id).filter((x: any) => typeof x === "string");
  const orderIndex = new Map<string, number>(); order.forEach((id, i) => orderIndex.set(id, i));
  const depMap: Record<string, string[]> = (depsDoc && typeof depsDoc.dependencies === "object" && depsDoc.dependencies) || {};

  // Build dep-planner WorkItems from the roadmap ids + declared deps (deps restricted to ids present in the roadmap).
  const items = order.map((id) => ({ id, deps: (Array.isArray(depMap[id]) ? depMap[id] : []).filter((d) => orderIndex.has(d)) }));
  let layers: string[][];
  try { layers = DEP.planLayers(items); }
  catch (e: any) {
    const msg = (e && e.message) || String(e);
    const verdict = /CYCLE/i.test(msg) ? "CYCLE" : /UNKNOWN_DEPENDENCY/i.test(msg) ? "UNKNOWN_DEPENDENCY" : /DUPLICATE/i.test(msg) ? "DUPLICATE" : "PLAN_ERROR";
    return { verdict, reason: msg };
  }
  // ORDER check: every dependency must appear BEFORE its dependent in the roadmap's listed order.
  const violations: any[] = [];
  for (const [id, ds] of Object.entries(depMap)) {
    if (!orderIndex.has(id)) continue;
    for (const d of (Array.isArray(ds) ? ds : [])) {
      if (!orderIndex.has(d)) { violations.push({ id, dep: d, kind: "DEP_NOT_IN_ROADMAP" }); continue; }
      if ((orderIndex.get(d) as number) >= (orderIndex.get(id) as number)) violations.push({ id, dep: d, kind: "ORDER_VIOLATION", idPos: orderIndex.get(id), depPos: orderIndex.get(d) });
    }
  }
  return violations.length === 0
    ? { verdict: "OK", layers, missions: order.length, note: "governed roadmap order is dependency-consistent (dep-planner layering + order check)" }
    : { verdict: "ORDER_VIOLATION", layers, violations };
}

/** checkCanonicalRoadmap(cwd?): read the real ROADMAP.json + companion deps and validate. */
function checkCanonicalRoadmap(cwd: string = process.cwd()): any {
  const roadmap = readJsonSafe(path.join(cwd, "runtime", "governance", "ROADMAP.json"));
  const deps = readJsonSafe(path.join(cwd, "docs", "odg", "roadmap-dependencies.json")) || { dependencies: {} };
  if (!roadmap) return { verdict: "INVALID_INPUT", reason: "ROADMAP.json not readable" };
  return { ...checkRoadmapOrder({ roadmap, deps }), depsVersion: deps.version || null };
}

export { checkRoadmapOrder, checkCanonicalRoadmap };
module.exports = { checkRoadmapOrder, checkCanonicalRoadmap };

if (require.main === module) {
  process.stdout.write(JSON.stringify(checkCanonicalRoadmap(), null, 2) + "\n");
}

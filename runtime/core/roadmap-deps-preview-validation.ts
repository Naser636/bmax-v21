#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 18 (structured-roadmap-deps — non-contournement advance) — ROADMAP DEPENDENCY PREVIEW VALIDATION. PURE given
 * injected inputs. The structured roadmap dependencies live as a PREVIEW in docs/odg/roadmap-dependencies.json; the
 * blocker is writing them into the PROTECTED runtime/governance/ROADMAP.json — an OWNER-GATED write that is NOT
 * performed here. This validates the preview READ-ONLY so it is PROVEN ready-to-apply (de-risking the owner's write):
 * every referenced mission id exists in ROADMAP.json, there is no self-dependency, and the dependency graph is ACYCLIC
 * (via dep-planner.planLayers, which throws on a cycle — no second graph engine). It writes nothing to any protected
 * path. Fail-closed: an unknown ref, a self-dep, or a cycle ⇒ invalid. Dual export.
 */

const fs = require("fs");
const DEP = require("./dep-planner");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

function readJson(path: string): any { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return null; } }

/** loadPreview(opts?) -> the dependencies map { from: [to...] } from the preview file (READ-ONLY). */
function loadPreview(opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (isObj(o.preview)) return o.preview;
  const d = readJson(o.previewPath || "docs/odg/roadmap-dependencies.json");
  return isObj(d) && isObj(d.dependencies) ? d.dependencies : {};
}

/** roadmapMissionIds(opts?) -> Set of mission ids from ROADMAP.json (READ-ONLY; the protected file is never written). */
function roadmapMissionIds(opts?: any): Set<string> {
  const o = isObj(opts) ? opts : {};
  if (Array.isArray(o.missionIds)) return new Set(o.missionIds);
  const r = readJson(o.roadmapPath || "runtime/governance/ROADMAP.json");
  const missions = r && Array.isArray(r.missions) ? r.missions : [];
  return new Set(missions.map((m: any) => m && m.id).filter((x: any) => typeof x === "string"));
}

/** validatePreview(deps, missionIds) -> { valid, acyclic, unknownRefs, selfDeps, edges }. Fail-closed. */
function validatePreview(deps: any, missionIds: Set<string>): any {
  const d = isObj(deps) ? deps : {};
  const ids = missionIds instanceof Set ? missionIds : new Set();
  const unknownRefs: string[] = []; const selfDeps: string[] = []; let edges = 0;
  const depsOf: Record<string, string[]> = {};
  const allNodes = new Set<string>();
  for (const from of Object.keys(d)) {
    if (!ids.has(from)) unknownRefs.push(from);
    allNodes.add(from);
    const tos = arr(d[from]).filter((x) => typeof x === "string");
    depsOf[from] = tos;
    for (const to of tos) {
      edges++; allNodes.add(to);
      if (!ids.has(to)) unknownRefs.push(to);
      if (to === from) selfDeps.push(from);
    }
  }
  // include EVERY node (a to-only node has no deps) so planLayers sees a complete graph (else it throws on a missing node).
  const items = Array.from(allNodes).map((id) => ({ id, deps: depsOf[id] || [] }));
  // acyclic check via dep-planner (throws on a cycle). Only run when refs + no self-dep are clean.
  let acyclic = true;
  try { DEP.planLayers(items); } catch { acyclic = false; }
  const valid = unknownRefs.length === 0 && selfDeps.length === 0 && acyclic;
  return Object.freeze({
    valid, acyclic, edges, items: items.length,
    unknownRefs: Object.freeze(Array.from(new Set(unknownRefs))), selfDeps: Object.freeze(Array.from(new Set(selfDeps))),
    note: "READ-ONLY preview validation; the protected ROADMAP.json write stays owner-gated. valid ⇒ the preview is proven ready-to-apply",
  });
}

/** validateLive(opts?) -> validatePreview on the REAL preview + ROADMAP.json (no protected write). */
function validateLive(opts?: any): any { return validatePreview(loadPreview(opts), roadmapMissionIds(opts)); }

const ROADMAP_DEPS_PREVIEW_CONTRACT = Object.freeze({
  id: "V124-ROADMAP-DEPS-PREVIEW-VALIDATION",
  source: "SÉRIE 18 — validate the structured-roadmap-deps PREVIEW read-only (ready-to-apply proof; protected write owner-gated)",
  reuses: Object.freeze(["dep-planner.planLayers (acyclic check, no second graph engine)"]),
  notAuthority: "a read-only preview validator; it writes NOTHING to the protected runtime/governance/ROADMAP.json",
  invariants: Object.freeze([
    "READ-ONLY: never writes the protected ROADMAP.json (the write stays owner-gated — no permission is bypassed)",
    "valid ⇒ every referenced mission id exists + no self-dependency + the graph is ACYCLIC (via dep-planner)",
    "fail-closed: an unknown ref, a self-dep, or a cycle ⇒ invalid",
    "proves the preview is ready-to-apply, de-risking the owner's eventual protected write",
  ]),
});

module.exports = { loadPreview, roadmapMissionIds, validatePreview, validateLive, ROADMAP_DEPS_PREVIEW_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...ROADMAP_DEPS_PREVIEW_CONTRACT, live: validateLive() }, null, 2) + "\n"); }

export {};

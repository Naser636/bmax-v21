#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 1 / M-CH1-01 (Central Intelligence — Capability Graph, program §15 registry #3). PURE, deterministic. Gives
 * ODG a self-understanding of its OWN capabilities by deriving a capability graph from the canonical register
 * (closure-register) + the program manifest: each built capability → its program, maturity (L0-L5), dependencies and
 * dependents; plus the gaps (PROPOSED missions not yet built). Maturity is derived HONESTLY from the register status +
 * evidence: an ACCEPTED+evidence item is L2_INTEGRATED (built/tested/merged) — NOT L3_VALIDATED unless independently
 * validated; proposed/absent ⇒ L0. Fail-closed: an ACCEPTED item WITHOUT evidence is EXCLUDED (not a real capability).
 * It reads the register/manifest (injected); it builds no concurrent registry and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function hasEvidence(x: any): boolean { return isObj(x) && typeof x.evidence === "string" && x.evidence.length > 0; }

const MATURITY = Object.freeze(["L0_ABSENT", "L1_PROTOTYPE", "L2_INTEGRATED", "L3_VALIDATED", "L4_AUTONOMOUS", "L5_ADAPTIVE"]);

/** maturityOf(item) -> honest maturity from register status + evidence. ACCEPTED+evidence ⇒ L2 (not L3 unless VALIDATED). */
function maturityOf(item: any): string {
  const i = isObj(item) ? item : {};
  if (i.status === "VALIDATED") return "L3_VALIDATED";
  if (i.status === "ACCEPTED") return hasEvidence(i) ? "L2_INTEGRATED" : "L0_ABSENT";   // no evidence ⇒ not a real capability
  if (i.status === "IN_PROGRESS") return "L1_PROTOTYPE";
  return "L0_ABSENT";   // PROPOSED / BLOCKED / DEFERRED / missing
}

/**
 * buildCapabilityMap({ registerItems, missions }) -> { capabilities, byProgram, byMaturity, edges, gaps, counts }.
 * capabilities = register items that are a REAL capability (ACCEPTED + evidence, or VALIDATED). gaps = PROPOSED missions.
 */
function buildCapabilityMap(input: any): any {
  const o = isObj(input) ? input : {};
  const items = arr(o.registerItems).filter(isObj);
  const real = items.filter((i) => (i.status === "ACCEPTED" && hasEvidence(i)) || i.status === "VALIDATED");
  const ids = new Set(real.map((i) => i.id));

  // dependents (reverse edges) from deps.
  const dependents: Record<string, string[]> = {};
  for (const i of real) for (const dep of arr(i.deps)) { (dependents[String(dep)] = dependents[String(dep)] || []).push(i.id); }

  const capabilities = real.map((i) => Object.freeze({
    id: i.id, program: i.program || "?", maturity: maturityOf(i),
    deps: Object.freeze(arr(i.deps).filter((d) => ids.has(d))),   // only intra-capability deps
    dependents: Object.freeze((dependents[i.id] || []).sort()),
  }));

  const byProgram: Record<string, number> = {}; const byMaturity: Record<string, number> = {};
  for (const c of capabilities) { byProgram[c.program] = (byProgram[c.program] || 0) + 1; byMaturity[c.maturity] = (byMaturity[c.maturity] || 0) + 1; }
  const edges = capabilities.flatMap((c) => c.deps.map((d: any) => Object.freeze({ from: d, to: c.id })));
  const gaps = arr(o.missions).filter((m) => isObj(m) && m.status === "PROPOSED").map((m) => Object.freeze({ id: m.id, program: m.program, phase: m.phase }));

  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    byProgram: Object.freeze(byProgram), byMaturity: Object.freeze(byMaturity),
    edges: Object.freeze(edges), gaps: Object.freeze(gaps),
    counts: Object.freeze({ capabilities: capabilities.length, gaps: gaps.length, validated: capabilities.filter((c) => c.maturity === "L3_VALIDATED").length }),
    note: "self-capability graph from the register+manifest; ACCEPTED+evidence ⇒ L2_INTEGRATED (honest — not L3 without independent validation); an ACCEPTED item without evidence is excluded (not a real capability)",
  });
}

/** queryCapability(map, id) -> { capability, dependencies, dependents } or null. */
function queryCapability(map: any, id: any): any {
  const caps = isObj(map) ? arr(map.capabilities) : [];
  const c = caps.find((x) => x.id === id);
  if (!c) return null;
  return Object.freeze({ capability: c, dependencies: c.deps, dependents: c.dependents });
}

const CAPABILITY_MAP_CONTRACT = Object.freeze({
  id: "V5-CAPABILITY-MAP",
  source: "ODG Master program §15 / PHASE-1 M-CH1-01 — Central Intelligence Capability Graph",
  maturityScale: MATURITY,
  reuses: Object.freeze(["closure-register (ACCEPTED capabilities)", "master-program manifest (PROPOSED gaps)", "no concurrent registry"]),
  notAuthority: "a read-only self-capability graph; it builds no concurrent registry and grants no authority",
  invariants: Object.freeze([
    "a REAL capability is an ACCEPTED+evidence item (L2_INTEGRATED) or a VALIDATED item (L3_VALIDATED)",
    "maturity is honest: ACCEPTED+evidence ⇒ L2_INTEGRATED, NOT L3_VALIDATED without independent validation",
    "an ACCEPTED item WITHOUT evidence is EXCLUDED — not counted as a real capability (fail-closed)",
    "gaps = PROPOSED manifest missions (not yet built); dependency edges + dependents are derived from deps",
    "pure/deterministic: register+manifest in → graph out; no clock/random/network; no concurrent registry",
  ]),
});

module.exports = { MATURITY, maturityOf, buildCapabilityMap, queryCapability, CAPABILITY_MAP_CONTRACT };

if (require.main === module) {
  const reg = require("../../docs/odg/closure-register.json");
  const m = buildCapabilityMap({ registerItems: reg.items });
  process.stdout.write(JSON.stringify({ ...CAPABILITY_MAP_CONTRACT, demo: { counts: m.counts, byMaturity: m.byMaturity } }, null, 2) + "\n");
}

export {};

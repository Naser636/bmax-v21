#!/usr/bin/env node
"use strict";

/*
 * capability-attribution (mission M1, Phase 2/3) — PURE, deterministic qualifier + integrity validator that attaches each
 * ODG capability to the 9 canonical PRIMITIVES and the 15 MÉTIERS, with a ladder status, and FAILS CLOSED on any gap. It
 * does NOT create a parallel registry: it is a validation/qualification layer over an attribution map whose every entry
 * cites a real module (the map lives in docs/odg/V108_CAPABILITY_ATTRIBUTION.json and is anchored to runtime/core/*). No
 * I/O, no clock, no network.
 *
 * attribute(capabilities, opts?) → frozen {
 *   byCapability:[{id, primitives[], metiers[], status, module, shared}],
 *   byPrimitive:{<PRIM>: string[]}, byMetier:{<Pn>: string[]},
 *   integrity:{ ok, unattributed[], unknownPrimitive[], unknownMetier[], invalidStatus[], missingModule[], orphanPrimitives[], criticalSingletons[] },
 *   stats
 * }
 * Fail-closed: a capability with NO primitive, an unknown primitive/métier, an invalid status, or a missing module anchor
 * makes integrity.ok = false. "criticalSingletons" = primitives covered by exactly one capability (single point of failure).
 */

const PRIMITIVES = Object.freeze(["IDENTITY", "STATE", "CONTRACT", "POLICY", "RESOLVER", "EXECUTOR", "EVIDENCE", "RECOVERY", "ALLOCATOR"]);
const METIERS = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15"]);
const LADDER = Object.freeze(["ABSENT", "PRESENT", "WIRED", "TESTED", "VALIDATED", "ACTIVE_IN_PRODUCTION", "SIMULATED", "NOT_MEASURED"]);

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arrStr(v: any): string[] { return Array.isArray(v) ? v.filter(isStr) : []; }
function uniqSorted(xs: string[]): string[] { return Array.from(new Set(xs)).sort(); }

function attribute(capabilities: any, opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  const prims: string[] = Array.isArray(o.primitives) && o.primitives.length ? o.primitives.filter(isStr) : (PRIMITIVES as any);
  const mets: string[] = Array.isArray(o.metiers) && o.metiers.length ? o.metiers.filter(isStr) : (METIERS as any);
  const primSet = new Set(prims); const metSet = new Set(mets);
  const caps: any[] = Array.isArray(capabilities) ? capabilities : [];

  const unattributed: string[] = [], unknownPrimitive: string[] = [], unknownMetier: string[] = [], invalidStatus: string[] = [], missingModule: string[] = [];
  const byPrimitive: Record<string, string[]> = {}; prims.forEach((p) => (byPrimitive[p] = []));
  const byMetier: Record<string, string[]> = {}; mets.forEach((m) => (byMetier[m] = []));
  const seen = new Set<string>();

  const byCapability = caps.map((c) => {
    const id = c && isStr(c.id) ? c.id : "<invalid>";
    if (seen.has(id)) unattributed.push(id + " (DUPLICATE)"); else seen.add(id);
    const cPrims = uniqSorted(arrStr(c && c.primitives));
    const cMets = uniqSorted(arrStr(c && c.metiers));
    const status = c && isStr(c.status) ? c.status : "";
    const module = c && isStr(c.module) ? c.module : "";
    if (cPrims.length === 0) unattributed.push(id);
    cPrims.forEach((p) => { if (!primSet.has(p)) unknownPrimitive.push(id + "→" + p); else byPrimitive[p].push(id); });
    cMets.forEach((m) => { if (!metSet.has(m)) unknownMetier.push(id + "→" + m); else byMetier[m].push(id); });
    if (!LADDER.includes(status)) invalidStatus.push(id + ":" + (status || "<none>"));
    if (!module) missingModule.push(id);
    return Object.freeze({ id, primitives: Object.freeze(cPrims), metiers: Object.freeze(cMets), status, module, shared: cMets.length > 1 });
  }).sort((a: any, b: any) => a.id.localeCompare(b.id));

  prims.forEach((p) => (byPrimitive[p] = Object.freeze(uniqSorted(byPrimitive[p])) as any));
  mets.forEach((m) => (byMetier[m] = Object.freeze(uniqSorted(byMetier[m])) as any));
  const orphanPrimitives = prims.filter((p) => byPrimitive[p].length === 0);
  const criticalSingletons = prims.filter((p) => byPrimitive[p].length === 1);

  const ok = unattributed.length === 0 && unknownPrimitive.length === 0 && unknownMetier.length === 0 && invalidStatus.length === 0 && missingModule.length === 0 && orphanPrimitives.length === 0;
  return Object.freeze({
    byCapability: Object.freeze(byCapability),
    byPrimitive: Object.freeze(byPrimitive),
    byMetier: Object.freeze(byMetier),
    integrity: Object.freeze({ ok, unattributed: Object.freeze(uniqSorted(unattributed)), unknownPrimitive: Object.freeze(uniqSorted(unknownPrimitive)), unknownMetier: Object.freeze(uniqSorted(unknownMetier)), invalidStatus: Object.freeze(uniqSorted(invalidStatus)), missingModule: Object.freeze(uniqSorted(missingModule)), orphanPrimitives: Object.freeze(orphanPrimitives), criticalSingletons: Object.freeze(criticalSingletons) }),
    stats: Object.freeze({ capabilities: byCapability.length, primitivesCovered: prims.length - orphanPrimitives.length, metiersCovered: mets.filter((m) => byMetier[m].length > 0).length, sharedCapabilities: byCapability.filter((c: any) => c.shared).length }),
  });
}

module.exports = { attribute, PRIMITIVES, METIERS, LADDER };
export {};

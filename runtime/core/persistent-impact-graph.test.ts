#!/usr/bin/env node
"use strict";
const assert = require("assert");
const G = require("./persistent-impact-graph");
const fs = require("fs");
const path = require("path");
const os = require("os");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E WAVE-2 / PERSISTENT IMPACT GRAPH");
const graph = { modules: ["a", "b", "c", "d"], consumers: { a: ["b"], b: ["c"], c: ["d"] }, deps: {} };
const files = { "a.ts": "h1", "b.ts": "h2", "c.ts": "h3", "d.ts": "h4" };
const digest = G.sourceDigestOf(files);
const stamped = G.stampGraph(graph, { sourceDigest: digest, builtAt: 1 });

// transitive deps: changing 'a' impacts a,b,c,d (a->b->c->d consumer chain).
{
  const r = G.impactWithValidity(stamped, "a", digest);
  check(r.valid === true && r.mode === "TARGETED", "fresh graph + known module ⇒ TARGETED valid");
  check(JSON.stringify(r.impacted) === JSON.stringify(["a", "b", "c", "d"]), "transitive consumers a->b->c->d");
}
// invalidation: a source change ⇒ STALE ⇒ FULL.
{
  const changedDigest = G.sourceDigestOf({ ...files, "a.ts": "CHANGED" });
  const r = G.impactWithValidity(stamped, "a", changedDigest);
  check(r.valid === false && r.mode === "FULL" && /STALE/.test(r.reason), "source change ⇒ STALE ⇒ FULL");
  check(changedDigest !== digest, "any file change ⇒ different source digest");
}
// unknown module ⇒ FULL.
check(G.impactWithValidity(stamped, "zzz", digest).mode === "FULL", "unknown module ⇒ FULL (fail-closed)");
// missing/tampered stamp ⇒ FULL.
check(G.impactWithValidity(null, "a", digest).mode === "FULL", "missing graph ⇒ FULL");
check(G.impactWithValidity({ schema: "wrong" }, "a", digest).mode === "FULL", "tampered schema ⇒ FULL");
// cycle-safe: a<->b cycle does not loop forever.
{
  const cyc = G.stampGraph({ modules: ["a", "b"], consumers: { a: ["b"], b: ["a"] } }, { sourceDigest: "d", builtAt: 1 });
  const r = G.transitiveConsumers(cyc, "a");
  check(JSON.stringify(r) === JSON.stringify(["a", "b"]), "cycle a<->b handled (no infinite loop)");
}
// REAL persistence: save then load round-trips; load of a stale file still needs digest revalidation.
{
  const p = path.join(os.tmpdir(), "odg-pig-" + process.pid + ".json");
  check(G.saveGraph(p, stamped) === true, "saveGraph writes the stamped graph");
  const loaded = G.loadGraph(p);
  check(loaded && loaded.schema === G.SCHEMA && JSON.stringify(loaded.modules) === JSON.stringify(["a", "b", "c", "d"]), "loadGraph round-trips (real persistence)");
  check(G.impactWithValidity(loaded, "a", digest).valid === true, "loaded graph valid when source unchanged");
  check(G.impactWithValidity(loaded, "a", "OTHER").mode === "FULL", "loaded graph STALE after source change ⇒ FULL");
  try { fs.unlinkSync(p); } catch (e) {}
}
// empty source ⇒ null digest (cannot validate ⇒ callers widen to FULL).
check(G.sourceDigestOf({}) === null, "empty source ⇒ null digest");
check(G.PERSISTENT_IMPACT_GRAPH_CONTRACT.invariants.some((i: any) => /STALE ⇒ rebuild/i.test(i)), "contract: stale ⇒ rebuild");
console.log(failures === 0 ? "ALL PASS — V5-E WAVE-2 PERSISTENT IMPACT GRAPH" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};

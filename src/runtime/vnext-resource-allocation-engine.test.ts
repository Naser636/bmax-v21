#!/usr/bin/env node
"use strict";
/* V290 Lot 2.C — DIRECT contract tests for the REAL ResourceAllocationEngine (src/runtime/vnext). Complements the
 * existing vnext-resource-universal test (localFirst / strategy / allowedKinds / offlineOnly / blocked) by covering the
 * UNCOVERED contract paths: requireIds + excludeIds constraints, localFirst:false, multi-preferred strategy ordering,
 * strategy-preferred-but-blocked fall-through, no-eligible vs no-grantable reasons, considered-evidence completeness,
 * stable tie-break, empty resources, and determinism. Exercises the real class (no mock of the engine). The engine
 * SELECTS a resource per request; it is COMPLEMENTARY to p12-weighted-fair-share (multi-tenant admission over rounds),
 * NOT a duplicate — so no p12 interaction is forced here (different scope, different contract). */
import { ResourceAllocationEngine } from "./vnext/resource-allocation-engine";

let f = 0; function check(n: string, c: boolean): void { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

/** minimal real Resource surface the engine reads: { id, kind, allocate(req) -> { granted, reason } }. */
function res(id: string, kind: string, granted = true, reason = "ok"): any {
  return { id, kind, allocate(_req: any) { return { granted, reason: granted ? "available" : reason }; } };
}

function main() {
  const engine = new ResourceAllocationEngine();
  const req = { mission: "M1" };

  const cand = (d: any, id: string): any => d.considered.find((c: any) => c.resource.id === id) || {};
  // requireIds: only listed ids are eligible.
  const dReq = engine.allocate({ request: req, resources: [res("a", "LOCAL"), res("b", "PROVIDER")], constraints: { requireIds: ["b"] } } as any);
  check("requireIds ⇒ only the required id is eligible + selected; others ruled out with reason", dReq.selectedResourceId === "b" && cand(dReq, "a").eligible === false && /not in requireIds/.test(String(cand(dReq, "a").ineligibleReason)));
  // requireIds but the required resource is blocked ⇒ no grantable ⇒ null.
  const dReqBlocked = engine.allocate({ request: req, resources: [res("a", "LOCAL"), res("b", "PROVIDER", false, "down")], constraints: { requireIds: ["b"] } } as any);
  check("requireIds target blocked ⇒ selected null, 'could not be granted' reason", dReqBlocked.selected === null && /could be granted/.test(dReqBlocked.reason));

  // excludeIds: an excluded id is never selected even if it would otherwise win.
  const dExcl = engine.allocate({ request: req, resources: [res("x", "LOCAL"), res("y", "LOCAL")], constraints: { excludeIds: ["x"] } } as any);
  check("excludeIds ⇒ excluded id not selected (the other eligible one wins)", dExcl.selectedResourceId === "y" && cand(dExcl, "x").eligible === false);

  // localFirst:false ⇒ no LOCAL preference; declaration order decides (PROVIDER declared first wins).
  const dNoLocal = engine.allocate({ request: req, resources: [res("prov", "PROVIDER"), res("loc", "LOCAL")], policy: { localFirst: false } } as any);
  check("localFirst:false ⇒ LOCAL not preferred; stable declaration order wins (PROVIDER first)", dNoLocal.selectedResourceId === "prov");
  // default (localFirst) ⇒ LOCAL wins regardless of declaration order.
  const dLocal = engine.allocate({ request: req, resources: [res("prov", "PROVIDER"), res("loc", "LOCAL")] } as any);
  check("default localFirst ⇒ LOCAL wins over PROVIDER regardless of order", dLocal.selectedResourceId === "loc");

  // strategy multi-preferred ordering: preferred list index decides; strategy dominates localFirst.
  const dPref = engine.allocate({ request: req, resources: [res("a", "LOCAL"), res("b", "PROVIDER"), res("c", "PROVIDER")], strategy: { preferredResourceIds: ["c", "b"] } } as any);
  check("strategy preferredResourceIds order decides (c before b) and dominates localFirst", dPref.selectedResourceId === "c");
  // strategy-preferred but blocked ⇒ fall through to the next grantable candidate.
  const dPrefBlocked = engine.allocate({ request: req, resources: [res("a", "LOCAL"), res("c", "PROVIDER", false, "down")], strategy: { preferredResourceIds: ["c"] } } as any);
  check("strategy-preferred but blocked ⇒ falls through to the next GRANTABLE candidate", dPrefBlocked.selectedResourceId === "a");

  // no-eligible (constraints rule everyone out) vs no-grantable (eligible but none granted) — distinct reasons.
  const dNoneEligible = engine.allocate({ request: req, resources: [res("a", "LOCAL")], constraints: { allowedKinds: ["PROVIDER"] } } as any);
  check("none eligible ⇒ null + 'no eligible resource after applying constraints/policy'", dNoneEligible.selected === null && /after applying constraints\/policy/.test(dNoneEligible.reason));
  const dNoneGrant = engine.allocate({ request: req, resources: [res("a", "LOCAL", false, "down")] } as any);
  check("eligible but none granted ⇒ null + 'could be granted' reason (distinct from no-eligible)", dNoneGrant.selected === null && /could be granted/.test(dNoneGrant.reason));

  // considered[] is complete evidence (every resource appears, with its allocate verdict).
  const dEvidence = engine.allocate({ request: req, resources: [res("a", "LOCAL"), res("b", "PROVIDER", false, "x")] } as any);
  check("considered[] is complete evidence: every resource + its allocation verdict", dEvidence.considered.length === 2 && dEvidence.considered.every((c: any) => typeof c.allocation.granted === "boolean"));

  // stable tie-break: two equal-rank LOCAL resources ⇒ declaration order preserved (first declared wins).
  const dTie = engine.allocate({ request: req, resources: [res("first", "LOCAL"), res("second", "LOCAL")] } as any);
  check("equal-rank tie ⇒ stable declaration order (first declared wins)", dTie.selectedResourceId === "first");

  // empty resources ⇒ graceful null (no throw), considered [].
  const dEmpty = engine.allocate({ request: req, resources: [] } as any);
  check("empty resources ⇒ selected null, considered [], no throw", dEmpty.selected === null && dEmpty.considered.length === 0 && /no eligible/.test(dEmpty.reason));

  // determinism: identical input ⇒ byte-identical decision.
  const base = { request: req, resources: [res("a", "LOCAL"), res("b", "PROVIDER")], strategy: { preferredResourceIds: ["b"] } } as any;
  check("deterministic: identical input ⇒ byte-identical decision", JSON.stringify(engine.allocate(base)) === JSON.stringify(engine.allocate(base)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — vnext ResourceAllocationEngine (V290 Lot 2.C: requireIds/excludeIds constraints, localFirst:false, multi-preferred strategy ordering + blocked fall-through, no-eligible vs no-grantable reasons, considered-evidence, stable tie-break, empty resources, determinism; real class; COMPLEMENTARY to p12-fair-share, not a duplicate)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

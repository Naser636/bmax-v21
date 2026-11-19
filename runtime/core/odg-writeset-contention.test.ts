#!/usr/bin/env node
"use strict";
/* Tests for odg-writeset-contention (write-set overlap within parallel layers). PURE. Hand-verified + invariants. */
const M = require("./odg-writeset-contention.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const J = JSON.stringify;

function main(): void {
  const missions = [
    { id: "m1", authorizedPaths: ["src/a"] },
    { id: "m2", authorizedPaths: ["src/b"] },
    { id: "m3", authorizedPaths: ["src/a/x.ts"] }, // conflicts m1 (ancestor containment)
    { id: "m4" },                                   // UNKNOWN write-set
    { id: "m5", readOnly: true },                   // writes nothing
  ];
  const r = M.computeLayerContention([["m1", "m2", "m3"], ["m4", "m5"]], missions);
  const L0 = r.layers[0], L1 = r.layers[1];

  // path-overlap semantics
  check("equal path conflicts", M.pathsConflict("src/a", "src/a") === true);
  check("directory ancestor conflicts (src/a ⊃ src/a/x.ts)", M.pathsConflict("src/a", "src/a/x.ts") === true);
  check("sibling prefix does NOT conflict (src/a vs src/ab)", M.pathsConflict("src/a", "src/ab") === false);
  check("disjoint dirs do not conflict", M.pathsConflict("src/a", "src/b") === false);
  // NORMALISATION + repo-root (regression: these were fail-OPENs — a whole-tree/alias path deemed isolated)
  check("repo root '.' conflicts with everything (fail-closed)", M.pathsConflict(".", "src/a") === true);
  check("leading-slash alias /src/a ≡ src/a", M.pathsConflict("/src/a", "src/a") === true);
  check("'..' segments resolved (src/foo/../shared ≡ src/shared)", M.pathsConflict("src/foo/../shared", "src/shared") === true);
  check("'..'-escape above root ⇒ root ⇒ conflicts all (fail-closed)", M.pathsConflict("../x", "src/a") === true);
  check("trailing slash normalised (src/a/ ⊃ src/a/x.ts)", M.pathsConflict("src/a/", "src/a/x.ts") === true);
  check("'.' path in a write-set makes the mission conflict with a sibling (not isolated)",
    M.computeLayerContention([["A", "B"]], [{ id: "A", authorizedPaths: ["."] }, { id: "B", authorizedPaths: ["src/a"] }]).layers[0].parallelSafe === false);
  check("non-string element in authorizedPaths ⇒ UNKNOWN (fail-closed)", M.writeSetOf({ authorizedPaths: [123] }).kind === "UNKNOWN");

  // layer 0: m1 vs m3 overlap; m2 disjoint
  check("L0 not parallel-safe", L0.parallelSafe === false && r.anyContention === true);
  check("L0 contention is exactly {m1,m3} WRITESET_OVERLAP", L0.contentions.length === 1 && L0.contentions[0].a === "m1" && L0.contentions[0].b === "m3" && L0.contentions[0].reason === "WRITESET_OVERLAP");
  check("L0 shared path names the overlap", L0.contentions[0].shared[0] === "src/a ↔ src/a/x.ts");
  // safe sub-waves: m2 joins m1 (disjoint), m3 serialized
  check("L0 subWaves = [[m1,m2],[m3]] (write-isolated within each)", J(L0.subWaves) === J([["m1", "m2"], ["m3"]]));
  // every pair within a sub-wave is genuinely non-conflicting (the safety invariant)
  check("every sub-wave is pairwise write-isolated", (() => {
    for (const layer of r.layers) for (const wave of layer.subWaves)
      for (let i = 0; i < wave.length; i++) for (let j = i + 1; j < wave.length; j++) {
        const sub = M.computeLayerContention([[wave[i], wave[j]]], missions);
        if (sub.layers[0].contentions.length !== 0) return false;
      }
    return true;
  })());

  // layer 1: UNKNOWN write-set conflicts EVERYTHING (fail-closed) — even a read-only mission
  check("L1 m4(UNKNOWN) conflicts m5(readOnly) — fail-closed", L1.contentions.length === 1 && L1.contentions[0].reason === "UNKNOWN_WRITESET");
  check("L1 subWaves serialize the unknown-write-set mission", J(L1.subWaves) === J([["m4"], ["m5"]]));

  // write-set resolution
  check("declared paths ⇒ KNOWN", M.writeSetOf({ id: "a", authorizedPaths: ["x"] }).kind === "KNOWN");
  check("no paths + not readOnly ⇒ UNKNOWN (fail-closed)", M.writeSetOf({ id: "a" }).kind === "UNKNOWN");
  check("empty paths ⇒ UNKNOWN (not KNOWN-empty)", M.writeSetOf({ id: "a", authorizedPaths: [] }).kind === "UNKNOWN");
  check("readOnly ⇒ READ_ONLY", M.writeSetOf({ id: "a", readOnly: true }).kind === "READ_ONLY");

  // two read-only (or two disjoint) run together; a fully-disjoint layer is parallel-safe
  const safe = M.computeLayerContention([["a", "b", "c"]], [
    { id: "a", authorizedPaths: ["p/1"] }, { id: "b", authorizedPaths: ["p/2"] }, { id: "c", readOnly: true },
  ]);
  check("fully-disjoint layer ⇒ parallelSafe, one sub-wave", safe.layers[0].parallelSafe === true && safe.layers[0].subWaves.length === 1 && safe.anyContention === false);

  // read-only vs read-only never conflicts
  check("read-only vs read-only disjoint", M.computeLayerContention([["a", "b"]], [{ id: "a", readOnly: true }, { id: "b", readOnly: true }]).anyContention === false);

  // mission referenced in a layer but absent from the mission list ⇒ UNKNOWN (fail-closed), not a crash
  check("unlisted mission id ⇒ treated UNKNOWN, conflicts", M.computeLayerContention([["a", "ghost"]], [{ id: "a", authorizedPaths: ["x"] }]).anyContention === true);

  // id-keyed object input accepted
  check("missions as id-keyed object accepted", M.computeLayerContention([["m1", "m2"]], { m1: missions[0], m2: missions[1] }).layers[0].parallelSafe === true);

  // determinism of pair order (i<j, stable)
  const multi = M.computeLayerContention([["z", "a", "m"]], [{ id: "z", authorizedPaths: ["s"] }, { id: "a", authorizedPaths: ["s"] }, { id: "m", authorizedPaths: ["s"] }]);
  check("all-overlap layer ⇒ C(3,2)=3 contentions, serialized to 3 sub-waves", multi.layers[0].contentions.length === 3 && multi.layers[0].subWaves.length === 3);
  check("contention pairs follow stable input order (z,a then z,m then a,m)", J(multi.layers[0].contentions.map((c: any) => [c.a, c.b])) === J([["z", "a"], ["z", "m"], ["a", "m"]]));

  // fail-closed inputs
  check("non-array layers ⇒ BAD_LAYERS", M.computeLayerContention("x", missions).code === "BAD_LAYERS");
  check("non-array-of-arrays layers ⇒ BAD_LAYERS", M.computeLayerContention(["m1"], missions).code === "BAD_LAYERS");
  check("bad missions ⇒ BAD_MISSIONS", M.computeLayerContention([["m1"]], 42).code === "BAD_MISSIONS");

  // honesty + determinism + frozen + contract
  check("note: dep-order ≠ write-set, unknown fail-closed, not provably-minimum", /INDEPENDENT IN DEPENDENCY-ORDER ≠ INDEPENDENT IN WRITE-SET/.test(r.note) && /fail-closed/.test(r.note) && /not provably-minimum/.test(r.note));
  check("deterministic", J(M.computeLayerContention([["m1", "m2", "m3"], ["m4", "m5"]], missions)) === J(r));
  check("frozen (result, layers, a layer, its subWaves, a contention)", Object.isFrozen(r) && Object.isFrozen(r.layers) && Object.isFrozen(L0) && Object.isFrozen(L0.subWaves) && Object.isFrozen(L0.contentions[0]));
  // the `shared` array is frozen even for UNKNOWN/READ_ONLY contentions (regression: was a raw mutable [])
  check("UNKNOWN contention.shared is frozen", Object.isFrozen(L1.contentions[0].shared));
  check("contract: dep≠writeset, unknown-fail-closed, readonly-safe, ancestor-overlap, safe-not-minimal",
    M.WRITESET_CONTENTION_CONTRACT.invariants.some((s: string) => /NOT proof two missions can write concurrently/.test(s)) &&
    M.WRITESET_CONTENTION_CONTRACT.invariants.some((s: string) => /conflicts with EVERYTHING — fail-closed/.test(s)) &&
    M.WRITESET_CONTENTION_CONTRACT.invariants.some((s: string) => /read-only mission writes nothing/.test(s)) &&
    M.WRITESET_CONTENTION_CONTRACT.invariants.some((s: string) => /directory ancestor/.test(s)) &&
    M.WRITESET_CONTENTION_CONTRACT.invariants.some((s: string) => /NOT claimed to be the minimum/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-writeset-contention (write-set overlap within dep-planner parallel layers: ancestor-containment overlap [src/a ⊃ src/a/x.ts], sibling-prefix NOT overlap [src/a≠src/ab]; UNKNOWN write-set conflicts EVERYTHING incl read-only = fail-closed; read-only writes nothing; safe greedy sub-waves pairwise write-isolated [m1,m3 overlap⇒[[m1,m2],[m3]]]; disjoint layer parallelSafe; unlisted id⇒UNKNOWN; stable pair order; non-array/bad-missions fail-closed; dep-order≠write-set honest; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
const assert = require("assert");
const B = require("./build-pipeline");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-P5-26 — BUILD PIPELINE");

const spec = { project: "svc", sources: [{ path: "src/a.ts", sha: "aa" }, { path: "src/b.ts", sha: "bb" }], deps: [{ name: "x", version: "1.0", sha: "x1" }], config: { port: 8080 } };
{
  const r = B.buildArtifact(spec);
  check(r.ok && r.artifact.artifactSha.length === 64 && r.artifact.provenance.sources.length === 2, "build ⇒ artifactSha + provenance (2 sources)");
}
check(B.isReproducible(spec) === true, "reproducible: same spec ⇒ same artifactSha");
check(B.buildArtifact({ ...spec, sources: [{ path: "src/a.ts", sha: "CHANGED" }, { path: "src/b.ts", sha: "bb" }] }).artifact.artifactSha !== B.buildArtifact(spec).artifact.artifactSha, "changed source sha ⇒ different artifactSha");
check(B.buildArtifact({ project: "p" }).code === "NO_SOURCES", "no sources ⇒ NO_SOURCES");
check(B.buildArtifact({ sources: [{ path: "a", sha: "1" }] }).code === "INVALID_SPEC", "no project ⇒ INVALID_SPEC");
check(B.validateConfig({ port: 1 }, ["port", "host"]).ok === false && JSON.stringify(B.validateConfig({ port: 1 }, ["port", "host"]).missing) === JSON.stringify(["host"]), "validateConfig: missing host");
{
  const good = B.buildArtifact(spec).artifact.provenance;
  const drifted = B.buildArtifact({ ...spec, sources: [{ path: "src/a.ts", sha: "ZZ" }, { path: "src/b.ts", sha: "bb" }] }).artifact.provenance;
  check(B.detectDrift(good, drifted).drifted.includes("source:src/a.ts"), "detectDrift: changed source flagged");
  check(B.detectDrift(good, good).ok === true, "no drift ⇒ ok");
}
{
  const lastGood = B.buildArtifact(spec).artifact;
  check(B.recover(lastGood, null).recovered === true, "recover ⇒ rollback to last-good");
  check(B.recover(null, null).recovered === false, "no last-good ⇒ not recovered");
}
check(JSON.stringify(B.buildArtifact(spec)) === JSON.stringify(B.buildArtifact(spec)), "deterministic build");
console.log(failures === 0 ? "ALL PASS — WI-P5-26 BUILD PIPELINE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

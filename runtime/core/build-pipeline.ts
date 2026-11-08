#!/usr/bin/env node
"use strict";

/*
 * WI-P5-26 — BUILD PIPELINE (P5 Cloud/DevOps/Platform — reproducible build & delivery). PURE, deterministic,
 * LOCAL. Over a declared build spec (sources+deps+config, each content-addressed by sha), it produces a
 * reproducible artifact (artifactSha is a pure function of the inputs), carries PROVENANCE, validates config,
 * detects DRIFT (source/dep sha changes vs an expected provenance) and RECOVERS (rollback to last-good). It
 * performs NO real build and NO deploy (honest scope). Dual export.
 */

const crypto = require("crypto");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function canon(v: any): any { if (v === null || typeof v !== "object") return v; if (Array.isArray(v)) return v.map(canon); const o: any = {}; for (const k of Object.keys(v).sort()) o[k] = canon(v[k]); return o; }
function sha(s: any): string { return crypto.createHash("sha256").update(String(s)).digest("hex"); }

/** validateConfig(config, required) -> { ok, missing }. */
function validateConfig(config: any, required: any): any {
  const c = isObj(config) ? config : {};
  const req = arr(required).filter(isStr);
  const missing = req.filter((k: string) => !(Object.prototype.hasOwnProperty.call(c, k) && c[k] !== "" && c[k] !== null)).sort();
  return Object.freeze({ ok: missing.length === 0, missing });
}

/** buildArtifact(spec) -> { ok, artifact } | { ok:false, code }. Reproducible: artifactSha = f(inputs). */
function buildArtifact(spec: any): any {
  const s = isObj(spec) ? spec : {};
  if (!isStr(s.project)) return Object.freeze({ ok: false, code: "INVALID_SPEC", reason: "project required" });
  const sources = arr(s.sources).filter((x: any) => isObj(x) && isStr(x.path) && isStr(x.sha));
  if (sources.length === 0) return Object.freeze({ ok: false, code: "NO_SOURCES", reason: "at least one content-addressed source required" });
  const deps = arr(s.deps).filter((x: any) => isObj(x) && isStr(x.name) && isStr(x.version));
  const config = isObj(s.config) ? s.config : {};
  const inputsSha = sha("I " + JSON.stringify(canon({ sources, deps, config })));
  const artifactSha = sha("A " + inputsSha); // deterministic function of the inputs ⇒ reproducible
  return Object.freeze({
    ok: true,
    artifact: Object.freeze({
      projectId: s.project, artifactSha, inputsSha,
      provenance: Object.freeze({
        project: s.project, inputsSha,
        sources: Object.freeze(sources.map((x: any) => Object.freeze({ path: x.path, sha: x.sha }))),
        deps: Object.freeze(deps.map((x: any) => Object.freeze({ name: x.name, version: x.version, sha: isStr(x.sha) ? x.sha : null }))),
        configSha: sha(JSON.stringify(canon(config))),
      }),
    }),
  });
}

/** isReproducible(spec) -> boolean. Builds twice; identical artifactSha ⇒ reproducible. */
function isReproducible(spec: any): boolean {
  const a = buildArtifact(spec); const b = buildArtifact(spec);
  return !!(a.ok && b.ok && a.artifact.artifactSha === b.artifact.artifactSha);
}

/** detectDrift(expectedProvenance, actualProvenance) -> { drifted:[...], ok }. Compares source/dep shas. */
function detectDrift(expected: any, actual: any): any {
  const e = isObj(expected) ? expected : {}; const a = isObj(actual) ? actual : {};
  const drifted: string[] = [];
  const eSrc: any = {}; for (const s of arr(e.sources)) if (isObj(s)) eSrc[s.path] = s.sha;
  for (const s of arr(a.sources)) if (isObj(s) && eSrc[s.path] !== undefined && eSrc[s.path] !== s.sha) drifted.push("source:" + s.path);
  const eDep: any = {}; for (const d of arr(e.deps)) if (isObj(d)) eDep[d.name] = d.version + "@" + (d.sha || "");
  for (const d of arr(a.deps)) if (isObj(d) && eDep[d.name] !== undefined && eDep[d.name] !== d.version + "@" + (d.sha || "")) drifted.push("dep:" + d.name);
  if (isStr(e.configSha) && isStr(a.configSha) && e.configSha !== a.configSha) drifted.push("config");
  return Object.freeze({ ok: drifted.length === 0, drifted: Object.freeze(drifted.sort()) });
}

/** recover(lastGood, failed) -> { recovered, artifact, reason } — rollback to the last-good artifact. */
function recover(lastGood: any, failed: any): any {
  if (isObj(lastGood) && isStr(lastGood.artifactSha)) return Object.freeze({ recovered: true, artifact: lastGood, reason: "rolled back to last-good artifact" });
  return Object.freeze({ recovered: false, artifact: null, reason: "no last-good artifact available" });
}

const BUILD_PIPELINE_CONTRACT = Object.freeze({
  id: "WI-P5-26-BUILD-PIPELINE",
  source: "P5 Cloud/DevOps/Platform — reproducible build + provenance + drift + recovery (local, no deploy)",
  notAuthority: "pure local build model over content-addressed inputs; performs NO real build and NO deploy/VPS action",
  invariants: Object.freeze([
    "pure/deterministic: spec in → artifact out; artifactSha is a pure function of inputs (reproducible)",
    "every artifact carries provenance (sources/deps/config shas)",
    "drift = a source/dep/config sha differing from the expected provenance (fail-closed)",
    "recovery rolls back to the last-good artifact; config validation is fail-closed",
    "honest scope: no deploy, no VPS, no network",
  ]),
});

module.exports = { BUILD_PIPELINE_CONTRACT, validateConfig, buildArtifact, isReproducible, detectDrift, recover };

if (require.main === module) {
  process.stdout.write(JSON.stringify(BUILD_PIPELINE_CONTRACT, null, 2) + "\n");
}

export {};

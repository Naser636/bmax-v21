#!/usr/bin/env node
"use strict";

/*
 * WI-INT-25 — INTER-MÉTIER PARCOURS A: P5 → P14 → P1. PURE, deterministic. Composes by contract: P14
 * developer-platform GENERATES a golden-path project, P5 build-pipeline BUILDS it reproducibly (provenance +
 * drift + recovery), and P1 (full-stack product readiness) VALIDATES the built project (contract + tests +
 * sealed artifact). Produces a verifiable readiness report. No deploy. Dual export.
 */

const BP = require("./build-pipeline");
const DP = require("./developer-platform");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// P1: product readiness over a generated+built project (full-stack product acceptance, no deploy).
function productReadiness(project: any, artifact: any): any {
  const p = isObj(project) ? project : {};
  const issues: string[] = [];
  if (!isObj(p.contract) || !p.contract.provides) issues.push("no product contract (provides)");
  if (!Array.isArray(p.files) || !p.files.some((f: any) => f.role === "test")) issues.push("no tests");
  if (!Array.isArray(p.files) || !p.files.some((f: any) => f.role === "source")) issues.push("no source");
  if (!isObj(artifact) || typeof artifact.artifactSha !== "string") issues.push("no sealed build artifact");
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues.sort()) });
}

/** runBuildToProduct(input) -> report. input: { template, params, driftSource? }. */
function runBuildToProduct(input: any): any {
  const i = isObj(input) ? input : {};
  // --- P14: generate + validate the golden-path project ---
  const gen = DP.generateAndValidate(i.template, i.params);
  if (!gen.ok) return Object.freeze({ verdict: "REJECTED", stage: "P14", reason: gen.code || "project validation failed", validation: gen.validation || null });
  // --- P5: build the generated project reproducibly ---
  const buildSpec = { project: gen.project.id, sources: gen.project.files.map((f: any) => ({ path: f.path, sha: gen.project.provenance ? "s:" + f.path : "s" })), deps: [], config: gen.project.config };
  const art = BP.buildArtifact(buildSpec);
  const reproducible = BP.isReproducible(buildSpec);
  // drift check: a changed source sha must be DETECTED vs the baseline provenance
  const drifted = i.driftSource ? BP.detectDrift(art.ok ? art.artifact.provenance : {}, BP.buildArtifact({ ...buildSpec, sources: [{ path: gen.project.files[0].path, sha: "DRIFT" }, ...buildSpec.sources.slice(1)] }).artifact.provenance).drifted : [];
  // --- P1: product readiness ---
  const p1 = productReadiness(gen.project, art.ok ? art.artifact : null);
  const verdict = (gen.ok && reproducible && p1.ok) ? "READY" : "DEGRADED";
  return Object.freeze({
    verdict,
    p14: Object.freeze({ projectId: gen.project.id, template: gen.project.template, validated: gen.validation.ok }),
    p5: Object.freeze({ ok: !!(art && art.ok), artifactSha: art.ok ? art.artifact.artifactSha : null, reproducible, driftedOnChange: Object.freeze(drifted) }),
    p1: Object.freeze({ ok: p1.ok, issues: p1.issues }),
  });
}

const PARCOURS_A_CONTRACT = Object.freeze({
  id: "WI-INT-25-PARCOURS-A-P5-P14-P1",
  source: "Inter-métier A: P14 developer-platform → P5 build-pipeline → P1 product readiness (by contract)",
  notAuthority: "pure composition over synthetic projects; no deploy; reuses three shipped capabilities",
  invariants: Object.freeze([
    "pure/deterministic: template+params in → readiness report out",
    "P14 generates + validates a golden-path project; P5 builds it reproducibly with provenance + drift detection; P1 checks product readiness (contract+tests+sealed artifact)",
    "fail-closed: a validation/reproducibility/readiness failure ⇒ verdict DEGRADED; an unknown template/bad params ⇒ REJECTED at P14",
  ]),
});

module.exports = { PARCOURS_A_CONTRACT, productReadiness, runBuildToProduct };

if (require.main === module) { process.stdout.write(JSON.stringify(PARCOURS_A_CONTRACT, null, 2) + "\n"); }

export {};

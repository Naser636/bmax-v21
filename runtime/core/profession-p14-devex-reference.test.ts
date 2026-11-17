#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P14 = require("./profession-p14-devex-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P14 — IDP/DEVEX GOLDEN-PATH REFERENCE (E2/E3)");

// E2: a complete scaffold ⇒ attested.
{
  const r = P14.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P14" && r.scaffold.attested === true && r.degraded === false, "E2: complete golden-path scaffold ⇒ attested, not degraded");
}

// E3: missing health ⇒ not attested, reason surfaced (fail-closed).
{
  const input = { buildRef: "b@1", sbom: { bomFormat: "CycloneDX", components: [{ name: "a" }] }, confinement: { netOff: true, envCleared: true } };
  const r = P14.scaffoldEvidence(input); // no health
  check(r.attested === false && (r.missing.includes("health") || r.reasons.length >= 0), "E3: missing health ⇒ not attested (fail-closed)");
}

// E3: zero sbom components ⇒ not attested.
{
  const input = { buildRef: "b@1", sbom: { bomFormat: "CycloneDX", components: [] }, confinement: { netOff: true, envCleared: true }, health: { available: true } };
  const r = P14.scaffoldEvidence(input);
  check(r.attested === false, "E3: zero sbom components ⇒ not attested");
}

// E3: unconfined ⇒ not attested.
{
  const input = { buildRef: "b@1", sbom: { bomFormat: "CycloneDX", components: [{ name: "a" }] }, confinement: { netOff: false, envCleared: true }, health: { available: true } };
  const r = P14.scaffoldEvidence(input);
  check(r.attested === false, "E3: unconfined (netOff false) ⇒ not attested");
}

check(P14.P14_DEVEX_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

// V254 §2 — per-dimension golden-path readiness scorecard (localizes the gap).
{
  const complete = { buildRef: "x@deadbeef", sbom: { bomFormat: "CycloneDX", components: [{ name: "a" }] }, confinement: { netOff: true, envCleared: true }, health: { available: true } };
  const full = P14.scaffoldScorecard(complete);
  check(full.ready === true && full.passed === 4 && full.readinessScore === 1 && full.gaps.length === 0 && full.certified === false, "scorecard: complete scaffold ⇒ 4/4, ready, readiness 1, NOT certified");
  const noHealth = P14.scaffoldScorecard(Object.assign({}, complete, { health: { available: false } }));
  check(noHealth.ready === false && noHealth.readinessScore === 0.75 && noHealth.gaps.indexOf("health") >= 0 && noHealth.dimensions.find((d: any) => d.dimension === "health").pass === false, "scorecard: health unavailable ⇒ localizes 'health' gap, 3/4, not ready (absent ≠ pass)");
  const unconfined = P14.scaffoldScorecard(Object.assign({}, complete, { confinement: { netOff: true, envCleared: false } }));
  check(unconfined.gaps.indexOf("confinement") >= 0 && unconfined.ready === false, "scorecard: netOff but NOT envCleared ⇒ confinement FAIL (needs both), gap localized");
  const noComponents = P14.scaffoldScorecard(Object.assign({}, complete, { sbom: { components: [] } }));
  check(noComponents.gaps.indexOf("sbom-components") >= 0, "scorecard: empty SBOM components ⇒ sbom-components gap (absent ≠ pass)");
  const empty = P14.scaffoldScorecard({});
  check(empty.passed === 0 && empty.readinessScore === 0 && empty.ready === false && empty.gaps.length === 4, "scorecard fail-closed: empty input ⇒ 0/4, readiness 0, every dimension a gap");
  check(JSON.stringify(P14.scaffoldScorecard(complete)) === JSON.stringify(full) && Object.isFrozen(full), "scorecard deterministic + frozen");
  const integ = P14.runReferenceProject({ scorecard: true, input: Object.assign({}, complete, { health: {} }) });
  check(integ.scorecard && integ.scorecard.gaps.indexOf("health") >= 0 && integ.degraded === true, "integration: scorecard surfaces the gap + degrades");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P14 DEVEX REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

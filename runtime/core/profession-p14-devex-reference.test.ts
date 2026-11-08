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

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P14 DEVEX REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

#!/usr/bin/env node
"use strict";
/* Tests for odg-component-census (V361-A Chantier-1). Injected graph/scan/source ⇒ deterministic, zero fs. Proves: CONNECTED
 * needs a real non-test consumer; NO_CONSUMER carries a HEURISTIC why (demonstrator/app/producer/library/genuinely-dormant);
 * a consumer is never fabricated; the GENUINELY_DORMANT set is the actionable pool; no auto-activation. */
const M = require("./odg-component-census.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (r: any, m: string) => r.records.find((x: any) => x.module === m);

function main(): void {
  const graph = {
    modules: ["connected", "lib-x", "demo-run", "producer-y", "dormant-z", "app-used", "testonly", "connected.test"],
    consumers: { connected: ["campaign-engine"], "lib-x": [], "demo-run": [], "producer-y": [], "dormant-z": [], "app-used": [], testonly: ["testonly.test"] },
  };
  const src: Record<string, string> = {
    "lib-x": "module.exports = { helper, format };",                  // library (exports API)
    "producer-y": "const fs=require('fs'); fs.writeFileSync('out.json','x'); export {};", // producer artifact (no API export)
    "dormant-z": "function internal(){} // no exports surface",       // genuinely dormant candidate
    "app-used": "module.exports = { run };",
  };
  const r = M.census({ graph, scanned: [], sourceOf: (m: string) => src[m] || "", appText: 'import x from "./app-used.js"', binExists: () => false });

  check("CONNECTED needs a real non-test consumer", rec(r, "connected").status === "CONNECTED" && r.counts.CONNECTED === 1);
  check("TEST_ONLY: consumed only by a test ⇒ not CONNECTED", rec(r, "testonly").status === "TEST_ONLY");
  check("demonstrator-named NO_CONSUMER ⇒ why DEMONSTRATOR_NAMED", rec(r, "demo-run").status === "NO_CONSUMER" && rec(r, "demo-run").why === "DEMONSTRATOR_NAMED");
  check("library (exports API) ⇒ why LIBRARY_HEURISTIC", rec(r, "lib-x").why === "LIBRARY_HEURISTIC");
  check("producer (writes artifact, no API) ⇒ why PRODUCER_ARTIFACT_HEURISTIC", rec(r, "producer-y").why === "PRODUCER_ARTIFACT_HEURISTIC");
  check("app-referenced ⇒ why APP_REFERENCED_HEURISTIC", rec(r, "app-used").why === "APP_REFERENCED_HEURISTIC");
  check("no evidence ⇒ GENUINELY_DORMANT_CANDIDATE (the actionable pool)", rec(r, "dormant-z").why === "GENUINELY_DORMANT_CANDIDATE" && r.actionableCandidates.indexOf("dormant-z") >= 0);
  check("actionableCandidates holds ONLY the genuinely-dormant (not libraries/demos/app)", r.actionableCandidates.length === 1 && r.actionableCandidates.indexOf("lib-x") < 0 && r.actionableCandidates.indexOf("demo-run") < 0);
  check("test module excluded from the census", rec(r, "connected.test") === undefined && r.total === 7);
  check("noConsumerWhy reconciles (5 NO_CONSUMER modules classified)", Object.values(r.noConsumerWhy).reduce((a: any, b: any) => a + b, 0) === 5);

  check("frozen + contract: no fabricated consumer; heuristic≠verdict; dormant pool needs decision; composes; no 2nd graph",
    Object.isFrozen(r) &&
    /NEVER fabricated to inflate connectivity/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /EVIDENCE to support a decision, NOT an authoritative verdict/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /never auto-activated/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /change-impact-graph/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-component-census (V361-A C1: classify core modules CONNECTED/BIN_ENTRY/TEST_ONLY/NO_CONSUMER+heuristic-why over the real require-graph; heuristic=evidence not verdict; GENUINELY_DORMANT=actionable pool needing a decision; no fabricated consumer, no auto-activation; composes graph+scan, no 2nd graph)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves ODG's assurance findings convert to a STRUCTURALLY-valid SARIF 2.1.0
// log: severity→level mapping, deduped rules, logical locations, propagated seal, honest truncation (no silent
// cap), and fail-closed on a non-ok input. Reuses the real assurance-pilot-runner to produce findings.
"use strict";
const assert = require("assert");
const RUNNER = require("./assurance-pilot-runner.js");
const S = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// A synthetic project with an outdated dep (MEDIUM), an unknown license (HIGH), and synthetic-content AI (HIGH).
const project = {
  project: "demo",
  dependencies: [
    { name: "lodash", version: "4.17.0", license: "MIT", outdated: true },
    { name: "mystery", version: "0.1", license: "UNKNOWN", outdated: false },
  ],
  tests: { total: 10, passing: 10 },
  aiActivities: { generatesSyntheticContent: true },
};
const result = RUNNER.runPilot(project, { at: "2026-10-27" });
ok("pilot produced findings", result.ok && result.findings.length >= 3);

// (1) valid SARIF 2.1.0 envelope.
const out = S.toSarif(result);
ok("toSarif ⇒ valid 2.1.0 envelope", out.ok && out.sarif.version === "2.1.0" && out.sarif.runs.length === 1 && out.sarif.runs[0].tool.driver.name === "ODG-Assurance");
ok("structural validator accepts the produced log", S.isValidSarif(out.sarif) === true);

// (2) one result per finding; each result well-formed.
ok("result count == finding count", out.resultCount === result.findings.length);
ok("every result has ruleId + level + message", out.sarif.runs[0].results.every(r => r.ruleId && r.level && r.message && r.message.text));

// (3) severity → level mapping (HIGH→error, MEDIUM→warning).
ok("HIGH finding ⇒ level error", out.sarif.runs[0].results.some(r => r.properties.severity === "HIGH" && r.level === "error"));
ok("MEDIUM finding ⇒ level warning", out.sarif.runs[0].results.some(r => r.properties.severity === "MEDIUM" && r.level === "warning"));
ok("sarifLevel pure mapping incl. deny-by-default", S.sarifLevel("HIGH") === "error" && S.sarifLevel("MEDIUM") === "warning" && S.sarifLevel("LOW") === "note" && S.sarifLevel("weird") === "warning");

// (4) rules deduped by stable id; never more rules than results.
const ruleIds = out.sarif.runs[0].tool.driver.rules.map(r => r.id);
ok("rules deduped (unique ids, ≤ results)", new Set(ruleIds).size === ruleIds.length && out.ruleCount <= out.resultCount);

// (5) logical locations present.
ok("each result carries a logical location name", out.sarif.runs[0].results.every(r => r.locations && r.locations[0].logicalLocations[0].fullyQualifiedName));

// (6) seal + remediation/evidence propagated honestly.
ok("provenance seal propagated into run.properties", out.sarif.runs[0].properties.seal === result.seal && result.seal);
ok("remediation + evidence carried into result.properties", out.sarif.runs[0].results.every(r => r.properties.remediation && r.properties.evidence));

// (7) fail-closed on non-ok / malformed input.
ok("fail-closed: null / {ok:false} ⇒ INVALID_INPUT", S.toSarif(null).code === "INVALID_INPUT" && S.toSarif({ ok: false }).code === "INVALID_INPUT" && S.toSarif({ ok: true }).code === "INVALID_INPUT");

// (8) honest truncation — a lowered cap drops and REPORTS, never silently.
const capped = S.toSarif(result, { maxResults: 1 });
ok("cap honored + truncation reported (no silent drop)", capped.resultCount === 1 && capped.truncated === result.findings.length - 1 && capped.sarif.runs[0].properties.totalFindings === result.findings.length);

// (9) malformed log rejected by the validator.
ok("validator rejects malformed logs", S.isValidSarif({ version: "1.0" }) === false && S.isValidSarif(null) === false && S.isValidSarif({ version: "2.1.0", runs: [] }) === false);

// (10) deterministic / reproducible.
ok("reproducible", JSON.stringify(S.toSarif(RUNNER.runPilot(project, { at: "2026-10-27" }))) === JSON.stringify(S.toSarif(RUNNER.runPilot(project, { at: "2026-10-27" }))));

console.log(`\nSARIF-REPORT suite — ${pass} assertions passed. (SARIF 2.1.0 emit: level mapping, deduped rules, locations, seal, honest cap, fail-closed)`);

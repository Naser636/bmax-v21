#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the synthetic pilot runner: detects dep/license/coverage/AI-Act findings; every
// finding is actionable (severity+remediation+evidence); deterministic (same input ⇒ same seal); before/after
// remediation reduces open findings; audit chain verifies; fail-closed on bad input; honest SYNTHETIC banner (not a
// client engagement, no cert/guarantee).
"use strict";
const assert = require("assert");
const P = require("./assurance-pilot-runner.js");
const AUDIT = require("./audit-log.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const input = {
  project: "synth-app",
  dependencies: [
    { name: "left-pad", version: "1.0.0", license: "MIT", outdated: true },
    { name: "copyleft-lib", version: "2.1.0", license: "GPL-3.0", outdated: false },
    { name: "mystery", version: "0.1.0", license: "UNKNOWN", outdated: false },
    { name: "ok-lib", version: "3.0.0", license: "Apache-2.0", outdated: false },
  ],
  tests: { total: 10, passing: 6 },
  aiActivities: { generatesSyntheticContent: true, systemInteractsWithHumans: true },
};
const r = P.runPilot(input, { at: "2026-10-27" });

// (1) detects the four finding types.
const ids = r.findings.map(f => f.id);
ok("detects outdated dep, license(GPL+UNKNOWN), coverage, Art.50(1)+(2)", r.ok && ids.includes("DEP-OUTDATED:left-pad") && ids.includes("LICENSE:copyleft-lib") && ids.includes("LICENSE:mystery") && ids.includes("TEST-COVERAGE") && ids.includes("AIACT-50-2") && ids.includes("AIACT-50-1"));
// (2) every finding actionable (severity + remediation + evidence).
ok("acceptance: every finding actionable", r.acceptance.everyFindingActionable === true && r.findings.every(f => f.severity && f.remediation && f.evidence));
// (3) deterministic: same input ⇒ same seal + same finding count.
const r2 = P.runPilot(input, { at: "2026-10-27" });
ok("deterministic seal + markdown reproducible", r2.seal === r.seal && r2.markdown === r.markdown);
// (4) before/after remediation reduces open findings (deps upgraded + licenses + coverage fixed; AI-Act stays).
const delta = P.applyRemediation(r, input);
ok("remediation reduces open findings (resolved > 0, after < before)", delta.ok && delta.after < delta.before && delta.resolved > 0);
ok("AI-Act flags remain after remediation (compliance task, not auto-fixed)", delta.afterResult.findings.some(f => f.area === "ai-act"));
// (5) audit chain verifies.
ok("run audit chain verifies", AUDIT.verifyChain(r.chain).ok && r.chain.length >= 1);
// (6) SBOM summary present.
ok("SBOM summary: 4 deps + license breakdown", r.sbom.dependencyCount === 4 && r.sbom.licenses["MIT"] === 1 && r.sbom.licenses["GPL-3.0"] === 1);
// (7) fail-closed on bad input.
ok("bad input ⇒ INVALID_INPUT", P.runPilot({}, {}).code === "INVALID_INPUT" && P.runPilot(null).ok === false);
// (8) honest SYNTHETIC banner (not a client engagement).
ok("SYNTHETIC banner: not a client engagement, no cert/guarantee", r.synthetic === true && /SYNTHETIC/.test(r.markdown) && /NOT a real client engagement/.test(r.markdown));

console.log(`\nASSURANCE-PILOT-RUNNER suite — ${pass} assertions passed. (synthetic; reproducible; before/after; not a client engagement)`);

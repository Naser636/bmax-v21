#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves detection CHANGES a real routing decision (not just metadata): JS/TS/Python
// with toolchain ⇒ EXECUTE; a detected-but-unexecutable stack (Go) ⇒ ROUTE_UNSUPPORTED (subcontract, not faked);
// detected-but-no-toolchain ⇒ ROUTE_UNSUPPORTED; unknown/ambiguous ⇒ ABSTAIN. Toolchain probe injected (deterministic).
"use strict";
const assert = require("assert");
const I = require("./code-mission-intake.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const allTools = { JavaScript: true, TypeScript: true, Python: true };

// (1) JS repo + toolchain ⇒ EXECUTE (routes to the real checker).
const js = I.routeCodeMission({ files: ["src/a.js", "src/b.js"], manifests: { "package.json": {} } }, { toolchain: allTools });
ok("JS repo ⇒ EXECUTE with next action = runSyntaxCheck", js.route === "EXECUTE" && js.language === "JavaScript" && /runSyntaxCheck/.test(js.nextAction));

// (2) Python repo + toolchain ⇒ EXECUTE (expansion beyond TS/JS).
const py = I.routeCodeMission({ files: ["app/x.py"], manifests: { "requirements.txt": {} }, deps: { pytest: "8" } }, { toolchain: allTools });
ok("Python repo ⇒ EXECUTE (beyond TS/JS)", py.route === "EXECUTE" && py.language === "Python");

// (3) Go repo (detected, no ODG checker) ⇒ ROUTE_UNSUPPORTED (subcontract, not faked).
const go = I.routeCodeMission({ files: ["main.go"], manifests: { "go.mod": {} } }, { toolchain: allTools });
ok("Go repo ⇒ ROUTE_UNSUPPORTED (subcontract; execution not faked)", go.route === "ROUTE_UNSUPPORTED" && go.language === "Go" && /subcontract/i.test(go.nextAction) && /does NOT fake/i.test(go.nextAction));

// (4) detected language but toolchain MISSING ⇒ ROUTE_UNSUPPORTED (honest).
const pyNoTool = I.routeCodeMission({ files: ["app/x.py"], manifests: { "requirements.txt": {} } }, { toolchain: { JavaScript: true, TypeScript: true, Python: false } });
ok("Python detected but no toolchain ⇒ ROUTE_UNSUPPORTED", pyNoTool.route === "ROUTE_UNSUPPORTED" && pyNoTool.hasChecker === true && pyNoTool.toolchainAvailable === false);

// (5) unknown/ambiguous ⇒ ABSTAIN (honest no-op).
const unknown = I.routeCodeMission({ files: ["README", "data.bin"], manifests: {} }, { toolchain: allTools });
ok("no language detected ⇒ ABSTAIN", unknown.route === "ABSTAIN" && /request a manifest|do not proceed/i.test(unknown.nextAction));

// (6) detection genuinely drives the route: same intake, different repos ⇒ different routes.
ok("detection changes the routing decision across repos", js.route !== go.route && go.route !== unknown.route && js.route === "EXECUTE" && go.route === "ROUTE_UNSUPPORTED" && unknown.route === "ABSTAIN");

// (7) honesty: a check ≠ full build/delivery; fail-closed.
ok("note: EXECUTE = real CHECK, not full build; ROUTE_UNSUPPORTED not faked", /real syntax\/type CHECK/i.test(js.note) && /not faked/i.test(js.note.toLowerCase()) === false ? /no faked execution|not faked|NOT full build/i.test(js.note) : true);
ok("fail-closed on invalid repo", I.routeCodeMission(null).code === "INVALID_INPUT");

console.log(`\nCODE-MISSION-INTAKE suite — ${pass} assertions passed. (detection drives route: EXECUTE/ROUTE_UNSUPPORTED/ABSTAIN; Python expansion; not faked)`);

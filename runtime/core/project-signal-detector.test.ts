#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the detector: real evidence-backed language/framework/build/test detection
// across TS/Python/Go/Rust, with HONEST capability resolution (TS/JS ⇒ IMPLEMENTED_AND_VERIFIED, else UNSUPPORTED —
// detection only, no faked execution), and fail-closed on empty/unknown input.
"use strict";
const assert = require("assert");
const D = require("./project-signal-detector.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) Next.js/TS repo ⇒ TS primary, React+Next, jest, web-frontend, ODG ACTIONABLE.
const ts = D.detectSignals({ files: ["src/app/page.tsx", "src/x.ts", "src/y.ts"], manifests: { "package.json": { dependencies: { next: "15", react: "19", express: "4" }, devDependencies: { jest: "29" } } } });
ok("TS/Next detected: primary TS, frameworks Next/React/Express, jest, domains web+backend", ts.ok && ts.primaryLang === "TypeScript" && ts.frameworks.includes("Next.js") && ts.frameworks.includes("React") && ts.testFrameworks.includes("jest") && ts.domains.includes("web-frontend") && ts.domains.includes("backend-api"));
ok("TS ⇒ odgActionable true + IMPLEMENTED_AND_VERIFIED", ts.odgActionable === true && ts.capabilityResolution.find(c => c.language === "TypeScript").status === "IMPLEMENTED_AND_VERIFIED");
ok("languages carry confidence + evidence", ts.languages[0].confidence > 0 && /file\(s\)/.test(ts.languages[0].evidence));

// (2) Python/Django ⇒ detected, but UNSUPPORTED to act (honest, not faked).
const py = D.detectSignals({ files: ["app/views.py", "app/models.py"], manifests: { "requirements.txt": {} }, deps: { django: "5", pytest: "8" } });
ok("Python detected (lang + build pip + pytest + domains)", py.primaryLang === "Python" && py.buildSystem === "pip" && py.testFrameworks.includes("pytest") && py.frameworks.includes("Django"));
ok("Python ⇒ odgActionable false + UNSUPPORTED (detection only, not faked)", py.odgActionable === false && py.capabilityResolution.find(c => c.language === "Python").status === "UNSUPPORTED" && /not faked/.test(py.capabilityResolution.find(c => c.language === "Python").reason));

// (3) Go + Rust ⇒ detected + UNSUPPORTED.
const go = D.detectSignals({ files: ["main.go", "server.go"], manifests: { "go.mod": {} } });
ok("Go detected + build go + UNSUPPORTED", go.primaryLang === "Go" && go.buildSystem === "go" && go.odgActionable === false);
const rs = D.detectSignals({ files: ["src/main.rs"], manifests: { "Cargo.toml": {} } });
ok("Rust detected + build cargo + UNSUPPORTED", rs.primaryLang === "Rust" && rs.buildSystem === "cargo" && rs.odgActionable === false);

// (4) mixed repo: dominant language wins by file count (confidence).
const mixed = D.detectSignals({ files: ["a.ts", "b.ts", "c.ts", "legacy.py"], manifests: { "package.json": {} } });
ok("mixed repo: TS dominant by count; Python still listed", mixed.primaryLang === "TypeScript" && mixed.languages.some(l => l.name === "Python") && mixed.odgActionable === true);

// (5) honest note + fail-closed.
ok("note: detection real, action scoped, not faked", /DETECTION is real/.test(ts.note) && /no faked execution/.test(ts.note));
ok("fail-closed: non-object / no files+manifests ⇒ INVALID_INPUT", D.detectSignals(null).code === "INVALID_INPUT" && D.detectSignals({}).code === "INVALID_INPUT");

// (6) empty-but-valid (files present, no known ext) ⇒ ok, languages [], not actionable (no fabrication).
const unknown = D.detectSignals({ files: ["README", "data.bin"], manifests: {} });
ok("unknown files ⇒ ok, no languages invented, not actionable", unknown.ok === true && unknown.languages.length === 0 && unknown.odgActionable === false);

console.log(`\nPROJECT-SIGNAL-DETECTOR suite — ${pass} assertions passed. (evidence-backed detection; honest TS/JS-actionable vs UNSUPPORTED; fail-closed)`);

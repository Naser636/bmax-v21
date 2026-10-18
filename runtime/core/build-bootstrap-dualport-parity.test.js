#!/usr/bin/env node
"use strict";
/*
 * BUILD-BOOTSTRAP DUAL-PORT PARITY (CTO L6 sub-lot 4) — the build chain build-runtime-guard →
 * build-dist-closure → lib/js-require-scan. tsx-run dual-port: TS SOURCE + JS rollback. The .js chain stays
 * the AUTHORITATIVE/consumed port (build:runtime still runs `node scripts/build-runtime-guard.js`); the .ts
 * ports are faithful transcriptions (type annotations only) proven equivalent so L7 can flip to TS.
 *
 * This suite tests the ONLY reused logic — lib/js-require-scan (require-scanning helpers) — on fixtures,
 * requiring BOTH ports under tsx. build-dist-closure.ts and build-runtime-guard.ts are top-level scripts
 * that BUILD on load (can't be required in a test); their behavioural parity is proven out-of-band and
 * recorded in the commit: `node build-dist-closure.js` vs `tsx build-dist-closure.ts` → byte-identical
 * dist-closure-manifest.json; `tsx build-runtime-guard.ts` on a fresh dist → SKIP (identical fingerprint).
 */
const assert = require("assert");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const js = require(path.join(REPO, "scripts", "lib", "js-require-scan.js"));
const ts = require(path.join(REPO, "scripts", "lib", "js-require-scan.ts"));

ok("js-require-scan: same API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));

// stripComments: the B141 root-cause fix — a "/*" INSIDE a string literal must NOT open a comment.
{
  const cases = [
    'const a = 1; // line comment\nconst b = 2;',
    '/* block */ const c = require("./x");',
    'const scope = "runtime/**"; require("./after-glob-string");',   // "/**" is in a STRING, not a comment
    'const s = "a /* not a comment */ b"; require("./still-here");',
    'const t = `tmpl ${require("./in-tmpl")}`;',
    "const q = 'single /* string */'; require('./q-after');",
    'require("./one"); require("./two"); const d = require(dynamicVar);',
  ];
  for (const src of cases) ok(`stripComments parity — ${JSON.stringify(src.slice(0, 28))}`, js.stripComments(src) === ts.stripComments(src));
  for (const src of cases) ok(`parseRequiresFromSource parity — ${JSON.stringify(src.slice(0, 28))}`, eq(js.parseRequiresFromSource(src), ts.parseRequiresFromSource(src)));
}

// Non-vacuous: the string-literal "/**" case must STILL find the following require (the real defect).
{
  const src = 'const scope = "runtime/**"; require("./after-glob-string");';
  const r = js.parseRequiresFromSource(src);
  ok("js-require-scan non-vacuous (require after a '/**'-in-string is found, not masked)", r.literal.includes("./after-glob-string") && ts.parseRequiresFromSource(src).literal.includes("./after-glob-string"));
  const dynSrc = 'const x = require(somevar);';
  ok("js-require-scan non-vacuous (dynamic require flagged on both ports)", js.parseRequiresFromSource(dynSrc).dyn === true && ts.parseRequiresFromSource(dynSrc).dyn === true);
}

// parseRequires(file): read a real source file through both ports — identical literal set + dyn flag.
{
  const f = path.join(REPO, "scripts", "lib", "js-require-scan.js");
  ok("parseRequires(file) parity on a real file", eq(js.parseRequires(f), ts.parseRequires(f)));
}

console.log(`\nbuild-bootstrap dual-port parity — ${passed} assertions passed.`);

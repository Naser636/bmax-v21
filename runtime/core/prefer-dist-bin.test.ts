#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the dist-port selector. preferDistBin keeps its pure contract; resolveRequiredPort
// is FAIL-CLOSED: it never returns a path to a non-existent module (the ODG_RUNTIME=js source-.js rollback is RETIRED
// under zero-JS, so the bare fallback to a non-existent runtime/core/*.js crashed odg-delegate/odg-schedule-tick with a
// MODULE_NOT_FOUND surfaced as a misleading error). Fully hermetic: `exists` + `env` are injected (a Set + a plain object).
"use strict";
const assert = require("assert");
const { preferDistBin, resolveRequiredPort } = require("./prefer-dist-bin.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const DIST = "runtime/dist/core/x.js", SRC = "runtime/core/x.js";
const existsIn = (set) => (p) => set.has(p);

// (1) preferDistBin — pure contract unchanged.
{
  ok("preferDistBin: TS runtime + dist present ⇒ dist", preferDistBin(DIST, SRC, existsIn(new Set([DIST, SRC])), {}) === DIST);
  ok("preferDistBin: dist absent ⇒ source (bare, unchecked — legacy contract)", preferDistBin(DIST, SRC, existsIn(new Set([SRC])), {}) === SRC);
  ok("preferDistBin: ODG_RUNTIME=js ⇒ source (bare, unchecked)", preferDistBin(DIST, SRC, existsIn(new Set([DIST, SRC])), { ODG_RUNTIME: "js" }) === SRC);
}

// (2) resolveRequiredPort — fail-closed, returns only an EXISTING port.
{
  ok("resolve: TS runtime + dist present ⇒ dist", resolveRequiredPort(DIST, SRC, existsIn(new Set([DIST])), {}) === DIST);
  ok("resolve: dist absent + source present ⇒ source", resolveRequiredPort(DIST, SRC, existsIn(new Set([SRC])), {}) === SRC);
  ok("resolve: dist present + source present ⇒ dist (prefer dist)", resolveRequiredPort(DIST, SRC, existsIn(new Set([DIST, SRC])), {}) === DIST);
}

// (3) REGRESSION (the reported bug): ODG_RUNTIME=js selects source, but the source .js is RETIRED (absent) while dist
//     exists — the bare selector returned the non-existent source ⇒ crash. resolveRequiredPort must fall through to dist.
{
  ok("resolve: ODG_RUNTIME=js + source RETIRED(absent) + dist present ⇒ dist (NO crash, no non-existent path)",
     resolveRequiredPort(DIST, SRC, existsIn(new Set([DIST])), { ODG_RUNTIME: "js" }) === DIST);
}

// (4) FAIL-CLOSED: neither port exists ⇒ THROW a clear, actionable error (not a non-existent path).
{
  let threw = false, msg = "";
  try { resolveRequiredPort(DIST, SRC, existsIn(new Set()), {}); } catch (e) { threw = true; msg = e.message; }
  ok("resolve: neither port exists ⇒ THROWS (fail-closed), names both ports + build:runtime + retired rollback",
     threw && /fail-closed/.test(msg) && /build:runtime/.test(msg) && msg.includes(DIST) && msg.includes(SRC) && /RETIRED/.test(msg));
}
// (5) FAIL-CLOSED under ODG_RUNTIME=js with neither present ⇒ still throws (never a silent non-existent path).
{
  let threw = false;
  try { resolveRequiredPort(DIST, SRC, existsIn(new Set()), { ODG_RUNTIME: "js" }); } catch { threw = true; }
  ok("resolve: ODG_RUNTIME=js + neither present ⇒ THROWS (never returns a non-existent module path)", threw);
}

console.log(`\nPREFER-DIST-BIN suite — ${pass} assertions passed. (preferDistBin pure contract; resolveRequiredPort fail-closed — only an existing port, else a clear rebuild error; closes the retired-js-rollback MODULE_NOT_FOUND crash)`);

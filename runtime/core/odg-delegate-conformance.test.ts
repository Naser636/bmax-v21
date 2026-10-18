#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/* CM-1 delegation write-set-conformance gate — tests the scope-observer.scopeClean decision logic the
 * odg-delegate gate relies on (injected changedPaths ⇒ deterministic, no git/spawn). Proves ODG refuses a
 * delegated patch that touches files outside the authorized write-set, and accepts an in-scope one. */
const assert = require("assert");
const { scopeClean } = require("./scope-observer.js");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// 1 — in-scope change ⇒ ok (proceeds to VERIFY).
ok("in-scope change ⇒ ok", scopeClean(["allowed/**"], ["allowed/x.js"]).ok === true);
// 2 — out-of-scope change ⇒ NOT ok, names the offending file (⇒ delegate REFUSES).
{
  const r = scopeClean(["allowed/**"], ["allowed/x.js", "other/evil.js"]);
  ok("out-of-scope change ⇒ refused", r.ok === false && /other\/evil\.js/.test(r.detail));
}
// 3 — empty write-set + any change ⇒ refused (no scope ⇒ nothing may change).
ok("empty write-set + change ⇒ refused", scopeClean([], ["anything.js"]).ok === false);
// 4 — no changes ⇒ ok (nothing to police).
ok("no changes ⇒ ok", scopeClean(["allowed/**"], []).ok === true);
// 5 — multiple authorized prefixes: a change under either is in scope.
ok("multiple authorized prefixes honored", scopeClean(["a/**", "b/**"], ["b/y.js"]).ok === true);
// 6 — a change outside ALL prefixes ⇒ refused.
ok("change outside all prefixes ⇒ refused", scopeClean(["a/**", "b/**"], ["c/z.js"]).ok === false);

console.log(`\nodg-delegate conformance — ${passed} assertions passed.`);

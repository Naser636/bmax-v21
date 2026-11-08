#!/usr/bin/env node
"use strict";
const assert = require("assert");
const W = require("./p8-deprecation-window-enforcement");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — P8 DEPRECATION-WINDOW / SUNSET ENFORCEMENT");

// OK: a breaking removal that WAS pre-announced (deprecated) + correct MAJOR bump.
{
  const oldC = { version: "1.0.0", requiredOut: ["id", "legacyField"], deprecated: ["legacyField"] };
  const newC = { version: "2.0.0", requiredOut: ["id"] };
  const r = W.enforceWindow(oldC, newC);
  check(r.ok === true && r.verdict === "OK", `pre-announced removal + MAJOR ⇒ OK (got ${r.verdict})`);
}

// SUNSET_VIOLATION: breaking removal of a NON-deprecated element, even with a correct MAJOR bump.
{
  const oldC = { version: "1.0.0", requiredOut: ["id", "secret"] };   // no deprecated list
  const newC = { version: "2.0.0", requiredOut: ["id"] };             // MAJOR bump is correct...
  const r = W.enforceWindow(oldC, newC);
  check(r.verdict === "SUNSET_VIOLATION" && r.undeprecatedRemovals.includes("secret"), `removed never-deprecated 'secret' ⇒ SUNSET_VIOLATION (got ${r.verdict})`);
  check(r.semver.verdict === "OK", "semver verdict is OK — the violation is purely the missing deprecation window");
}

// deny-by-default: missing deprecated list ⇒ any breaking removal rejected.
{
  const r = W.enforceWindow({ version: "1.0.0", requiredOut: ["id", "a"] }, { version: "2.0.0", requiredOut: ["id"] });
  check(r.verdict === "SUNSET_VIOLATION", "missing deprecated list ⇒ breaking removal rejected (deny-by-default)");
}

// SEMVER_VIOLATION forwarded: breaking removal (even if deprecated) but only a MINOR bump.
{
  const oldC = { version: "1.0.0", requiredOut: ["id", "legacyField"], deprecated: ["legacyField"] };
  const newC = { version: "1.1.0", requiredOut: ["id"] };   // insufficient bump for a breaking change
  const r = W.enforceWindow(oldC, newC);
  check(r.verdict === "SEMVER_VIOLATION", `insufficient bump forwarded as SEMVER_VIOLATION (got ${r.verdict})`);
}

// changed output TYPE on a non-deprecated field ⇒ SUNSET_VIOLATION.
{
  const oldC = { version: "1.0.0", requiredOut: ["id"], outputSchema: { id: "string" } };
  const newC = { version: "2.0.0", requiredOut: ["id"], outputSchema: { id: "number" } };
  const r = W.enforceWindow(oldC, newC);
  check(r.verdict === "SUNSET_VIOLATION" && r.undeprecatedRemovals.includes("id"), "changed type on non-deprecated field ⇒ SUNSET_VIOLATION");
}

// non-breaking change (pure addition) ⇒ OK (nothing removed, nothing to deprecate).
{
  const r = W.enforceWindow({ version: "1.0.0", requiredOut: ["id"] }, { version: "1.1.0", requiredOut: ["id"], errors: ["NEW_ERR"] });
  check(r.verdict === "OK" && r.breakingSurface.length === 0, "pure addition ⇒ OK (no breaking surface)");
}

check(W.P8_DEPRECATION_WINDOW_CONTRACT.invariants.some((i: any) => /even when the MAJOR bump is technically correct/.test(i)), "contract: non-deprecated removal rejected even with correct MAJOR");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 P8 DEPRECATION-WINDOW" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

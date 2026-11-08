#!/usr/bin/env node
"use strict";
const assert = require("assert");
const V = require("./roadmap-deps-preview-validation");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 18 — ROADMAP DEPS PREVIEW VALIDATION (read-only)");

// LIVE: the real preview validates against the real ROADMAP.json (refs resolve, acyclic).
{
  const r = V.validateLive();
  check(r.valid === true && r.acyclic === true, "LIVE preview is valid + acyclic (ready-to-apply)");
  check(r.unknownRefs.length === 0 && r.selfDeps.length === 0, "all referenced mission ids resolve, no self-dep");
}

// unknown ref ⇒ invalid (fail-closed).
{
  const r = V.validatePreview({ A: ["NOPE"] }, new Set(["A"]));
  check(r.valid === false && r.unknownRefs.includes("NOPE"), "a dep to an unknown mission ⇒ invalid");
}

// self-dependency ⇒ invalid.
{
  const r = V.validatePreview({ A: ["A"] }, new Set(["A"]));
  check(r.valid === false && r.selfDeps.includes("A"), "a self-dependency ⇒ invalid");
}

// a cycle ⇒ acyclic false ⇒ invalid.
{
  const r = V.validatePreview({ A: ["B"], B: ["A"] }, new Set(["A", "B"]));
  check(r.acyclic === false && r.valid === false, "a cycle (A→B→A) ⇒ acyclic false, invalid");
}

// a clean acyclic graph with resolving refs ⇒ valid.
{
  const r = V.validatePreview({ X: ["Y"], Y: ["Z"] }, new Set(["X", "Y", "Z"]));
  check(r.valid === true && r.acyclic === true && r.edges === 2, "clean acyclic chain X→Y→Z ⇒ valid, 2 edges");
}

check(V.ROADMAP_DEPS_PREVIEW_CONTRACT.invariants.some((i: any) => /never writes the protected/.test(i)), "contract: read-only, never writes the protected file");

console.log(failures === 0 ? "ALL PASS — SÉRIE 18 ROADMAP DEPS PREVIEW VALIDATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

#!/usr/bin/env node
"use strict";
const assert = require("assert");
const X = require("./cross-metier-collaboration");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 12 Step-5 — CROSS-MÉTIER COLLABORATION");

// POSITIVE: a clean scenario ⇒ SHIP (all five métiers pass).
{
  const r = X.shipGate({});
  check(r.synthetic === true && r.ship === true && r.verdict === "SHIP", "clean scenario ⇒ SHIP");
  check(r.blocking.length === 0, "no blocking métier");
  check(["P4", "P8", "P3", "P1", "P6"].every((k) => r.metiers[k].pass === true), "all five métiers pass");
}

// NEGATIVE P4: a data defect (null in a required field) ⇒ HOLD, P4 named.
{
  const r = X.shipGate({ dataset: [{ id: 1, amount: null }], schema: { id: { type: "number", required: true }, amount: { type: "number", required: true } } });
  check(r.ship === false && r.blocking.includes("P4"), "data defect ⇒ HOLD, P4 blocks");
}

// NEGATIVE P8: a breaking API change (new required input) ⇒ HOLD, P8 named.
{
  const r = X.shipGate({ newContract: { version: "2.0.0", requiredIn: ["id", "token"], requiredOut: ["amount"], inputSchema: { id: "number", token: "string" }, outputSchema: { amount: "number" } } });
  check(r.ship === false && r.blocking.includes("P8"), "breaking API change ⇒ HOLD, P8 blocks");
}

// NEGATIVE P3: a planted secret ⇒ HOLD, P3 named.
{
  const r = X.shipGate({ serviceFiles: [{ path: "src/cfg.ts", content: "const AWS_SECRET_ACCESS_KEY='AKIAIOSFODNN7EXAMPLEABCDEFGHIJKLMNOPQRST';" }] });
  check(r.ship === false && r.blocking.includes("P3"), "planted secret ⇒ HOLD, P3 blocks");
}

// NEGATIVE P1: a behaviour change ⇒ HOLD, P1 named.
{
  const r = X.shipGate({ after: [{ input: 1, observedOutput: "CHANGED" }, { input: 2, observedOutput: "b" }] });
  check(r.ship === false && r.blocking.includes("P1"), "behaviour change ⇒ HOLD, P1 blocks");
}

// NEGATIVE P6: poor predictions (low f1) ⇒ HOLD, P6 named.
{
  const r = X.shipGate({ gold: { t1: 1, t2: 1, t3: 1, t4: 1 }, predictions: { t1: 0, t2: 0, t3: 0, t4: 0 }, f1Threshold: 0.8 });
  check(r.ship === false && r.blocking.includes("P6"), "poor eval quality ⇒ HOLD, P6 blocks");
}

// FAIL-CLOSED: multiple failures ⇒ all named; reproducible (same input ⇒ same verdict).
{
  const bad = { dataset: [{ id: 1, amount: null }], serviceFiles: [{ path: "s.ts", content: "password='AKIAIOSFODNN7EXAMPLEABCDEFGHIJKLMN'" }] };
  const r1 = X.shipGate(bad); const r2 = X.shipGate(bad);
  check(r1.ship === false && r1.blocking.length >= 2, "multiple failing métiers ⇒ HOLD, all named");
  check(JSON.stringify(r1) === JSON.stringify(r2), "reproducible: same input ⇒ identical verdict");
}

console.log(failures === 0 ? "ALL PASS — SÉRIE 12 CROSS-MÉTIER COLLABORATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

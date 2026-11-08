#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const M = require("./capability-map");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 1 / M-CH1-01 — CAPABILITY MAP");
// maturity derivation (honest).
check(M.maturityOf({ status: "ACCEPTED", evidence: "proof" }) === "L2_INTEGRATED", "ACCEPTED+evidence ⇒ L2_INTEGRATED");
check(M.maturityOf({ status: "ACCEPTED" }) === "L0_ABSENT", "ACCEPTED without evidence ⇒ L0 (not a real capability)");
check(M.maturityOf({ status: "VALIDATED", evidence: "x" }) === "L3_VALIDATED", "VALIDATED ⇒ L3");
check(M.maturityOf({ status: "IN_PROGRESS" }) === "L1_PROTOTYPE", "IN_PROGRESS ⇒ L1");
check(M.maturityOf({ status: "PROPOSED" }) === "L0_ABSENT", "PROPOSED ⇒ L0");
// build map with deps + dependents.
{
  const reg = [
    { id: "a", status: "ACCEPTED", evidence: "e", program: "V5", deps: [] },
    { id: "b", status: "ACCEPTED", evidence: "e", program: "V5", deps: ["a"] },
    { id: "noev", status: "ACCEPTED", program: "V5", deps: [] },
  ];
  const map = M.buildCapabilityMap({ registerItems: reg, missions: [{ id: "M1", status: "PROPOSED", program: "E" }] });
  check(map.counts.capabilities === 2, "ACCEPTED-without-evidence excluded (2 real caps, not 3)");
  check(map.edges.some((e: any) => e.from === "a" && e.to === "b"), "dependency edge a->b");
  check(M.queryCapability(map, "a").dependents.includes("b"), "a has dependent b");
  check(map.gaps.length === 1 && map.gaps[0].id === "M1", "PROPOSED mission ⇒ gap");
}
// against the REAL register: all capabilities are L2 (ACCEPTED+evidence) or L3; none L3 unless VALIDATED.
{
  const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../docs/odg/closure-register.json"), "utf8"));
  const map = M.buildCapabilityMap({ registerItems: reg.items });
  check(map.counts.capabilities > 300, `real register ⇒ 300+ capabilities (got ${map.counts.capabilities})`);
  check(map.counts.validated === (map.byMaturity.L3_VALIDATED || 0), "validated count = L3 count (honest: no L3 without VALIDATED status)");
}
check(M.CAPABILITY_MAP_CONTRACT.invariants.some((i: any) => /not counted as a real capability/i.test(i)), "contract: no-evidence excluded");
console.log(failures === 0 ? "ALL PASS — V5 M-CH1-01 CAPABILITY MAP" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};

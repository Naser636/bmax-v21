#!/usr/bin/env node
"use strict";
const assert = require("assert");
const GE = require("./gate-e-demonstration");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §101 — GATE E (TECHNICAL TRUTH) DEMONSTRATION");

const presOk = { ok: true };
const presBad = { ok: false, violations: ["stashes dropped"] };

// POSITIVE: all real evidence green + preservation ⇒ DEMONSTRATED_SLICE.
{
  const r = GE.demonstrateGateE({ build: true, typescript: true, generatedContractsValid: true }, { preservation: presOk });
  check(r.verdict === "DEMONSTRATED_SLICE" && r.demonstrated === true && r.slice === true, "POSITIVE: build+ts+contracts+preservation ⇒ DEMONSTRATED_SLICE");
  check(/NOT a global Gate-E PASS/.test(r.note) && r.remaining.length >= 1, "honest: slice is NOT a global PASS; remaining recorded");
}

// contracts via the detailed shape (total>0, invalid empty) also counts.
{
  const r = GE.demonstrateGateE({ build: true, typescript: true, generatedContracts: { total: 92, invalid: [] } }, { preservation: presOk });
  check(r.demonstrated === true, "contracts via {total,invalid:[]} shape ⇒ valid");
}

// NEGATIVE: a failing typescript ⇒ NOT_DEMONSTRATED (fail-closed).
{
  const r = GE.demonstrateGateE({ build: true, typescript: false, generatedContractsValid: true }, { preservation: presOk });
  check(r.verdict === "NOT_DEMONSTRATED" && r.failing.includes("typescript"), "NEGATIVE: typescript false ⇒ NOT_DEMONSTRATED");
}

// NEGATIVE: preservation violated ⇒ NOT_DEMONSTRATED (technical truth includes preservation).
{
  const r = GE.demonstrateGateE({ build: true, typescript: true, generatedContractsValid: true }, { preservation: presBad });
  check(r.verdict === "NOT_DEMONSTRATED" && r.failing.includes("preservation invariant"), "NEGATIVE: preservation violated ⇒ NOT_DEMONSTRATED");
}

// ADVERSARIAL: empty snapshot ⇒ NOT_DEMONSTRATED (no vacuous pass).
{
  const r = GE.demonstrateGateE({}, { preservation: presOk });
  check(r.demonstrated === false, "ADVERSARIAL: empty verify snapshot ⇒ NOT_DEMONSTRATED (no vacuous pass)");
}

// honesty: only Gate E demonstrable now; the other six are not claimed demonstrated.
{
  const s = GE.gateDemonstrationStatus();
  const e = s.gates.find((g: any) => g.gate === "E");
  const others = s.gates.filter((g: any) => g.gate !== "E");
  check(e.demonstrableNow === true, "Gate E demonstrable now (slice)");
  check(others.every((g: any) => g.demonstrableNow === false), "Gates A/B/C/D/F/G NOT claimed demonstrated (honest)");
}

check(GE.GATE_E_DEMONSTRATION_CONTRACT.invariants.some((i: any) => /fabricates no PASS/.test(i)), "contract documents no-fabricated-PASS");

console.log(failures === 0 ? "ALL PASS — V12.4 §101 GATE E DEMONSTRATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};

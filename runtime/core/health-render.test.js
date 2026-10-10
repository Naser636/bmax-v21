#!/usr/bin/env node

/*
 * Health dashboard render() — RC-5 behavioural test.
 *
 * Proves the Dashboard reconciles the last-run VALIDATION VERDICT (state.lastRun) with the governance
 * Next Action WITHOUT conflating them, and stays behaviour-preserving when no verdict exists.
 * render() is pure (no filesystem), so this test needs no temp tree. Deterministic.
 */

"use strict";

const path = require("path");
const assert = require("assert");
const { render } = require(path.resolve(__dirname, "..", "bin", "odg-health.js"));

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function base() {
  return {
    state: { runtime: "READY", status: "READY", foundation: "READY", pipeline: "READY", brain: "READY", lastMission: "PREV", nextMission: "MX" },
    status: { runtime: "READY", foundation: "READY", nextMission: "MX" },
    caps: { capabilities: ["A"], missingCapabilities: [{ id: "MX" }] },
    ledger: { count: 1, entries: [{ mission: "PREV", state: "ARCHIVED" }] },
    constitution: { principles: ["DETERMINISM_FIRST"] },
    queue: { queue: [{ mission: "MX", objective: "MX_1", status: "PENDING" }] },
  };
}

console.log("Health render — RC-5 verdict reconciliation");

// 1. SUCCESS last-run on the SAME mission as Next Action ⇒ Next Action annotated + Last Run line.
{
  const a = base();
  a.state.lastRun = { mission: "MX", status: "SUCCESS", validated: true };
  const out = render(a);
  ok("Next Action annotated with the SUCCESS verdict", out.includes("last run: SUCCESS (validated, awaiting ledger record)"));
  ok("a LAST RUN line surfaces the verdict", out.includes("Last Run     : MX — SUCCESS"));
  ok("governance Next Action mission is preserved (not replaced)", out.includes("MX / MX_1 — last run: SUCCESS"));
}

// 2. BLOCKED last-run is shown verbatim (never promoted to SUCCESS).
{
  const a = base();
  a.state.lastRun = { mission: "MX", status: "BLOCKED", validated: false };
  const out = render(a);
  ok("Next Action annotated BLOCKED", out.includes("last run: BLOCKED"));
  ok("BLOCKED verdict is not shown as SUCCESS", !out.includes("last run: SUCCESS"));
  ok("LAST RUN line marks validated=false", out.includes("Last Run     : MX — BLOCKED (validated=false)"));
}

// 3. No verdict ⇒ behaviour-preserving: no Last Run line, no annotation, plain Next Action.
{
  const out = render(base());
  ok("no 'Last Run' line when there is no verdict (byte-identical to before)", !out.includes("Last Run"));
  ok("no Next Action annotation when there is no verdict", !out.includes("last run:"));
  ok("plain governance Next Action is rendered", out.includes("\n  MX / MX_1\n"));
  ok("dashboard honours the <100-line contract", out.split("\n").length <= 99);
}

// 4. A verdict on a DIFFERENT mission ⇒ Last Run shown, but Next Action NOT falsely annotated.
{
  const a = base();
  a.state.lastRun = { mission: "OTHER", status: "SUCCESS", validated: true };
  const out = render(a);
  ok("Last Run line reflects the other mission", out.includes("Last Run     : OTHER — SUCCESS"));
  ok("Next Action stays plain when the verdict is for another mission", out.includes("\n  MX / MX_1\n") && !out.includes("MX / MX_1 — last run"));
}

console.log(`\nHealth render — ${passed} assertions passed.`);

#!/usr/bin/env node

/*
 * Governance Kernel — TRUTH REPAIR test (FIX_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1).
 *
 * authorizeMission() does NOT make a real authority decision: it only reports whether the current
 * lifecycle state has an outgoing edge in state-machine.json. Before this repair that lifecycle fact
 * was surfaced as `authorized`, misrepresenting a state-graph adjacency as an authority grant.
 *
 * This test pins the honest post-repair contract and PROVES that no authority source was invented:
 *   - `transitionPossible` is the real adjacency fact (true for a non-terminal state, false for the
 *     terminal one);
 *   - `authorized` is preserved as a backward-compatibility ALIAS equal to `transitionPossible`
 *     (existing callers keep identical behaviour — no verdict change);
 *   - `authorityEnforced` is explicitly false;
 *   - the result is INDEPENDENT of mission identity (two unrelated mission names at the same state
 *     yield identical authorization fields) — i.e. no per-mission authority allowlist exists.
 *
 * Drives the REAL module against the REAL authority files, copied into a throwaway cwd (the kernel
 * reads them via relative paths). Deterministic: no wall-clock, no network.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..", "..");

let passed = 0;
function ok(name, cond, extra) {
  assert.ok(cond, name + (extra ? "  " + extra : ""));
  console.log("  ok -", name, extra || "");
  passed += 1;
}
function cp(sandbox, rel) {
  const d = path.join(sandbox, rel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(path.join(REPO, rel), d);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "governance-kernel-"));
const cwd0 = process.cwd();

try {
  // Real authority inputs read by authorizeMission (relative-path reads ⇒ need a real cwd).
  cp(sandbox, "runtime/governance/state-machine.json");
  cp(sandbox, "runtime/constitution/runtime-constitution.json");
  cp(sandbox, "runtime/policies/runtime-policies.json");

  process.chdir(sandbox);
  const { authorizeMission } = require("./governance-kernel"); // the REAL module, reading sandbox cwd
  const sm = JSON.parse(fs.readFileSync("runtime/governance/state-machine.json", "utf8"));

  console.log("Case 1 — the honest fact IS lifecycle-transition possibility (non-terminal state)");
  const created = authorizeMission("ANY_MISSION", "CREATED");
  ok("transitionPossible=true for a non-terminal state", created.transitionPossible === true);
  ok("transitionPossible mirrors the real state-machine adjacency",
    created.transitionPossible === ((sm.transitions["CREATED"] || []).length > 0));

  console.log("Case 2 — the terminal state has no outgoing edge ⇒ transitionPossible=false");
  const archived = authorizeMission("ANY_MISSION", sm.terminalState);
  ok("transitionPossible=false for the terminal state", archived.transitionPossible === false, "(state=" + sm.terminalState + ")");

  console.log("Case 3 — `authorized` is a preserved compatibility ALIAS of transitionPossible (no verdict change)");
  ok("authorized === transitionPossible (non-terminal)", created.authorized === created.transitionPossible && created.authorized === true);
  ok("authorized === transitionPossible (terminal)", archived.authorized === archived.transitionPossible && archived.authorized === false);

  console.log("Case 4 — authority is explicitly NOT enforced (absence declared, nothing invented)");
  ok("authorityEnforced === false", created.authorityEnforced === false);
  ok("no authority/permission/allowlist field was added",
    !("permissions" in created) && !("allowlist" in created) && !("authoritySource" in created) && !("roles" in created));

  console.log("Case 5 — PROOF no authority source exists: result is independent of mission identity");
  const a = authorizeMission("FIX_GOVERNANCE_AUTHORIZATION_TAUTOLOGY_V1", "CREATED");
  const b = authorizeMission("../../etc/passwd", "CREATED");
  const c = authorizeMission("", "CREATED");
  ok("different missions ⇒ identical transitionPossible", a.transitionPossible === b.transitionPossible && b.transitionPossible === c.transitionPossible);
  ok("different missions ⇒ identical authorized", a.authorized === b.authorized && b.authorized === c.authorized && a.authorized === true);

  console.log("Case 6 — existing fields preserved for callers (nextStates / currentState / versions / strategy)");
  ok("nextStates preserved", JSON.stringify(created.nextStates) === JSON.stringify(sm.transitions["CREATED"] || []));
  ok("currentState preserved", created.currentState === "CREATED");
  ok("version/strategy fields still present",
    "constitutionVersion" in created && "policyVersion" in created && "strategy" in created);
} finally {
  process.chdir(cwd0);
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\nGOVERNANCE KERNEL TRUTH REPAIR — ${passed} assertions passed.`);

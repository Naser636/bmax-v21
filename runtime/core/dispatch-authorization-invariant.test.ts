#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * DISPATCH-AUTHORIZATION INVARIANT (audit C5-A1) — regression protection for the capability dispatch.
 *
 * ROOT CAUSE this guards (audit C5-A1, V57): capability-executors.resolve() has NO central authorization
 * chokepoint — each executor SELF-GATES (deny-by-default, dry-run default, fail-closed). Today all are
 * correct, but the risk is REGRESSION: a FUTURE executor added to the EXECUTORS registry could silently
 * omit its gate, and nothing would catch it. This test makes that omission impossible to merge silently.
 *
 * PRINCIPLE (OWASP ASVS V1/V4 Access Control, adapted): access control must be enforced and must FAIL
 * SECURELY (deny by default). Where enforcement is distributed (per-executor) rather than centralized, an
 * automated invariant is the compensating control: every consequential capability, dispatched WITHOUT any
 * authorization, must produce NO live effect (no file write / command execution / network acquisition /
 * branch integration-or-push). We assert this behaviorally for the hermetically-runnable executors and
 * structurally (a tripwire) for the whole registry.
 *
 * SAFE + HERMETIC: runs under a THROWAWAY cwd (process.chdir) so every cwd-relative write
 * (runtime/generated) lands in the temp dir — the real repo is never touched. No authorization is ever
 * supplied, so no executor can take a live action. Provider Activation is NOT invoked here (its run()
 * spawns a subprocess and its live gate is downstream in provider-live-call-gate, tested separately).
 *
 * Run: node runtime/core/dispatch-authorization-invariant.test.js   (or via tsx under `npm test`)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const execMod = require(path.join(REPO, "runtime", "core", "capability-executors.js"));
const { resolve, EXECUTORS } = execMod;

let failures = 0;
const check = (c, l) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("DISPATCH-AUTHORIZATION INVARIANT (C5-A1)");

// The GOVERNED classification of every executor. A CONSEQUENTIAL capability can take a live action (write /
// execute / network-acquire / integrate-or-push / provider call) and MUST fail closed without authorization.
// OBSERVATIONAL capabilities only read / scan / verify (delete nothing, acquire nothing, mutate nothing).
const CONSEQUENTIAL = new Set([
  "ODG Synthetic Deliverable",          // file write (confined to authorized_paths)
  "ODG Spec Author",                    // file write (confined to authorized_paths)
  "Governed Git Branch Integration",    // branch integrate / push
  "Governed Bash/Linux Command",        // command execution in sandbox
  "External Research Acquisition",      // network acquisition
  "Provider Activation",                // live provider call (gated downstream: provider-live-call-gate)
]);
const OBSERVATIONAL = new Set([
  "Clean Workspace",                    // scans transient artifacts; deletes NOTHING (read-only)
  "Governed Observability Verification",// re-derives + verifies the autonomy signal (read-only)
  "Connectivity Audit",                 // reachability probe (no acquisition / no mutation)
]);

// (1) STRUCTURAL TRIPWIRE — every executor is classified, and the two sets exactly partition the registry.
// A newly-added executor (or a rename) FAILS here until it is consciously classified consequential-or-not,
// which is precisely the review that forces a new consequential executor to carry its fail-closed gate.
const registry = EXECUTORS.map((e) => e.capability);
check(new Set(registry).size === registry.length, "no duplicate capability names in the dispatch registry");
for (const cap of registry) {
  check(CONSEQUENTIAL.has(cap) || OBSERVATIONAL.has(cap), `executor "${cap}" is classified (consequential | observational) — a new one must be classified before it can dispatch`);
}
for (const cap of [...CONSEQUENTIAL, ...OBSERVATIONAL]) {
  check(registry.includes(cap), `classified capability "${cap}" still exists in the registry (classification not stale)`);
}
check(registry.length === CONSEQUENTIAL.size + OBSERVATIONAL.size, `registry size (${registry.length}) == classified size (${CONSEQUENTIAL.size + OBSERVATIONAL.size})`);

// (2) BEHAVIORAL FAIL-CLOSED — dispatch each hermetically-runnable consequential capability via resolve()
// with an UNAUTHORIZED patch (no grant / no execute / no scope), under a throwaway cwd, and assert NO live
// effect. Any throw is also fail-closed (a refusal before effect). Provider Activation is excluded (spawns).
const cwd0 = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dai-"));
// A no-live-effect verdict: the run either threw (refused) or returned a result with no live-action flag set.
function failClosed(objectiveId, assertNoEffect) {
  const r = resolve({ objectiveId });
  if (!r) return { routed: false, ok: false };
  let threw = false, result = null, err = null;
  try { result = r.run(); } catch (e) { threw = true; err = e; }
  const ok = threw ? true : assertNoEffect(result);
  return { routed: true, ok, threw, result, err };
}
try {
  process.chdir(tmp);

  // route correctness: each prefix resolves to the expected capability
  check(resolve({ objectiveId: "BASH_COMMAND__x" }).capability === "Governed Bash/Linux Command", "resolve routes BASH_COMMAND__ ⇒ Governed Bash/Linux Command");
  check(resolve({ objectiveId: "GIT_BRANCH_INTEGRATION__x" }).capability === "Governed Git Branch Integration", "resolve routes GIT_BRANCH_INTEGRATION ⇒ Git Branch Integration");
  check(resolve({ objectiveId: "EXTERNAL_RESEARCH_x" }).capability === "External Research Acquisition", "resolve routes EXTERNAL_RESEARCH_ ⇒ External Research Acquisition");
  check(resolve({ objectiveId: "ODG_WRITE_x" }).capability === "ODG Synthetic Deliverable", "resolve routes ODG_WRITE_ ⇒ ODG Synthetic Deliverable");
  check(resolve({ objectiveId: "ODG_SPEC_x" }).capability === "ODG Spec Author", "resolve routes ODG_SPEC_ ⇒ ODG Spec Author");

  // BASH_COMMAND unauthorized ⇒ dry-run default, NEVER EXECUTED (no command / no execute flag).
  const bash = failClosed("BASH_COMMAND__noauth", (res) => res && res.summary && res.summary.outcome !== "EXECUTED" && res.summary.outcome !== "SANDBOX_OBSERVED");
  check(bash.routed && bash.ok, "BASH_COMMAND unauthorized ⇒ fail-closed (never EXECUTED / never sandbox-ran)");

  // EXTERNAL_RESEARCH unauthorized ⇒ DRY_RUN, acquired:false, ZERO network.
  const research = failClosed("EXTERNAL_RESEARCH_noauth", (res) => res && res.summary && res.summary.mode === "DRY_RUN" && res.summary.acquired === false);
  check(research.routed && research.ok, "EXTERNAL_RESEARCH unauthorized ⇒ fail-closed (DRY_RUN, acquired:false, zero network)");

  // GIT_BRANCH_INTEGRATION unauthorized ⇒ DRY_RUN, never integrated/pushed (or throws in a non-repo temp dir).
  const git = failClosed("GIT_BRANCH_INTEGRATION__noauth", (res) => res && res.summary && res.summary.integrated !== true && res.summary.pushed !== true);
  check(git.routed && git.ok, "GIT_BRANCH_INTEGRATION unauthorized ⇒ fail-closed (never integrated/pushed; or refused)");

  // ODG_WRITE_ / ODG_SPEC_ unauthorized ⇒ no authorized scope ⇒ confineSyntheticTarget refuses (throws) ⇒ NO write.
  const write = failClosed("ODG_WRITE_noauth", () => false); // a non-throwing success would FAIL (there must be no write)
  check(write.routed && write.threw === true, "ODG_WRITE_ unauthorized (no authorized_paths) ⇒ REFUSED before any write");
  const spec = failClosed("ODG_SPEC_noauth", () => false);
  check(spec.routed && spec.threw === true, "ODG_SPEC_ unauthorized (no authorized_paths) ⇒ REFUSED before any write");

  // Provider Activation: structurally governed (above); NOT invoked here — its run() spawns a subprocess and
  // its live gate is enforced downstream by provider-live-call-gate (own tests). Assert only that it routes.
  check(resolve({ objectiveId: "x", action: "activate provider" }).capability === "Provider Activation", "Provider Activation routes (behavioral gate is downstream in provider-live-call-gate; not spawned here)");
} finally {
  process.chdir(cwd0);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}

console.log(failures === 0 ? "ALL PASS — dispatch-authorization invariant (C5-A1)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

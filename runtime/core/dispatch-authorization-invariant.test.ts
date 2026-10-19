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
  "Implement Via Local Provider",       // applies a LOCAL-provider-authored diff (scope-validated, fail-closed, ODG never commits)
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
  check(resolve({ objectiveId: "IMPLEMENT_LOCAL_CODE_x" }).capability === "Implement Via Local Provider", "resolve routes IMPLEMENT_LOCAL_CODE ⇒ Implement Via Local Provider");

  // IMPLEMENT_LOCAL_CODE with no local generator ⇒ GENERATOR_UNAVAILABLE ⇒ run() throws (fail-closed, no
  // live effect, and crucially NO external/billable provider fallback). A throw is a refusal before effect.
  const impl = failClosed("IMPLEMENT_LOCAL_CODE_noauth", (res) => res && res.summary && res.summary.status !== "EXECUTED");
  check(impl.routed && impl.ok, "IMPLEMENT_LOCAL_CODE with no generator ⇒ fail-closed (GENERATOR_UNAVAILABLE, no external fallback, no effect)");

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

// --- TRUST-GAP-3(a): resolve() CHOKEPOINT — deny-by-default for an unregistered/ungoverned capability ------
// The classification is now a PRODUCTION registry (CAPABILITY_EFFECT), enforced at resolve() BEFORE any
// effect. A new executor added to EXECUTORS but NOT the registry cannot produce an effect (deny-by-default).
{
  const { CAPABILITY_EFFECT, effectRegistryVerdict } = execMod;
  // Registry is the single SOT: every EXECUTORS capability is registered, and the registry adds no phantom.
  const regKeys = new Set(Object.keys(CAPABILITY_EFFECT));
  check([...new Set(EXECUTORS.map((e: any) => e.capability))].every((c: any) => regKeys.has(c)), "every dispatchable capability is in CAPABILITY_EFFECT (registry complete)");
  check([...regKeys].every((c: any) => EXECUTORS.some((e: any) => e.capability === c)), "CAPABILITY_EFFECT has no phantom capability (no stale registry entry)");
  // Registry classification agrees with the governed CONSEQUENTIAL/OBSERVATIONAL partition (no drift).
  check([...CONSEQUENTIAL].every((c) => CAPABILITY_EFFECT[c] && CAPABILITY_EFFECT[c].effect === "consequential"), "registry marks every CONSEQUENTIAL capability consequential");
  check([...OBSERVATIONAL].every((c) => CAPABILITY_EFFECT[c] && CAPABILITY_EFFECT[c].effect === "observational"), "registry marks every OBSERVATIONAL capability observational");
  check([...CONSEQUENTIAL].every((c) => typeof CAPABILITY_EFFECT[c].control === "string" && CAPABILITY_EFFECT[c].control.length > 0), "every consequential capability names a control mechanism");
  // Verdict: unregistered ⇒ deny; registered ⇒ ok.
  check(effectRegistryVerdict("No Such Capability").ok === false && /UNREGISTERED_CAPABILITY/.test(effectRegistryVerdict("No Such Capability").reason), "effectRegistryVerdict: unknown capability ⇒ deny-by-default");
  check(effectRegistryVerdict("Governed Bash/Linux Command").ok === true, "effectRegistryVerdict: a registered capability ⇒ ok");
  // INTEGRATION (adversarial): a dummy consequential executor with NO internal gate + NOT registered ⇒
  // resolve().run() REFUSES before any effect (proven: the side-effect file is never written).
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gap3a-"));
  const target = path.join(d, "pwned.txt");
  EXECUTORS.push({ capability: "Dummy Ungoverned Writer", matches: (p: any) => p && p.objectiveId === "DUMMY_UNGOVERNED_1", run: () => { fs.writeFileSync(target, "effect"); return { capability: "Dummy Ungoverned Writer", evidence: target }; } });
  let threw = false, msg = "";
  try { resolve({ objectiveId: "DUMMY_UNGOVERNED_1" }).run(); } catch (e: any) { threw = true; msg = e.message; }
  EXECUTORS.pop();
  check(threw && /REFUSED|UNREGISTERED_CAPABILITY/.test(msg), "unregistered consequential executor ⇒ resolve().run() REFUSES");
  check(fs.existsSync(target) === false, "unregistered executor produced NO EFFECT (side-effect file never written)");
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  // NO double-gating / NO regression: a registered executor still resolves + its run is bound (not pre-refused).
  const legit = resolve({ objectiveId: "CLEAN_WORKSPACE_1" });
  check(!!legit && legit.capability === "Clean Workspace" && typeof legit.run === "function" && legit.effect === "observational", "registered executor resolves normally (no double-gating / no pre-refusal)");
}

console.log(failures === 0 ? "ALL PASS — dispatch-authorization invariant (C5-A1)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

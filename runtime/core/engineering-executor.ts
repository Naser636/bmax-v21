#!/usr/bin/env node
/**
 * engineering-executor — ODG AUTONOMOUS ENGINEERING EXECUTOR V1 (slice 1): a BOUNDED, DENY-BY-DEFAULT governance
 * state-machine for engineering lots that perform REAL modifications — distinct from the `verification` executor
 * (which only runs read-only syntax/type checks). It does NOT grant general modification power: the real effecting
 * function is INJECTED by ODG per lot (never self-granted), the write-set is explicitly bounded and enforced, and a
 * lot reaches ACCEPTED only through the full evidence ladder with execution and verification SEPARATED.
 *
 * Ladder (each transition requires its own evidence — NO fictitious transition):
 *   PROPOSED → AUTHORIZED → EXECUTING → VERIFIED → ACCEPTED   (canonical protocol states)
 * with sub-gates recorded as evidence: authorized · executed · writeSetContained · tested · independentlyVerified.
 *
 * Fail-closed invariants:
 *  - DENY-BY-DEFAULT: no explicit authorization, or no bounded write-set, or no injected real executor ⇒ it STOPS at
 *    the corresponding state with an honest reason (never a faked forward transition, never a self-granted executor).
 *  - WRITE-SET CONTAINMENT: any produced change outside the declared write-set ⇒ the whole lot is REFUSED (REJECTED,
 *    default-deny via delegate-isolation.validateScope). NOTE: this is a REFUSAL GATE, not a filesystem revert — it does
 *    no fs/git I/O; the injected executor MUST use the isolate→diff→validate→apply discipline (delegate-isolation
 *    .applyProposal) so an out-of-scope change never lands on the real repo in the first place.
 *  - SEPARATION of execution & verification: ACCEPTED requires an INDEPENDENT verifier that is a DISTINCT function from
 *    the executor (the executor can never self-verify); missing/same ⇒ cannot pass VERIFIED. CAVEAT: the distinctness
 *    check is function-reference identity + a required verifier `by` label — two wrappers over the same implementation
 *    would pass here; TRUE independence (different trust root) is asserted at the CI + independent-audit layer, not here.
 *  - A no-op (zero changes) or evidence without real integer exit codes is NEVER ACCEPTED (no fabricated proof).
 *  - PROOF-REQUIRED: the final ACCEPTED transition is gated by mission-evidence.assertAcceptable({expect:"ACCEPTED"}),
 *    which re-confirms real exit codes / verification and refuses a spoofed/missing-evidence transition.
 * Composes mission-evidence + delegate-isolation; NO new permanent primitive (a RESOLVER/EXECUTOR-layer orchestration
 * over the existing STATE/CONTRACT/POLICY/EVIDENCE primitives). Pure/deterministic given injected deps + clock.
 */
"use strict";

const MEV = require("./mission-evidence.js");
const ISO = require("./delegate-isolation.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isFn(v: any): boolean { return typeof v === "function"; }
/** a bounded write-set: a non-empty array of explicit (non-glob, non-empty) relative file paths. */
function boundedWriteSet(ws: any): boolean {
  return Array.isArray(ws) && ws.length > 0 && ws.every((p: any) => typeof p === "string" && p.trim().length > 0 && !p.includes("*") && !p.includes("..") && !p.startsWith("/"));
}

/**
 * runEngineeringLot(lot, deps, opts?): drive one engineering lot through the deny-by-default ladder.
 * lot = { id, title?, authorization:{authorized, grantedBy?, scope?}, write_set:[paths], ... }
 * deps = { execute(lot)->{changes:[{path,...}], attempts:[{command,exitCode,stderr?}]}, runTests(lot,execResult)->{passed,exitCode,detail?},
 *          independentVerify(lot,execResult)->{ok,by,method} }  — ALL injected by ODG; absent ⇒ deny-by-default stop.
 * Returns { taskId, status(protocol state), accepted, ladder:[{state,evidence}], reason, proof? }. Never throws on policy.
 */
function runEngineeringLot(lot: any, deps: any = {}, opts: any = {}): any {
  const at = typeof opts.at === "string" ? opts.at : undefined;
  const ladder: any[] = [{ state: "PROPOSED", evidence: "lot received" }];
  const stop = (status: string, reason: string, extra: any = {}) => ({ taskId: lot && lot.id, status, accepted: false, ladder, reason, ...extra });
  if (!isObj(lot) || typeof lot.id !== "string" || !lot.id) return stop("REJECTED", "invalid lot (id required)");

  // (1) PROPOSED → AUTHORIZED — deny-by-default: explicit authorization + a bounded write-set are BOTH required.
  const authorized = isObj(lot.authorization) && lot.authorization.authorized === true;
  if (!authorized) return stop("PROPOSED", "deny-by-default: lot.authorization.authorized !== true (ODG/CTO must authorize; the executor never self-authorizes)");
  if (!boundedWriteSet(lot.write_set)) return stop("AUTHORIZED", "deny-by-default: no bounded write_set (non-empty array of explicit, non-glob, repo-relative paths required)");
  // if an authorized scope is declared, the enforced write_set must be CONTAINED by it (no enforcing a path the
  // authorization did not grant). Default-deny on mismatch.
  if (Array.isArray(lot.authorization.scope) && lot.authorization.scope.length > 0) {
    const granted = new Set(lot.authorization.scope);
    const ungranted = lot.write_set.filter((p: string) => !granted.has(p));
    if (ungranted.length) return stop("AUTHORIZED", `deny-by-default: write_set path(s) not in authorization.scope: ${ungranted.join(", ")}`);
  }
  ladder.push({ state: "AUTHORIZED", evidence: `authorized by ${(lot.authorization.grantedBy) || "ODG"}; write_set=${lot.write_set.length} path(s)` });

  // (2) AUTHORIZED → EXECUTING — requires an INJECTED real executor (never self-granted). Absent ⇒ honest stop.
  if (!isFn(deps.execute)) return stop("AUTHORIZED", "NO_ENGINEERING_EXECUTOR_ATTACHED: no authorized real executor injected (deny-by-default; refuses to invent an effect)");
  let execResult: any;
  try { execResult = deps.execute(lot); } catch (e: any) { return stop("EXECUTING", `executor threw: ${(e && e.message) || e}`); }
  // a REAL engineering lot must produce ≥1 concrete change (a no-op is never an accepted engineering lot).
  if (!isObj(execResult) || !Array.isArray(execResult.changes) || execResult.changes.length === 0) return stop("EXECUTING", "executor produced no concrete change(s) — a no-op is not an accepted engineering lot (deny-by-default)");
  // PROOF-REQUIRED: evidence is never fabricated. The executor must report ≥1 real attempt each carrying an integer
  // exit code; absent ⇒ STOP (we do NOT synthesise a passing attempt).
  const attempts = Array.isArray(execResult.attempts) ? execResult.attempts : [];
  if (attempts.length === 0 || !attempts.every((a: any) => isObj(a) && Number.isInteger(a.exitCode))) return stop("EXECUTING", "executor reported no real attempts with integer exit codes — refusing to fabricate proof (deny-by-default)");
  ladder.push({ state: "EXECUTING", evidence: `executed: ${execResult.changes.length} change(s), ${attempts.length} attempt(s)` });

  // (3) WRITE-SET CONTAINMENT — any out-of-scope change ⇒ atomic refusal (default-deny). Normalise change paths to the
  // {rel} shape delegate-isolation.validateScope expects (a change may carry `path` or `rel`).
  const scopeChanges = execResult.changes.map((c: any) => ({ rel: (c && (c.path || c.rel)) || "" }));
  const scope = ISO.validateScope(scopeChanges, lot.write_set);
  if (!scope.ok) return stop("REJECTED", `write-set violation — REFUSED (no acceptance). NOTE: this gate refuses; it does not revert the filesystem — the injected executor MUST use the isolate→diff→validate→apply discipline (delegate-isolation.applyProposal) so an out-of-scope change never lands. ${scope.detail}`, { outOfScope: scope.outOfScope });
  ladder.push({ state: "EXECUTING", evidence: "write-set contained (all changes in scope)" });

  // (4) tests — real pass required (an executor that skips tests cannot advance).
  if (!isFn(deps.runTests)) return stop("EXECUTING", "deny-by-default: no runTests injected (a real targeted test is required before verification)");
  let tests: any;
  try { tests = deps.runTests(lot, execResult); } catch (e: any) { return stop("EXECUTING", `runTests threw: ${(e && e.message) || e}`); }
  if (!isObj(tests) || tests.passed !== true || !Number.isInteger(tests.exitCode)) return stop("EXECUTING", `tests did not pass with a real integer exit code: ${(tests && tests.detail) || "no pass/exitCode signal"}`);
  ladder.push({ state: "EXECUTING", evidence: `tests passed (exit ${isObj(tests) ? tests.exitCode : "?"})` });

  // (5) SEPARATION of execution & verification — the verifier must exist AND be a DISTINCT function from the executor.
  if (!isFn(deps.independentVerify)) return stop("EXECUTING", "deny-by-default: no INDEPENDENT verifier injected (execution cannot self-verify)");
  if (deps.independentVerify === deps.execute) return stop("EXECUTING", "SEPARATION_VIOLATION: the independent verifier must NOT be the executor function (no self-verification)");
  let verify: any;
  try { verify = deps.independentVerify(lot, execResult); } catch (e: any) { return stop("EXECUTING", `independentVerify threw: ${(e && e.message) || e}`); }
  if (!isObj(verify) || verify.ok !== true || !verify.by) return stop("EXECUTING", `independent verification did not confirm: ${(verify && verify.reason) || "no ok/by"}`);
  ladder.push({ state: "VERIFIED", evidence: `independently verified by ${verify.by} (${verify.method || "method n/a"})` });

  // (6) VERIFIED → ACCEPTED — proof-required: the false-success gate re-confirms the REAL exit codes + verification.
  // Evidence is passed through verbatim (attempts/artifacts from the real executor) — NEVER synthesised.
  let proof: any, gate: any;
  try {
    proof = MEV.buildEvidenceRecord({
      mission: { id: lot.id, objective: lot.title || lot.objective || null, acceptanceCriteria: lot.acceptance || null },
      authorization: { authorized: true, scope: lot.write_set },
      attempts,
      artifacts: execResult.changes.map((c: any) => ({ path: (c && (c.path || c.rel)) || null, sha256: (c && c.sha256) || null })),
      verification: { verified: true, by: verify.by, method: verify.method || "independent" },
      transition: { to: "ACCEPTED", reason: "executed in-scope + tests passed + independently verified" },
    }, at ? { at } : {});
    gate = MEV.assertAcceptable(proof, { expect: "ACCEPTED" });
  } catch (e: any) { return stop("VERIFIED", `proof build/gate threw (non-serialisable lot?): ${(e && e.message) || e}`); }
  if (!gate.acceptable) return stop("VERIFIED", `false-success gate refused ACCEPTED: ${(gate.reasons || []).join("; ")}`, { proof });
  ladder.push({ state: "ACCEPTED", evidence: `accepted on proof ${String(proof.digest).slice(0, 12)}` });
  return { taskId: lot.id, status: "ACCEPTED", accepted: true, ladder, reason: "all ladder gates passed on real evidence", proof };
}

/** highestProvenState(record): the furthest ladder state actually reached (for checkpoint/resume reasoning). */
function highestProvenState(record: any): string { const l = isObj(record) && Array.isArray(record.ladder) ? record.ladder : []; return l.length ? l[l.length - 1].state : "NONE"; }

export { runEngineeringLot, highestProvenState, boundedWriteSet };
module.exports = { runEngineeringLot, highestProvenState, boundedWriteSet };

if (require.main === module) {
  // DEFAULT (no injected executor) ⇒ deny-by-default honest stop.
  const r = runEngineeringLot({ id: "DEMO_LOT", authorization: { authorized: true }, write_set: ["runtime/core/x.ts"] }, {});
  process.stdout.write(JSON.stringify({ status: r.status, reason: r.reason }, null, 2) + "\n");
}

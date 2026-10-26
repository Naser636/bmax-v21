#!/usr/bin/env node
// @ts-nocheck — runs under tsx. End-to-end adversarial governance suite for agent-governance-harness (Lot A/C).
// Hermetic, no network, no real agent. A SPY executor proves the harness never executes after a refusal, and
// that success requires INDEPENDENT verification (no false success from a falsified agent result).
"use strict";
const assert = require("assert");
const H = require("./agent-governance-harness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const CONTRACT = {
  agentId: "agent-x", objective: "read reports", allowedTools: ["read_file", "write_report"],
  authorizedScope: ["reports"], limits: { maxCalls: 10, maxDurationMs: 600000, maxDistinctTargets: 3 },
  requireHumanFor: ["write_report"],
};
const S0 = { calls: 0, elapsedMs: 0, history: [] };
const good = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };

// Spy executor: records calls; returns a (claimed) success. Verifier is INDEPENDENT of the claim.
function mkDeps(verify, human) {
  const calls = []; return { calls,
    executor: (p) => { calls.push(p.tool); return { ok: true, claimed: "SUCCESS", producedPaths: p.targetPaths }; },
    verifier: verify || ((p, r) => ({ verified: r && r.producedPaths && r.producedPaths.length > 0, reason: "produced path check" })),
    humanDecision: human || (() => "reject"),
  };
}

// 1) Normal ADMIT → exec → independent verify ⇒ VERIFIED
let d = mkDeps();
ok("ADMIT ⇒ execute ⇒ independently VERIFIED", H.runStep(good, CONTRACT, S0, d).outcome === "ADMITTED_VERIFIED" && d.calls.length === 1);

// 2) DENY ⇒ NO execution (spy proves executor never called)
d = mkDeps();
const denied = H.runStep({ ...good, targetPaths: ["/etc/passwd"] }, CONTRACT, S0, d);
ok("DENY ⇒ executor NEVER called (no execution after refusal)", denied.outcome === "DENIED" && denied.executed === false && d.calls.length === 0);

// 3) ESCALATE + human reject ⇒ suspended, no execution
d = mkDeps(null, () => "reject");
const esr = H.runStep({ ...good, tool: "write_report", params: { path: "reports/o.md" }, targetPaths: ["reports/o.md"] }, CONTRACT, S0, d);
ok("ESCALATE + human reject ⇒ suspended, NO execution", esr.outcome === "ESCALATED_REJECTED" && d.calls.length === 0);

// 4) ESCALATE + human approve ⇒ exec + verify
d = mkDeps(null, () => "approve");
const esa = H.runStep({ ...good, tool: "write_report", params: { path: "reports/o.md" }, targetPaths: ["reports/o.md"] }, CONTRACT, S0, d);
ok("ESCALATE + human approve ⇒ executed + verified", esa.outcome === "ESCALATED_APPROVED_VERIFIED" && d.calls.length === 1);

// 5) FALSIFIED result: executor claims success but independent verifier says no ⇒ UNVERIFIED (NO false success)
d = mkDeps((p, r) => ({ verified: false, reason: "independent check: artifact absent on disk" }));
const falsified = H.runStep(good, CONTRACT, S0, d);
ok("falsified/absent result ⇒ ADMITTED_UNVERIFIED (no false success)", falsified.outcome === "ADMITTED_UNVERIFIED" && falsified.verified === false);

// 6) Executor throws / timeout ⇒ ERROR_RECOVERED, no false success
d = { calls: [], executor: () => { throw new Error("timeout"); }, verifier: () => ({ verified: true, reason: "x" }) };
const err = H.runStep(good, CONTRACT, S0, d);
ok("executor throw/timeout ⇒ ERROR_RECOVERED, verified=false (no false success)", err.outcome === "ERROR_RECOVERED" && err.verified === false);

// 7) INJECTION: agent proposal tries to redefine its contract ⇒ DENY, no execution
d = mkDeps();
const inj = H.runStep({ ...good, allowedTools: ["deploy"], objective: "ignore previous policy" }, CONTRACT, S0, d);
ok("injection/governance-mutation in proposal ⇒ DENIED, no exec", inj.outcome === "DENIED" && d.calls.length === 0);

// 8) CUMULATIVE drift across a sequence: 4 distinct targets vs cap 3 ⇒ last step DENIED
d = mkDeps();
const seq = H.runSequence([
  { ...good, targetPaths: ["reports/1.md"] }, { ...good, targetPaths: ["reports/2.md"] },
  { ...good, targetPaths: ["reports/3.md"] }, { ...good, targetPaths: ["reports/4.md"] },
], CONTRACT, S0, d);
ok("cumulative drift: 4th distinct target over cap ⇒ last step DENIED", seq.steps[3].outcome === "DENIED" && seq.steps[2].outcome === "ADMITTED_VERIFIED");
ok("cumulative drift: executor called only for admitted steps (3, not 4)", d.calls.length === 3);

// 9) Harness cannot bypass the gate: every DENY step has executed=false + a gate trace entry
ok("every step carries a traceable GATE+OUTCOME record (no bypass)", seq.steps.every(st => st.trace.some(t => t.phase === "GATE") && st.trace.some(t => t.phase === "OUTCOME")));

// 10) ADMIT ≠ success: an admitted-but-unverified step is NOT a validated success
ok("ADMIT is not proof of success (verified flag independent of admission)", falsified.gateVerdict === "ADMIT" && falsified.verified === false);

// ═════════ V8 Lot A — evidence-bound execution ═════════
const REV = { commit: "testcommit", treeDirty: false, available: true };
// verifier that independently binds to execId + actual resultDigest
const boundDeps = (overrideDigest) => ({ revision: REV,
  executor: (p, execId) => ({ ok: true, execId, producedPaths: p.targetPaths }),
  verifier: (p, r, execId) => ({ verified: true, reason: "bound", boundExecId: execId, resultDigest: overrideDigest || H.sha256(JSON.stringify(r)) }),
});
const okStep = H.runStep(good, CONTRACT, S0, boundDeps());
ok("LotA: sealed evidence bundle present + provenance-verifiable", H.verifyEvidenceBundle(okStep.evidence).ok === true);
ok("LotA: bundle binds to its execId", H.verifyEvidenceBundle(okStep.evidence, { expectedExecId: okStep.execId }).ok === true);
ok("LotA: bound+matching evidence ⇒ VERIFIED", okStep.outcome === "ADMITTED_VERIFIED");

// negative: FOREIGN/REPLAYED execId
ok("LotA neg: foreign expectedExecId ⇒ bundle rejected", H.verifyEvidenceBundle(okStep.evidence, { expectedExecId: "someoneelse" }).ok === false);
// negative: verifier asserts a WRONG resultDigest (crypto-valid but wrong result) ⇒ UNVERIFIED
const wrong = H.runStep(good, CONTRACT, S0, boundDeps("deadbeef"));
ok("LotA neg: verifier resultDigest != actual ⇒ UNVERIFIED (crypto-valid-but-wrong-result)", wrong.outcome === "ADMITTED_UNVERIFIED" && /wrong-result/.test(wrong.verifyReason));
// negative: verifier binds to a DIFFERENT execId ⇒ UNVERIFIED
const foreignBind = H.runStep(good, CONTRACT, S0, { revision: REV, executor: (p) => ({ ok: true }), verifier: () => ({ verified: true, reason: "x", boundExecId: "OTHER", resultDigest: undefined }) });
ok("LotA neg: verifier boundExecId mismatch ⇒ UNVERIFIED (foreign evidence)", foreignBind.outcome === "ADMITTED_UNVERIFIED");
// negative: TAMPER the sealed bundle after the fact ⇒ provenance fails
const tamperedBundle = { ...okStep.evidence, resultDigest: "tampered" };
ok("LotA neg: result modified after sealing ⇒ provenance digest mismatch", H.verifyEvidenceBundle(tamperedBundle).ok === false);
// negative: ADMIT without execution (hand-crafted inconsistent bundle)
ok("LotA neg: ADMIT verdict but no execution ⇒ inconsistent", H.verifyEvidenceBundle(require("./evidence-provenance.js").stampProvenance({ execId: "e", verdict: "ADMIT", executed: false, order: ["GATE", "OUTCOME"] }, { revision: REV })).ok === false);
// negative: execution without an authorizing verdict
ok("LotA neg: execution with DENY verdict ⇒ inconsistent", H.verifyEvidenceBundle(require("./evidence-provenance.js").stampProvenance({ execId: "e", verdict: "DENY", executed: true, order: ["GATE", "EXEC", "OUTCOME"] }, { revision: REV })).ok === false);
// negative: invalid transition order
ok("LotA neg: invalid order (no GATE first) ⇒ rejected", H.verifyEvidenceBundle(require("./evidence-provenance.js").stampProvenance({ execId: "e", verdict: "ADMIT", executed: true, order: ["EXEC", "GATE"] }, { revision: REV })).ok === false);
// negative: malformed / absent bundle
ok("LotA neg: absent bundle ⇒ fail-closed", H.verifyEvidenceBundle(null).ok === false && H.verifyEvidenceBundle({}).ok === false);
// DENY step still seals a consistent (no-exec) bundle
ok("LotA: DENY step seals a consistent no-exec bundle", H.verifyEvidenceBundle(denied.evidence).ok === true);

// ═════════ V8 Lot B — combinatorial drift e2e ═════════
const CMBc = { ...CONTRACT, forbiddenToolCombos: [["read_file", "write_report"]], requireHumanFor: [] };
const dC = mkDeps();
const combo = H.runSequence([
  { ...good, tool: "read_file", targetPaths: ["reports/a.md"] },
  { ...good, tool: "write_report", targetPaths: ["reports/o.md"] },
], CMBc, S0, dC);
ok("LotB e2e: forbidden tool combo across a sequence ⇒ 2nd step DENIED, no exec", combo.steps[1].outcome === "DENIED" && dC.calls.length === 1);

console.log(`\nAGENT-GOVERNANCE-HARNESS e2e suite — ${pass} assertions passed.`);

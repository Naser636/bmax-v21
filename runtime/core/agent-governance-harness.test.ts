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

// ═════════ V9 — cryptographic auth integrated as a PRE-GATE step ═════════
const crypto2 = require("crypto");
const ID = require("./agent-identity.js");
const reg = ID.createRegistry();
const kp = crypto2.generateKeyPairSync("ed25519");
ID.register(reg, { tenantId: "T1", agentId: "agent-x", publicKeyPem: kp.publicKey.export({ type: "spki", format: "pem" }) });
ID.openSession(reg, { sessionId: "S1", tenantId: "T1", agentId: "agent-x", contractSha: H.contractShaOf(CONTRACT) });
const challenge = () => ID.issueChallenge(reg, { tenantId: "T1", agentId: "agent-x", sessionId: "S1", contractSha: H.contractShaOf(CONTRACT) });
const signCh = (ch) => crypto2.sign(null, Buffer.from(ID.canon(ch)), kp.privateKey).toString("base64");
const authDeps = (c9, sig) => { const da = mkDeps(); da.auth = { registry: reg, challenge: c9, signature: sig }; da.revision = { commit: "t", treeDirty: false, available: true }; return da; };

// valid auth ⇒ proceeds to gate + exec + verify
let c9 = challenge(); let da = authDeps(c9, signCh(c9));
const authed = H.runStep(good, CONTRACT, S0, da);
ok("V9 valid auth ⇒ proceeds past gate to ADMITTED_VERIFIED", authed.outcome === "ADMITTED_VERIFIED" && da.calls.length === 1 && authed.trace.some(t => t.phase === "AUTH" && t.data.ok === true));

// invalid signature ⇒ AUTH_DENIED, executor NEVER called, gate never reached
c9 = challenge(); da = authDeps(c9, signCh({ ...c9, nonce: "tampered" }));
const bad = H.runStep(good, CONTRACT, S0, da);
ok("V9 invalid auth ⇒ AUTH_DENIED, executor NEVER called", bad.outcome === "AUTH_DENIED" && bad.executed === false && da.calls.length === 0 && bad.gateVerdict === null);

// replayed challenge ⇒ 2nd AUTH_DENIED
c9 = challenge(); const sig9 = signCh(c9);
const first = H.runStep(good, CONTRACT, S0, authDeps(c9, sig9));
const replayDeps = authDeps(c9, sig9); const replay = H.runStep(good, CONTRACT, S0, replayDeps);
ok("V9 replayed challenge ⇒ AUTH_DENIED on 2nd use, no exec", first.outcome === "ADMITTED_VERIFIED" && replay.outcome === "AUTH_DENIED" && replayDeps.calls.length === 0);

// requireAuth but no auth presented ⇒ AUTH_DENIED
const dReq = mkDeps(); dReq.requireAuth = true;
const noAuth = H.runStep(good, CONTRACT, S0, dReq);
ok("V9 requireAuth + none presented ⇒ AUTH_DENIED (fail-closed), no exec", noAuth.outcome === "AUTH_DENIED" && dReq.calls.length === 0);

// AUTH bundle carries no secret
ok("V9 AUTH_DENIED bundle contains no key material", !/PRIVATE KEY|BEGIN .*KEY/.test(JSON.stringify(bad)));
// identity != permission: valid auth but out-of-scope action ⇒ still DENY at the gate (no exec)
c9 = challenge(); da = authDeps(c9, signCh(c9));
const authedButDenied = H.runStep({ ...good, targetPaths: ["/etc/passwd"] }, CONTRACT, S0, da);
ok("V9 identity != permission: authenticated but out-of-scope ⇒ gate DENY, no exec", authedButDenied.outcome === "DENIED" && da.calls.length === 0);

// ═════════ V11 — TENANT ISOLATION (logical, hermetic; NOT production isolation) ═════════
// Two independent tenants, SAME agentId + proposal: evidence must be tenant-distinct and non-attributable across.
const tDeps = (tid) => ({ revision: { commit: "t", treeDirty: false, available: true }, tenantId: tid,
  executor: (p) => ({ ok: true, producedPaths: p.targetPaths }), verifier: () => ({ verified: true, reason: "x" }), calls: [] });
const sA = H.runStep(good, CONTRACT, S0, tDeps("TA"));
const sB = H.runStep(good, CONTRACT, S0, tDeps("TB"));
ok("V11 two tenants, same agent/proposal ⇒ DISTINCT execId", sA.execId !== sB.execId);
ok("V11 A-bundle attributes to A", H.verifyEvidenceBundle(sA.evidence, { expectedTenantId: "TA" }).ok === true);
ok("V11 A-bundle CANNOT authorize/attribute to B ⇒ rejected", H.verifyEvidenceBundle(sA.evidence, { expectedTenantId: "TB" }).ok === false);
ok("V11 missing tenant binding vs expected ⇒ fail-closed", H.verifyEvidenceBundle(H.runStep(good, CONTRACT, S0, mkDeps()).evidence, { expectedTenantId: "TA" }).ok === false);
ok("V11 bundle carries the tenant it was sealed under", sA.evidence.tenantId === "TA" && sB.evidence.tenantId === "TB");

// AUTH-bound tenant: the AUTHENTICATED identity's tenant is authoritative (not proposal-supplied).
{ const reg2 = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  ID.register(reg2, { tenantId: "T-AUTH", agentId: "agent-x", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }) });
  ID.openSession(reg2, { sessionId: "SX", tenantId: "T-AUTH", agentId: "agent-x", contractSha: H.contractShaOf(CONTRACT) });
  const cc = ID.issueChallenge(reg2, { tenantId: "T-AUTH", agentId: "agent-x", sessionId: "SX", contractSha: H.contractShaOf(CONTRACT) });
  const dd = mkDeps(); dd.revision = { commit: "t", treeDirty: false, available: true };
  dd.auth = { registry: reg2, challenge: cc, signature: crypto2.sign(null, Buffer.from(ID.canon(cc)), k.privateKey).toString("base64") };
  const authedStep = H.runStep(good, CONTRACT, S0, dd);
  ok("V11 auth-bound tenant propagates to evidence (authoritative)", authedStep.outcome === "ADMITTED_VERIFIED" && authedStep.evidence.tenantId === "T-AUTH");
  ok("V11 auth-bound bundle rejects a foreign expected tenant", H.verifyEvidenceBundle(authedStep.evidence, { expectedTenantId: "T-OTHER" }).ok === false);
}

// ═════════ V12 — TENANT/CONTRACT-SCOPED ADMISSION (authenticated binding) ═════════
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  const pub = k.publicKey.export({ type: "spki", format: "pem" });
  ID.register(r, { tenantId: "TA", agentId: "agent-x", publicKeyPem: pub });
  const contractA = { agentId: "agent-x", tenantId: "TA", objective: "A", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 5, maxDurationMs: 600000 } };
  const contractB = { agentId: "agent-x", tenantId: "TA", objective: "B-DIFFERENT", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 5, maxDurationMs: 600000 } };
  const shaA = H.contractShaOf(contractA);
  ID.openSession(r, { sessionId: "SA", tenantId: "TA", agentId: "agent-x", contractSha: shaA });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TA", agentId: "agent-x", sessionId: "SA", contractSha: shaA }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const spy = () => { const calls = []; return { calls, revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { calls.push(x.tool); return { ok: true, producedPaths: x.targetPaths }; }, verifier: () => ({ verified: true, reason: "x" }) }; };

  // A1: tenant A authenticated for contract A, running contract A ⇒ admitted per policy
  let d = spy(); d.auth = mkAuth();
  ok("V12 auth(A)+contractA ⇒ ADMITTED_VERIFIED", H.runStep(p, contractA, S0, d).outcome === "ADMITTED_VERIFIED" && d.calls.length === 1);

  // A2: tenant A authenticated for contract A, running contract B ⇒ CONTRACT_MISMATCH, NO exec
  d = spy(); d.auth = mkAuth();
  const mm = H.runStep(p, contractB, S0, d);
  ok("V12 auth(A for contractA)+run contractB ⇒ CONTRACT_MISMATCH, no exec", mm.outcome === "CONTRACT_MISMATCH" && mm.executed === false && d.calls.length === 0 && mm.gateVerdict === null);

  // A3: contract whose tenant != authenticated tenant ⇒ TENANT_MISMATCH, no exec
  const contractOther = { ...contractA, tenantId: "TB" }; const shaOther = H.contractShaOf(contractOther);
  ID.openSession(r, { sessionId: "SO", tenantId: "TA", agentId: "agent-x", contractSha: shaOther });
  const cO = ID.issueChallenge(r, { tenantId: "TA", agentId: "agent-x", sessionId: "SO", contractSha: shaOther });
  d = spy(); d.auth = { registry: r, challenge: cO, signature: crypto2.sign(null, Buffer.from(ID.canon(cO)), k.privateKey).toString("base64") };
  const tm = H.runStep(p, contractOther, S0, d);
  ok("V12 contract.tenant != authenticated tenant ⇒ TENANT_MISMATCH, no exec", tm.outcome === "TENANT_MISMATCH" && d.calls.length === 0);

  // A4: an A verdict/auth cannot be replayed for B (replay the same challenge) ⇒ AUTH_DENIED (nonce consumed)
  const authR = mkAuth(); d = spy(); d.auth = authR; H.runStep(p, contractA, S0, d);
  const d2 = spy(); d2.auth = authR; const rep = H.runStep(p, contractA, S0, d2);
  ok("V12 replay of A's auth ⇒ AUTH_DENIED, no exec", rep.outcome === "AUTH_DENIED" && d2.calls.length === 0);

  // A5: bind-failure bundle carries no secret + is sealed
  ok("V12 CONTRACT_MISMATCH bundle: sealed, no key material", mm.evidence && /AUTH_BIND|CONTRACT_MISMATCH/.test(JSON.stringify(mm.evidence)) && !/PRIVATE KEY/.test(JSON.stringify(mm)));
}

// ═════════ V14 — AUTHENTICATED EXECUTION BOUNDARY (authorizeExecution) ═════════
// The gap (reproduced): a NO-AUTH policy ADMIT seals a bundle that {verdict:ADMIT, executed:true,
// verifyEvidenceBundle().ok} would treat as executable — WITHOUT authentication. authorizeExecution() is the
// sole re-verifiable execution boundary: it re-checks the sealed proof AT EXECUTION TIME and refuses any
// admission that was not authenticated + contract/tenant-bound. A downstream invoker executes ONLY if authorized.
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  const pub = k.publicKey.export({ type: "spki", format: "pem" });
  ID.register(r, { tenantId: "TV14", agentId: "agent-x", publicKeyPem: pub });
  const C = { agentId: "agent-x", tenantId: "TV14", objective: "exec-boundary", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 5, maxDurationMs: 600000 } };
  const sha = H.contractShaOf(C);
  ID.openSession(r, { sessionId: "SV", tenantId: "TV14", agentId: "agent-x", contractSha: sha });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TV14", agentId: "agent-x", sessionId: "SV", contractSha: sha }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const spy = () => { const calls = []; return { calls, revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { calls.push(x.tool); return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }) }; };
  // EXTERNAL executor-invoker that HONORS the boundary: it executes ONLY when authorizeExecution authorizes.
  const downstream = []; const invoke = (ev, expected) => { const az = H.authorizeExecution(ev, expected); if (az.authorized) downstream.push("EXEC"); return az; };
  const expect = { tenantId: "TV14", contractSha: sha };

  // (1) VALID authenticated harness path ⇒ authBound sealed; authorizeExecution AUTHORIZES; downstream executes.
  const dv = spy(); dv.auth = mkAuth();
  const good = H.runStep(p, C, S0, dv);
  ok("V14 authenticated harness step seals authBound:true + contractSha", good.outcome === "ADMITTED_VERIFIED" && good.authBound === true && good.evidence.authBound === true && good.evidence.contractSha === sha);
  const azGood = invoke(good.evidence, { ...expect, execId: good.execId, agentId: "agent-x" });
  ok("V14 valid authenticated admission ⇒ authorizeExecution AUTHORIZES", azGood.authorized === true);
  ok("V14 downstream executes ONLY after authorization", downstream.length === 1);

  // (2) DIRECT/UNAUTHENTICATED ADMIT ⇒ authBound:false ⇒ REFUSED ⇒ NO downstream execution.
  const dna = spy(); // NO .auth
  const noauth = H.runStep(p, C, S0, dna);
  const before = downstream.length;
  const azNo = invoke(noauth.evidence, { tenantId: null, contractSha: noauth.evidence.contractSha });
  ok("V14 bare ADMIT (no auth) ⇒ authBound:false", noauth.gateVerdict === "ADMIT" && noauth.executed === true && noauth.authBound === false);
  ok("V14 unauthenticated ADMIT ⇒ NOT authorized ⇒ no downstream exec", azNo.authorized === false && /authBound/.test(azNo.reason) && downstream.length === before);

  // (3) TAMPERED sealed proof ⇒ provenance fails ⇒ REFUSED.
  const tampered = { ...good.evidence }; tampered.objective = "ESCALATED-PRIVILEGE";
  ok("V14 tampered sealed bundle ⇒ NOT authorized", H.authorizeExecution(tampered, { ...expect, execId: good.execId }).authorized === false);

  // (4) CROSS-TENANT: valid TV14 proof presented for another tenant ⇒ REFUSED.
  ok("V14 cross-tenant proof (TV14 used as OTHER) ⇒ NOT authorized", H.authorizeExecution(good.evidence, { tenantId: "OTHER", contractSha: sha }).authorized === false);

  // (5) WRONG CONTRACT: valid proof but expected a different contractSha ⇒ REFUSED.
  ok("V14 contract binding mismatch ⇒ NOT authorized", H.authorizeExecution(good.evidence, { tenantId: "TV14", contractSha: "deadbeef" }).authorized === false);

  // (6) ABSENT/MALFORMED proof ⇒ fail-closed REFUSED.
  ok("V14 absent/malformed proof ⇒ fail-closed NOT authorized", H.authorizeExecution(null, expect).authorized === false && H.authorizeExecution({}, expect).authorized === false);

  // (7) MISSING expected context (no tenant / no contractSha) ⇒ fail-closed REFUSED (no caller-trusted defaults).
  ok("V14 missing expected tenant/contract ⇒ fail-closed", H.authorizeExecution(good.evidence, { contractSha: sha }).authorized === false && H.authorizeExecution(good.evidence, { tenantId: "TV14" }).authorized === false);

  // (8) WRONG execId binding ⇒ REFUSED (foreign/replayed evidence).
  ok("V14 execId binding mismatch ⇒ NOT authorized", H.authorizeExecution(good.evidence, { ...expect, execId: "not-the-execId" }).authorized === false);

  // (9) DENIED-AUTH bundle (replay ⇒ AUTH_DENIED, executed:false, no authBound) ⇒ REFUSED ⇒ no exec.
  const authR = mkAuth(); const dr1 = spy(); dr1.auth = authR; H.runStep(p, C, S0, dr1);
  const dr2 = spy(); dr2.auth = authR; const replay = H.runStep(p, C, S0, dr2); // nonce consumed ⇒ AUTH_DENIED
  const beforeR = downstream.length;
  const azR = invoke(replay.evidence, expect);
  ok("V14 replayed/denied auth ⇒ executed:false ⇒ NOT authorized ⇒ no exec", replay.outcome === "AUTH_DENIED" && replay.executed === false && azR.authorized === false && downstream.length === beforeR);

  // (10) NO FALSE SUCCESS: across every refused case, downstream executed EXACTLY once (only the valid path).
  ok("V14 execution spy: exactly ONE execution across all cases (only the authorized one)", downstream.length === 1);
}

console.log(`\nAGENT-GOVERNANCE-HARNESS e2e suite — ${pass} assertions passed.`);

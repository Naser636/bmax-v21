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

// ═════════ V15 — EXECUTOR BOUNDARY (createGovernedExecutor) ═════════
// The raw executor is captured in a closure and is NOT a property of the handle ⇒ given only the handle there is
// no path to run it without a verified, context-bound authorization (runtime encapsulation, not a type/convention).
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  ID.register(r, { tenantId: "TV15", agentId: "agent-x", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }) });
  const C = { agentId: "agent-x", tenantId: "TV15", objective: "exec-boundary", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 5, maxDurationMs: 600000 } };
  const sha = H.contractShaOf(C);
  ID.openSession(r, { sessionId: "SV", tenantId: "TV15", agentId: "agent-x", contractSha: sha });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TV15", agentId: "agent-x", sessionId: "SV", contractSha: sha }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const spy = () => { const calls = []; return { calls, revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { calls.push(x && x.tool); return { ok: true, producedPaths: x && x.targetPaths }; }, verifier: () => ({ verified: true, reason: "x" }) }; };

  const dv = spy(); dv.auth = mkAuth();
  const good = H.runStep(p, C, S0, dv);                                   // a VALID authenticated admission bundle
  const expect = { tenantId: "TV15", contractSha: sha, execId: good.execId, agentId: "agent-x" };

  let rawCalls = 0; const raw = (prop, execId) => { rawCalls++; return { ok: true, execId }; };
  const gx = H.createGovernedExecutor(raw);

  // (1) ENCAPSULATION: handle exposes ONLY {execute,stats}; the raw executor is not reachable from it; frozen.
  ok("V15 governed handle exposes only {execute,stats} — raw executor not a property", JSON.stringify(Object.keys(gx).sort()) === JSON.stringify(["execute", "stats"]) && typeof gx.execute === "function" && gx.executor === undefined && gx.raw === undefined && gx.rawExecutor === undefined);
  ok("V15 governed handle is frozen (cannot inject a bypass method)", Object.isFrozen(gx) && (() => { try { gx.execute = () => ({ hacked: true }); } catch (e) {} const res = gx.execute("x", null, null) || {}; return typeof gx.execute === "function" && !("hacked" in res); })());

  // (2) VALID authorization ⇒ raw invoked exactly once.
  const okRes = gx.execute(p, { evidence: good.evidence }, expect);
  ok("V15 valid authorization ⇒ executes, raw called once", okRes.executed === true && okRes.authorized === true && rawCalls === 1 && okRes.result && okRes.result.ok === true);

  // (3) ABSENT/EMPTY proof ⇒ refused, raw NOT called.
  const before1 = rawCalls;
  const n1 = gx.execute(p, undefined, expect); const n2 = gx.execute(p, { evidence: null }, expect); const n3 = gx.execute(p, { evidence: {} }, expect);
  ok("V15 absent/empty proof ⇒ refused, raw NOT called", n1.executed === false && n2.executed === false && n3.executed === false && rawCalls === before1);

  // (4) TAMPERED proof ⇒ refused.
  const tampered = { ...good.evidence }; tampered.objective = "PRIV-ESC"; const before2 = rawCalls;
  const ft = gx.execute(p, { evidence: tampered }, expect);
  ok("V15 tampered proof ⇒ refused, raw NOT called", ft.executed === false && /re-verification/.test(ft.reason) && rawCalls === before2);

  // (5) CROSS-TENANT / WRONG-CONTRACT / MISSING-CONTEXT / WRONG-EXECID ⇒ all refused.
  const before3 = rawCalls;
  const xt = gx.execute(p, { evidence: good.evidence }, { tenantId: "OTHER", contractSha: sha });
  const wc = gx.execute(p, { evidence: good.evidence }, { tenantId: "TV15", contractSha: "deadbeef" });
  const mc = gx.execute(p, { evidence: good.evidence }, { tenantId: "TV15" });
  const we = gx.execute(p, { evidence: good.evidence }, { tenantId: "TV15", contractSha: sha, execId: "nope" });
  ok("V15 cross-tenant/wrong-contract/missing-context/wrong-execId ⇒ all refused, raw NOT called", [xt, wc, mc, we].every(x => x.executed === false) && rawCalls === before3);

  // (6) UNAUTHENTICATED harness ADMIT (authBound:false) as authorization ⇒ refused.
  const dna = spy(); const noauth = H.runStep(p, C, S0, dna); const before4 = rawCalls;
  const ua = gx.execute(p, { evidence: noauth.evidence }, { tenantId: null, contractSha: noauth.evidence.contractSha });
  ok("V15 unauthenticated ADMIT as authorization ⇒ refused, raw NOT called", ua.executed === false && /authBound/.test(ua.reason) && rawCalls === before4);

  // (7) NO EXEC AFTER REFUSAL even when raw would throw: refusal short-circuits BEFORE raw.
  let throwCalls = 0; const throwingRaw = () => { throwCalls++; throw new Error("boom"); };
  const gxt = H.createGovernedExecutor(throwingRaw);
  const safe = gxt.execute(p, { evidence: null }, expect);
  ok("V15 refusal short-circuits BEFORE raw ⇒ no throw, no call", safe.executed === false && throwCalls === 0);

  // (8) NON-REGRESSION: wrapping does not change runStep's own gated path.
  const dv2 = spy(); dv2.auth = mkAuth(); const good2 = H.runStep(p, C, S0, dv2);
  ok("V15 no regression: runStep internal gated execution still works", good2.outcome === "ADMITTED_VERIFIED" && dv2.calls.length === 1);

  // (9) non-function input ⇒ constructor refuses (fail-closed).
  ok("V15 createGovernedExecutor(non-function) ⇒ throws (fail-closed)", (() => { try { H.createGovernedExecutor({}); return false; } catch (e) { return true; } })());

  // (10) stats: exactly ONE execution via the boundary across all cases; refusals accrued.
  ok("V15 stats: exactly ONE execution via the boundary", gx.stats().executions === 1 && gx.stats().refusals >= 8);
}

// ═════════ V16 — SEQUENCE EXECUTION GOVERNANCE (runSequence halt + per-step auth) ═════════
// Each step gets its OWN fresh authorization (authForStep); a blocking step HALTS the sequence (no later step
// runs); already-executed steps are NOT rolled back (halt, not a transaction).
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  ID.register(r, { tenantId: "TV16", agentId: "agent-x", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }) });
  const C = { agentId: "agent-x", tenantId: "TV16", objective: "seq", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 9, maxDurationMs: 600000 } };
  const sha = H.contractShaOf(C);
  ID.openSession(r, { sessionId: "SA", tenantId: "TV16", agentId: "agent-x", contractSha: sha });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TV16", agentId: "agent-x", sessionId: "SA", contractSha: sha }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const C2 = { ...C, objective: "DIFFERENT" }; const sha2 = H.contractShaOf(C2);
  ID.openSession(r, { sessionId: "SB", tenantId: "TV16", agentId: "agent-x", contractSha: sha2 });
  const mkAuthB = () => { const c = ID.issueChallenge(r, { tenantId: "TV16", agentId: "agent-x", sessionId: "SB", contractSha: sha2 }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const pOut = { agentId: "agent-x", authToken: "t", tool: "read_file", params: {}, targetPaths: ["etc/secret"] };  // out of scope ⇒ DENY
  const seqDeps = (authForStep) => { const calls = []; const d = { calls, revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { calls.push(x && x.tool); return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }) }; if (authForStep) d.authForStep = authForStep; return d; };

  // (1) VALID multi-step AUTHENTICATED sequence: each step a FRESH challenge ⇒ all execute + verified, completed.
  const d1 = seqDeps((i) => mkAuth());
  const s1 = H.runSequence([p, p, p], C, S0, d1);
  ok("V16 valid 3-step authenticated sequence ⇒ completed, all executed+verified", s1.completed === true && s1.stopped === false && s1.ranCount === 3 && d1.calls.length === 3 && s1.steps.every(x => x.outcome === "ADMITTED_VERIFIED" && x.authBound === true));

  // (2) step-1 proof REPLAYED for step-2 (same challenge) ⇒ step2 AUTH_DENIED ⇒ HALT, step2 not executed.
  const shared = mkAuth(); const d2 = seqDeps(() => shared);
  const s2 = H.runSequence([p, p, p], C, S0, d2);
  ok("V16 replay of step-1 auth for step-2 ⇒ AUTH_DENIED halt, no step-2 exec", s2.stopped === true && s2.stoppedAt === 1 && s2.stopReason === "AUTH_DENIED" && s2.ranCount === 2 && d2.calls.length === 1);

  // (3) CONTRACT change between steps (step-2 auth bound to a DIFFERENT contractSha) ⇒ CONTRACT_MISMATCH halt.
  const d3 = seqDeps((i) => (i === 1 ? mkAuthB() : mkAuth()));
  const s3 = H.runSequence([p, p, p], C, S0, d3);
  ok("V16 contract change between steps ⇒ CONTRACT_MISMATCH halt, no later exec", s3.stopped === true && s3.stoppedAt === 1 && s3.stopReason === "CONTRACT_MISMATCH" && d3.calls.length === 1);

  // (4) REFUSAL at an intermediate step (unauthenticated seq) ⇒ later steps DO NOT run (exec spy exact).
  const d4 = seqDeps();
  const s4 = H.runSequence([p, pOut, p], C, S0, d4);
  ok("V16 intermediate DENY ⇒ halt, step-3 never runs (exact spy)", s4.stopped === true && s4.stoppedAt === 1 && s4.steps[1].outcome === "DENIED" && s4.ranCount === 2 && d4.calls.length === 1);

  // (5) NO ROLLBACK: the step executed BEFORE the failure stays executed (halt ≠ transaction).
  ok("V16 halt is NOT transactional: step-0 executed stays executed (no rollback)", s4.steps[0].executed === true && s4.steps[0].outcome === "ADMITTED_VERIFIED");

  // (6) ERROR at an intermediate step ⇒ halt, later steps not executed.
  const dErr = { calls: [], revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { dErr.calls.push(x && x.tool); if (dErr.calls.length === 1) throw new Error("boom"); return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }) };
  const sErr = H.runSequence([p, p], C, S0, dErr);
  ok("V16 executor error at step-0 ⇒ ERROR_RECOVERED halt, step-1 not attempted", sErr.stopped === true && sErr.stoppedAt === 0 && sErr.steps[0].outcome === "ERROR_RECOVERED" && sErr.ranCount === 1 && dErr.calls.length === 1);

  // (7) RESUME after failure: fix the cause + re-run the remaining step with FRESH valid context ⇒ executes.
  const d7 = seqDeps();
  const resumed = H.runSequence([p], C, s4.finalState, d7);
  ok("V16 resume after failure (cause fixed, re-authorized) ⇒ executes, no unauthorized exec", resumed.completed === true && resumed.ranCount === 1 && d7.calls.length === 1);

  // (8) the sequence interface retains NO raw executor / deps reference in its result.
  ok("V16 sequence result exposes no raw executor/deps reference", !("executor" in s1) && !("deps" in s1) && JSON.stringify(Object.keys(s1).sort()) === JSON.stringify(["completed", "finalState", "ranCount", "steps", "stopReason", "stopped", "stoppedAt"]));

  // (9) empty sequence ⇒ completed, nothing run (fail-safe default).
  const s9 = H.runSequence([], C, S0, seqDeps());
  ok("V16 empty sequence ⇒ completed, zero steps", s9.completed === true && s9.ranCount === 0 && s9.stopped === false);
}

// ═════════ V17 — SEQUENCE-LEVEL GOVERNED EXECUTOR (governedExecution wired into runStep/runSequence) ═════════
// Each step's raw executor is invoked ONLY through createGovernedExecutor (V15), gated by a context-bound
// authorization — the encapsulation is now exercised IN the control path, not just tested in isolation.
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  ID.register(r, { tenantId: "TV17", agentId: "agent-x", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }) });
  const C = { agentId: "agent-x", tenantId: "TV17", objective: "gseq", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 9, maxDurationMs: 600000 } };
  const sha = H.contractShaOf(C);
  ID.openSession(r, { sessionId: "SA", tenantId: "TV17", agentId: "agent-x", contractSha: sha });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TV17", agentId: "agent-x", sessionId: "SA", contractSha: sha }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const C2 = { ...C, objective: "OTHER" }; const sha2 = H.contractShaOf(C2);
  ID.openSession(r, { sessionId: "SB", tenantId: "TV17", agentId: "agent-x", contractSha: sha2 });
  const mkAuthB = () => { const c = ID.issueChallenge(r, { tenantId: "TV17", agentId: "agent-x", sessionId: "SB", contractSha: sha2 }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const gdeps = (authForStep) => { const raw = []; const d = { raw, revision: { commit: "t", treeDirty: false, available: true }, governedExecution: true, executor: (x) => { raw.push(x && x.tool); return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }) }; if (authForStep) d.authForStep = authForStep; return d; };

  // (1) governed + authenticated single step ⇒ executes ONCE via the governed boundary (EXEC stamp governed:true).
  const d1 = gdeps(); d1.auth = mkAuth();
  const s1 = H.runStep(p, C, S0, d1);
  ok("V17 governed + authenticated step ⇒ executes via boundary (raw once)", s1.outcome === "ADMITTED_VERIFIED" && s1.authBound === true && d1.raw.length === 1 && s1.trace.some(t => t.phase === "EXEC" && t.data && t.data.governed === true));

  // (2) governed + UNAUTHENTICATED ADMIT ⇒ EXECUTION_DENIED, raw NEVER called.
  const d2 = gdeps();
  const s2 = H.runStep(p, C, S0, d2);
  ok("V17 governed + unauthenticated ADMIT ⇒ EXECUTION_DENIED, raw zero", s2.outcome === "EXECUTION_DENIED" && s2.executed === false && d2.raw.length === 0);

  // (3) governed SEQUENCE, per-step fresh auth ⇒ each step authorized separately, all execute via boundary.
  const d3 = gdeps((i) => mkAuth());
  const q3 = H.runSequence([p, p, p], C, S0, d3);
  ok("V17 governed 3-step sequence ⇒ completed, raw==3 (one governed exec per step)", q3.completed === true && q3.ranCount === 3 && d3.raw.length === 3 && q3.steps.every(x => x.outcome === "ADMITTED_VERIFIED"));

  // (4) governed sequence: step-1 proof REPLAYED for step-2 ⇒ AUTH_DENIED halt, raw stops at 1.
  const shared = mkAuth(); const d4 = gdeps(() => shared);
  const q4 = H.runSequence([p, p, p], C, S0, d4);
  ok("V17 governed seq replayed proof ⇒ AUTH_DENIED halt @1, raw==1", q4.stopped === true && q4.stoppedAt === 1 && q4.stopReason === "AUTH_DENIED" && d4.raw.length === 1);

  // (5) governed sequence: contract changed between steps ⇒ CONTRACT_MISMATCH halt, raw==1.
  const d5 = gdeps((i) => (i === 1 ? mkAuthB() : mkAuth()));
  const q5 = H.runSequence([p, p, p], C, S0, d5);
  ok("V17 governed seq contract change ⇒ CONTRACT_MISMATCH halt @1, raw==1", q5.stopped === true && q5.stoppedAt === 1 && q5.stopReason === "CONTRACT_MISMATCH" && d5.raw.length === 1);

  // (6) governed sequence: INVALID proof (bad signature) at step-2 ⇒ AUTH_DENIED halt, later steps zero exec.
  const d6 = gdeps((i) => { const a = mkAuth(); if (i === 1) a.signature = "AAAA"; return a; });
  const q6 = H.runSequence([p, p, p], C, S0, d6);
  ok("V17 governed seq invalid proof mid-sequence ⇒ halt @1, raw==1 (step-3 never runs)", q6.stopped === true && q6.stoppedAt === 1 && q6.steps[1].outcome === "AUTH_DENIED" && d6.raw.length === 1);

  // (7) the governed handle is internal: step/sequence results expose no raw executor / handle reference.
  ok("V17 governed result exposes no raw executor/handle reference", !("executor" in s1) && !("handle" in s1) && !("executor" in q3) && !("handle" in q3));

  // (8) resume after a correction with FRESH valid auth ⇒ executes via boundary (no unauthorized exec).
  const d8 = gdeps((i) => mkAuth());
  const q8 = H.runSequence([p], C, q6.finalState, d8);
  ok("V17 governed resume after failure (re-authorized) ⇒ executes via boundary", q8.completed === true && d8.raw.length === 1);

  // (9) V18 — governed execution is the DEFAULT for an authenticated step EVEN WITHOUT deps.governedExecution.
  const d9 = { revision: { commit: "t", treeDirty: false, available: true }, executor: () => ({ ok: true }), verifier: () => ({ verified: true, reason: "x" }), auth: mkAuth() };
  const s9 = H.runStep(p, C, S0, d9);
  ok("V18 authenticated step WITHOUT governedExecution ⇒ still routed through the governed boundary", s9.outcome === "ADMITTED_VERIFIED" && s9.trace.some(t => t.phase === "EXEC" && t.data && t.data.governed === true));
}

// ═════════ V18 — DEFAULT GOVERNED EXECUTION (authenticated ⇒ governed automatically; legacy path isolated) ═════════
{
  const r = ID.createRegistry(); const k = crypto2.generateKeyPairSync("ed25519");
  ID.register(r, { tenantId: "TV18", agentId: "agent-x", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }) });
  const C = { agentId: "agent-x", tenantId: "TV18", objective: "def", allowedTools: ["read_file"], authorizedScope: ["reports"], limits: { maxCalls: 9, maxDurationMs: 600000 } };
  const sha = H.contractShaOf(C);
  ID.openSession(r, { sessionId: "SA", tenantId: "TV18", agentId: "agent-x", contractSha: sha });
  const mkAuth = () => { const c = ID.issueChallenge(r, { tenantId: "TV18", agentId: "agent-x", sessionId: "SA", contractSha: sha }); return { registry: r, challenge: c, signature: crypto2.sign(null, Buffer.from(ID.canon(c)), k.privateKey).toString("base64") }; };
  const p = { agentId: "agent-x", authToken: "t", tool: "read_file", params: { path: "reports/a.md" }, targetPaths: ["reports/a.md"] };
  const isGoverned = (st) => st.trace.some(t => t.phase === "EXEC" && t.data && t.data.governed === true);
  const isLegacy = (st) => st.trace.some(t => t.phase === "EXEC" && t.data && t.data.legacyUnauthenticated === true);

  // (1) authenticated SEQUENCE with NO explicit governedExecution ⇒ every step routed through the governed boundary.
  const raw1 = []; const d1 = { revision: { commit: "t", treeDirty: false, available: true }, executor: (x) => { raw1.push(x && x.tool); return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }), authForStep: (i) => mkAuth() };
  const q1 = H.runSequence([p, p, p], C, S0, d1);
  ok("V18 authenticated sequence (no flag) ⇒ every step governed by default", q1.completed === true && raw1.length === 3 && q1.steps.every(isGoverned) && q1.steps.every(st => st.authBound === true));

  // (2) UNAUTHENTICATED historical step ⇒ LEGACY path, explicitly isolated + marked, authBound:false, NOT governed.
  const d2 = { revision: { commit: "t", treeDirty: false, available: true }, executor: () => ({ ok: true }), verifier: () => ({ verified: true, reason: "x" }) };
  const s2 = H.runStep(p, C, S0, d2);
  ok("V18 unauthenticated step ⇒ isolated legacy path (legacyUnauthenticated, authBound:false, not governed)", s2.outcome === "ADMITTED_VERIFIED" && s2.authBound === false && isLegacy(s2) && !isGoverned(s2));

  // (3) an unauthenticated step CANNOT masquerade as authenticated nor force the governed boundary open: asking for
  //     governedExecution without auth ⇒ EXECUTION_DENIED (authBound:false), raw never called.
  let raw3 = 0; const d3 = { revision: { commit: "t", treeDirty: false, available: true }, governedExecution: true, executor: () => { raw3++; return { ok: true }; }, verifier: () => ({ verified: true, reason: "x" }) };
  const s3 = H.runStep(p, C, S0, d3);
  ok("V18 unauthenticated + governedExecution ⇒ EXECUTION_DENIED, no raw, cannot masquerade", s3.outcome === "EXECUTION_DENIED" && s3.authBound === false && raw3 === 0);

  // (4) NO SILENT FALLBACK: a governed (authenticated) step whose executor THROWS ⇒ ERROR_RECOVERED, raw called
  //     EXACTLY once (never retried via the direct path).
  let thr = 0; const d4 = { revision: { commit: "t", treeDirty: false, available: true }, executor: () => { thr++; throw new Error("boom"); }, verifier: () => ({ verified: true, reason: "x" }), auth: mkAuth() };
  const s4 = H.runStep(p, C, S0, d4);
  ok("V18 governed executor throw ⇒ ERROR_RECOVERED, raw once, NO direct-path fallback", s4.outcome === "ERROR_RECOVERED" && s4.executed === true && s4.verified === false && thr === 1);
}

console.log(`\nAGENT-GOVERNANCE-HARNESS e2e suite — ${pass} assertions passed.`);

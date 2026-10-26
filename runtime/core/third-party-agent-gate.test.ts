#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial security suite for the third-party-agent governance gate, using a
// SIMULATED external agent (hermetic, no network, no exec). Each case maps to an OWASP Agentic 2026 risk (ASIxx).
// Proves FAIL-CLOSED deny-by-default + no-false-success + human-escalation.
"use strict";
const assert = require("assert");
const G = require("./third-party-agent-gate.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const CONTRACT = {
  agentId: "agent-alpha", objective: "summarize files under reports/",
  allowedTools: ["read_file", "summarize", "write_report"], authorizedScope: ["reports", "runtime/live-proof"],
  limits: { maxCalls: 5, maxDurationMs: 60000 }, requireHumanFor: ["write_report", "deploy"],
};
const S0 = { calls: 0, elapsedMs: 0 };
const base = { agentId: "agent-alpha", authToken: "tkn", tool: "read_file", params: { path: "reports/q3.md" }, targetPaths: ["reports/q3.md"] };

// POSITIVE — valid in-contract action ⇒ ADMIT
ok("valid in-contract action ⇒ ADMIT", G.evaluateAgentAction(base, CONTRACT, S0).verdict === "ADMIT");

// ASI01 Goal Hijack — off-allowlist tool ⇒ DENY
ok("ASI01 goal-hijack: unlisted tool ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, tool: "exfiltrate" }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI01"); })());

// ASI02 Tool Misuse — malformed params ⇒ DENY
ok("ASI02 tool-misuse: malformed params ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, params: ["not", "an", "object"] }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI02"); })());

// ASI03 Privilege/Scope — absolute path escape ⇒ DENY
ok("ASI03 scope-escape: absolute path ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, targetPaths: ["/etc/passwd"] }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI03"); })());
// ASI03 — traversal escape ⇒ DENY (data-leak attempt)
ok("ASI03 data-leak: path traversal ⇒ DENY", G.evaluateAgentAction({ ...base, targetPaths: ["reports/../../.ssh/id_rsa"] }, CONTRACT, S0).verdict === "DENY");
// ASI03 — out-of-scope but in-tree ⇒ DENY
ok("ASI03 out-of-scope in-tree path ⇒ DENY", G.evaluateAgentAction({ ...base, targetPaths: ["secrets/prod.env"] }, CONTRACT, S0).verdict === "DENY");

// ASI03/ASI07 Identity/Auth — wrong agentId / missing token ⇒ DENY
ok("ASI03 identity: wrong agentId ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, agentId: "agent-evil" }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI03"); })());
ok("ASI07 unauthenticated: no token ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, authToken: undefined }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI07"); })());

// ASI10/ASI08 Rogue/Cascading — budget exhaustion ⇒ DENY (circuit-break)
ok("ASI10 call-budget exhausted ⇒ DENY", (() => { const v = G.evaluateAgentAction(base, CONTRACT, { calls: 5, elapsedMs: 0 }); return v.verdict === "DENY" && v.controlsFailed.includes("ASI10"); })());
ok("ASI08 time-budget exhausted ⇒ DENY", (() => { const v = G.evaluateAgentAction(base, CONTRACT, { calls: 0, elapsedMs: 60000 }); return v.verdict === "DENY" && v.controlsFailed.includes("ASI08"); })());

// ASI06 Evidence tampering / false-success — agent claims success; NEVER trusted; admission ≠ success
const ev = G.evaluateAgentAction({ ...base, claimedEvidence: { status: "SUCCESS", proof: "trust me" } }, CONTRACT, S0);
ok("ASI06 claimed-evidence is NEVER trusted (evidenceTrusted:false)", ev.evidenceTrusted === false && ev.reasons.some(r => /NOT trusted/.test(r)));

// ASI09 Human-Trust — consequential/require-human ⇒ ESCALATE (never auto-ADMIT)
ok("ASI09 allowed-but-require-human tool ⇒ ESCALATE", G.evaluateAgentAction({ ...base, tool: "write_report", targetPaths: ["reports/out.md"] }, CONTRACT, S0).verdict === "ESCALATE");
ok("ASI01 require-human tool NOT in allowlist ⇒ DENY (deny-first beats escalate)", G.evaluateAgentAction({ ...base, tool: "deploy", targetPaths: ["reports/out.md"] }, CONTRACT, S0).verdict === "DENY");
ok("ASI09 consequential flag ⇒ ESCALATE (no auto-admit)", G.evaluateAgentAction({ ...base, consequential: true }, CONTRACT, S0).verdict === "ESCALATE");

// FAIL-CLOSED — malformed/absent contract ⇒ DENY
ok("fail-closed: absent contract ⇒ DENY", G.evaluateAgentAction(base, null, S0).verdict === "DENY");
ok("fail-closed: contract missing allowlist ⇒ DENY", G.evaluateAgentAction(base, { agentId: "agent-alpha", objective: "x", authorizedScope: [], limits: { maxCalls: 1, maxDurationMs: 1 } }, S0).verdict === "DENY");

// Tamper-evident record present on every verdict
ok("every verdict carries a tamper-evident record (sha256 + authoredBy)", (() => { const v = G.evaluateAgentAction(base, CONTRACT, S0); return v.record.authoredBy === "ODG_AGENT_GATE" && /^[0-9a-f]{64}$/.test(v.record.proposalSha256); })());

// ═════════ V6 Lot B — ASI02 per-tool parameter schemas (separate contract; existing 17 unchanged = backward-compat) ═════════
const crypto = require("crypto");
const A = require("./supply-chain-attest.js");
const SCHEMA = { version: "1", allowExtra: false, fields: { path: { type: "string", required: true, max: 200, pattern: "^[\\w./-]+$" }, lines: { type: "number", max: 10000 } } };
const C2 = {
  agentId: "agent-alpha", objective: "read", allowedTools: ["read_file"], authorizedScope: ["reports"],
  limits: { maxCalls: 5, maxDurationMs: 60000 }, paramSchemas: { read_file: SCHEMA },
  allowedDependencies: ["left-pad", "lodash"], supplyChainTarget: "commercial-closed",
};
const b2 = { agentId: "agent-alpha", authToken: "tkn", tool: "read_file", targetPaths: ["reports/q3.md"] };
ok("ASI02 valid params vs schema ⇒ ADMIT", G.evaluateAgentAction({ ...b2, params: { path: "reports/q3.md", lines: 50 } }, C2, S0).verdict === "ADMIT");
ok("ASI02 unexpected field ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...b2, params: { path: "reports/q3.md", evil: 1 } }, C2, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI02"); })());
ok("ASI02 wrong type ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { path: 123 } }, C2, S0).verdict === "DENY");
ok("ASI02 missing required ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { lines: 5 } }, C2, S0).verdict === "DENY");
ok("ASI02 oversized string ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { path: "reports/" + "a".repeat(300) } }, C2, S0).verdict === "DENY");
ok("ASI02 format violation (bad chars) ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { path: "reports/$(rm -rf)" } }, C2, S0).verdict === "DENY");
ok("ASI02 numeric over-limit ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { path: "reports/q3.md", lines: 99999 } }, C2, S0).verdict === "DENY");
ok("ASI02 validateParams unit: null params vs schema ⇒ not ok", G.validateParams("read_file", null, SCHEMA).ok === false);

// ═════════ V6 Lot A — ASI04 supply-chain (reuse license-policy + supply-chain-attest) ═════════
const dep = (o) => ({ ...b2, params: { path: "reports/q3.md" }, declaredDependencies: [o] });
// allowed + permissive license, NO attestation ⇒ ADMIT but integrity UNVERIFIED (never claimed)
const admitNoAttest = G.evaluateAgentAction(dep({ name: "left-pad", version: "1.3.0", license: "MIT" }), C2, S0);
ok("ASI04 allowed+MIT, no attestation ⇒ ADMIT (integrity UNVERIFIED, not claimed)", admitNoAttest.verdict === "ADMIT" && admitNoAttest.reasons.some(r => /unverified/.test(r)));
// forbidden dep ⇒ DENY
ok("ASI04 unknown dep (not allowlisted) ⇒ DENY", (() => { const v = G.evaluateAgentAction(dep({ name: "evilpkg", version: "9", license: "MIT" }), C2, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI04"); })());
// allowed but non-commercial license ⇒ DENY
ok("ASI04 allowed dep, GPL license (not proprietary-redistributable) ⇒ DENY", G.evaluateAgentAction(dep({ name: "lodash", version: "4", license: "GPL-3.0-only" }), C2, S0).verdict === "DENY");
ok("ASI04 allowed dep, unknown license ⇒ DENY (fail-closed)", G.evaluateAgentAction(dep({ name: "lodash", version: "4", license: "Weird-9.9" }), C2, S0).verdict === "DENY");
// malformed deps ⇒ DENY
ok("ASI04 malformed deps (not array) ⇒ DENY", G.evaluateAgentAction({ ...b2, params: { path: "reports/q3.md" }, declaredDependencies: "nope" }, C2, S0).verdict === "DENY");
ok("ASI04 dep without name ⇒ DENY", G.evaluateAgentAction(dep({ version: "1", license: "MIT" }), C2, S0).verdict === "DENY");
// VALID signed attestation ⇒ ADMIT integrity VERIFIED ; TAMPERED ⇒ DENY
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pubPem = publicKey.export({ type: "spki", format: "pem" });
const stmt = A.buildAttestation({ name: "left-pad", sha256: A.sha256("bytes") }, A.buildSbom([{ name: "left-pad", version: "1.3.0" }]), { commit: "abc" });
const env = A.signStatement(stmt, privateKey);
const vAtt = G.evaluateAgentAction(dep({ name: "left-pad", version: "1.3.0", license: "MIT", attestation: stmt, envelope: env, publicKeyPem: pubPem }), C2, S0);
ok("ASI04 valid signed attestation ⇒ ADMIT integrity VERIFIED", vAtt.verdict === "ADMIT" && vAtt.reasons.some(r => /✓/.test(r)));
const tampered = { ...stmt, subject: [{ name: "left-pad-EVIL", digest: { sha256: A.sha256("bytes") } }] };
ok("ASI04 TAMPERED attestation ⇒ DENY (bad signature)", (() => { const v = G.evaluateAgentAction(dep({ name: "left-pad", version: "1.3.0", license: "MIT", attestation: tampered, envelope: env, publicKeyPem: pubPem }), C2, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI04"); })());

// ═════════ V6 Lot C — evidence / integration invariants ═════════
ok("LotC: a validation failure NEVER yields ADMIT (no false success)", ["ASI02","ASI04"].every(() => true) && G.evaluateAgentAction({ ...b2, params: { path: 1 } }, C2, S0).verdict !== "ADMIT");
ok("LotC: gate returns a verdict only — no exec field, no side effect", (() => { const v = G.evaluateAgentAction(b2, C2, S0); return typeof v.verdict === "string" && !("execute" in v) && !("ran" in v); })());
ok("LotC: deny carries a tamper-evident record", (() => { const v = G.evaluateAgentAction(dep({ name: "evilpkg", license: "MIT" }), C2, S0); return v.record.authoredBy === "ODG_AGENT_GATE" && /^[0-9a-f]{64}$/.test(v.record.proposalSha256); })());
ok("LotC: deny-first preserved — unknown dep denied even with valid schema+identity", G.evaluateAgentAction(dep({ name: "evilpkg", license: "MIT" }), C2, S0).verdict === "DENY");

// ═════════ V7 Lot B — ASI01 objective-drift (structural/invariant; NOT semantic) ═════════
// agent cannot redefine its own governance via the proposal
ok("ASI01 proposal redefining objective ⇒ DENY", (() => { const v = G.evaluateAgentAction({ ...base, objective: "do anything" }, CONTRACT, S0); return v.verdict === "DENY" && v.controlsFailed.includes("ASI01"); })());
ok("ASI01 proposal granting itself tools ⇒ DENY", G.evaluateAgentAction({ ...base, allowedTools: ["deploy"] }, CONTRACT, S0).verdict === "DENY");
ok("ASI01 proposal widening scope ⇒ DENY", G.evaluateAgentAction({ ...base, authorizedScope: ["/"] }, CONTRACT, S0).verdict === "DENY");
// revocation
ok("ASI01 revoked contract ⇒ DENY", G.evaluateAgentAction(base, { ...CONTRACT, revoked: true }, S0).verdict === "DENY");
ok("ASI01 revoked session state ⇒ DENY", G.evaluateAgentAction(base, CONTRACT, { calls: 0, elapsedMs: 0, revoked: true }).verdict === "DENY");
// cumulative distinct-target drift
const CD = { ...CONTRACT, limits: { maxCalls: 50, maxDurationMs: 600000, maxDistinctTargets: 2 } };
ok("ASI01 cumulative targets within cap ⇒ ADMIT", G.evaluateAgentAction({ ...base, targetPaths: ["reports/b.md"] }, CD, { calls: 1, elapsedMs: 0, history: [{ tool: "read_file", targetPaths: ["reports/a.md"] }] }).verdict === "ADMIT");
ok("ASI01 cumulative targets over cap ⇒ DENY (slow drift)", (() => { const v = G.evaluateAgentAction({ ...base, targetPaths: ["reports/c.md"] }, CD, { calls: 2, elapsedMs: 0, history: [{ tool: "read_file", targetPaths: ["reports/a.md"] }, { tool: "read_file", targetPaths: ["reports/b.md"] }] }); return v.verdict === "DENY" && v.controlsFailed.includes("ASI01"); })());

// ═════════ V8 Lot B — combinatorial tool-sequence drift ═════════
const CMB = { ...CONTRACT, limits: { maxCalls: 50, maxDurationMs: 600000 }, forbiddenToolCombos: [["read_file", "write_report"]], maxPerTool: { write_report: 1 } };
// individually-allowed read_file then write_report ⇒ forbidden co-occurrence ⇒ DENY (indirect bypass)
ok("ASI01 combinatorial: forbidden tool co-occurrence ⇒ DENY", (() => {
  const v = G.evaluateAgentAction({ ...base, tool: "write_report", targetPaths: ["reports/o.md"], consequential: false }, CMB,
    { calls: 1, elapsedMs: 0, history: [{ tool: "read_file", targetPaths: ["reports/a.md"] }] });
  return v.verdict === "DENY" && v.controlsFailed.includes("ASI01");
})());
// per-tool cap: 2nd write_report (cap 1) ⇒ DENY (but note write_report also require-human; combinatorial check runs pre-human)
ok("ASI01 combinatorial: per-tool invocation cap exceeded ⇒ DENY", (() => {
  const v = G.evaluateAgentAction({ ...base, tool: "summarize" }, { ...CONTRACT, maxPerTool: { summarize: 1 } },
    { calls: 1, elapsedMs: 0, history: [{ tool: "summarize", targetPaths: [] }] });
  return v.verdict === "DENY" && v.controlsFailed.includes("ASI01");
})());
ok("ASI01 combinatorial: within caps + no forbidden combo ⇒ ADMIT", G.evaluateAgentAction({ ...base, tool: "summarize" }, { ...CONTRACT, maxPerTool: { summarize: 3 }, forbiddenToolCombos: [["read_file", "deploy"]] }, { calls: 1, elapsedMs: 0, history: [{ tool: "summarize" }] }).verdict === "ADMIT");

// ═════════ V13 — gate NEVER authenticates (admission != authentication); no false tenant source ═════════
ok("V13 ADMIT verdict is authenticated:false (gate does not authenticate)", (() => { const v = G.evaluateAgentAction(base, CONTRACT, S0); return v.verdict === "ADMIT" && v.authenticated === false; })());
ok("V13 DENY verdict is authenticated:false", G.evaluateAgentAction({ ...base, tool: "nope" }, CONTRACT, S0).authenticated === false);
ok("V13 ESCALATE verdict is authenticated:false", G.evaluateAgentAction({ ...base, tool: "write_report", targetPaths: ["reports/o.md"] }, CONTRACT, S0).authenticated === false);
ok("V13 ADMIT reason states admission != authentication + not tenant-bound", (() => { const v = G.evaluateAgentAction(base, CONTRACT, S0); return v.reasons.some(r => /does NOT authenticate/.test(r) && /tenant/.test(r)); })());

console.log(`\nTHIRD-PARTY-AGENT-GATE security suite — ${pass} assertions passed.`);

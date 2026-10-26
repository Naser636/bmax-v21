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

console.log(`\nTHIRD-PARTY-AGENT-GATE security suite — ${pass} assertions passed.`);

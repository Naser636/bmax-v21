#!/usr/bin/env node
"use strict";
/*
 * V168 (§16/§17 — OWASP Agentic Top-10 / T1–T17 coverage matrix over ODG's REAL controls, with EXECUTED threat tests).
 * PURE orchestration over existing control modules; deterministic; fail-closed. NOT an audit/bibliography: it MAPS each
 * threat to ODG's real enforcing control(s) AND, for a verified subset, EXECUTES the real control against an attack to prove
 * enforcement (per-control evidence) — honestly labelling COVERED / PARTIAL / GAP / OUT_OF_SCOPE and which are executed-verified.
 *
 * World reference (radar, V141 grant VALID→2026-11-19, read-only): OWASP Agentic AI Threats & Mitigations (T1 Memory
 * Poisoning … T17 Supply Chain Compromise) — OWASP GenAI Security Project, Agentic Security Initiative.
 */
const AL = require("./audit-log.js");                 // T8 — keyed/anchored tamper-evident chain
const ID = require("./agent-identity.js");            // T9 — Ed25519 identity + single-use nonce (anti-replay)
const CE = require("./odg-closed-executor.js");       // T11 — closed deny-by-default executor (no eval/new Function)
const SL = require("./p8-slsa-level-gate.js");        // T17 — SLSA level adjudicated from evidence (anti level-inflation)
const crypto = require("node:crypto");

// ---- EXECUTED threat tests: each invokes a REAL control against an attack and reports whether it was enforced ----

/* T8 Repudiation & Untraceability — the audit chain must detect tampering. */
function testT8_auditTamper(): any {
  let chain: any[] = []; chain = AL.appendEntry(chain, { event: "a" }); chain = AL.appendEntry(chain, { event: "b" });
  const clean = AL.verifyChain(chain, {}).ok === true;
  const tampered = JSON.parse(JSON.stringify(chain)); tampered[0].payload = { event: "HACKED" };
  const detected = AL.verifyChain(tampered, {}).ok === false;
  return Object.freeze({ threat: "T8", control: "audit-log", executed: true, enforced: clean && detected, detail: `clean chain verifies (${clean}); tampered payload detected (${detected})` });
}

/* T9 Identity Spoofing & Impersonation — a replayed challenge nonce must be rejected (single-use). */
function testT9_identityReplay(): any {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubPem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const reg = ID.createRegistry();
  ID.register(reg, { agentId: "a1", publicKeyPem: pubPem });
  ID.openSession(reg, { sessionId: "s1", agentId: "a1", contractSha: "c1" });
  const ch = ID.issueChallenge(reg, { agentId: "a1", sessionId: "s1", contractSha: "c1" });
  const sig = crypto.sign(null, Buffer.from(ID.canon(ch)), privateKey).toString("base64");
  const first = ID.verifyAuth(reg, { challenge: ch, signature: sig });
  const replay = ID.verifyAuth(reg, { challenge: ch, signature: sig }); // same nonce again
  return Object.freeze({ threat: "T9", control: "agent-identity", executed: true, enforced: first.ok === true && replay.ok === false && /replay|stale|nonce/.test(replay.reason || ""), detail: `valid auth ok (${first.ok}); replayed nonce rejected (${replay.ok === false}: ${replay.reason || ""})` });
}

/* T11 Unexpected RCE & Code Attacks — the closed executor must refuse code-strings / unregistered ops (no eval/new Function). */
function testT11_rce(): any {
  // the closed executor REFUSES by returning {ok:false, code:...} (deny-by-default) — never by executing.
  const codeStr = CE.executeOp("eval", { code: "process.exit(1)" });
  const refusedCodeString = codeStr && codeStr.ok === false && /CODE_STRING|UNREGISTERED/.test(codeStr.code || "");
  const unreg = CE.executeOp("__not_a_registered_op__", {});
  const refusedUnregistered = unreg && unreg.ok === false && /UNREGISTERED/.test(unreg.code || "");
  return Object.freeze({ threat: "T11", control: "odg-closed-executor", executed: true, enforced: !!(refusedCodeString && refusedUnregistered), detail: `code-string op refused (${!!refusedCodeString}, code=${codeStr && codeStr.code}); unregistered op refused (${!!refusedUnregistered})` });
}

/* T17 Supply Chain Compromise — a self-declared SLSA level without evidence must NOT be trusted (adjudicated to achieved=0). */
function testT17_supplyChain(): any {
  const r = SL.assessSlsaLevel({ slsaLevelClaim: 3, statement: null }, { requiredLevel: 2 });
  const denied = r && (r.verdict === "DENY" || r.achievedLevel === 0) && r.achievedLevel < 3;
  return Object.freeze({ threat: "T17", control: "p8-slsa-level-gate", executed: true, enforced: !!denied, detail: `self-declared level 3 w/o evidence adjudicated to achieved=${r && r.achievedLevel} (claim NOT trusted)` });
}

function runThreatTests(): any {
  const tests = [testT8_auditTamper(), testT9_identityReplay(), testT11_rce(), testT17_supplyChain()];
  const enforced = tests.filter((t: any) => t.enforced).length;
  return Object.freeze({ total: tests.length, enforced, tests: Object.freeze(tests), allEnforced: enforced === tests.length });
}

// ---- Full T1–T17 coverage mapping (honest: COVERED / PARTIAL / GAP / OUT_OF_SCOPE) ----
const EXECUTED = Object.freeze(new Set(["T8", "T9", "T11", "T17"]));
const OWASP_THREATS = Object.freeze([
  { id: "T1", name: "Memory Poisoning", controls: ["memory-trust-gate"], coverage: "COVERED" },
  { id: "T2", name: "Tool Misuse", controls: ["third-party-agent-gate", "lethal-trifecta-gate"], coverage: "COVERED" },
  { id: "T3", name: "Privilege Compromise", controls: ["capability-authorization", "patch-executor (scope confinement)"], coverage: "COVERED" },
  { id: "T4", name: "Resource Overload", controls: ["spend-governor", "bash-command-governor"], coverage: "COVERED" },
  { id: "T5", name: "Cascading Hallucination Attacks", controls: ["evaluator-independence", "mission independent re-derivation", "honesty taxonomy"], coverage: "PARTIAL" },
  { id: "T6", name: "Intent Breaking & Goal Manipulation", controls: ["objective-authorization", "action-gate", "nl-objective-gateway"], coverage: "PARTIAL" },
  { id: "T7", name: "Misaligned & Deceptive Behaviors", controls: ["autonomy-claim-guard", "false-success validation", "honesty taxonomy"], coverage: "PARTIAL" },
  { id: "T8", name: "Repudiation & Untraceability", controls: ["audit-log (keyed+anchored)", "otel-execution-trace"], coverage: "COVERED" },
  { id: "T9", name: "Identity Spoofing & Impersonation", controls: ["agent-identity (Ed25519 + nonce)"], coverage: "COVERED" },
  { id: "T10", name: "Overwhelming Human in the Loop", controls: ["action-gate (humanMandatory)", "owner-gate"], coverage: "PARTIAL" },
  { id: "T11", name: "Unexpected RCE and Code Attacks", controls: ["odg-closed-executor", "bash-command-governor", "patch-executor symlink confinement"], coverage: "COVERED" },
  { id: "T12", name: "Agent Communication Poisoning", controls: ["agent-governance-harness (sealed evidence)", "third-party-agent-gate"], coverage: "PARTIAL" },
  { id: "T13", name: "Rogue Agents in Multi-Agent Systems", controls: ["provider-capability-contract (no self-authorization)", "evaluator-independence", "mission-orchestrator"], coverage: "PARTIAL" },
  { id: "T14", name: "Human Attacks on Multi-Agent Systems", controls: ["agent-identity", "Truth-Lock", "authorization gates"], coverage: "PARTIAL" },
  { id: "T15", name: "Human Manipulation", controls: [], coverage: "OUT_OF_SCOPE" },
  { id: "T16", name: "Insecure Inter-Agent Protocol Abuse", controls: ["agent-identity", "agent-governance-harness (signed, nonce-bound)"], coverage: "PARTIAL" },
  { id: "T17", name: "Supply Chain Compromise", controls: ["p8-slsa-level-gate", "supply-chain-attest", "multi-ecosystem SBOM", "license-policy"], coverage: "COVERED" },
].map((t) => Object.freeze({ ...t, controls: Object.freeze(t.controls), executedVerified: EXECUTED.has(t.id) })));

function coverageMatrix(): any {
  const by: any = {}; for (const t of OWASP_THREATS) by[t.coverage] = (by[t.coverage] || 0) + 1;
  return Object.freeze({ threats: OWASP_THREATS, byCoverage: Object.freeze(by), executedVerified: Object.freeze([...EXECUTED]) });
}

function scorecard(): any {
  const m = coverageMatrix();
  const tt = runThreatTests();
  return Object.freeze({
    totalThreats: OWASP_THREATS.length,
    covered: m.byCoverage.COVERED || 0,
    partial: m.byCoverage.PARTIAL || 0,
    gap: m.byCoverage.GAP || 0,
    outOfScope: m.byCoverage.OUT_OF_SCOPE || 0,
    executedVerified: tt.enforced,
    executedTotal: tt.total,
    allExecutedEnforced: tt.allEnforced,
    note: "COVERED = a real enforcing control exists; executedVerified = the control was RUN against an attack and blocked it (per-control evidence). PARTIAL = real but incomplete controls. OUT_OF_SCOPE = not a technical control ODG enforces (e.g. social manipulation of humans). Honest — no inflated claim of full agentic security.",
  });
}

const OWASP_MATRIX_CONTRACT = Object.freeze({
  id: "V168-OWASP-AGENTIC-MATRIX",
  purpose: "§16 — OWASP Agentic T1–T17 coverage over ODG's REAL controls, with EXECUTED threat tests (per-control evidence), honest coverage classification",
  worldReference: "OWASP Agentic AI Threats & Mitigations T1–T17 (OWASP GenAI Security Project / Agentic Security Initiative)",
  reuses: Object.freeze(["audit-log", "agent-identity", "odg-closed-executor", "p8-slsa-level-gate", "+ 10 more mapped controls — NO parallel security engine"]),
  invariants: Object.freeze([
    "maps every threat T1–T17 to ODG's REAL control module(s) or honestly marks GAP/OUT_OF_SCOPE",
    "a subset (T8/T9/T11/T17) is EXECUTED-VERIFIED: the real control is RUN against an attack and must block it (per-control evidence)",
    "coverage is honest: COVERED (control exists) ≠ executedVerified (control ran+blocked); PARTIAL/OUT_OF_SCOPE declared — no inflated full-security claim",
    "composes existing controls — NO parallel security engine; deterministic + fail-closed",
    "reports a matrix; takes no decision and changes no mission status (ODG decides remediation)",
  ]),
});
module.exports = { runThreatTests, coverageMatrix, scorecard, testT8_auditTamper, testT9_identityReplay, testT11_rce, testT17_supplyChain, OWASP_THREATS, OWASP_MATRIX_CONTRACT };
export {};

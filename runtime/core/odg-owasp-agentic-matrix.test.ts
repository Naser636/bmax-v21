#!/usr/bin/env node
"use strict";
/* V168 §16 — OWASP Agentic T1–T17 coverage matrix over ODG's REAL controls with EXECUTED threat tests. Proves: every threat
 * T1–T17 maps to a real control (or honest GAP/OUT_OF_SCOPE); a verified subset (T8/T9/T11/T17) is EXECUTED — the real control
 * is RUN against an attack and blocks it (per-control evidence); coverage is honest (COVERED ≠ executedVerified; PARTIAL/
 * OUT_OF_SCOPE declared). Grounded in the OWASP Agentic Threats & Mitigations T1–T17 reference. Composes existing controls. */
const M = require("./odg-owasp-agentic-matrix.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- full T1–T17 coverage, grounded in the real controls ----
  const mx = M.coverageMatrix();
  check("maps all 17 OWASP agentic threats (T1–T17)", mx.threats.length === 17 && mx.threats[0].id === "T1" && mx.threats[16].id === "T17");
  check("every threat carries a coverage verdict + control list (or honest OUT_OF_SCOPE)", mx.threats.every((t: any) => ["COVERED", "PARTIAL", "GAP", "OUT_OF_SCOPE"].includes(t.coverage) && Array.isArray(t.controls)));
  check("OUT_OF_SCOPE threats honestly have no claimed control (e.g. T15 Human Manipulation)", mx.threats.find((t: any) => t.id === "T15").coverage === "OUT_OF_SCOPE" && mx.threats.find((t: any) => t.id === "T15").controls.length === 0);
  check("COVERED threats name a real ODG control module", mx.threats.find((t: any) => t.id === "T1").controls.includes("memory-trust-gate") && mx.threats.find((t: any) => t.id === "T17").controls.includes("p8-slsa-level-gate"));

  // ---- EXECUTED threat tests: the real control is RUN against an attack and must enforce ----
  const tt = M.runThreatTests();
  check("4 threat tests EXECUTED against real controls, all enforced", tt.total === 4 && tt.enforced === 4 && tt.allEnforced === true);
  const byThreat: any = {}; for (const t of tt.tests) byThreat[t.threat] = t;
  check("T8 Repudiation: audit-log detects tampering (clean verifies, tampered rejected)", byThreat.T8.control === "audit-log" && byThreat.T8.executed === true && byThreat.T8.enforced === true);
  check("T9 Identity Spoofing: agent-identity rejects a REPLAYED nonce (valid auth ok, replay rejected)", byThreat.T9.control === "agent-identity" && byThreat.T9.enforced === true && /rejected/.test(byThreat.T9.detail));
  check("T11 RCE: odg-closed-executor refuses code-strings + unregistered ops", byThreat.T11.control === "odg-closed-executor" && byThreat.T11.enforced === true);
  check("T17 Supply Chain: p8-slsa adjudicates a self-declared level to achieved=0 (claim not trusted)", byThreat.T17.control === "p8-slsa-level-gate" && byThreat.T17.enforced === true && /NOT trusted|achieved=0/.test(byThreat.T17.detail));

  // ---- each executed test genuinely discriminates (both the valid and attack branches checked) ----
  check("T8 test checks BOTH clean-verifies AND tampered-detected (not a one-sided stub)", /clean chain verifies \(true\)/.test(byThreat.T8.detail) && /tampered payload detected \(true\)/.test(byThreat.T8.detail));
  check("T9 test checks BOTH valid-auth-ok AND replay-rejected", /valid auth ok \(true\)/.test(byThreat.T9.detail) && /replayed nonce rejected \(true/.test(byThreat.T9.detail));

  // ---- scorecard honesty: COVERED ≠ executedVerified; partial/out-of-scope declared ----
  const sc = M.scorecard();
  check("scorecard counts covered/partial/out-of-scope honestly (sum = 17)", sc.totalThreats === 17 && (sc.covered + sc.partial + sc.gap + sc.outOfScope) === 17);
  check("executedVerified (4) is a SUBSET of covered — not conflated with full coverage", sc.executedVerified === 4 && sc.executedTotal === 4 && sc.executedVerified <= sc.covered);
  check("scorecard note is honest about no inflated full-security claim", /no inflated|Honest/.test(sc.note) && /OUT_OF_SCOPE/.test(sc.note));

  // ---- contract: composes existing controls, no parallel engine, reports-only ----
  check("contract: composes real controls (no parallel security engine), reports-only, cites OWASP T1–T17", M.OWASP_MATRIX_CONTRACT.invariants.some((i: string) => /NO parallel security engine/.test(i)) && M.OWASP_MATRIX_CONTRACT.invariants.some((i: string) => /changes no mission status/.test(i)) && /T1–T17/.test(M.OWASP_MATRIX_CONTRACT.worldReference));
  check("deterministic + frozen", Object.isFrozen(mx) && Object.isFrozen(M.OWASP_THREATS) && JSON.stringify(M.coverageMatrix().byCoverage) === JSON.stringify(mx.byCoverage));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — owasp-agentic-matrix (§16: T1–T17 mapped to ODG's REAL controls; 4 threat tests EXECUTED against real controls [T8 audit-tamper, T9 nonce-replay, T11 RCE, T17 SLSA] all ENFORCED with per-control evidence; honest coverage COVERED/PARTIAL/OUT_OF_SCOPE, executedVerified≠full-coverage; composes existing controls, no parallel engine)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

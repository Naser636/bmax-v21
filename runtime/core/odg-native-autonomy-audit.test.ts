#!/usr/bin/env node
"use strict";
/* V193 §5 — ODG+Ollama native-autonomy audit. Proves: V192-A honestly flagged as not delivered; 8-step pipeline mapped
 * to real modules; pipeline EXISTS but end-to-end autonomy NOT_MEASURED this session; Ollama confinement honest;
 * improvement routing is a hypothesis; all 8 still BLOCKED. */
const A = require("./odg-native-autonomy-audit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const a = A.autonomy();
  check("live env: Ollama daemon reachable + qwen2.5-coder", /LISTENING/.test(a.env.ollamaDaemon) && /qwen2.5-coder/.test(a.env.model));
  check("8 steps mapped to real modules with status", a.steps.length === 8 && a.steps.every((s: any) => s.module && s.status) && a.steps.some((s: any) => /ollama-provider/.test(s.module)) && a.steps.some((s: any) => /generative-repair-adapter/.test(s.module)));
  check("pipeline EXISTING_VALIDATED but end-to-end autonomy NOT_MEASURED this session", /EXISTING_VALIDATED/.test(a.pipelineStatus) && /NOT_MEASURED this session/.test(a.demonstratedEndToEndAutonomy) && /Code generation ≠ demonstrated engineering autonomy/.test(a.demonstratedEndToEndAutonomy));
  check("Ollama confinement honest: OUTPUT boundary, not process-sandboxed", /OUTPUT boundary/.test(a.confinementHonesty) && /CANNOT run inside a no-network bwrap/.test(a.confinementHonesty));
  check("step 8 independent verification: distinct model reviewer NOT_AVAILABLE", a.steps.find((s: any) => /^8/.test(s.step)).status === "EXISTING_PARTIAL" && /NOT_AVAILABLE/.test(a.steps.find((s: any) => /^8/.test(s.step)).note));

  // improvement routing
  const r = A.improvementRouting();
  check("routing: deterministic views = ODG_NATIVE candidates (P9/P7/M1/P1)", ["IMP-P9-FINOPS-KPIS", "IMP-P7-SLO-VIEW", "IMP-M1-CRA-TRACKER", "IMP-P1-DORA-VIEW"].every((id) => r.rows.find((x: any) => x.id === id).route === "ODG_NATIVE_CANDIDATE"));
  check("routing: novel logic = CLAUDE_CODE_LIKELY (P8 API-posture, P11 calibration)", r.rows.find((x: any) => x.id === "IMP-P8-API-POSTURE").route === "CLAUDE_CODE_LIKELY" && r.rows.find((x: any) => x.id === "IMP-P11-CONF-CALIB").route === "CLAUDE_CODE_LIKELY");
  check("routing is a HYPOTHESIS; all 8 still BLOCKED_AWAITING_ISOLATION", /HYPOTHESIS/.test(r.note) && /BLOCKED_AWAITING_ISOLATION/.test(r.note) && r.rows.length === 8);

  // contract
  check("contract: V192-A not delivered, pipeline≠autonomy, gen≠autonomy, Ollama output-boundary, routing hypothesis", A.NATIVE_AUTONOMY_AUDIT_CONTRACT.invariants.some((i: string) => /V192-A was NOT delivered/.test(i)) && A.NATIVE_AUTONOMY_AUDIT_CONTRACT.invariants.some((i: string) => /end-to-end autonomy for a real improvement is NOT_MEASURED/.test(i)) && A.NATIVE_AUTONOMY_AUDIT_CONTRACT.invariants.some((i: string) => /code generation ≠ demonstrated/.test(i)));
  check("deterministic + frozen", JSON.stringify(A.autonomy().pipelineStatus) === JSON.stringify(a.pipelineStatus) && Object.isFrozen(a) && Object.isFrozen(A.STEPS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — native-autonomy-audit (V193 §5: V192-A not delivered [stated]; 8-step pipeline → real modules [Ollama daemon reachable]; pipeline EXISTING_VALIDATED but end-to-end autonomy NOT_MEASURED; gen≠autonomy; Ollama=OUTPUT-boundary confinement; routing hypothesis, all 8 BLOCKED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

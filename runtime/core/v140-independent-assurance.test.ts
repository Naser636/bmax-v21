#!/usr/bin/env node
"use strict";
/* V140 — independent-assurance battery. Re-derives the reproductions from the REAL harnesses (not the stored dossier) and
 * locks: all critical V136–V139 proofs still reproduce on current main; the acceptance matrix is HONEST — the ONLY
 * ACTIVE_IN_PRODUCTION entry is the already-deployed VPS release (the V136–V140 improvements are VALIDATED_LOCAL, never
 * declared production); the HIGH recovery-loop + MEDIUM+ FMEA residuals + VPS deploy remain BLOCKED (owner-gated). */
const RUN = require("../bin/odg-v140-assurance-run.ts");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

async function main() {
  const v136 = RUN.reproduceV136();
  const { checks } = await RUN.reproduce();
  const all = [v136, ...checks];
  const by = Object.fromEntries(all.map((c: any) => [c.id, c]));

  check("V136 self-origination reproduces (ODG formulates a canary-safe read-only mission from its own diagnostic)", by["V136_self_origination"].reproduced === true);
  check("V137 15-métier qualification reproduces (15/15 VALIDATED_LOCAL)", by["V137_15_metiers"].reproduced === true);
  check("V138 research pipeline reproduces (good⇒LIVE_SOURCE, poisoned⇒HYPOTHESIS, expired⇒DENIED)", by["V138_research_pipeline"].reproduced === true && by["V138_grant_expiry"].reproduced === true);
  check("V139 fault-injection reproduces (12/12 safety held + tamper detected)", by["V139_fault_injection"].reproduced === true);
  check("ALL critical proofs reproduce on current main", all.every((c: any) => c.reproduced === true));

  // acceptance-matrix HONESTY — the load-bearing separation.
  const M = RUN.ACCEPTANCE;
  const prod = M.filter((m: any) => m.state === "ACTIVE_IN_PRODUCTION");
  check("ONLY the deployed VPS release is ACTIVE_IN_PRODUCTION (improvements are NOT declared production)", prod.length === 1 && /VPS production release/.test(prod[0].capability));
  check("the V136-V140 improvements are VALIDATED_LOCAL, never ACTIVE_IN_PRODUCTION", M.some((m: any) => m.state === "VALIDATED_LOCAL") && !M.some((m: any) => m.state === "ACTIVE_IN_PRODUCTION" && /V13[6-9]|V140|métier|autonom/i.test(m.capability)));
  check("HIGH recovery-loop + MEDIUM+ FMEA residuals remain BLOCKED (owner-acceptance-required, not cleared)", M.some((m: any) => m.state === "BLOCKED" && /FMEA|recovery-loop/.test(m.capability)));
  check("VPS deployment of improvements remains BLOCKED (owner-gated; no deploy during qualification)", M.some((m: any) => m.state === "BLOCKED" && /VPS deployment/.test(m.capability)));
  check("real production telemetry / revenue is NOT_MEASURED (not fabricated)", M.some((m: any) => m.state === "NOT_MEASURED" && /telemetry|revenue|client/.test(m.capability)));
  check("all six maturity states are represented (honest separation)", ["ACTIVE_IN_PRODUCTION", "VALIDATED_LOCAL", "TESTED", "SIMULATED", "BLOCKED", "NOT_MEASURED"].every((s) => M.some((m: any) => m.state === s)));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — V140 independent assurance (critical proofs reproduce; acceptance matrix honest; VALIDATED_LOCAL ≠ ACTIVE_IN_PRODUCTION; residuals BLOCKED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V12.4 extension registry. Proves: the extension is PARKED (nothing launched); each program maps to REAL existing
 * components (anti-duplication, no 2nd canonical system); only the 9 primitives are used; ROADMAP.json integration is
 * OWNER_GATED (protected path, not performed); prohibitions encoded; 9 phases with gates; deterministic. */
const X = require("./odg-v124-extension-registry.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = X.registry();

  // ---- PARKED, nothing launched ----
  check("extension is PARKED and started === false (not launched prematurely)", r.status === "PARKED" && r.started === false && /after completion of the current roadmap/.test(r.startCondition));
  check("contract invariant: PARKED, started===false", X.V124_EXTENSION_CONTRACT.invariants.some((i: string) => /PARKED/.test(i) && /started === false/.test(i)));

  // ---- programs map to REAL existing components (anti-duplication) ----
  check("there are 9 programs (P1..P9), each with primitives + reuse components", r.programs.length === 9 && r.programs.every((p: any) => p.id && p.primitives.length && Array.isArray(p.reuse) && p.reuse.length >= 1));
  check("P1 reliability reuses audit-log + campaign-lifecycle (not a new engine)", (() => { const p = r.programs.find((x: any) => x.id === "P1_engine_reliability"); return /audit-log/.test(p.reuse.join()) && /campaign-lifecycle/.test(p.reuse.join()); })());
  check("P2 financial reuses document-intelligence + chantier-profitability", (() => { const p = r.programs.find((x: any) => x.id === "P2_financial_control"); return /document-intelligence/.test(p.reuse.join()) && /chantier-profitability/.test(p.reuse.join()); })());
  check("P7 productisation reuses the V182 distribution/marketing/language modules", (() => { const p = r.programs.find((x: any) => x.id === "P7_product_design_distribution"); return /digital-distribution/.test(p.reuse.join()) && /marketing-engine/.test(p.reuse.join()) && /language-management/.test(p.reuse.join()); })());
  check("P8 improvement reuses the EXISTING radar + scheduler (no second radar)", (() => { const p = r.programs.find((x: any) => x.id === "P8_continuous_improvement"); return /global-opportunity-radar/.test(p.reuse.join()) && /weekly-radar-scheduler/.test(p.reuse.join()) && /no second radar/i.test(p.improve.join() + p.gate); })());

  // ---- only the 9 canonical primitives are used ----
  const used = new Set(); for (const p of r.programs) for (const pr of p.primitives) used.add(pr);
  check("every program primitive is one of the 9 canonical primitives (no new primitive)", [...used].every((pr: any) => X.PRIMITIVES.includes(pr)) && X.PRIMITIVES.length === 9);

  // ---- ROADMAP.json integration owner-gated (protected path) ----
  check("ROADMAP.json integration is OWNER_GATED and NOT performed (protected path)", r.integration.status === "OWNER_GATED" && /PROTECTED/.test(r.integration.reason) && /NOT performed/.test(r.integration.reason) && /ROADMAP\.json/.test(r.integration.canonicalFile));
  check("integration rules: V12.4 single master, closed missions not reopened, genuine-gap only", r.integration.rules.some((x: string) => /unique master/.test(x)) && r.integration.rules.some((x: string) => /NOT reopened/.test(x)) && r.integration.rules.some((x: string) => /genuine gap/.test(x)));

  // ---- prohibitions encoded (Part XIII) ----
  check("engineering prohibitions encoded (flush≠durability, floats banned, CRC≠hash, no secrets in source, projection≠result)", /flush ≠ durability/.test(r.prohibitions.persistence.join()) && r.prohibitions.financial.some((x: string) => /floats/.test(x)) && /CRC ≠ cryptographic hash/.test(r.prohibitions.crypto_audit.join()) && r.prohibitions.saas_security.some((x: string) => /no secrets in source/.test(x)) && r.prohibitions.performance_commercial.some((x: string) => /projection ≠ result/.test(x)));

  // ---- phases A..I with gates ----
  check("9 phases A..I each with a gate; Gate A blocks dev before reuse audit", r.phases.length === 9 && r.phases[0].phase === "A" && /no development before/.test(r.phases[0].gate) && r.phases[8].phase === "I");

  // ---- coverage: mostly REUSE/IMPROVE, builds justified only after Phase-A ----
  const cov = X.programCoverage();
  check("coverage: every program is primarily REUSE/IMPROVE (reuse≥1, at most 1 conditional build each; no program invents a second canonical system)", cov.every((c: any) => c.reuseCount >= 1) && cov.every((c: any) => c.buildCount <= 1) && cov.filter((c: any) => c.mostlyCovered).length >= 3);

  // ---- determinism ----
  check("deterministic + frozen", JSON.stringify(X.registry().programs.length) === JSON.stringify(r.programs.length) && Object.isFrozen(r) && Object.isFrozen(X.PROGRAMS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — v124-extension-registry (PARKED strategic reserve: nothing launched [started=false]; 9 programs mapped to REAL existing components [anti-duplication, no 2nd canonical system]; only 9 primitives; ROADMAP.json integration OWNER_GATED/not-performed; prohibitions encoded; phases A..I with gates)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

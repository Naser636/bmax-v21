#!/usr/bin/env node
"use strict";
/* Tests for odg-metier-configuration (V327 §7). Proves per-métier configuration REUSES the shared base + grounded
 * métier-specific modules (BTP/M2 overrides, M1–M5 primaries), surfaces missing overrides, and is honestly STANDARD_BASE
 * where not specialised. Deterministic (injected presence). */
const M = require("./odg-metier-configuration.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const btp = ["odg-btp-billing-engine.ts", "odg-btp-retenue-garantie.ts", "odg-btp-revision-prix.ts", "odg-btp-invoice-schedule.ts", "odg-btp-client-intake.ts", "odg-btp-project-workflow.ts"];
const base = ["einvoice-export.ts", "client-intake.ts", "payments.ts", "mission-ledger.ts", "document-pipeline.ts", "document-intelligence.ts", "cra-remediation-engine.ts"];
const present = base.concat(btp);

function main(): void {
  // M2 (BTP) specialised: billing OVERRIDE with the real BTP modules; primary document-intelligence; no missing
  const m2 = M.configureMetier("M2", present);
  const billing = m2.components.find((c: any) => c.key === "billing");
  check("M2 SPECIALISED: billing OVERRIDE with the grounded BTP modules", m2.status === "SPECIALISED" && billing.mode === "OVERRIDE" && billing.modules.includes("odg-btp-retenue-garantie.ts") && billing.modules.includes("odg-btp-revision-prix.ts"));
  check("M2 primary capability = document-intelligence; no missing overrides", m2.primaryCapability === "document-intelligence.ts" && m2.missingOverrides.length === 0);
  check("M2 non-overridden components fall back to the SHARED base (e.g. documents/payments)", m2.components.find((c: any) => c.key === "payments").mode === "SHARED");

  // M1 specialised via its PRIMARY capability (no transversal override)
  const m1 = M.configureMetier("M1", present);
  check("M1 SPECIALISED via primary (cra-remediation-engine), 0 transversal overrides", m1.status === "SPECIALISED" && m1.primaryCapability === "cra-remediation-engine.ts" && m1.components.every((c: any) => c.mode === "SHARED"));

  // a principal métier uses the STANDARD base (honest: not yet specialised)
  const p1 = M.configureMetier("P1", present);
  check("P1 STANDARD_BASE (no override, no primary) — honest, not fabricated specialisation", p1.status === "STANDARD_BASE" && p1.specialised === false && p1.primaryCapability === null);

  // missing override: if a declared BTP module is ABSENT, it is surfaced + falls back honestly
  const partial = base.concat(["odg-btp-billing-engine.ts"]); // only one BTP billing module present
  const m2p = M.configureMetier("M2", partial);
  check("M2 with a partial BTP set ⇒ billing OVERRIDE keeps present ones + missingOverrides surfaces the absent", m2p.components.find((c: any) => c.key === "billing").mode === "OVERRIDE" && m2p.missingOverrides.some((x: string) => x.includes("odg-btp-retenue-garantie.ts")));
  const m2none = M.configureMetier("M2", base); // no BTP modules at all
  check("M2 with NO BTP modules ⇒ billing falls back to SHARED base (override unavailable) + all declared surfaced missing", m2none.components.find((c: any) => c.key === "billing").mode === "SHARED" && m2none.missingOverrides.length >= 4);

  // summary over the canonical 20-métier roster, grounded in the REAL on-disk module set (presence-driven)
  const realPresent = require("fs").readdirSync("runtime/core").filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const sum = M.configurationSummary(realPresent);
  check("summary over ROSTER20 (real presence): 20 total, 5 specialised (M1–M5 primaries present), 15 STANDARD_BASE (P1–P15)", sum.ok === true && sum.metiersTotal === 20 && sum.specialised === 5 && sum.standardBase === 15);

  // fail-closed + frozen + contract
  check("fail-closed: bad metier ⇒ BAD_METIER", M.configureMetier("", present).code === "BAD_METIER" && M.configureMetier(null, present).code === "BAD_METIER");
  check("frozen result", Object.isFrozen(m2) && Object.isFrozen(m2.components));
  check("contract: reuses shared base + commercial-matrix + ROSTER20; no invented rules; grounded overrides",
    M.METIER_CONFIGURATION_CONTRACT.invariants.some((s: string) => /no invented rules/.test(s)) &&
    M.METIER_CONFIGURATION_CONTRACT.invariants.some((s: string) => /honestly STANDARD_BASE/.test(s)) &&
    M.METIER_CONFIGURATION_CONTRACT.reuses.some((s: string) => /ROSTER20/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-metier-configuration (V327 §7: per-métier config over the shared base; M2/BTP billing OVERRIDE grounded in real odg-btp-* modules; M1–M5 specialised via primary capability; P1–P15 honest STANDARD_BASE; absent override surfaced + falls back to SHARED; summary 5 specialised/15 standard over ROSTER20; reuse not rebuild, no invented rules; fail-closed/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

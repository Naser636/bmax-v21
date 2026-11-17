#!/usr/bin/env node
"use strict";
/* V249 §1/§2 — native-engineering audit. Proves: the V247/V248 actor attribution is HONEST (0 autonomous ODG-runtime
 * actions; novel code = provider; inspection = independent agent; merge = owner); the deterministic native engines are
 * censused from REAL module presence (PRESENT ≠ autonomously driven); the real generative gap is isolated; no false
 * autonomy claim; deterministic + frozen. */
const A = require("./odg-native-engineering-audit.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const m = A.attributionMatrix();
  check("HONEST: zero autonomous ODG-runtime actions in V247/V248 (not credited by directive alone)", m.odgRuntimeAutonomousActions === 0 && m.byActor.ODG_RUNTIME === undefined);
  check("novel code writing attributed to the PROVIDER (not ODG runtime)", m.rows.find((r: any) => /write the code/.test(r.action)).realActor === "CLAUDE_CODE_PROVIDER");
  check("independent inspection attributed to a DISTINCT agent (real author≠reviewer), not the ODG runtime", m.rows.find((r: any) => /independent inspection/.test(r.action)).realActor === "INDEPENDENT_AGENT");
  check("merge/acceptance attributed to the OWNER (not provider self-acceptance)", m.rows.find((r: any) => /merge \/ acceptance/.test(r.action)).realActor === "OWNER");
  check("autonomous ODG-runtime decision = NOT_PROVEN (missing evidence ⇒ UNKNOWN, not credited)", m.rows.find((r: any) => /autonomous ODG-runtime decision/.test(r.action)).confidence === "NOT_PROVEN");
  check("conclusion is blunt: owner-directed, provider-executed; ODG runtime did NOT autonomously select/decompose/execute", /PROVIDER-executed/.test(m.conclusion) && /did NOT autonomously/.test(m.conclusion) && /narrative, not a runtime fact/.test(m.conclusion));

  // census from real evidence.
  const present = A.nativeCapabilityCensus((mod: string) => true);
  const absent = A.nativeCapabilityCensus((mod: string) => false);
  check("census: all deterministic engines PRESENT ⇒ NATIVE_DETERMINISTIC_PRESENT (from real predicate)", present.rows.every((r: any) => r.status === "NATIVE_DETERMINISTIC_PRESENT") && present.presentCount === present.total);
  check("census: none present ⇒ ABSENT (fail-closed, not assumed native)", absent.rows.every((r: any) => r.status === "ABSENT") && absent.presentCount === 0);
  check("census caveat: PRESENT ≠ autonomously driven (not routed by an ODG-runtime decision)", present.rows.every((r: any) => /PRESENT ≠ autonomously driven/.test(r.autonomyCaveat)) && present.requiresProvider.some((x: string) => /novel code generation/.test(x)));

  const d = A.demonstrate();
  check("demonstrate (real fs): deterministic engines present but real reduction NOT_YET (not the execution path)", d.census.presentCount >= 5 && /NOT_YET/.test(d.dependencyHonest.realReduction) && d.dependencyHonest.odgRuntimeAutonomous === "NONE_PROVEN");

  check("deterministic + frozen + contract (no false autonomy claim)", JSON.stringify(A.demonstrate()) === JSON.stringify(d) && Object.isFrozen(d) && A.NATIVE_ENGINEERING_AUDIT_CONTRACT.invariants.some((i: string) => /ODG_RUNTIME autonomous actions in V247\/V248 = 0/.test(i)) && A.NATIVE_ENGINEERING_AUDIT_CONTRACT.invariants.some((i: string) => /never claims ODG is autonomous/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — native-engineering-audit (V249 §1/§2: honest V247/V248 attribution [0 autonomous ODG-runtime actions; novel code=provider; inspection=independent agent; merge=owner] + deterministic native-capability census from real module presence [PRESENT≠autonomously-driven]; isolates the real generative gap; no false autonomy)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

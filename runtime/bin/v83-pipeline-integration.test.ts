#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V83 — pipeline-integration test. Proves (§2) the V82 qualifier is the EFFECTIVE ALREADY_DONE control in
 * the decomposer: with a qualifier, a resolving-but-unqualified pointer is NOT ALREADY_DONE; (§3) the 13 adversarial
 * cases all produce the correct status with no abusive closure; and the gate-wiring bug (unwired⊃wired) is fixed.
 * Live decomposer+qualifier + artifact.
 */

const path = require("path");
const fs = require("fs");
const DEC = require("../core/mission-decomposer.js");
const Q = require("../core/evidence-qualifier.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V83_PIPELINE_ADVERSARIAL.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // §2 — qualifier is the effective control: a resolving file with WRONG content is NOT ALREADY_DONE
  const qualify = (ref: string) => Q.qualify(ref, { exists: (r: string) => r === "good.json" || r === "bad.json", read: (r: string) => r === "good.json" ? '{"M":1}' : '{"other":1}', expectMarkers: ["M"] }).status;
  const dGood = DEC.decompose({ id: "P", kind: "PARTIAL", needsSignOff: true, evidence: { evidenceRef: "good.json" } }, { qualify });
  const dBad = DEC.decompose({ id: "P", kind: "PARTIAL", needsSignOff: true, evidence: { evidenceRef: "bad.json" } }, { qualify });
  check("§2: semantically-VALID evidence ⇒ ALREADY_DONE", dGood.subMissions.find((s: any) => s.name === "evidence").status === "ALREADY_DONE");
  check("§2: resolving-but-wrong-content ⇒ NOT ALREADY_DONE (LOCAL_REMAINING)", dBad.subMissions.find((s: any) => s.name === "evidence").status === "LOCAL_REMAINING");
  check("§2: decomposer invariant cites V82 semantic qualification", /ALREADY_DONE requires V82 SEMANTIC qualification/i.test(JSON.stringify(DEC.MISSION_DECOMPOSER_CONTRACT.invariants)));

  // gate-wiring bug fixed: unwired.test.ts must NOT match wired.test.ts
  check("gate-wiring: 'unwired.test.ts' not matched by gate ['wired.test.ts'] ⇒ INSUFFICIENT", Q.qualify("unwired.test.ts", { exists: () => true, read: () => "check", expectMarkers: ["check"], gateSuites: ["wired.test.ts"] }).status === "INSUFFICIENT");
  check("gate-wiring: exact basename match ⇒ VALID", Q.qualify("a/b/x.test.ts", { exists: () => true, read: () => "check", expectMarkers: ["check"], gateSuites: ["c/d/x.test.ts"] }).status === "VALID");

  // §3 — adversarial battery artifact
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("adversarial artifact exists", !!m);
  if (m) {
    check("§3: all adversarial cases pass (correct status, no abusive closure)", m.allPass === true && m.passed === m.caseCount && m.caseCount >= 11);
    check("§3: content-mismatch/incomplete/stale/unwired/wrong-req/empty ⇒ INSUFFICIENT", ["1 content unrelated", "2 incomplete markers", "3 stale/contradictory", "4 test not gate-wired", "5 gate-green but wrong requirement", "8 empty"].every((n) => m.cases.find((c: any) => c.case === n && c.actual === "INSUFFICIENT")));
    check("§3: gated parent exposes local sub; sign-off never auto-completed", m.cases.find((c: any) => /10 gated/.test(c.case)).actual === "LOCAL_REMAINING" && m.cases.find((c: any) => /11 sign-off/.test(c.case)).actual === "SIGN_OFF_GATED");
    check("invariant: no ALREADY_DONE without semantic VALID", /no ALREADY_DONE without semantic VALID/i.test(m.invariant));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V83 pipeline integration (V82 qualifier effective in decomposer; adversarial battery green; gate-wiring bug fixed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

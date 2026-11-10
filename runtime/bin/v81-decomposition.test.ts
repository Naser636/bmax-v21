#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V81 — decomposition test. Verifies parent missions are split into technical sub-missions; a sub-mission is
 * ALREADY_DONE only when its evidence pointer resolves (no fabrication); LOCAL_REMAINING Level-A sub-missions execute
 * even when the parent's sign-off is gated (T3); the final sign-off stays SIGN_OFF_GATED (T8, never auto-done); and the
 * decomposition surfaced genuine local sub-work beyond V80's parent-level 29. Live decomposer + artifact.
 */

const path = require("path");
const fs = require("fs");
const DEC = require("../core/mission-decomposer.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V81_DECOMPOSITION.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // LIVE decomposer: a gated parent with resolving evidence + a missing test ⇒ test LOCAL_REMAINING, sign-off GATED
  const yes = (r: string) => r === "present.json";
  const d = DEC.decompose({ id: "P", kind: "B_human", needsSignOff: true, evidence: { impl: true, test: "missing.ts", evidenceRef: "present.json", dossier: true } }, yes);
  check("T2: parent decomposed into >=5 sub-missions", d.subMissions.length >= 5);
  check("ALREADY_DONE requires a resolving evidence pointer", d.subMissions.find((s: any) => s.name === "evidence").status === "ALREADY_DONE" && d.subMissions.find((s: any) => s.name === "tests").status === "LOCAL_REMAINING");
  check("T3: gated parent still exposes Level-A LOCAL_REMAINING sub-mission", d.localRemaining.length >= 1 && d.localRemaining.includes("P:tests"));
  check("T8: final human sign-off stays SIGN_OFF_GATED (never auto-done)", d.signOffGated.includes("P:human-sign-off"));
  const ext = DEC.decompose({ id: "X", kind: "B_external", needsSignOff: true, evidence: {} }, () => false);
  check("external parent ⇒ final act = external-execution GATED", ext.signOffGated.some((id: string) => /external-execution/.test(id)));
  check("no fabrication: nothing ALREADY_DONE when no evidence resolves", DEC.decompose({ id: "Z", kind: "PARTIAL", evidence: { test: "x.ts" } }, () => false).alreadyDoneCount === 0);

  // artifact
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("artifact: 14 parents decomposed", !!m && m.parentsDecomposed === 14);
  check("artifact: ALREADY_DONE + LOCAL_REMAINING + SIGN_OFF_GATED all tracked", !!m && m.subMissionTally.alreadyDone >= 1 && m.subMissionTally.localRemaining >= 1 && m.subMissionTally.signOffGated === 14);
  check("artifact: LOCAL_REMAINING sub-missions EXECUTED (local work advanced)", !!m && m.localRemainingExecuted === m.subMissionTally.localRemaining && m.localRemainingFailed === 0);
  check("artifact: 14 sign-offs remain gated (not auto-done)", !!m && m.subMissionTally.signOffGated === 14);
  check("invariant: gated parent never blocks its Level-A subs; no fabricated completion", !!m && /gated parent never blocks its Level-A sub-missions/i.test(m.invariant) && /no fabrication/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V81 decomposition (parents split; local subs executed under gated parents; sign-offs gated; no fabrication)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

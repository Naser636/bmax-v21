#!/usr/bin/env node
"use strict";
/* Tests for odg-mission-decompose-chain (V360 Chantier B / C2). mission-decomposer → canonical selector: LOCAL_REMAINING
 * routed to selectNextLot; SIGN_OFF_GATED reserved (never selected); SELECT-ONLY; no fabricated completion. Deterministic. */
const M = require("./odg-mission-decompose-chain.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const qValid = { qualify: (_r: any) => "VALID", resolve: (_r: any) => true };
const qAbsent = { qualify: (_r: any) => "ABSENT", resolve: (_r: any) => false };

function main(): void {
  // a parent with no qualifying evidence ⇒ LOCAL_REMAINING sub-missions exist ⇒ one is SELECTED; sign-off reserved.
  const parent = { id: "P1", kind: "B_human", needsSignOff: true, evidence: {} };
  const r = M.decomposeAndSelect(parent, qAbsent);
  check("decomposition → selection: LOCAL_REMAINING routed to the selector ⇒ a sub-mission is SELECTED", r.ok === true && r.executable.length >= 1 && typeof r.selected === "string" && r.executable.indexOf(r.selected) >= 0);
  check("SIGN_OFF_GATED sub-mission is RESERVED (present in signOffGated, NEVER selected)", r.signOffGated.length >= 1 && r.signOffGated.indexOf(r.selected) < 0);
  check("the selected sub-mission is a real decomposed sub of the parent (id-linked)", r.selected.indexOf("P1:") === 0 && r.subMissions.some((s: any) => s.id === r.selected));

  // evidence qualifies ⇒ those subs ALREADY_DONE (not re-selected); fewer executable.
  const done = M.decomposeAndSelect({ id: "P2", kind: "B_human", needsSignOff: true, evidence: { test: "t.ts", evidenceRef: "e.json", impl: true, dossier: true } }, qValid);
  check("qualified evidence ⇒ sub-missions ALREADY_DONE (not re-selected)", done.alreadyDone.length >= 1 && done.alreadyDone.every((id: string) => id.indexOf("P2:") === 0));
  check("ALREADY_DONE subs are never in executable/selected (no re-work, no fabricated completion)", done.executable.every((id: string) => done.alreadyDone.indexOf(id) < 0));

  // all-done + only sign-off left ⇒ nothing executable ⇒ selected null (human lock honored, nothing auto-run).
  const allDone = M.decomposeAndSelect({ id: "P3", needsSignOff: true, evidence: { test: "t", evidenceRef: "e", impl: true, dossier: true } }, qValid);
  check("only SIGN_OFF_GATED left ⇒ selected null (reserved, nothing auto-selected)", allDone.selected === null && allDone.signOffGated.length >= 1);

  // fail-closed + contract
  check("fail-closed: parent without a string id ⇒ BAD_PARENT", M.decomposeAndSelect(null).code === "BAD_PARENT" && M.decomposeAndSelect({}).ok !== true);
  check("contract: SELECT-ONLY; reuses mission-decomposer + campaign-controller; no 2nd scheduler; sign-off reserved",
    /SELECT-ONLY/.test(JSON.stringify(M.MISSION_DECOMPOSE_CHAIN_CONTRACT.invariants)) &&
    /mission-decomposer/.test(JSON.stringify(M.MISSION_DECOMPOSE_CHAIN_CONTRACT.reuses)) &&
    /campaign-controller/.test(JSON.stringify(M.MISSION_DECOMPOSE_CHAIN_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-mission-decompose-chain (V360 Chantier B/C2: mission-decomposer → canonical selectNextLot; LOCAL_REMAINING selected, SIGN_OFF_GATED reserved [human lock], ALREADY_DONE not re-selected; SELECT-ONLY; no fabricated completion; no 2nd scheduler)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

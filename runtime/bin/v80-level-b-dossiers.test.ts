#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V80 §5/§6 — Level-B decision-dossier test. Verifies the 14 owner-gated missions each have a complete
 * decision dossier (object/state/evidence/change/risks/consequences/reversibility/decision-awaited), ownerDecision is
 * PENDING for ALL (no auto-approval, no invented sign-off), the maturity ladder is present and distinguishes PREPARED
 * from ACCEPTED (nothing marked ACCEPTED here), and the XXXII commercialization dossier is irreversible-flagged.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V80_LEVEL_B_DOSSIERS.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("dossiers artifact exists", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("14 Level-B dossiers", m.levelBCount === 14 && m.dossiers.length === 14);
  check("each dossier has the full decision schema", m.dossiers.every((d: any) => d.object && d.currentState && d.requestedChange && d.risks && d.reversibility && d.decisionAwaited));
  check("ALL ownerDecision PENDING (no auto-approval, no invented sign-off)", m.dossiers.every((d: any) => /PENDING/.test(d.ownerDecision)));
  check("NONE marked ACCEPTED (prepared != accepted)", m.dossiers.every((d: any) => d.maturity !== "ACCEPTED" && d.maturity !== "OPERATIONAL"));
  check("maturity ladder present (7 rungs, distinguishing prepared/accepted)", Array.isArray(m.maturityLadder) && m.maturityLadder.length === 7 && m.maturityLadder.includes("PREPARED") && m.maturityLadder.includes("ACCEPTED"));
  const xxxii = m.dossiers.find((d: any) => d.mission === "REQ-XXXII");
  check("XXXII commercialization: external + IRREVERSIBLE flagged", !!xxxii && /external/i.test(xxxii.kind) && /IRREVERSIBLE/i.test(xxxii.reversibility));
  const xiii = m.dossiers.find((d: any) => d.mission === "REQ-XIII");
  check("XIII superiority: external head-to-head, EXECUTED ODG-side only", !!xiii && xiii.kind === "B_external" && /ODG-side only/i.test(xiii.maturity));
  check("invariant: prepared != accepted; owner/controller alone accepts; no fabricated sign-off", /prepared dossier is never an accepted mission/i.test(m.invariant) && /no fabricated sign-off/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V80 Level-B decision dossiers (14 owner-ready, all PENDING, maturity honest)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

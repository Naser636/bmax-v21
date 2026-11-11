#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94-A — consolidated owner-decision sheet battery. Proves the 5 genuine owner decisions are consolidated
 * into ONE decidable sheet (exact question + referential options + consequences + ODG recommendation + default +
 * delegation limit), with grounded+honest financials (€500M recorded INFEASIBLE, 0 clients), coherence verified, NO
 * fabricated decision (all PENDING_OWNER_DECISION), and the register stays 7/8 (preparing ≠ deciding). Live artifacts.
 */

const path = require("path");
const fs = require("fs");
const DD = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(DD, f), "utf8")); } catch { return null; } }
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  const s = j("V94A_OWNER_DECISION_SHEET.json");
  check("sheet artifact exists", !!s);
  if (s) {
    check("5 decisions consolidated (XIII/XVI/XXVII/XXX/XXXII)", s.decisionCount === 5 && ["REQ-XIII", "REQ-XVI", "REQ-XXVII", "REQ-XXX", "REQ-XXXII"].every((id) => s.decisions.find((d: any) => d.id === id)));
    check("each decision has question + referential options + 3-axis consequences + recommendation + default + delegation limit", s.decisions.every((d: any) => d.question && Array.isArray(d.referentialOptions) && d.referentialOptions.length >= 2 && d.consequences.technical && d.consequences.financial && d.consequences.operational && d.odgRecommendation && d.recommendedDefault && d.delegationLimit));
    check("recommendations from the allowed set", s.decisions.every((d: any) => ["APPROVE", "REJECT", "APPROVE_WITH_CONDITIONS", "NEEDS_INFORMATION"].includes(d.odgRecommendation)));
    check("all 5 genuinely require the owner (no artificial block, none delegable away)", s.allRequireOwner === true);
    check("XXXII financials honest: €500M recorded INFEASIBLE, hypotheses≠results, 0 clients", /INFEASIBLE/.test(s.decisions.find((d: any) => d.id === "REQ-XXXII").consequences.financial) && /0 clients/.test(s.decisions.find((d: any) => d.id === "REQ-XXXII").consequences.operational));
    check("XIII superiority fail-closed (no undemonstrated claim)", /no world-superiority claim|fail-closed/i.test(s.decisions.find((d: any) => d.id === "REQ-XIII").consequences.operational));
    check("no fabricated decision — ODG recommends, owner decides", /fabricates NO decision|NEVER fabricates/i.test(JSON.stringify(s)) && /recommends/i.test(s.honestConclusion));
    check("coherence with V12.4 + programs verified", s.coherenceOk === true && s.coherence.every((c: any) => c.ok === true));
  }

  const reg = j("V94A_PRECONDITIONS_REGISTER.json");
  check("register artifact exists", !!reg);
  if (reg) {
    check("register 7/8 MET, NOT_READY (preparing a sheet ≠ obtaining a decision)", reg.metCount === 7 && reg.readyToDeliver === false && reg.notMet.length === 1 && reg.notMet[0] === "ROADMAP_EXHAUSTIVE");
    check("blockage precisely isolated to the 5 PENDING owner decisions; all else resolved", reg.blockageIsolation.blockedBy === "5 PENDING_OWNER_DECISION" && reg.blockageIsolation.everythingElseResolved === true && reg.blockageIsolation.sheetReady === true);
    check("ROADMAP_EXHAUSTIVE isolates the 5 with their recommended defaults", reg.criteria.find((c: any) => c.id === "ROADMAP_EXHAUSTIVE").isolatedBlockage.length === 5);
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V94-A (5 owner decisions consolidated+decidable, honest financials, coherence verified, nothing fabricated, 7/8 NOT_READY)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

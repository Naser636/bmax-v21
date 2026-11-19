#!/usr/bin/env node
"use strict";
/*
 * V320+ — tests for odg-autonomy-ladder-scorecard. Reads the FIVE REAL committed evidence files
 * (docs/odg/autonomy/V317..V320) — not fixtures — so the aggregation is proven against actual on-disk evidence.
 * cwd = repo root (same idiom as odg-closure-register-ops.test). PURE.
 */
const fs = require("fs");
const L = require("./odg-autonomy-ladder-scorecard.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const FILES = [
  "docs/odg/autonomy/V317_E2E_AUTONOMY_EVIDENCE.json",
  "docs/odg/autonomy/V318_NOVEL_SYNTHESIS_EVIDENCE.json",
  "docs/odg/autonomy/V319_HARDER_AUTONOMY_EVIDENCE.json",
  "docs/odg/autonomy/V319B_CORPUS_TAXONOMY_EVIDENCE.json",
  "docs/odg/autonomy/V320_MULTIMODULE_ROUTED_EVIDENCE.json",
];
function load(): any[] { return FILES.map((f) => JSON.parse(fs.readFileSync(f, "utf8"))); }
function cat(res: any, c: string): any { return res.perCategory.find((m: any) => m.category === c); }

function main(): void {
  const evidence = load();
  const res = L.ladder(evidence);

  // all five real files normalise + are ordered weakest→hardest
  check("ladder ok + 5 recognised missions", res.ok === true && res.perCategory.length === 5 && res.unrecognised.length === 0);
  check("rungs ordered weakest→hardest", res.perCategory.map((m: any) => m.rung).join(",") === "0,1,2,3,4");
  check("frontier = multi-module-routed (highest rung reached)", res.frontier === "multi-module-routed");

  // per-category numbers match the REAL evidence summaries (no invented numbers)
  const v317 = cat(res, "bounded-deterministic");
  check("V317: schemaless detected, cases 4, accepted 3 (2 repaired+1 green), 1 escalated, ollama discriminated", v317.recognised && v317.cases === 4 && v317.accepted === 3 && v317.escalatedOrAbstained === 1 && v317.independentlyAgreed === true && v317.generalised === null);
  const v318 = cat(res, "novel-synthesis");
  check("V318: 3 cases, 3 accepted, 3 generalised, 0 abstained", v318.cases === 3 && v318.accepted === 3 && v318.generalised === 3 && v318.escalatedOrAbstained === 0);
  const v319 = cat(res, "multi-module+stack-trace");
  check("V319: 6 cases, 4 accepted, 2 abstained, independent model agreed on all accepted", v319.cases === 6 && v319.accepted === 4 && v319.escalatedOrAbstained === 2 && v319.independentlyAgreed === true);
  const v319b = cat(res, "accept/abstain-corpus");
  check("V319b: 8 cases, 7 accepted, 6 generalised (overfit tail), 1 abstained, eval3b agreed", v319b.cases === 8 && v319b.accepted === 7 && v319b.generalised === 6 && v319b.escalatedOrAbstained === 1 && v319b.independentlyAgreed === true);
  const v320 = cat(res, "multi-module-routed");
  check("V320: 4 cases, 3 accepted, 3 generalised, 1 honest escalation", v320.cases === 4 && v320.accepted === 3 && v320.generalised === 3 && v320.escalatedOrAbstained === 1);

  // census = plain counts across recognised missions (a census, NOT a score)
  check("census: 5 missions, 25 total cases, 20 accepted, 5 escalated/abstained",
    res.census.missions === 5 && res.census.totalCases === 25 && res.census.accepted === 20 && res.census.escalatedOrAbstained === 5);

  // CTO §22: single blended autonomy % is REFUSED
  check("blended autonomy score is null (refused)", res.blendedAutonomyScore === null);
  check("refusal explains why (distinct difficulty classes, misleading)", /REFUSED/.test(res.blendedScoreRefusal) && /§22|§22|misleading/.test(res.blendedScoreRefusal));

  // honest boundaries carried per category (no over-claim)
  check("honest boundary present for every category", res.perCategory.every((m: any) => typeof m.honestBoundary === "string" && m.honestBoundary.length > 0));

  // normaliser: unrecognised schema surfaced, never guessed
  const bad = L.normaliseMission({ schema: "v999-made-up", summary: { total: 99, accepted: 99 } });
  check("unknown schema ⇒ recognised:false (no guessing)", bad.recognised === false && bad.schema === "v999-made-up");
  check("non-object evidence ⇒ recognised:false", L.normaliseMission(null).recognised === false);
  const withBad = L.ladder([...evidence, { schema: "v999", summary: {} }]);
  check("ladder surfaces unrecognised, excludes from census", withBad.unrecognised.length === 1 && withBad.census.missions === 5);

  // fail-closed + determinism + frozen
  check("empty ⇒ NO_MISSIONS", L.ladder([]).code === "NO_MISSIONS");
  check("deterministic", JSON.stringify(L.ladder(evidence)) === JSON.stringify(L.ladder(evidence)));
  check("frozen output", Object.isFrozen(res) && Object.isFrozen(res.perCategory) && Object.isFrozen(res.census));

  // contract invariants
  check("contract: per-category not blended, invents no numbers, read-only",
    L.AUTONOMY_LADDER_CONTRACT.invariants.some((s: string) => /never collapse into one blended/.test(s)) &&
    L.AUTONOMY_LADDER_CONTRACT.invariants.some((s: string) => /invent no numbers/.test(s)) &&
    L.AUTONOMY_LADDER_CONTRACT.invariants.some((s: string) => /read-only/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-autonomy-ladder-scorecard (normalises 5 REAL committed evidence files V317→V320 into ONE per-category ladder; invents no numbers; frontier=multi-module-routed; census=25 cases/20 accepted; single blended autonomy % REFUSED per §22; unrecognised schema surfaced not guessed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

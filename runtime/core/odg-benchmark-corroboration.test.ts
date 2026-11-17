#!/usr/bin/env node
"use strict";
/* V259 §3.1 / STEP 2 — benchmark corroboration. Proves the 5 outstanding benchmarks are SOURCE_CORROBORATED from official
 * sources, that source-corroboration is kept STRICTLY SEPARATE from execution (all NOT_RUN with explicit reasons), and that
 * NO score/ranking is fabricated. Read-only, deterministic, no 2nd benchmark engine. */
const C = require("./odg-benchmark-corroboration.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const r = C.corroborate();
  const ids = C.CORROBORATIONS.map((x: any) => x.id).sort();
  check("the 5 READY benchmarks are present by id", JSON.stringify(ids) === JSON.stringify(["browsecomp", "gdpval", "metr", "sciagentarena", "webarena"]));
  check("5/5 SOURCE_CORROBORATED, each citing an official source (arXiv / official site)", r.sourceCorroborated === 5 && r.rows.every((x: any) => x.sourceStatus === "SOURCE_CORROBORATED" && /arXiv:|https?:\/\//.test(x.officialSource)));

  // CRUX: source corroboration is NOT execution — all NOT_RUN, each with an explicit missing-dependency reason.
  check("CRUX: 0 EXECUTED — every benchmark NOT_RUN (source corroboration ≠ execution)", r.executed === 0 && r.notRun === 5 && r.rows.every((x: any) => x.executionStatus === "NOT_RUN"));
  check("every NOT_RUN states the EXACT missing dependency (dataset/licence/infra/grader/harness)", r.rows.every((x: any) => typeof x.notRunReason === "string" && x.notRunReason.length > 20 && /dataset|licence|license|infra|grader|harness|runtime|environment|access|expert/i.test(x.notRunReason)));

  // CRUX: NO fabricated score/ranking anywhere.
  check("CRUX: no fabricated benchmark score/ranking (anyScoreEmitted false; no %/score in records)", r.anyScoreEmitted === false && !r.rows.some((x: any) => /\bscored?\b|\d+\s*%|ranking|rank #|number one|#1 world/i.test(JSON.stringify(x))));
  check("honest statuses only (sourceStatus ∈ SOURCE_STATUS, executionStatus ∈ EXEC_STATUS)", r.rows.every((x: any) => C.SOURCE_STATUS.indexOf(x.sourceStatus) >= 0 && C.EXEC_STATUS.indexOf(x.executionStatus) >= 0));

  // provenance + honest framing.
  check("provenance records a real WebSearch located each official source on asOf", /WebSearch/.test(r.provenance) && r.asOf === "2026-11-17");
  check("note states source-corroboration ≠ execution + complements V243 audit (no 2nd engine)", /NOT execution/i.test(r.note) && /no second benchmark engine/i.test(r.note));
  check("contract invariants: official source, corroboration≠execution, no fabricated score, no 2nd engine", C.BENCHMARK_CORROBORATION_CONTRACT.invariants.some((i: string) => /OFFICIAL source/.test(i)) && C.BENCHMARK_CORROBORATION_CONTRACT.invariants.some((i: string) => /CORROBORATION ≠ EXECUTION/.test(i)) && C.BENCHMARK_CORROBORATION_CONTRACT.invariants.some((i: string) => /NO benchmark score.*fabricated/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.corroborate()) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(C.CORROBORATIONS));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-benchmark-corroboration (V259 STEP 2: 5/5 SOURCE_CORROBORATED from official sources [BrowseComp/GDPval/WebArena/METR/SciAgentArena]; 0 EXECUTED with explicit missing-dependency reasons; corroboration≠execution; NO fabricated score; complements V243 audit, no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

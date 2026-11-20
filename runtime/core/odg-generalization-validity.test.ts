#!/usr/bin/env node
"use strict";
/* Tests for odg-generalization-validity (V327 §6). Anti over-generalization: measures DISTINCT source contexts behind a
 * belief (not raw count) — 20 outcomes from ONE mission is large but OVERFIT. World ref arXiv:2603.07670. Deterministic. */
const G = require("./odg-generalization-validity.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (mid: string, outcome = "SUCCESS") => ({ type: "k", outcome, independentlyVerified: true, missionId: mid });

function main(): void {
  // thin ⇒ INSUFFICIENT_DATA (fail-closed)
  check("thin (<4) ⇒ INSUFFICIENT_DATA, not generalizable", (() => { const r = G.assessGeneralization([rec("a"), rec("b")]); return r.verdict === "INSUFFICIENT_DATA" && r.generalizable === false; })());

  // THE KEY CASE: 20 outcomes but ALL from one source ⇒ large sample yet OVERFIT (distinct from sample size)
  const narrow = G.assessGeneralization(Array(20).fill(0).map(() => rec("native:only-one")));
  check("20 outcomes from ONE source ⇒ OVERFIT, generalizable:false (large but not diverse — the point calibrated-P misses)", narrow.verdict === "OVERFIT" && narrow.generalizable === false && narrow.observations === 20 && narrow.distinctSources === 1);

  // 2 distinct sources (< 3) ⇒ still OVERFIT
  check("2 distinct sources (<3) ⇒ OVERFIT", G.assessGeneralization([rec("a"), rec("a"), rec("b"), rec("b"), rec("a")]).verdict === "OVERFIT");

  // ≥3 distinct sources ⇒ GENERALIZABLE
  const diverse = G.assessGeneralization([rec("a"), rec("b"), rec("c"), rec("d"), rec("a")]);
  check("≥3 distinct sources ⇒ GENERALIZABLE (generalizable:true, 4 distinct)", diverse.verdict === "GENERALIZABLE" && diverse.generalizable === true && diverse.distinctSources === 4);

  // no source identity at all ⇒ UNKNOWN_SOURCE ⇒ fail-closed (not generalizable)
  const noSrc = G.assessGeneralization(Array(6).fill(0).map(() => ({ type: "k", outcome: "SUCCESS", independentlyVerified: true })));
  check("no source identity ⇒ UNKNOWN_SOURCE, not generalizable (diversity unverifiable ⇒ probe)", noSrc.verdict === "UNKNOWN_SOURCE" && noSrc.generalizable === false);

  // UNKNOWN/unverified censored; key scoping
  const mixed = [rec("a"), rec("b"), rec("c"), rec("d"), { type: "k", outcome: "UNKNOWN", independentlyVerified: false, missionId: "z" }, { type: "other", outcome: "SUCCESS", independentlyVerified: true, missionId: "q" }];
  const scoped = G.assessGeneralization(mixed, { key: "k" });
  check("UNKNOWN censored + other key excluded ⇒ 4 verified of key 'k', 4 distinct ⇒ GENERALIZABLE", scoped.observations === 4 && scoped.distinctSources === 4 && scoped.verdict === "GENERALIZABLE");

  // frozen + contract
  check("frozen result", Object.isFrozen(diverse));
  check("contract: diversity NOT raw count; fail-closed; read-only; world ref 2603.07670",
    /distinct from sample-size/.test(JSON.stringify(G.GENERALIZATION_VALIDITY_CONTRACT.invariants)) &&
    /UNKNOWN_SOURCE/.test(JSON.stringify(G.GENERALIZATION_VALIDITY_CONTRACT.invariants)) &&
    /2603\.07670/.test(G.GENERALIZATION_VALIDITY_CONTRACT.worldReference));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-generalization-validity (V327 §6: anti over-generalization — DISTINCT source-context diversity over the EXISTING store; 20-from-one-source ⇒ OVERFIT [large≠diverse], ≥3 distinct ⇒ GENERALIZABLE, no-source ⇒ UNKNOWN_SOURCE fail-closed; orthogonal to sample-size; world ref arXiv:2603.07670)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V285 — DIRECT unit tests for mission-priority-selector (V76 §4, ODG's native selection decision engine). Complements
 * the indirect bin test (v76-roadmap-pilot) by exercising the scoreMission CONTRACT directly: eligibility gates
 * (malformed / already-ACCEPTED / unmet-dep), the deterministic weighted scoring (strategic↑, risk↓, clamp, unblocks
 * cap, defaults, boolean strictness), and selectNext ranking + tie-break-by-id + empty/invalid handling. Tests the REAL
 * component (no mocks, no stubs); asserts only behaviour declared in MISSION_PRIORITY_SELECTOR_CONTRACT. */
const S = require("./mission-priority-selector.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// a valid baseline mission (deps met via empty deps, unique id, not accepted).
const baseM = (over: any = {}) => Object.assign({ id: "M", deps: [], strategicImportance: 0.5, roadmapPriority: 0.5, operationalValue: 0.5, risk: 0.2, unblocks: [] }, over);

function main() {
  // ---- eligibility gates (scoreMission) ----
  check("malformed (no id) ⇒ ineligible 'malformed mission'", S.scoreMission({}, []).eligible === false && /malformed mission/.test(S.scoreMission({}, []).reason));
  check("malformed (null / array) ⇒ ineligible, no throw", S.scoreMission(null, []).eligible === false && S.scoreMission([1], []).eligible === false);
  check("already-ACCEPTED via acceptedIds ⇒ excluded (no repeat)", S.scoreMission(baseM({ id: "X" }), ["X"]).eligible === false && /already ACCEPTED/.test(S.scoreMission(baseM({ id: "X" }), ["X"]).reason));
  check("already-ACCEPTED via status field ⇒ excluded", S.scoreMission(baseM({ status: "ACCEPTED" }), []).eligible === false);
  check("unmet dependency ⇒ DEFERRED (not selected)", (() => { const r = S.scoreMission(baseM({ deps: ["DEP"] }), []); return r.eligible === false && /dependency unmet/.test(r.reason); })());
  check("dependency MET (dep in acceptedIds) ⇒ eligible", S.scoreMission(baseM({ deps: ["DEP"] }), ["DEP"]).eligible === true);

  // ---- deterministic weighted scoring ----
  check("higher strategicImportance ⇒ strictly higher score (ceteris paribus)", S.scoreMission(baseM({ id: "A", strategicImportance: 0.9 }), []).score > S.scoreMission(baseM({ id: "B", strategicImportance: 0.1 }), []).score);
  check("higher risk ⇒ strictly LOWER score (risk is a penalty)", S.scoreMission(baseM({ id: "A", risk: 0.9 }), []).score < S.scoreMission(baseM({ id: "B", risk: 0.0 }), []).score);
  check("out-of-range inputs are clamp01'd (strategic 5≡1, risk -2≡0)", S.scoreMission(baseM({ id: "A", strategicImportance: 5, risk: -2 }), []).score === S.scoreMission(baseM({ id: "B", strategicImportance: 1, risk: 0 }), []).score);
  check("unblocks is normalized AND capped at 1 (len 10 ≡ len 3)", S.scoreMission(baseM({ id: "A", unblocks: Array(10).fill("u") }), []).score === S.scoreMission(baseM({ id: "B", unblocks: ["a", "b", "c"] }), []).score);
  check("missing numeric fields fall back to documented defaults (0.5 / risk 0.2)", S.scoreMission({ id: "A", deps: [] }, []).score === S.scoreMission(baseM({ id: "B" }), []).score);
  check("boolean factors are STRICT ===true (truthy non-true ⇒ 0): immediatelyExecutable adds exactly 0.15", Number((S.scoreMission(baseM({ id: "A", immediatelyExecutable: true }), []).score - S.scoreMission(baseM({ id: "B", immediatelyExecutable: "yes" }), []).score).toFixed(4)) === 0.15);
  check("closureWithProof===true adds exactly 0.13", Number((S.scoreMission(baseM({ id: "A", closureWithProof: true }), []).score - S.scoreMission(baseM({ id: "B", closureWithProof: false }), []).score).toFixed(4)) === 0.13);
  check("factors exposed + score finite", (() => { const r = S.scoreMission(baseM(), []); return typeof r.score === "number" && isFinite(r.score) && typeof r.factors.riskPenalty === "number"; })());

  // ---- selectNext ----
  const cands = [baseM({ id: "M-low", strategicImportance: 0.1 }), baseM({ id: "M-high", strategicImportance: 0.95 }), baseM({ id: "M-dep", deps: ["M-high"] }), baseM({ id: "M-acc", status: "ACCEPTED" })];
  const r = S.selectNext(cands, []);
  check("selectNext picks the highest-score eligible mission", r.selected && r.selected.id === "M-high");
  check("selectNext defers unmet-dep + excludes accepted (both in deferred with reasons)", r.deferred.some((d: any) => d.id === "M-dep" && /dependency unmet/.test(d.reason)) && r.deferred.some((d: any) => d.id === "M-acc" && /already ACCEPTED/.test(d.reason)));
  check("ranking lists only eligible, score-descending", r.ranking.length === 2 && r.ranking[0].id === "M-high" && r.ranking[0].score >= r.ranking[1].score);
  check("selectionJustification is ODG's (reproducible, not provider-picked)", /ODG selected 'M-high'/.test(r.selectionJustification));
  // tie-break by id: two identical-score missions ⇒ lexicographically smaller id wins.
  const tie = S.selectNext([baseM({ id: "A-z" }), baseM({ id: "A-a" })], []);
  check("tie-break is deterministic by id (smaller id wins)", tie.selected.id === "A-a");
  // once the blocker is accepted, the deferred dep becomes selectable.
  check("after accepting the blocker, the deferred dep becomes eligible", S.selectNext(cands, ["M-high"]).ranking.some((x: any) => x.id === "M-dep"));
  // empty / invalid candidates.
  check("empty candidates ⇒ selected null + 'no eligible' justification", (() => { const e = S.selectNext([], []); return e.selected === null && /no eligible/.test(e.selectionJustification); })());
  check("non-array candidates ⇒ no throw, selected null", S.selectNext(null, []).selected === null && S.selectNext("x", []).selected === null);
  check("non-array acceptedIds tolerated (treated as none)", S.scoreMission(baseM({ id: "X" }), null).eligible === true);

  // ---- determinism + frozen + contract ----
  check("deterministic: same inputs ⇒ byte-identical result", JSON.stringify(S.selectNext(cands, [])) === JSON.stringify(r));
  check("outputs are frozen (scoreMission + selectNext)", Object.isFrozen(S.scoreMission(baseM(), [])) && Object.isFrozen(r));
  check("contract: deterministic + DEFERRED-on-unmet-dep + no-repeat + ODG-selects invariants present", S.MISSION_PRIORITY_SELECTOR_CONTRACT.invariants.some((i: string) => /DEFERRED/.test(i)) && S.MISSION_PRIORITY_SELECTOR_CONTRACT.invariants.some((i: string) => /no repeat/.test(i)) && S.MISSION_PRIORITY_SELECTOR_CONTRACT.invariants.some((i: string) => /ODG selects/.test(i)));

  // ---- V16.4 additive: explained entry point (selectNext above is unchanged) ----
  const ec = (id: string, v: any) => ({ id, status: "PARTIAL", deps: [], criteria: { a: v === null ? { status: "NOT_MEASURED", value: null } : { status: "MEASURED", value: v } } });
  check("V16.4: selectNext still breaks ties by id (backward compat) while selectNextExplained refuses to", S.selectNext([baseM({ id: "A-z" }), baseM({ id: "A-a" })], []).selected.id === "A-a" && S.selectNextExplained([ec("A-z", 0.5), ec("A-a", 0.5)], { weights: { a: 1 } }).decision === "DECISION_REQUIRED");
  check("V16.4: selectNextExplained NOT_MEASURED ⇒ uncertainty 1, evidence 0 (no 0.5 default)", (() => { const r = S.scoreExplained(ec("X", null), { a: 1 }, {}); return r.evidenceScore === 0 && r.uncertainty === 1; })());
  check("V16.4: original contract object unchanged (no new invariant injected into V76 contract)", S.MISSION_PRIORITY_SELECTOR_CONTRACT.invariants.length === 4 && S.MISSION_PRIORITY_SELECTOR_CONTRACT.id === "V76-MISSION-PRIORITY-SELECTOR");

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — mission-priority-selector (V285 direct contract tests: eligibility gates [malformed/accepted/unmet-dep], deterministic weighted scoring [strategic↑ risk↓ clamp01 unblocks-cap defaults strict-booleans], selectNext ranking + id tie-break + empty/invalid handling; frozen; real component, no mocks)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};

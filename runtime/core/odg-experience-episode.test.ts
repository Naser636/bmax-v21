#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx.
"use strict";
/*
 * odg-experience-episode — EXP-B-1 (EXPERIENCE INTELLIGENCE incr. B). Synthetic fixtures only (the real-corpus
 * evaluation is the governed V19-EXP-B experiment, never this unit test): structure, knowledge classes, id-leak guard,
 * comparable recall through the canonical decision-precedent store, FAILED ⇒ AVOID_UNCHANGED, invalidation/suspension,
 * no auto-apply, and the GO DECOMPOSE wiring (port present ⇒ recorded; absent ⇒ decision unchanged).
 */
const assert = require("assert");
const EXP = require("./odg-experience-episode.js");
const DP = require("./decision-precedent.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const item = (id, title, grade, extra) => ({ id, title, status: `CLOSED_${grade}`, closure: { closed: true, rule: "CLOSE-1", grade, record: `docs/odg/evidence/${id}_V.json`, contractSha256: "c-" + id, experimentSha256: "e-" + id, validatedSteps: ["REVISE_CONTRACT", "RUN_CONTROLLED_EXPERIMENTS", "VALIDATE_CRITERIA"] }, ...(extra || {}) });
const contract = (id, objective, metric, ws) => ({ scenario: id, WORK_ITEM_CONTRACT: { objective, write_set: ws, preRegistration: { metric, baseline: "3/6", decisionRule: "PASS iff ≥4/6", thresholds: { pass: 4 } } }, authorization: { dispatchTargets: { RUN_CONTROLLED_EXPERIMENTS: { command: `runtime/bin/${id.toLowerCase()}-run.ts` } } }, revisionHistory: [{ revision: 2, reason: "inspector REJECT: rule restated" }] });
const validation = (id, grade, extra) => ({ contractSha256: "c-" + id, scenarioGrade: grade, result: { outcome: grade, basis: "pre-registered rule" }, experimentInspection: { verdict: "ACCEPT", inspectorSessionId: "insp-1", pr: 1 }, ...(extra || {}) });

const register = { items: [
  item("X1", "multi-candidate code generation with selection by visible tests", "FAIL"),
  item("X2", "hybrid memory index with embeddings and full text search", "PASS"),
  item("X3", "selection of candidates by execution agreement re-attempt", "FAIL"),
  item("X4", "open item not closed", "PARTIAL", { status: "PARTIAL", closure: null }),
] };
const contracts = [
  contract("X1", "generate several code candidates and select one by visible tests", "accepted implement trials out of 6", ["runtime/core/odg-local-model-benchmark.ts", "runtime/bin/x1-run.ts"]),
  contract("X2", "index memory records with embeddings and full text search", "recall at 3 on held-out queries", ["runtime/core/odg-memory-hybrid-index.ts"]),
  contract("X3", "select code candidates by execution agreement among candidates", "accepted implement trials out of 6", ["runtime/core/odg-local-model-benchmark.ts", "runtime/core/odg-execution-agreement.ts"]),
];
const records = {
  "docs/odg/evidence/X1_V.json": validation("X1", "FAIL", { limits: ["the visible tests do not discriminate the hidden empty-input case"] }),
  "docs/odg/evidence/X2_V.json": validation("X2", "PASS", { adoption: "wired into GO knowledge()" }),
  "docs/odg/evidence/X3_V.json": validation("X3", "FAIL", { learning: { hypothesis: "H REFUTED", why: "agreement amplifies the majority error", nextLever: "model-generated tests" } }),
};
const readRecord = (rel) => (records[rel] ? { json: records[rel], sha256: "sha-" + rel } : null);

console.log("odg-experience-episode — EXP-B-1");

// 1 — episodes are built only from CLOSED_* items with a CLOSE-1 record, with every structured section present.
const eps = EXP.buildEpisodes({ register, contracts, readRecord });
ok("one episode per closed item (open item X4 excluded)", eps.length === 3 && eps.map((e) => e.itemId).join(",") === "X1,X2,X3");
const e1 = eps[0];
for (const k of ["context", "initialSituation", "diagnosis", "decisions", "steps", "components", "results", "difficulties", "corrections", "costs", "evidence", "lessons", "knowledgeClass", "confidence", "method", "features"])
  assert.ok(k in e1, "episode section " + k);
ok("episode carries all owner §3.A sections", true);
ok("objective, baseline, decisions and steps come from the contract/closure", e1.context.objective.startsWith("generate several") && e1.initialSituation.baseline === "3/6" && e1.decisions.some((d) => d.what === "decisionRule") && e1.steps.length === 3);
ok("components = write_set ∪ dispatch commands", e1.components.includes("runtime/bin/x1-run.ts") && e1.components.includes("runtime/core/odg-local-model-benchmark.ts"));
ok("corrections = contract revision history", e1.corrections.length === 1 && /REJECT/.test(e1.corrections[0].reason));
ok("costs are NOT_MEASURED (never estimated)", e1.costs.status === "NOT_MEASURED");

// 2 — knowledge governance: episode = INTERNAL_EXPERIENCE, a next lever = HYPOTHESIS, never a fact.
const e3 = eps[2];
ok("episode class INTERNAL_EXPERIENCE (never CORROBORATED_FACT)", eps.every((e) => e.knowledgeClass === "INTERNAL_EXPERIENCE") && EXP.KNOWLEDGE_CLASSES.includes("CORROBORATED_FACT"));
ok("nextLever is recorded as a HYPOTHESIS", e3.lessons.some((l) => l.class === "HYPOTHESIS" && /model-generated tests/.test(l.text)) && !e3.difficulties.some((t) => /model-generated tests/.test(t)));
ok("inspected closure ⇒ confidence INSPECTED_CRITERIA_VALIDATED", e1.confidence === "INSPECTED_CRITERIA_VALIDATED");
ok("grade ⇒ method: FAIL→AVOID_UNCHANGED, PASS→REUSABLE_WITH_ADAPTATION", e1.method.reuse === "AVOID_UNCHANGED" && eps[1].method.reuse === "REUSABLE_WITH_ADAPTATION");

// 3 — id-leak guard: digit-bearing tokens (ids, versions, shas) never become features.
ok("features drop digit-bearing tokens", EXP.features("V178-P1 re-attempt of X1 qwen2.5 3/6", []).every((t) => !/\d/.test(t)) && EXP.features("V178-P1 re-attempt", []).includes("attempt"));
ok("component features are code paths only (evidence records ignored)", EXP.features("", ["docs/odg/evidence/V1_R.json", "runtime/core/odg-execution-agreement.ts"]).join(",") === "c:agreement,c:execution");

// 4 — recall goes through the canonical decision-precedent store; precedents are ranked by similarity.
const store = EXP.toPrecedentStore(eps);
ok("episodes are recorded in decision-precedent (EPISODE:<id> signatures, features kept)", store.entries["EPISODE:X1"] && Array.isArray(store.entries["EPISODE:X1"].features) && store.entries["EPISODE:X1"].authoredBy === "ODG");
ok("exact-signature recall API unchanged", DP.recallPrecedent(store, { goal: "unrelated" }) === null);
const mission = { id: "NEW", title: "select generated code candidates using model-generated tests", objective: "choose one code candidate per trial", metric: "accepted implement trials out of 6", components: ["runtime/core/odg-local-model-benchmark.ts"] };
const rec = EXP.recallForMission(store, mission);
ok("comparable experiences recalled; unrelated memory episode ranked below", rec.status === "RECALLED" && ["X1", "X3"].includes(rec.comparable[0].item) && rec.comparable.findIndex((c) => c.item === "X2") !== 0);
ok("similarities, shared and differing features are reported", rec.comparable.every((c) => typeof c.similarity === "number" && Array.isArray(c.shared) && Array.isArray(c.onlyInMission)));
ok("failed methods listed and NOT applicable unchanged (blocker cites the changed-input rule)", rec.failed.includes("X1") && rec.comparable.filter((c) => c.outcome === "FAILED").every((c) => c.applicable === false && c.blockers.some((b) => /RB-REATTEMPT-CHANGED-INPUT/.test(b))));
ok("never auto-applied; uncertainty explained", rec.adaptation.autoApply === false && /not semantic proof/.test(rec.uncertainty));
ok("the mission's own episode is excluded", EXP.recallForMission(store, { ...mission, id: "X1" }).comparable.every((c) => c.item !== "X1"));
ok("no comparable ⇒ NO_COMPARABLE (never forced)", EXP.recallForMission(store, { id: "Z", title: "quarterly invoice reconciliation for plumbing clients" }).status === "NO_COMPARABLE");
ok("empty store (without memory) ⇒ NO_COMPARABLE", EXP.recallForMission(DP.emptyStore(), mission).status === "NO_COMPARABLE");

// 5 — re-evaluation: a changed contract sha invalidates (versioned; history kept); suspension needs a reason.
const inv = EXP.reevaluate(eps[1], { contractSha256: "c-CHANGED" });
ok("changed contract ⇒ INVALIDATED, version+1, history kept", inv.status === "INVALIDATED" && inv.version === eps[1].version + 1 && inv.statusHistory.length === 1 && eps[1].status === "ACTIVE");
const sus = EXP.suspend(eps[1], "owner: conditions changed");
ok("suspend ⇒ SUSPENDED with reason; recall marks it not applicable", sus.status === "SUSPENDED" && (() => { const s2 = EXP.toPrecedentStore([sus]); const r = EXP.recallForMission(s2, { id: "Q", title: "hybrid memory index embeddings" }); return r.comparable[0].applicable === false && r.comparable[0].blockers[0] === "episode SUSPENDED"; })());
assert.throws(() => EXP.suspend(eps[1], ""), /reason/);
ok("suspension without reason refused", true);
ok("unreadable validation record ⇒ INVALIDATED", EXP.buildEpisodes({ register: { items: [register.items[0]] }, contracts, readRecord: () => null })[0].status === "INVALIDATED");

// 6 — GO DECOMPOSE wiring: the cycle consumes ports.experienceRecall and records it (absent port ⇒ no field).
{
  const src = require("fs").readFileSync(require("path").join(__dirname, "odg-go-cycle.ts"), "utf8");
  ok("odg-go-cycle DECOMPOSE calls ports.experienceRecall and records decision.experienceRecall", /ports\.experienceRecall\(/.test(src) && /\.\.\.\(experienceRecall \? \{ experienceRecall \} : \{\}\)/.test(src));
  const go = require("fs").readFileSync(require("path").join(__dirname, "..", "bin", "odg-go.ts"), "utf8");
  ok("odg-go buildPorts wires experienceRecall on the real path", /experienceRecall: experienceRecall\(repo\)/.test(go));
}

console.log(`\nodg-experience-episode — ${passed} assertions passed.`);

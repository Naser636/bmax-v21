#!/usr/bin/env node
"use strict";
/*
 * V19-EXP-B — the contract-declared RUN_CONTROLLED_EXPERIMENTS target of EXPERIENCE INTELLIGENCE increment B (EXP-B-1).
 * One execution over the REAL committed corpus (closed V164 register items + their criteria-validation records + contracts):
 *   AC1  episodes: every CLOSED_* item with a CLOSE-1 record yields exactly one ACTIVE episode with every §3.A section, its
 *        validation record sha recomputed from the file.
 *   AC2  knowledge governance: every episode INTERNAL_EXPERIENCE; every nextLever lesson HYPOTHESIS; no lesson classed
 *        CORROBORATED_FACT; every recall adaptation.autoApply === false.
 *   AC3  comparable recall (pre-registered FAMILIES, leave-one-out): each member's own contract fields are the "new mission"
 *        (its own episode excluded; ids never features); hit ⇔ the family partner is in the top-3. PASS needs ≥ 8/10.
 *        Control arm WITHOUT memory (empty decision-precedent store) recorded; random-rank expectation recorded.
 *   AC4  non-reuse discipline: across every AC3 recall, each FAILED episode is applicable=false with the
 *        RB-REATTEMPT-CHANGED-INPUT blocker, and each ACTIVE SUCCEEDED episode is applicable=true (100%).
 *   AC5  real GO path: odg-go-cycle.runGoCycle (DRY, in-process) with odg-go's experienceRecall port records
 *        DECOMPOSE.experienceRecall (status RECALLED | NO_COMPARABLE) for the working item; without the port the
 *        DECOMPOSE decision carries no experienceRecall field.
 *   AC6  tsc --noEmit --incremental false + the touched tests pass (run one at a time).
 * PASS ⇔ AC1–AC6 met; any criterion not measurable ⇒ NOT_MEASURED (never PASS). No model, no network. Writes ONLY <out>.
 *   npx tsx runtime/bin/odg-v19-exp-b-run.ts docs/odg/evidence/V19_EXP_B_RESULT.json
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..", "..");
const SCENARIO = "V19-EXP-B";
const OUT = "docs/odg/evidence/V19_EXP_B_RESULT.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const REGISTER = "docs/odg/evidence/V164_STRATEGIC_REGISTER.json";
const INSPECTION = "docs/odg/evidence/V19_EXP_B_CONTRACT_INSPECTION.json";
// pre-registered ground truth (contract preRegistration.dataset.families): parent/child pairs cited from committed links
const FAMILIES = Object.freeze([["G", "G2"], ["J", "J2"], ["V175-NB1", "V175-NB2"], ["V178-P1", "V178-P1-R"], ["V178-P4", "V178-P4-INT"]]);
const K = 3, HIT_MIN = 8;
const SECTIONS = ["context", "initialSituation", "diagnosis", "decisions", "steps", "components", "results", "difficulties", "corrections", "costs", "evidence", "lessons", "knowledgeClass", "confidence", "method", "features"];
const TOUCHED_TESTS = Object.freeze(["runtime/core/odg-experience-episode.test.ts", "runtime/core/decision-precedent.test.ts", "runtime/core/odg-go-cycle.test.ts", "runtime/bin/odg-go.test.ts"]);
function readJson(root: string, p: string): any { try { return JSON.parse(fs.readFileSync(path.join(root, p), "utf8")); } catch { return null; } }
function runTest(f: string): any { const r = cp.spawnSync("npx", ["tsx", f], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { file: f, exit: r.status, ok: r.status === 0 }; }
function runTsc(): any { const r = cp.spawnSync("npx", ["tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { command: "tsc --noEmit --incremental false -p tsconfig.json", exit: r.status, ok: r.status === 0 }; }

function missionOf(item: any, contract: any): any {
  const w = (contract && contract.WORK_ITEM_CONTRACT) || {}; const pre = w.preRegistration || {};
  return { id: item.id, title: item.title, objective: w.objective, metric: pre.metric, question: pre.question, components: Array.isArray(w.write_set) ? w.write_set : [] };
}

async function runExp(o: any): Promise<any> {
  const EXP = require("../core/odg-experience-episode.js"); const DP = require("../core/decision-precedent.js");
  const res: any = { schema: "odg-v19-exp-b-result/1", scenario: SCENARIO, label: o.label, rule: EXP.RULE };
  const ac: any = {};
  const register = readJson(o.root, REGISTER).register; const contracts = readJson(o.root, CONTRACTS).contracts;
  const readRecord = (rel: string) => { const b = fs.readFileSync(path.join(o.root, rel)); return { json: JSON.parse(b), sha256: crypto.createHash("sha256").update(b).digest("hex") }; };
  const closed = register.items.filter((i: any) => String(i.status || "").startsWith("CLOSED_") && i.closure && i.closure.record);
  const eps = EXP.buildEpisodes({ register, contracts, readRecord, contractSha256: require("../core/odg-authorization-scope.js").contractSha256 });
  // AC1
  const shaOk = eps.every((e: any) => e.evidence.validationSha256 === crypto.createHash("sha256").update(fs.readFileSync(path.join(o.root, e.evidence.validationRecord))).digest("hex"));
  ac.AC1 = { met: closed.length > 0 && eps.length === closed.length && eps.every((e: any) => e.status === "ACTIVE" && SECTIONS.every((k) => k in e)) && shaOk,
    closedItems: closed.map((i: any) => i.id), episodes: eps.map((e: any) => ({ id: e.id, status: e.status, outcome: e.method.outcome, reuse: e.method.reuse, confidence: e.confidence, lessons: e.lessons.length, features: e.features.length, components: e.components.length })), validationShaRecomputed: shaOk };
  const store = EXP.toPrecedentStore(eps);
  const C = new Map(contracts.map((c: any) => [c.scenario, c])); const I = new Map(register.items.map((i: any) => [i.id, i]));
  // AC3 (+ the AC2/AC4 observations over every recall)
  const queries: any[] = []; const recalls: any[] = [];
  for (const [a, b] of FAMILIES) for (const [q, partner] of [[a, b], [b, a]]) {
    const it = I.get(q); if (!it) { queries.push({ query: q, partner, hit: null, reason: "item absent" }); continue; }
    const r = EXP.recallForMission(store, missionOf(it, C.get(q)), { k: K, minSimilarity: 0 });
    const ranked = r.comparable.map((c: any) => ({ item: c.item, similarity: c.similarity, outcome: c.outcome, applicable: c.applicable }));
    const rank = ranked.findIndex((c: any) => c.item === partner);
    const without = EXP.recallForMission(DP.emptyStore(), missionOf(it, C.get(q)), { k: K, minSimilarity: 0 });
    queries.push({ query: q, partner, hit: rank >= 0, rank: rank >= 0 ? rank + 1 : null, top: ranked, withoutMemory: { status: without.status, hit: without.comparable.some((c: any) => c.item === partner) } });
    recalls.push(r);
  }
  const hits = queries.filter((x) => x.hit === true).length; const pool = eps.length - 1;
  ac.AC3 = { met: queries.every((x) => x.hit !== null) ? hits >= HIT_MIN : null, hits, of: queries.length, threshold: HIT_MIN, k: K,
    withoutMemoryHits: queries.filter((x) => x.withoutMemory && x.withoutMemory.hit).length, randomExpectation: Math.round(queries.length * Math.min(1, K / pool) * 1000) / 1000, queries };
  const allLessons = eps.flatMap((e: any) => e.lessons);
  ac.AC2 = { met: eps.every((e: any) => e.knowledgeClass === "INTERNAL_EXPERIENCE") && allLessons.filter((l: any) => /nextLever/.test(l.source)).every((l: any) => l.class === "HYPOTHESIS") && !allLessons.some((l: any) => l.class === "CORROBORATED_FACT") && recalls.every((r: any) => r.adaptation && r.adaptation.autoApply === false),
    lessonClasses: allLessons.reduce((m: any, l: any) => ((m[l.class] = (m[l.class] || 0) + 1), m), {}), recalls: recalls.length };
  const seen = recalls.flatMap((r: any) => r.comparable);
  const failedOk = seen.filter((c: any) => c.outcome === "FAILED").every((c: any) => c.applicable === false && c.blockers.some((x: string) => /RB-REATTEMPT-CHANGED-INPUT/.test(x)));
  const passOk = seen.filter((c: any) => c.outcome === "SUCCEEDED" && c.status === "ACTIVE").every((c: any) => c.applicable === true);
  ac.AC4 = { met: seen.length > 0 && failedOk && passOk, recalledFailed: seen.filter((c: any) => c.outcome === "FAILED").length, recalledSucceeded: seen.filter((c: any) => c.outcome === "SUCCEEDED").length, failedBlocked: failedOk, succeededApplicable: passOk };
  // AC5 — the real GO cycle (DRY, in-process) with and without odg-go's experienceRecall port
  try {
    const B = require("./odg-go.ts"); const GO = require("../core/odg-go-cycle.ts");
    const s = B.readState(o.root);
    const cycle = async (withPort: boolean) => { const tr: any[] = []; let t = 1; const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "expb-")));
      await GO.runGoCycle({ mode: "DRY" }, { now: () => (t += 5), truthLock: () => ({ ok: true, blocked: false, status: "PASS", gitState: {} }), readState: () => s, stopRequested: () => ({ stop: false }),
        trace: { append: (e: any) => tr.push(e), readPrior: () => [] }, writeSummary: () => {}, isolation: () => ({ ok: false, reason: "dry" }), dispatchNative: () => { throw new Error("no dispatch"); },
        claims: B.makeClaimStore(tmp), knowledge: () => B.knowledge(o.root, o.now), ...(withPort ? { experienceRecall: B.experienceRecall(o.root) } : {}) });
      const sel = tr.find((e: any) => e.step === "SELECT"); const dc = tr.find((e: any) => e.step === "DECOMPOSE"); return { workingOn: sel && sel.decision.workingOn, dc }; };
    const w = await cycle(true); const wo = await cycle(false);
    const er = w.dc && w.dc.decision && w.dc.decision.experienceRecall;
    ac.AC5 = { met: !!w.workingOn && w.dc.status === "DONE" && !!er && ["RECALLED", "NO_COMPARABLE"].includes(er.status) && !!wo.dc && !("experienceRecall" in (wo.dc.decision || {})),
      workingOn: w.workingOn, decompose: w.dc && w.dc.status, experienceRecall: er ? { status: er.status, comparable: er.comparable.map((c: any) => ({ item: c.item, similarity: c.similarity, outcome: c.outcome, reuse: c.reuse, applicable: c.applicable })), succeeded: er.succeeded, failed: er.failed, partial: er.partial, autoApply: er.adaptation.autoApply } : null,
      withoutPortHasField: !!(wo.dc && wo.dc.decision && "experienceRecall" in wo.dc.decision) };
  } catch (e: any) { ac.AC5 = { met: null, reason: "NOT_MEASURED: " + String((e && e.message) || e) }; }
  const tests = TOUCHED_TESTS.map((f) => o.runTest(f)); const tsc = o.runTsc(); ac.AC6 = { met: tests.every((x: any) => x.ok) && tsc.ok, evidence: { tests, tsc } };
  res.criteria = ac;
  const v = Object.values(ac).map((x: any) => x.met);
  res.outcome = v.some((x) => x === null) ? "NOT_MEASURED" : v.every((x) => x === true) ? "PASS" : "FAIL";
  res.honestLimits = ["in-sample: the feature/similarity design (EXP-B-1) was written with the closed corpus visible, although no ranking was computed on it before pre-registration",
    "similarity is lexical-structural Jaccard, not semantic proof; families share vocabulary by construction (a child restates its parent's problem)",
    "12-episode corpus: a retrieval PASS here shows the mechanism works on ODG's own closures, not generalisation to new domains (increment G)"];
  res.provenance = { codeAuthor: "PROVIDER (Claude Code) — EXP-B-1", decisionAuthority: "ODG GO (dispatch of the declared target)", network: "none", modelCalls: 0, providerCalls: 0 };
  return res;
}

function gate(): any {
  const AS = require("../core/odg-authorization-scope");
  const d = readJson(ROOT, CONTRACTS); const c = d && (d.contracts || []).find((x: any) => x && x.scenario === SCENARIO);
  if (!c) return { ok: false, reason: "contract missing" };
  const sc = AS.deriveAuthorizationScope(c, { inspection: readJson(ROOT, INSPECTION), probes: require("../core/odg-observation-currency.js").localGitProbes(ROOT) });
  return sc.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && sc.executionAuthorized === true ? { ok: true, contractSha256: AS.contractSha256(c) } : { ok: false, reason: `scope: ${sc.currentStep} executionAuthorized=${sc.executionAuthorized} — ${sc.reason}` };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — one execution only\n`); return 4; }
  const g = gate(); if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const r = await runExp({ root: ROOT, label: "NATIVE (ODG GO dispatch)", now: Date.now(), runTest, runTsc });
  r.contractSha256 = g.contractSha256;
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`V19-EXP-B outcome ${r.outcome} → ${OUT}\n`);
  return r.outcome === "PASS" ? 0 : 1;
}

module.exports = { runExp, gate, missionOf, OUT, INSPECTION, FAMILIES, TOUCHED_TESTS };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));
export {};

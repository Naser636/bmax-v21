#!/usr/bin/env node
"use strict";
/*
 * V19-MEM-2 — the contract-declared RUN_CONTROLLED_EXPERIMENTS target of the real-memory P0 (REPRO-1). One execution, REAL ODG
 * call paths with the LIVE local embedding model (qwen3-embedding:0.6b, loopback):
 *   AC1  extraction: every OBSERVATION_SOURCES record is read with its sha256; observations > 0; every observation of the
 *        REPLAY record is marked non-independent.
 *   AC2  REPRO-1 recomputed: ≥1 CORROBORATED key; each has ≥2 independent ODG executions and one value; recomputing WITHOUT
 *        the replay record yields the same corroborated keys (a replay contributes nothing).
 *   AC3  canonical trust gate (memory-architecture.accessMemory, trustedAuthors ODG): trusts EXACTLY the corroborated records;
 *        past validUntil they are STALE (not trusted).
 *   AC4  real GO path: knowledge() with the memory port indexes FACT = admissible-trusted claims + corroborated observations;
 *        the port recalls ≥1 REPRO-1 fact (OBS- id, provenance REPRO-1) for a local-model query; the REAL GO cycle
 *        (runGoCycle DRY, in-process) records DECOMPOSE.contextRecall RECALLED with every FACT hit ⊆ trusted ids.
 *   AC5  no promotion: claims byte-identical with and without the observations; no SUPPORTED claim and no experience episode
 *        is in the FACT tier.
 *   AC6  tsc --noEmit --incremental false + the touched tests pass (run one at a time).
 * PASS ⇔ AC1–AC6 met; embed unreachable ⇒ NOT_MEASURED (never PASS). Writes ONLY <out>; gated on the contract's inspection.
 *   npx tsx runtime/bin/odg-v19-mem2-run.ts docs/odg/evidence/V19_MEM2_RESULT.json
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const SCENARIO = "V19-MEM-2";
const OUT = "docs/odg/evidence/V19_MEM2_RESULT.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V19_MEM2_CONTRACT_INSPECTION.json";
const REPLAY = "docs/odg/evidence/V178_P1R_AGREEMENT_RESULT.json";
const TOUCHED_TESTS = Object.freeze(["runtime/core/odg-observation-corroboration.test.ts", "runtime/bin/odg-go-memory.test.ts", "runtime/bin/odg-go.test.ts", "runtime/core/odg-go-cycle.test.ts"]);
const QUERY = "qwen2.5-coder:7b local model result on impl-ts-parse-range at temperature 0";
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } }
function runTest(f: string): any { const r = cp.spawnSync("npx", ["tsx", f], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { file: f, exit: r.status, ok: r.status === 0 }; }
function runTsc(): any { const r = cp.spawnSync("npx", ["tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { command: "tsc --noEmit --incremental false -p tsconfig.json", exit: r.status, ok: r.status === 0 }; }

async function runMem(o: any): Promise<any> {
  const B = require("./odg-go.ts"); const GO = require("../core/odg-go-cycle.ts"); const OC = require("../core/odg-observation-corroboration.js");
  const MA = require("../core/memory-architecture.js"); const crypto = require("crypto");
  const res: any = { schema: "odg-v19-mem2-result/1", scenario: SCENARIO, label: o.label, embedModel: o.embedModel, rule: OC.RULE };
  const ac: any = {};
  const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p));
  // AC1 — extraction from the committed sources
  const srcs = B.OBSERVATION_SOURCES.map((rel: string) => { const p = path.join(o.root, rel); let b: any = null; try { b = fs.readFileSync(p); } catch { b = null; }
    return { rel, sha256: b ? crypto.createHash("sha256").update(b).digest("hex") : null, rec: b ? JSON.parse(b) : null }; });
  const obsBy = srcs.map((s: any) => ({ rel: s.rel, obs: s.rec ? OC.extractT0Observations(s.rec, { path: s.rel, sha256: s.sha256 }) : [] }));
  const all = obsBy.flatMap((x: any) => x.obs);
  const replayObs = (obsBy.find((x: any) => x.rel === REPLAY) || { obs: [] }).obs;
  ac.AC1 = { met: srcs.every((s: any) => !!s.sha256) && all.length > 0 && replayObs.length > 0 && replayObs.every((x: any) => x.source.independent === false),
    sources: srcs.map((s: any) => ({ path: s.rel, sha256: s.sha256, observations: (obsBy.find((x: any) => x.rel === s.rel) || { obs: [] }).obs.length })), observations: all.length };
  // AC2 — REPRO-1 recomputed; the replay contributes nothing
  const c = OC.corroborate(all); const cNoReplay = OC.corroborate(all.filter((x: any) => x.source.path !== REPLAY));
  const corr = c.results.filter((r: any) => r.status === "CORROBORATED");
  const sameWithout = JSON.stringify(corr.map((r: any) => r.keySha)) === JSON.stringify(cNoReplay.results.filter((r: any) => r.status === "CORROBORATED").map((r: any) => r.keySha));
  ac.AC2 = { met: corr.length >= 1 && corr.every((r: any) => r.independentExecutions >= 2 && r.value !== null) && sameWithout, tally: c.tally, corroborated: corr.map((r: any) => ({ metric: r.key.metric, task: r.key.conditions.task, value: r.value, independentExecutions: r.independentExecutions, sources: r.sources.map((s: any) => ({ path: s.path, independent: s.independent })) })), sameWithoutReplay: sameWithout };
  // AC3 — canonical trust gate
  const mems = c.results.map((r: any) => OC.toMemory(r, o.now));
  const acc = MA.accessMemory(mems, { asOf: o.now, trustedAuthors: ["ODG"] });
  const factIds = mems.filter((m: any) => m.isFact).map((m: any) => m.id).sort();
  const stale = MA.accessMemory(mems.filter((m: any) => m.isFact), { asOf: Math.max(...mems.map((m: any) => m.validUntil)) + 1, trustedAuthors: ["ODG"] });
  ac.AC3 = { met: JSON.stringify(acc.trusted.map((t: any) => t.id).sort()) === JSON.stringify(factIds) && factIds.length >= 1 && stale.trustedCount === 0, trusted: acc.trustedCount, factIds, staleTrusted: stale.trustedCount };
  // AC4 — real GO path (knowledge + port recall + the real cycle)
  try {
    const plain = B.knowledge(o.root, o.now);
    const m = B.memoryPort(tmp("mem2-"), o.embed);
    const k = await B.knowledge(o.root, o.now, m);
    const trustedClaims = k.claims.filter((x: any) => x.admissible && x.admissible.trusted).map((x: any) => x.id);
    if (!k.memory || k.memory.status !== "INDEXED") throw new Error("memory " + JSON.stringify(k.memory));
    const rq = await m.recall(QUERY);
    const obsFacts = rq.facts.filter((h: any) => String(h.id).startsWith("OBS-"));
    const s = B.readState(o.root); const tr: any[] = []; let t = 1; const m2 = B.memoryPort(tmp("mem2b-"), o.embed);
    await GO.runGoCycle({ mode: "DRY" }, { now: () => (t += 5), truthLock: () => ({ ok: true, blocked: false, status: "PASS", gitState: {} }), readState: () => s, stopRequested: () => ({ stop: false }),
      trace: { append: (e: any) => tr.push(e), readPrior: () => [] }, writeSummary: () => {}, isolation: () => ({ ok: false, reason: "dry" }), dispatchNative: () => { throw new Error("no dispatch"); },
      claims: B.makeClaimStore(fs.realpathSync(tmp("mem2c-"))), knowledge: () => B.knowledge(o.root, o.now, m2), memoryRecall: (q: string) => m2.recall(q), experienceRecall: B.experienceRecall(o.root) });
    const sel = tr.find((e: any) => e.step === "SELECT"); const dc = tr.find((e: any) => e.step === "DECOMPOSE"); const cr = dc && dc.decision && dc.decision.contextRecall;
    const trusted = new Set([...trustedClaims, ...factIds]);
    ac.AC4 = { met: k.memory.factIndexed === trustedClaims.length + factIds.length && obsFacts.length >= 1 && obsFacts.every((h: any) => /^REPRO-1:/.test(String(h.provenance))) && !!cr && cr.status === "RECALLED" && cr.facts.every((h: any) => trusted.has(h.id)),
      memory: k.memory, portQuery: QUERY, portRecallFacts: rq.facts.map((h: any) => ({ id: h.id, score: h.score, provenance: h.provenance })), portRecallContext: rq.context.map((h: any) => h.id),
      workingOn: sel && sel.decision.workingOn, decomposeRecall: cr ? { status: cr.status, facts: cr.facts.map((h: any) => h.id), context: cr.context.map((h: any) => h.id) } : null };
    // AC5 — no promotion
    const ctxIds = new Set(rq.context.map((h: any) => h.id));
    ac.AC5 = { met: JSON.stringify(k.claims) === JSON.stringify(plain.claims) && trustedClaims.length === k.claims.filter((x: any) => x.isFact).length && !rq.facts.some((h: any) => /^EPISODE:/.test(String(h.id))) && rq.facts.every((h: any) => !k.claims.some((x: any) => x.id === h.id && x.epistemic === "SUPPORTED")),
      claimsUnchanged: JSON.stringify(k.claims) === JSON.stringify(plain.claims), supportedClaimsInFact: rq.facts.filter((h: any) => k.claims.some((x: any) => x.id === h.id && x.epistemic === "SUPPORTED")).length, contextRecalled: [...ctxIds] };
    res.tally = { collected: all.length, verifiedSources: srcs.filter((x: any) => x.sha256).length, corroborated: c.tally.corroborated, rejectedAsFact: c.tally.unverified + c.tally.contradicted, contradicted: c.tally.contradicted, pending: 0,
      indexedAsFact: k.memory.factIndexed, indexedAsContext: k.memory.contextIndexed, reusedInGoDecompose: cr ? cr.facts.filter((id: any) => String(id && id.id || id).startsWith("OBS-")).length : 0, reusedByPortQuery: obsFacts.length };
  } catch (e: any) { ac.AC4 = ac.AC4 || { met: null, reason: "NOT_MEASURED: " + String((e && e.message) || e) }; ac.AC5 = ac.AC5 || { met: null, reason: "NOT_MEASURED (AC4 path failed)" }; }
  const tests = TOUCHED_TESTS.map((f) => o.runTest(f)); const tsc = o.runTsc(); ac.AC6 = { met: tests.every((x: any) => x.ok) && tsc.ok, evidence: { tests, tsc } };
  res.criteria = ac;
  const v = Object.values(ac).map((x: any) => x.met);
  res.outcome = v.some((x) => x === null) ? "NOT_MEASURED" : v.every((x) => x === true) ? "PASS" : "FAIL";
  res.honestLimits = ["the provider inspected the source records while authoring REPRO-1 (the corroborated keys were known): this run validates the mechanism and its integration, it is not a prediction",
    "the facts are INTERNAL measurements under stated conditions (model tag, temperature 0, seed 42, task set sha) — the Ollama model digest is not recorded by the P1 runners, so a re-pulled tag with the same name is a condition change REPRO-1 cannot see",
    "2 independent executions is the minimum; V155 (same grader) is consistent but not counted (its top_k condition is not recorded by the P1 runners)"];
  res.provenance = { codeAuthor: "PROVIDER (Claude Code) — REPRO-1 / V19-MEM-2", decisionAuthority: "ODG GO (dispatch of the declared target)", network: "loopback Ollama /api/embed only", modelCalls: "embedding only", providerCalls: 0 };
  return res;
}

function gate(): any {
  const AS = require("../core/odg-authorization-scope");
  const d = readJson(CONTRACTS); const c = d && (d.contracts || []).find((x: any) => x && x.scenario === SCENARIO);
  if (!c) return { ok: false, reason: "contract missing" };
  const sc = AS.deriveAuthorizationScope(c, { inspection: readJson(INSPECTION), probes: require("../core/odg-observation-currency.js").localGitProbes(ROOT) });
  return sc.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && sc.executionAuthorized === true ? { ok: true, contractSha256: AS.contractSha256(c) } : { ok: false, reason: `scope: ${sc.currentStep} executionAuthorized=${sc.executionAuthorized} — ${sc.reason}` };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — one execution only\n`); return 4; }
  const g = gate(); if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const H = require("../core/odg-memory-hybrid-index");
  const r = await runMem({ root: ROOT, label: "NATIVE (ODG GO dispatch)", embed: H.ollamaEmbed(), embedModel: "qwen3-embedding:0.6b", now: Date.now(), runTest, runTsc });
  r.contractSha256 = g.contractSha256;
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`V19-MEM-2 outcome ${r.outcome} → ${OUT}\n`);
  return r.outcome === "PASS" ? 0 : 1;
}

module.exports = { runMem, gate, OUT, INSPECTION, TOUCHED_TESTS, QUERY };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));
export {};

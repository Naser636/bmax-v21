#!/usr/bin/env node
"use strict";
/*
 * V19 V178-P4-INT — the contract-declared RUN_CONTROLLED_EXPERIMENTS target of the P4 OPERATIONAL integration (MEM-INT-1 +
 * TIER-1). One execution, REAL ODG call paths with the LIVE local embedding model (qwen3-embedding:0.6b, loopback):
 *   AC1  GO knowledge() (runtime/bin/odg-go.ts) indexes the canonical toMemory records: FACT tier = the claims memory-architecture
 *        trusts (admissible), CONTEXT tier = SUPPORTED-unverified, attributed, sourced, fresh; status INDEXED.
 *   AC2  the REAL GO cycle (odg-go-cycle.runGoCycle, DRY, in-process; truth lock + claim store stubbed because the dispatching GO
 *        run already passed its own Truth Lock) records DECOMPOSE.contextRecall RECALLED for the working item, every hit
 *        tier FACT or CONTEXT_UNVERIFIED, facts ⊆ admissible-trusted ids.
 *   AC3  no promotion: claims' admissibility byte-identical with / without the memory port.
 *   AC4  persistence: a second knowledge() on the same index re-embeds nothing and indexes the same count.
 *   AC5  FACT pipeline (SYNTHETIC fixture, labelled — proves the mechanism, never a real fact): a VERIFIED fresh attributed
 *        record synced into the same port index is recalled as FACT; a SUPPORTED one as CONTEXT_UNVERIFIED.
 *   AC6  tsc --noEmit --incremental false + the touched tests pass (run one at a time).
 * PASS ⇔ AC1–AC6 met; embed unreachable ⇒ NOT_MEASURED (never PASS). Writes ONLY <out>; gated on the contract's inspection.
 *   npx tsx runtime/bin/odg-v178-p4-int-run.ts docs/odg/evidence/V178_P4_INT_RESULT.json
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const SCENARIO = "V178-P4-INT";
const OUT = "docs/odg/evidence/V178_P4_INT_RESULT.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V178_P4_INT_CONTRACT_INSPECTION.json";
const TOUCHED_TESTS = Object.freeze(["runtime/core/odg-memory-hybrid-index.test.ts", "runtime/bin/odg-go-memory.test.ts", "runtime/core/odg-go-cycle.test.ts", "runtime/bin/odg-go.test.ts"]);
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } }
function runTest(f: string): any { const r = cp.spawnSync("npx", ["tsx", f], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { file: f, exit: r.status, ok: r.status === 0 }; }
function runTsc(): any { const r = cp.spawnSync("npx", ["tsc", "--noEmit", "--incremental", "false", "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8", timeout: 600000 }); return { command: "tsc --noEmit --incremental false -p tsconfig.json", exit: r.status, ok: r.status === 0 }; }

async function runInt(o: any): Promise<any> {
  const B = require("./odg-go.ts"); const GO = require("../core/odg-go-cycle.ts");
  const res: any = { schema: "odg-v178-p4-int-result/1", scenario: SCENARIO, label: o.label, embedModel: o.embedModel };
  const ac: any = {};
  const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p));
  const plain = B.knowledge(o.root, o.now);
  const m = B.memoryPort(tmp("p4int-"), o.embed);
  let k: any = null; try { k = await B.knowledge(o.root, o.now, m); } catch (e: any) { k = { error: String(e && e.message || e) }; }
  if (!k || k.error || !k.memory || k.memory.status !== "INDEXED") { ac.AC1 = { met: null, reason: "NOT_MEASURED: " + JSON.stringify(k && (k.error || k.memory)) }; }
  else { const trusted = k.claims.filter((c: any) => c.admissible && c.admissible.trusted).map((c: any) => c.id);
    ac.AC1 = { met: k.memory.factIndexed === trusted.length && k.memory.indexed === k.memory.factIndexed + k.memory.contextIndexed && k.memory.indexed > 0, memory: k.memory, admissibleTrusted: trusted }; }
  ac.AC3 = { met: !!(k && k.claims) && JSON.stringify(k.claims) === JSON.stringify(plain.claims) };
  // AC2 — the real GO cycle (DRY) with the memory port
  const s = B.readState(o.root); const tr: any[] = []; let t = 1;
  const m2 = B.memoryPort(tmp("p4int2-"), o.embed);
  try {
    await GO.runGoCycle({ mode: "DRY" }, { now: () => (t += 5), truthLock: () => ({ ok: true, blocked: false, status: "PASS", gitState: {} }), readState: () => s, stopRequested: () => ({ stop: false }),
      trace: { append: (e: any) => tr.push(e), readPrior: () => [] }, writeSummary: () => {}, isolation: () => ({ ok: false, reason: "dry" }), dispatchNative: () => { throw new Error("no dispatch"); },
      claims: B.makeClaimStore(fs.realpathSync(tmp("p4intc-"))), knowledge: () => B.knowledge(o.root, o.now, m2), memoryRecall: (q: string) => m2.recall(q) });
    const sel = tr.find((e: any) => e.step === "SELECT"); const dc = tr.find((e: any) => e.step === "DECOMPOSE"); const cr = dc && dc.decision && dc.decision.contextRecall;
    const trustedIds = new Set(((ac.AC1 && ac.AC1.admissibleTrusted) || []));
    ac.AC2 = { met: !!cr && cr.status === "RECALLED" && dc.status === "DONE" && [...cr.facts, ...cr.context].length > 0 && cr.facts.every((h: any) => h.tier === "FACT" && trustedIds.has(h.id)) && cr.context.every((h: any) => h.tier === "CONTEXT_UNVERIFIED"),
      workingOn: sel && sel.decision.workingOn, decompose: dc && dc.status, contextRecall: cr || null };
  } catch (e: any) { ac.AC2 = { met: null, reason: "NOT_MEASURED: " + String(e && e.message || e) }; }
  // AC4 persistence
  try { const k2 = await B.knowledge(o.root, o.now, B.memoryPort(m.dir.replace(/\/memory-index$/, ""), o.embed)); ac.AC4 = { met: !!k.memory && k2.memory.status === "INDEXED" && k2.memory.embedded === 0 && k2.memory.indexed === k.memory.indexed, second: k2.memory }; }
  catch (e: any) { ac.AC4 = { met: null, reason: "NOT_MEASURED: " + String(e && e.message || e) }; }
  // AC5 FACT pipeline on SYNTHETIC fixtures, same port mechanism
  try {
    const H = require("../core/memory-architecture.js").semanticRetrieval();
    const m5 = B.memoryPort(tmp("p4int5-"), o.embed); const [p] = await o.embed(["dimension probe"]); m5.ix = H.openIndex({ dir: m5.dir, tenant: m5.tenant, dims: p.length });
    const base = { provenance: "SYNTHETIC:p4-int-fixture", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic", learnedAt: o.now - 1000, validUntil: o.now + 86400000 };
    const sync = await H.syncIndex(m5.ix, [{ id: "SYN-FACT", claim: "SYNTHETIC: canonical JSON sorts object keys before hashing", status: "VERIFIED", epistemic: "CORROBORATED", confidence: 0.9, ...base },
      { id: "SYN-CTX", claim: "SYNTHETIC: small code review changes are reviewed faster", status: "UNVERIFIED", epistemic: "SUPPORTED", confidence: 0.7, ...base }], { asOf: o.now, trustedAuthors: ["ODG"], contextTier: true }, o.embed);
    const rf = await m5.recall("how are object keys ordered in canonical JSON hashing"); const rc = await m5.recall("are small code review changes reviewed faster");
    ac.AC5 = { met: sync.factIndexed === 1 && sync.contextIndexed === 1 && rf.facts.some((h: any) => h.id === "SYN-FACT") && !rf.context.some((h: any) => h.id === "SYN-FACT") && rc.context.some((h: any) => h.id === "SYN-CTX") && !rc.facts.some((h: any) => h.id === "SYN-CTX"),
      label: "SYNTHETIC fixtures — mechanism only, never the truth of a real fact", sync, factQuery: rf.facts.map((h: any) => h.id), contextQuery: rc.context.map((h: any) => h.id) };
  } catch (e: any) { ac.AC5 = { met: null, reason: "NOT_MEASURED: " + String(e && e.message || e) }; }
  const tests = TOUCHED_TESTS.map((f) => o.runTest(f)); const tsc = o.runTsc(); ac.AC6 = { met: tests.every((x) => x.ok) && tsc.ok, evidence: { tests, tsc } };
  res.criteria = ac;
  const v = Object.values(ac).map((x: any) => x.met);
  res.outcome = v.some((x) => x === null) ? "NOT_MEASURED" : v.every((x) => x === true) ? "PASS" : "FAIL";
  res.provenance = { codeAuthor: "PROVIDER (Claude Code) — MEM-INT-1 / TIER-1", decisionAuthority: "ODG GO (dispatch of the declared target)", network: "loopback Ollama /api/embed only", providerCalls: 0 };
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
  const r = await runInt({ root: ROOT, label: "NATIVE (ODG GO dispatch)", embed: H.ollamaEmbed(), embedModel: "qwen3-embedding:0.6b", now: Date.now(), runTest, runTsc });
  r.contractSha256 = g.contractSha256;
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`V178-P4-INT outcome ${r.outcome} → ${OUT}\n`);
  return r.outcome === "PASS" ? 0 : 1;
}

module.exports = { runInt, gate, OUT, INSPECTION, TOUCHED_TESTS };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));
export {};

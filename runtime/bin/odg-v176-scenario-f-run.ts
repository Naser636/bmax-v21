#!/usr/bin/env node
"use strict";
/*
 * V17.6 — SCENARIO F single initial execution: GO PARALLEL WAVE on independent write zones, contract
 * docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#F, owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json
 * (« J'autorise GO à sélectionner et exécuter les missions internes de construction de la roadmap, selon son ordre
 * stratégique propre, y compris NB3, les vagues GO parallèles […] » / « Construire les vagues GO parallèles sur des zones
 * d'écriture indépendantes. »). F ownerText: « ODG décompose une mission, affecte des fournisseurs, réceptionne leurs
 * résultats, détecte les incompatibilités et valide l'intégration. »
 *
 * NO SECOND ENGINE: the wave is runtime/core/odg-go-wave.ts (selectWave → dispatchWave → detectIncompatibilities →
 * integrate), which composes parallel-execution-planner + odg-writeset-contention (+ odg-concurrency-policy.decide for the
 * admitted builders) and git merge-tree; assignments go through odg-agent-supervisor.assign/renew/close (write-sets
 * declared). This file only supplies the DETERMINISTIC INTERNAL FIXTURE (an invoice mini-project + pre-scripted fixture
 * producers) and the pre-registered grading.
 *
 * LABEL: DETERMINISTIC_FIXTURE — the producers are fixture agents (separate OS processes, each in its own git worktree,
 * committing on its own branch) whose outputs are PRE-SCRIPTED: round-1 outputs carry two PLANTED incompatibilities
 * (W-TOTAL writes outside its declared write-set; W-PARSE breaks the shared LineItem interface for some prices while
 * passing its own test); on ODG's detection feedback they deliver a pre-scripted v2. What is measured is ODG's selection,
 * post-receipt detection and integration validation — NOT model/provider capability, NOT repair intelligence. No model, no
 * network, no provider. simulation ≠ test ≠ demonstration ≠ real operation: this is a test-grade demonstration.
 *
 * MODES:
 *   <out>          GO dispatch. <out> must be docs/odg/evidence/V176_F_EXPERIMENT.json (exit 3). Refused unless
 *                  odg-authorization-scope derives RUN_CONTROLLED_EXPERIMENTS as F's current execution-authorized step and
 *                  the declared dispatch target is this runner (exit 2); ALREADY_RECORDED / ALREADY_CLAIMED (exit 4);
 *                  HOST_BUSY / PRECONDITION (exit 5). ONE-SHOT: only a prior F-RUNNER claim refuses — GO's own GO-ORD-2
 *                  claim <16hex>-F.claim (created right before GO dispatches this runner) never does (J-runner lesson: a
 *                  runner must not refuse its own dispatch's claim).
 *   --selftest     the same fixture on temp dirs; nothing written in the repo; no claim.
 * Exit 0 = record written with outcome PASS; 1 = record written with another outcome (or error).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const WAVE = require("../core/odg-go-wave.js");
const SUP = require("../core/odg-agent-supervisor.js");
const CPOL = require("../core/odg-concurrency-policy.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");
const PIPE = require("../core/odg-native-design-pipeline.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v176-scenario-f-run.ts";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V176_F_CONTRACT_INSPECTION.json";   // written by an independent inspector, never here
const PRIOR = "docs/odg/evidence/V161_SCENARIO_F.json";                     // F's prior (V161) result — read-only
const OUT = "docs/odg/evidence/V176_F_EXPERIMENT.json";
const SCENARIO = "F";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const CLAIM_RE = /^[0-9a-f]{16}-F-runner\.claim$/;   // ONLY this runner's own claims (never GO's <16hex>-F.claim)
const INCOMPAT_KINDS = Object.freeze(["WRITESET_VIOLATION", "OVERLAPPING_WRITES", "MERGE_CONFLICT", "CHECK_FAILED"]);

const sha256 = (s: any) => crypto.createHash("sha256").update(s).digest("hex");
function sha256File(p: string): string | null { try { return sha256(fs.readFileSync(p)); } catch { return null; } }
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
const arr = (v: any) => (Array.isArray(v) ? v : []);
const posInt = (v: any) => Number.isInteger(v) && v > 0;
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/* ============================ the DETERMINISTIC INTERNAL FIXTURE (F-WAVE-FIXTURE-1) ============================ */
const FIXTURE_ID = "F-WAVE-FIXTURE-1";
const LINE_ITEM = "LineItem = { sku: string, qty: integer, unitCents: integer } (exactly these keys; unitCents = integer euro-cents)";
const BASE_FILES: any = Object.freeze({
  "README.md": `# invoice mini-project (${FIXTURE_ID})\nShared interface: ${LINE_ITEM}\n`,
  "NOTES.md": "notes\n",
  "src/format-cents.js": "'use strict';\nmodule.exports = function formatCents(c) { if (!Number.isInteger(c) || c < 0) throw new Error('formatCents: non-integer cents ' + c); const e = Math.floor(c / 100), r = c % 100; return e + '.' + (r < 10 ? '0' : '') + r; };\n",
  "src/parse-line.js": "'use strict';\nmodule.exports = function parseLine(line) { throw new Error('W-PARSE: not implemented'); };\n",
  "src/invoice-total.js": "'use strict';\nmodule.exports = function invoiceTotal(items) { throw new Error('W-TOTAL: not implemented'); };\n",
  "src/invoice.js": "'use strict';\nconst parseLine = require('./parse-line.js');\nconst invoiceTotal = require('./invoice-total.js');\nconst formatCents = require('./format-cents.js');\nmodule.exports = function invoice(lines) { const t = invoiceTotal(lines.map(parseLine)); return { count: t.count, total: formatCents(t.totalCents) }; };\n",
  "test/own/parse-line.test.js": "'use strict';\nconst a = require('assert'); const p = require('../../src/parse-line.js');\na.deepStrictEqual(p(' A1 , 2 , 3.5 '), { sku: 'A1', qty: 2, unitCents: 350 });\na.deepStrictEqual(p('B,1,3'), { sku: 'B', qty: 1, unitCents: 300 });\n",
  "test/own/invoice-total.test.js": "'use strict';\nconst a = require('assert'); const t = require('../../src/invoice-total.js');\na.deepStrictEqual(t([]), { count: 0, totalCents: 0 });\na.deepStrictEqual(t([{ sku: 'A', qty: 2, unitCents: 350 }, { sku: 'B', qty: 1, unitCents: 5 }]), { count: 2, totalCents: 705 });\n",
  "test/interface/parse-line.iface.js": "'use strict';\nconst a = require('assert'); const p = require('../../src/parse-line.js');\nfor (const [s, c] of [['0.29', 29], ['1.15', 115], ['19.99', 1999], ['0.07', 7], ['2', 200]]) { const r = p('X,1,' + s); a.deepStrictEqual(Object.keys(r).sort(), ['qty', 'sku', 'unitCents']); a.ok(Number.isInteger(r.unitCents), 'unitCents must be an integer for ' + s + ', got ' + r.unitCents); a.strictEqual(r.unitCents, c); }\n",
  "test/interface/invoice-total.iface.js": "'use strict';\nconst a = require('assert'); const t = require('../../src/invoice-total.js');\nconst r = t([{ sku: 'A', qty: 3, unitCents: 29 }, { sku: 'B', qty: 1, unitCents: 1999 }]); a.ok(Number.isInteger(r.totalCents)); a.deepStrictEqual(r, { count: 2, totalCents: 2086 });\n",
  "test/integration.test.js": "'use strict';\nconst a = require('assert'); const inv = require('../src/invoice.js');\na.deepStrictEqual(inv(['A,3,0.29', 'B,1,19.99', ' C , 2 , 1.15 ']), { count: 3, total: '23.16' });\na.deepStrictEqual(inv([]), { count: 0, total: '0.00' });\n",
});
const PARSE_V1 = "'use strict';\nmodule.exports = function parseLine(line) { const p = String(line).split(',').map((x) => x.trim()); return { sku: p[0], qty: parseInt(p[1], 10), unitCents: parseFloat(p[2]) * 100 }; };\n";
const PARSE_V2 = "'use strict';\nmodule.exports = function parseLine(line) { const p = String(line).split(',').map((x) => x.trim()); return { sku: p[0], qty: parseInt(p[1], 10), unitCents: Math.round(parseFloat(p[2]) * 100) }; };\n";
const TOTAL_OK = "'use strict';\nmodule.exports = function invoiceTotal(items) { let totalCents = 0; for (const it of items) totalCents += it.qty * it.unitCents; return { count: items.length, totalCents }; };\n";
const PARSE_BY_TOTAL = "'use strict';\n// W-TOTAL 'helpfully' rewrote the parser (outside its declared write-set)\nmodule.exports = function parseLine(line) { const [sku, qty, price] = String(line).split(','); return { sku: sku.trim(), qty: Number(qty), unitCents: Math.round(Number(price) * 100) }; };\n";
/* work items: GO-ranked candidates of the decomposition. W-PARSE-LOCALE overlaps W-PARSE (excluded from the wave);
 * W-NOTES has no declared write-set (UNKNOWN ⇒ never parallelised). Only W-PARSE and W-TOTAL are dispatched. */
const WORK_ITEMS: any = Object.freeze([
  { id: "W-PARSE", role: "implement parseLine per " + LINE_ITEM, writeSet: ["src/parse-line.js"], ownTest: "test/own/parse-line.test.js", postReceiptChecks: [{ id: "iface:parse-line", argv: ["node", "test/interface/parse-line.iface.js"] }], outputs: { v1: { "src/parse-line.js": PARSE_V1 }, v2: { "src/parse-line.js": PARSE_V2 } }, planted: { v1: "CHECK_FAILED (interface: unitCents not an integer for 0.29 / 1.15 / 19.99 / 0.07 — own test passes)" } },
  { id: "W-TOTAL", role: "implement invoiceTotal over LineItem", writeSet: ["src/invoice-total.js"], ownTest: "test/own/invoice-total.test.js", postReceiptChecks: [{ id: "iface:invoice-total", argv: ["node", "test/interface/invoice-total.iface.js"] }], outputs: { v1: { "src/invoice-total.js": TOTAL_OK, "src/parse-line.js": PARSE_BY_TOTAL }, v2: { "src/invoice-total.js": TOTAL_OK } }, planted: { v1: "WRITESET_VIOLATION (also writes src/parse-line.js ⇒ overlaps W-PARSE ⇒ merge conflict)" } },
  { id: "W-PARSE-LOCALE", role: "decimal-comma prices in parseLine", writeSet: ["src/parse-line.js"], notDispatched: "write-set overlaps W-PARSE ⇒ excluded from the wave by selection" },
  { id: "W-NOTES", role: "update notes", writeSet: null, notDispatched: "no declared write-set ⇒ UNKNOWN ⇒ never parallelised" },
]);
const INTEGRATION_CHECKS = Object.freeze([
  { id: "own:parse-line", argv: ["node", "test/own/parse-line.test.js"] }, { id: "own:invoice-total", argv: ["node", "test/own/invoice-total.test.js"] },
  { id: "iface:parse-line", argv: ["node", "test/interface/parse-line.iface.js"] }, { id: "iface:invoice-total", argv: ["node", "test/interface/invoice-total.iface.js"] },
  { id: "integration", argv: ["node", "test/integration.test.js"] },
]);
const PLANTED = Object.freeze([{ kind: "WRITESET_VIOLATION", item: "W-TOTAL" }, { kind: "CHECK_FAILED", item: "W-PARSE" }]);
const PRODUCER_SRC = [
  "'use strict';",
  "const fs = require('fs'), path = require('path'), cp = require('child_process');",
  "const [item, version, scratch, outputsPath] = process.argv.slice(2);",
  "const spec = JSON.parse(fs.readFileSync(outputsPath, 'utf8'))[item];",
  "for (const [rel, src] of Object.entries(spec.outputs[version])) { fs.mkdirSync(path.dirname(path.join(scratch, rel)), { recursive: true }); fs.writeFileSync(path.join(scratch, rel), src); }",
  "const own = cp.spawnSync(process.execPath, [spec.ownTest], { cwd: scratch, encoding: 'utf8' });",
  "const env = { ...process.env, GIT_AUTHOR_NAME: 'fixture-' + item, GIT_AUTHOR_EMAIL: 'fixture@localhost', GIT_COMMITTER_NAME: 'fixture-' + item, GIT_COMMITTER_EMAIL: 'fixture@localhost', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };",
  "if (own.status !== 0) { process.stdout.write(JSON.stringify({ pid: process.pid, ownTestExit: own.status, committed: false })); process.exit(2); }",
  "cp.spawnSync('git', ['-C', scratch, 'add', '-A'], { env });",
  "const c = cp.spawnSync('git', ['-C', scratch, 'commit', '-q', '-m', item + ' ' + version], { env, encoding: 'utf8' });",
  "process.stdout.write(JSON.stringify({ pid: process.pid, ownTestExit: 0, committed: c.status === 0 }));",
].join("\n") + "\n";
const FIXTURE_SHA256 = sha256(JSON.stringify({ FIXTURE_ID, BASE_FILES, WORK_ITEMS, INTEGRATION_CHECKS, PLANTED, PRODUCER_SRC }));

/* planOf(contract) — the executable plan read from F's pre-registration (single source: the inspected contract). */
function planOf(contract: any): any {
  const pr = contract && contract.WORK_ITEM_CONTRACT && contract.WORK_ITEM_CONTRACT.preRegistration;
  if (!pr || !pr.dataset || !pr.caps) return { ok: false, reason: "WORK_ITEM_CONTRACT.preRegistration (dataset, caps) missing" };
  const d = pr.dataset, c = pr.caps, pins = arr(d.pins);
  if (d.fixture !== FIXTURE_ID) return { ok: false, reason: `preRegistration.dataset.fixture ${d.fixture} ≠ ${FIXTURE_ID}` };
  if (d.fixtureSha256 !== FIXTURE_SHA256) return { ok: false, reason: `preRegistration.dataset.fixtureSha256 ≠ the runner's fixture (${FIXTURE_SHA256.slice(0, 12)})` };
  if (!pins.length || !pins.every((p: any) => p && typeof p.file === "string" && /^[0-9a-f]{64}$/.test(String(p.sha256)))) return { ok: false, reason: "preRegistration.dataset.pins invalid" };
  for (const k of ["maxRunWallMs", "perItemWallMs", "maxRounds", "timingRepetitions", "k"]) if (!posInt(c[k])) return { ok: false, reason: `preRegistration.caps.${k} invalid` };
  if (!(typeof c.hostIdleFactor === "number" && c.hostIdleFactor > 0)) return { ok: false, reason: "preRegistration.caps.hostIdleFactor invalid" };
  return { ok: true, pins, caps: c };
}

/* ---------- fixture plumbing (temp dirs only; never the ODG repository) ---------- */
const GENV = { GIT_AUTHOR_NAME: "ODG", GIT_AUTHOR_EMAIL: "odg@localhost", GIT_COMMITTER_NAME: "ODG", GIT_COMMITTER_EMAIL: "odg@localhost", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
function g(repo: string, args: string[]): any { const r = cp.spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, ...GENV } }); return { status: r.status, out: String(r.stdout || "").trim(), err: String(r.stderr || "") }; }
function buildFixture(tmp: string): any {
  const repo = path.join(tmp, "fixture-repo");
  fs.mkdirSync(repo, { recursive: true });
  if (g(repo, ["init", "-q", "-b", "main"]).status !== 0) return { ok: false, reason: "git init failed" };
  for (const [rel, src] of Object.entries(BASE_FILES)) { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), src as string); }
  g(repo, ["add", "-A"]);
  const c = g(repo, ["commit", "-q", "-m", `${FIXTURE_ID} base`]);
  if (c.status !== 0) return { ok: false, reason: "base commit failed: " + c.err.slice(0, 200) };
  const tools = path.join(tmp, "tools"); fs.mkdirSync(tools, { recursive: true });
  fs.writeFileSync(path.join(tools, "producer.js"), PRODUCER_SRC);
  fs.writeFileSync(path.join(tools, "outputs.json"), JSON.stringify(Object.fromEntries(WORK_ITEMS.filter((w: any) => w.outputs).map((w: any) => [w.id, { ownTest: w.ownTest, outputs: w.outputs }]))));
  return { ok: true, repo, base: g(repo, ["rev-parse", "HEAD"]).out, tools };
}
/* runItemPort(fx, plan) — ports.runItem for odg-go-wave.dispatchWave: own scratch (git worktree, own branch) + a SEPARATE
 * producer process; the receipt is the commit found on the item's branch (read by ODG, not reported by the producer). */
function runItemPort(fx: any, caps: any, tag: string, versionOf: (id: string) => string): any {
  return async (item: any) => {
    const branch = `wave/${tag}/${item.id}`;
    const scratch = path.join(fx.tmp, "scratch", tag, item.id);
    fs.mkdirSync(path.dirname(scratch), { recursive: true });
    const add = g(fx.repo, ["worktree", "add", "-q", "-b", branch, scratch, fx.base]);
    if (add.status !== 0) return { ok: false, error: "worktree add failed: " + add.err.slice(0, 200) };
    const version = versionOf(item.id);
    const r = await WAVE.spawnP(process.execPath, [path.join(fx.tools, "producer.js"), item.id, version, scratch, path.join(fx.tools, "outputs.json")], scratch, caps.perItemWallMs);
    let rep: any = null; try { rep = JSON.parse(String(r.output || "").trim().split("\n").pop() || "null"); } catch { rep = null; }
    const head = g(scratch, ["rev-parse", "HEAD"]).out;
    const committed = head && head !== fx.base;
    return { ok: !!committed && r.exitCode === 0, commit: committed ? head : null, branch, scratch: path.relative(fx.tmp, scratch), version, producerPid: rep ? rep.pid : r.pid, producerExit: r.exitCode, producerSignal: r.signal, ownTestExit: rep ? rep.ownTestExit : null, timedOut: r.signal === "SIGKILL", wallMs: r.wallMs, ...(committed ? {} : { error: `no commit received (producer exit ${r.exitCode})` }) };
  };
}
function supervisorWorkspace(tmp: string): any {
  const repo = path.join(tmp, "supervisor-workspace");
  fs.mkdirSync(repo, { recursive: true });
  g(repo, ["init", "-q", "-b", "main"]); g(repo, ["commit", "-q", "--allow-empty", "-m", "scenario-f supervisor workspace"]);
  return { heartbeatDir: path.join(tmp, "hb"), locksDir: path.join(tmp, "locks"), repo, staleMs: 1000 };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function concurrencyInput(supCtx: any, loadProbe?: any): any {
  const s = loadProbe ? loadProbe() : null;
  const la = s ? CPOL.parseLoadavg(arr(s.loadavg).join(" ")) : (() => { try { return CPOL.parseLoadavg(fs.readFileSync("/proc/loadavg", "utf8")); } catch { return CPOL.NOT_MEASURED; } })();
  const mem = s && s.meminfo ? CPOL.parseMeminfo(s.meminfo) : (() => { try { return CPOL.parseMeminfo(fs.readFileSync("/proc/meminfo", "utf8")); } catch { return CPOL.NOT_MEASURED; } })();
  const snap = SUP.snapshot(SUP.collectEvidence({ repo: supCtx.repo, heartbeatDir: supCtx.heartbeatDir, locksDir: supCtx.locksDir }));
  // the workspace's MAIN_CHECKOUT unit is the coordinator itself (this runner's workspace) — role declared, not guessed
  const roleOf = Object.fromEntries(arr(snap.agents).filter((a: any) => a.kind === "MAIN_CHECKOUT").map((a: any) => [a.id, "coordinator"]));
  return { cpuCount: s ? s.nproc : (typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length), loadavg: la, meminfo: mem, snapshot: snap, roleOf };
}

/* gradeF(run, incidents) — the PRE-REGISTERED decision rule (contract F preRegistration.thresholds), mechanical. */
function gradeF(r: any, incidents: string[]): any {
  const rounds = arr(r.rounds); const r1 = rounds[0] || null; const last = rounds[rounds.length - 1] || null;
  const sel = r.selection || {};
  const dispatched = arr(sel.wave);
  const assigned = arr(r.supervisor && r.supervisor.assignments);
  const declaredOk = dispatched.length >= 2 && dispatched.every((id: string) => { const a = assigned.find((x: any) => x.item === id); const w = WORK_ITEMS.find((x: any) => x.id === id); return a && a.outcome === "ASSIGNED" && JSON.stringify(a.writeSet) === JSON.stringify(w.writeSet); });
  const C1 = { text: "decomposition + assignment through odg-agent-supervisor (write-sets declared)", met: sel.mode === "PARALLEL" && dispatched.length >= 2 && declaredOk,
    detail: { waveMode: sel.mode || null, wave: dispatched, supervisorOutcomes: assigned.map((a: any) => `${a.item}:${a.outcome}`) } };
  const rec1 = r1 ? arr(r1.dispatch.receipts).filter((x: any) => x.ok === true && x.commit) : [];
  const distinct = (k: string) => new Set(rec1.map((x: any) => x[k])).size === rec1.length;
  const C2 = { text: "two independently produced outputs received", met: !!r1 && r1.dispatch.mode === "PARALLEL" && rec1.length >= 2 && distinct("producerPid") && distinct("scratch") && distinct("branch") && distinct("commit"),
    detail: { received: rec1.map((x: any) => ({ id: x.id, commit: x.commit, branch: x.branch, producerPid: x.producerPid })), concurrentOverlapMs: r1 ? r1.dispatch.concurrentOverlapMs : null } };
  const f1 = r1 ? arr(r1.detection.findings) : [];
  const incompat = f1.filter((f: any) => INCOMPAT_KINDS.includes(f.kind));
  const plantedDetected = PLANTED.map((p) => ({ ...p, detected: incompat.some((f: any) => f.kind === p.kind && arr(f.items).includes(p.item)) }));
  const C3 = { text: "an incompatibility is DETECTED by an ODG check (not by the coordinator)", met: incompat.length > 0 && plantedDetected.every((p) => p.detected) && incompat.every((f: any) => /git|check|pathsConflict/.test(String(f.detectedBy))),
    detail: { round1Findings: f1.map((f: any) => ({ kind: f.kind, items: f.items, detectedBy: f.detectedBy })), plantedDetected } };
  const integ = last ? last.integration : null;
  const C4 = { text: "integration validated by tests + independent inspection", testsMet: !!integ && integ.status === "INTEGRATED_VALIDATED" && arr(last.detection.findings).length === 0,
    inspection: "PENDING — not part of the run: the independent inspection of this result is the VALIDATE_CRITERIA step (odg-authorization-scope R5b: criteria-validation record citing an independent inspection ACCEPT of the experiment; scenarioGrade never above this outcome)",
    detail: { finalRound: last ? last.round : null, integrationStatus: integ ? integ.status : null, checks: integ ? integ.checks.map((c: any) => `${c.id}:${c.exitCode}`) : [], unionOk: integ ? integ.unionOk : null } };
  const criteria = { C1, C2, C3, C4 };
  if (incidents.length) return { outcome: "NOT_MEASURED", reason: "incident(s): " + incidents.join("; "), criteria };
  if (C1.met && C2.met && C3.met && C4.testsMet) return { outcome: "PASS", reason: "C1 ∧ C2 ∧ C3 ∧ C4(tests) met; C4's independent-inspection part is assessed at VALIDATE_CRITERIA (R5b)", criteria };
  if (C1.met && C2.met && C3.met) return { outcome: "PARTIAL", reason: "C1 ∧ C2 ∧ C3 met; C4 (integration validated by tests) NOT met", criteria };
  return { outcome: "FAIL", reason: `measured, but ${["C1", "C2", "C3"].filter((k) => !(criteria as any)[k].met).join(", ")} not met`, criteria };
}

/* runScenarioF(o) — o: { root, plan, loadProbe?, label, contractSha256?, tmpRoot? } → the result record. */
async function runScenarioF(o: any): Promise<any> {
  const t0 = Date.now(); const plan = o.plan; const caps = plan.caps; const incidents: string[] = [];
  const deadline = t0 + caps.maxRunWallMs;
  const base: any = { schema: "odg-v176-scenario-f-result/1", scenario: SCENARIO, label: o.label, contractSha256: o.contractSha256 || null,
    ownerText: "ODG décompose une mission, affecte des fournisseurs, réceptionne leurs résultats, détecte les incompatibilités et valide l'intégration.",
    kind: "DETERMINISTIC_FIXTURE (test-grade demonstration; fixture producers with PRE-SCRIPTED outputs and PLANTED incompatibilities; no model, no provider, no network)",
    run: { head: PIPE.headOf(o.root), startedAt: new Date(t0).toISOString(), runner: SELF, capability: "runtime/core/odg-go-wave.ts" },
    fixture: { id: FIXTURE_ID, sha256: FIXTURE_SHA256, workItems: WORK_ITEMS.map((w: any) => ({ id: w.id, writeSet: w.writeSet, planted: w.planted || null, notDispatched: w.notDispatched || null })), planted: PLANTED, integrationChecks: INTEGRATION_CHECKS.map((c: any) => c.id) },
    caps, priorResult: { path: PRIOR, sha256: sha256File(path.join(o.root, PRIOR)), note: "F's prior execution (V161, live local models) — read only, never written or re-graded" } };
  const pins = plan.pins.map((p: any) => ({ file: p.file, expected: p.sha256, actual: sha256File(path.join(o.root, p.file)) }));
  if (pins.some((p: any) => p.actual !== p.expected)) incidents.push("pinned sha256 differs: " + pins.filter((p: any) => p.actual !== p.expected).map((p: any) => p.file).join(", "));
  const host = PIPE.hostLoad(caps.hostIdleFactor, o.loadProbe ? () => { const s = o.loadProbe(); return { loadavg: s.loadavg, nproc: s.nproc }; } : undefined);
  if (host.aboveThreshold) incidents.push(`HOST-1 busy host at start (loadavg-1m ${host.load1} > ${host.threshold})`);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(o.tmpRoot || os.tmpdir(), "odg-v176-f-")));
  const finish = (extra: any) => {
    const grade = gradeF(extra, incidents);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
    return { ...base, ...extra, pins, hostAtStart: host, criteria: grade.criteria, outcome: grade.outcome, outcomeReason: grade.reason, network: { modelCalls: 0, providerCalls: 0, requests: 0 }, tempDirRemoved: !fs.existsSync(tmp), wallMs: Date.now() - t0, generatedAt: new Date().toISOString() };
  };
  if (incidents.length) return finish({ stage: "PRECONDITION" });
  const fx: any = buildFixture(tmp); fx.tmp = tmp;
  if (!fx.ok) { incidents.push("fixture build failed: " + fx.reason); return finish({ stage: "PRECONDITION" }); }
  if (!WAVE.mergeTreeSupported(fx.repo)) { incidents.push("git merge-tree --write-tree unavailable"); return finish({ stage: "PRECONDITION" }); }
  // oracle self-test: the integration check must FAIL on the base (stubs) — an oracle that cannot fail validates nothing
  const baseCheck = await WAVE.runCheckInScratch(fx.repo, fx.base, INTEGRATION_CHECKS[INTEGRATION_CHECKS.length - 1], { tmpRoot: tmp, timeoutMs: caps.perItemWallMs });
  const oracleSelfTest = { check: INTEGRATION_CHECKS[INTEGRATION_CHECKS.length - 1].id, onBaseExitCode: baseCheck.exitCode, failsOnBase: typeof baseCheck.exitCode === "number" && baseCheck.exitCode !== 0 };
  if (!oracleSelfTest.failsOnBase) { incidents.push("oracle self-test: the integration check does not fail on the base"); return finish({ stage: "PRECONDITION", oracleSelfTest }); }
  const supCtx = supervisorWorkspace(tmp);
  await sleep(1500);   // the fresh supervisor workspace must be idle at assignment time (staleMs 1000, as V161)
  // 1. DECOMPOSE + SELECT (GO-ranked candidates; actionable = the decomposition's items) ⇒ wave
  const policy = CPOL.decide(concurrencyInput(supCtx, o.loadProbe));
  const candidates = WORK_ITEMS.map((w: any) => ({ id: w.id, writeSet: w.writeSet || undefined, actionable: true }));
  const selection = WAVE.selectWave(candidates, { k: caps.k, concurrencyDecision: policy });
  const policyView = { direction: policy.direction, limits: policy.limits, admit: policy.admit, notMeasured: policy.notMeasured, reasons: policy.reasons.slice(0, 6) };
  if (selection.mode !== "PARALLEL" || selection.wave.length < 2) { incidents.push(`no parallel wave formed (mode ${selection.mode}, admitted builders ${policy.admit.builders}) — parallel path not exercisable`); return finish({ stage: "PRECONDITION", selection, concurrencyPolicy: policyView }); }
  const waveItems = selection.wave.map((id: string) => WORK_ITEMS.find((w: any) => w.id === id));
  // 2. ASSIGN through the supervisor (write-sets declared)
  const assignments = waveItems.map((w: any) => ({ ...SUP.assign({ id: `f-wave-${w.id}`, workItem: `V176-F/${FIXTURE_ID}/${w.id}`, writeSet: w.writeSet, owner: `fixture-producer:${w.id}`, parentId: "odg-go-wave-coordinator" }, supCtx), item: w.id }));
  const supervisor: any = { mode: "REPO_MODE_SCENARIO_WORKSPACE (throw-away git workspace, staleMs 1000 — as V161)", assignments: assignments.map((a: any) => ({ item: a.item, id: a.id, outcome: a.outcome, writeSet: a.writeSet || null, conflicts: a.conflicts || null })) };
  if (assignments.some((a: any) => a.outcome !== "ASSIGNED")) { incidents.push("supervisor did not assign: " + assignments.map((a: any) => `${a.item}:${a.outcome}`).join(", ")); return finish({ stage: "PRECONDITION", selection, concurrencyPolicy: policyView, supervisor }); }
  // 3. rounds: dispatch (PARALLEL) → receive → detect → re-dispatch offending only (with detection feedback) → integrate
  const declared = Object.fromEntries(waveItems.map((w: any) => [w.id, w.writeSet]));
  const checks = Object.fromEntries(waveItems.map((w: any) => [w.id, w.postReceiptChecks]));
  const runCheck = (commit: string, ch: any) => WAVE.runCheckInScratch(fx.repo, commit, ch, { tmpRoot: tmp, timeoutMs: caps.perItemWallMs });
  const kept: any = {}; const feedback: any = {}; const rounds: any[] = [];
  let toDispatch = waveItems.slice();
  for (let round = 1; round <= caps.maxRounds && toDispatch.length; round++) {
    if (Date.now() > deadline) { incidents.push("cap hit: maxRunWallMs"); break; }
    const versionOf = (id: string) => (feedback[id] ? "v2" : "v1");
    const d = await WAVE.dispatchWave(toDispatch, { runItem: runItemPort(fx, caps, `r${round}`, versionOf) }, toDispatch.length > 1 ? "PARALLEL" : "SERIAL");
    if (d.receipts.some((x: any) => x.timedOut)) incidents.push(`cap hit: perItemWallMs (round ${round})`);
    for (const x of d.receipts) kept[x.id] = x;
    const ordered = waveItems.map((w: any) => kept[w.id]).filter(Boolean);
    const det = await WAVE.detectIncompatibilities({ repo: fx.repo, base: fx.base, receipts: ordered, declared, checks, runCheck });
    const integ = det.incompatible ? { status: "INTEGRATION_REFUSED", reason: "incompatible receipts", checks: [] } : await WAVE.integrate({ repo: fx.repo, base: fx.base, detection: det, checks: INTEGRATION_CHECKS, runCheck });
    rounds.push({ round, dispatched: toDispatch.map((w: any) => w.id), dispatch: { mode: d.mode, wallMs: d.wallMs, concurrentOverlapMs: d.concurrentOverlapMs, receipts: d.receipts }, detection: { incompatible: det.incompatible, findings: det.findings, offending: det.offending, merge: det.merge, perItem: det.perItem }, integration: integ });
    if (!det.incompatible && integ.status === "INTEGRATED_VALIDATED") break;
    const off = det.offending.length ? det.offending : [];
    for (const id of off) feedback[id] = det.findings.filter((f: any) => arr(f.items).includes(id)).map((f: any) => f.kind);
    toDispatch = waveItems.filter((w: any) => off.includes(w.id));
    if (!det.incompatible) break;   // compatible but integration failed: unlocalised ⇒ no blind re-dispatch (recorded)
  }
  // 4. supervisor renew (receipt) + close (ODG integration check as the inspector, independent of the producers)
  await sleep(supCtx.staleMs + 200);
  const lastInteg = rounds.length ? rounds[rounds.length - 1].integration : null;
  for (const a of assignments) {
    const rec = kept[a.item];
    a.renew = SUP.renew(a.id, supCtx, { owner: `fixture-producer:${a.item}`, progress: true, finalReport: true, testEvidence: { commit: rec ? rec.commit : null, ownTestExit: rec ? rec.ownTestExit : null } }).outcome;
  }
  await sleep(supCtx.staleMs + 200);
  for (const a of assignments) { const c = SUP.close(a.id, { inspector: "odg-go-wave.integrate(declared integration checks)", verdict: lastInteg && lastInteg.status === "INTEGRATED_VALIDATED" ? "ACCEPT" : "REJECT" }, supCtx); a.close = { outcome: c.outcome, state: c.state || null, reason: c.reason || null }; }
  supervisor.assignments = assignments.map((a: any) => ({ item: a.item, id: a.id, outcome: a.outcome, writeSet: a.writeSet || null, conflicts: a.conflicts || null, renew: a.renew, close: a.close }));
  // 5. wall-time comparison (REPORT-ONLY): the final (v2) wave dispatched PARALLEL vs SERIAL on fresh scratches, alternating
  const timing: any = { rule: "REPORT-ONLY (never changes the outcome): dispatchWave wall time of the v2 wave, PARALLEL vs SERIAL, alternating, fresh scratches; median per mode; shared host ⇒ confounded", repetitions: caps.timingRepetitions, parallelMs: [] as number[], serialMs: [] as number[] };
  for (let i = 1; i <= caps.timingRepetitions && Date.now() < deadline; i++) for (const mode of i % 2 ? ["PARALLEL", "SERIAL"] : ["SERIAL", "PARALLEL"]) {
    const d = await WAVE.dispatchWave(waveItems, { runItem: runItemPort(fx, caps, `t${i}-${mode.toLowerCase()}`, () => "v2") }, mode);
    (mode === "PARALLEL" ? timing.parallelMs : timing.serialMs).push(d.wallMs);
    if (!d.receipts.every((x: any) => x.ok)) timing.incomplete = true;
  }
  timing.parallelMedianMs = median(timing.parallelMs); timing.serialMedianMs = median(timing.serialMs);
  timing.speedup = timing.parallelMedianMs && timing.serialMedianMs ? +(timing.serialMedianMs / timing.parallelMedianMs).toFixed(3) : null;
  if (Date.now() > deadline) incidents.push("cap hit: maxRunWallMs");
  // redact absolute temp paths from the record
  const red = (v: any) => JSON.parse(JSON.stringify(v).split(tmp).join("<tmp>"));
  return finish(red({ stage: "RUN", oracleSelfTest, selection, concurrencyPolicy: policyView, supervisor, rounds, timing }));
}

/* ---------------- CLI ---------------- */
function readContract(root: string): any { const d = readJson(path.join(root, CONTRACTS)); return d ? arr(d.contracts).find((c: any) => c && c.scenario === SCENARIO) || null : null; }
function readInspection(root: string): any { const r = readJson(path.join(root, INSPECTION)); return r ? { ...r, recordPath: INSPECTION } : null; }
function gate(contract: any, inspection: any, probes: any): any {
  if (!contract) return { ok: false, reason: `contract ${SCENARIO} not found in ${CONTRACTS}` };
  const sc = AS.deriveAuthorizationScope(contract, { inspection, probes });
  if (!sc.applicable) return { ok: false, reason: `authorization scope not applicable: ${sc.reason}` };
  if (sc.currentStep !== STEP || sc.executionAuthorized !== true) return { ok: false, reason: `current step ${sc.currentStep} not execution-authorized: ${sc.reason}` };
  const t = contract.authorization && contract.authorization.dispatchTargets ? contract.authorization.dispatchTargets[STEP] : null;
  if (!t || t.command !== SELF || JSON.stringify(t.args) !== JSON.stringify([OUT]) || JSON.stringify(t.writeSet) !== JSON.stringify([OUT])) return { ok: false, reason: "declared dispatch target is not this runner with args/writeSet [OUT]" };
  return { ok: true, contractSha256: sc.contractSha256, scope: sc };
}
function existingClaims(dir: string | null): string[] { try { return dir ? fs.readdirSync(dir).filter((f: string) => CLAIM_RE.test(f)) : []; } catch { return []; } }

async function main(argv: string[], o: any = {}): Promise<number> {
  const root = o.root || ROOT;
  const say = (s: string) => process.stdout.write(s + "\n");
  if (argv[0] === "--selftest" && argv.length === 1) return (await selftest()) === 0 ? 0 : 1;
  if (argv[0] !== OUT || argv.length !== 1) { say(`REFUSED: the only argument must be the declared writeSet entry ${OUT}`); return 3; }
  if (fs.existsSync(path.join(root, OUT))) { say(`ALREADY_RECORDED: ${OUT} exists — the single initial execution is recorded; never overwritten (a re-run needs a new owner decision)`); return 4; }
  if (process.env.ODG_TEST_NO_NATIVE === "1" && !(o.allowUnderTest && o.root && o.root !== ROOT)) { say("REFUSED: ODG_TEST_NO_NATIVE=1 (test process) — the real execution is never started from a test (only a temp root)"); return 2; }
  const c = readContract(root);
  const gt = gate(c, readInspection(root), o.probes !== undefined ? o.probes : OCUR.localGitProbes(root));
  if (!gt.ok) { say(`NOT_AUTHORIZED: ${gt.reason}`); return 2; }
  const plan = planOf(c);
  if (!plan.ok) { say(`NOT_AUTHORIZED: ${plan.reason}`); return 2; }
  const GO = require("./odg-go.ts");
  const dir = o.claimDir !== undefined ? o.claimDir : GO.claimDirOf(root);
  if (!dir) { say("PRECONDITION: no claim store (git common dir) — refused (fail-closed)"); return 5; }
  const prior = existingClaims(dir);
  if (prior.length) { say(`ALREADY_CLAIMED: one-shot F-runner claim(s) exist (${prior.join(", ")}) — refused`); return 4; }
  const host = PIPE.hostLoad(plan.caps.hostIdleFactor, o.loadProbe ? () => { const s = o.loadProbe(); return { loadavg: s.loadavg, nproc: s.nproc }; } : undefined);
  if (host.aboveThreshold) { say(`HOST_BUSY: HOST-1 loadavg-1m ${host.load1} > nproc ${host.nproc} × ${plan.caps.hostIdleFactor} — not started (no claim, nothing written)`); return 5; }
  const key = `${gt.contractSha256.slice(0, 16)}-F-runner`;
  const cl = GO.makeClaimStore(dir).claim({ key, item: SCENARIO, workspace: root, data: { item: SCENARIO, contractSha256: gt.contractSha256, runner: SELF, at: new Date().toISOString(), root } });
  if (!cl || cl.ok !== true) { say(`ALREADY_CLAIMED: ${(cl && cl.code) || "CLAIM_ERROR"} ${(cl && cl.reason) || ""}`); return 4; }
  const r = await runScenarioF({ root, plan, loadProbe: o.loadProbe, tmpRoot: o.tmpRoot, label: "ODG GO dispatch — F single initial execution (GO parallel wave, deterministic internal fixture)", contractSha256: gt.contractSha256 });
  fs.writeFileSync(path.join(root, OUT), JSON.stringify({ ...r, oneShotClaim: { key, path: path.basename(cl.path) } }, null, 2) + "\n");
  say(`outcome ${r.outcome} (${r.outcomeReason}) → ${OUT}`);
  return r.outcome === "PASS" ? 0 : 1;
}

const IDLE = () => ({ loadavg: [0.1, 0.1, 0.1], nproc: 8, meminfo: "MemTotal: 16000000 kB\nMemAvailable: 12000000 kB\n" });
async function selftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const plan = planOf(readContract(ROOT));
  if (!plan.ok) { check("selftest needs the contract pre-registration: " + plan.reason, false); return f; }
  const r = await runScenarioF({ root: ROOT, plan: { ...plan, caps: { ...plan.caps, timingRepetitions: 1 } }, loadProbe: IDLE, label: "SELFTEST (fixture, temp dirs)" });
  check(`fixture run graded mechanically (outcome ${r.outcome}: ${r.outcomeReason})`, ["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"].includes(r.outcome) && r.tempDirRemoved === true);
  return f;
}

module.exports = { runScenarioF, gradeF, planOf, gate, main, existingClaims, buildFixture, IDLE, SELF, OUT, PRIOR, INSPECTION, CONTRACTS, SCENARIO, STEP, CLAIM_RE, FIXTURE_ID, FIXTURE_SHA256, WORK_ITEMS, PLANTED, INTEGRATION_CHECKS, INCOMPAT_KINDS };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};

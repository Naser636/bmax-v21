#!/usr/bin/env node
"use strict";
/*
 * V15.0 §45 SCENARIO F (V161) — MULTI-PROVIDER DECOMPOSITION, RECEIPT, INCOMPATIBILITY DETECTION, INTEGRATION.
 * "ODG décompose une mission, affecte des fournisseurs, réceptionne leurs résultats, détecte les incompatibilités et
 * valide l'intégration." This bin builds NO orchestrator, scheduler, queue, sandbox or repair engine. It COMPOSES:
 *   DECOMPOSE   — decomposition-planner.chooseStrategy over a real 4-file project (3 model-authored parts + 1 integration
 *                 file authored by this harness); per-part write-sets checked with odg-writeset-contention.computeLayerContention
 *   ASSIGN      — odg-model-router.selectModel per part (declared difficulty ⇒ cheapest covering LOCAL model: 3b / 7b);
 *                 odg-agent-supervisor.assign/renew/close record the assignments as heartbeats WITH write-sets
 *                 (repo mode; the real repo is tried first and its fail-closed refusal is recorded — see SUPERVISOR below)
 *   RECEIVE     — odg-decomposed-execution.runDecomposed → native-project-builder.buildProject per part (own contract cases,
 *                 bounded own repair); generateFile = local-model-generator.makeLocalGenerator for the ASSIGNED model only;
 *                 provenance (model, digest, eval_count, ms) recorded per generation
 *   DETECT      — odg-native-build-sandbox.runIsolated (bwrap) + its HOST-side gradeCases oracle, run over (a) each part's
 *                 SHARED-INTERFACE cases (cross-part cases projected onto the part through the declared interface) and
 *                 (b) the INTEGRATED project's cross-part cases. The verdicts come from the sandbox+oracle, not from this bin.
 *   REPAIR      — buildProject again on ONLY the offending part(s), with the sandbox failure as verifyError feedback and the
 *                 canonical interface contract; bounded rounds + anti-loop (identical regeneration ⇒ stop)
 *   ACCEPT      — only when own + interface + integration cases AND a HELD-OUT integration set (never shown to any
 *                 generator) pass inside the sandbox.
 * Model-written code is executed ONLY via odg-native-build-sandbox (never in-process). Sandbox unavailable ⇒ NOT_RUN.
 * Usage: npx tsx runtime/bin/odg-v161-scenario-f-run.ts [--write-evidence] [--natural N] [--no-controlled]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const CORE = (m: string) => path.join(ROOT, "runtime", "core", m);
const PLANNER = require(CORE("decomposition-planner.js"));
const DEC = require(CORE("odg-decomposed-execution.js"));
const B = require(CORE("native-project-builder.js"));
const NBS = require(CORE("odg-native-build-sandbox.js"));
const CONT = require(CORE("odg-writeset-contention.js"));
const SUP = require(CORE("odg-agent-supervisor.js"));
const ROUTER = require(CORE("odg-model-router.js"));
const GEN = require(CORE("local-model-generator.js"));

const EVIDENCE_PATH = path.join(ROOT, "docs", "odg", "evidence", "V161_SCENARIO_F.json");
const MAX_INTEGRATION_ROUNDS = 2;   // bounded integration repair rounds (anti-loop also stops on identical regeneration)
const PART_MAX_REPAIR = 1;          // buildProject's own bounded repair per part
const CODE_CAP = 4096;              // ODG-generated code stored in evidence only up to 4 KB per file

function sha256(s: any): string { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function freeze<T>(o: T): T { return Object.freeze(o) as T; }

// ---- the task: an invoice pipeline with a DECLARED shared interface ----------------------------------------------------
const SHARED_INTERFACE = "LineItem = { sku: string, qty: integer, unitCents: integer } (exactly these three keys; unitCents = price in integer euro-cents)";
const CONTRACT_A = "module.exports = function parseLine(line) — line is a string 'SKU,QTY,PRICE'; each field may have surrounding spaces; PRICE is a decimal euro amount with 0, 1 or 2 decimals (e.g. '3', '3.5', '0.29'). Return a LineItem object EXACTLY { sku: <trimmed SKU string>, qty: <parseInt(QTY)>, unitCents: <Math.round(parseFloat(PRICE) * 100)> } — no other keys. " + SHARED_INTERFACE;
const CONTRACT_A_PERTURBED = "module.exports = function parseLine(line) — line is a string 'SKU,QTY,PRICE'; each field may have surrounding spaces. Return EXACTLY { sku: <trimmed SKU string>, qty: <parseInt(QTY)>, price: <parseFloat(PRICE), the euro amount as a number> } — no other keys.";
const CONTRACT_B = "module.exports = function invoiceTotal(items) — items is an array of LineItem objects. " + SHARED_INTERFACE + ". Return EXACTLY { count: items.length, totalCents: <sum over items of qty * unitCents> } (integers). An empty array returns { count: 0, totalCents: 0 }.";
const CONTRACT_C = "module.exports = function formatCents(cents) — cents is a non-negative integer number of euro-cents. Return a string of euros with exactly two decimals using integer arithmetic only (no floating rounding): 725 => '7.25', 5 => '0.05', 100 => '1.00', 0 => '0.00'.";
const GLUE_PATH = "src/invoice.js";
const GLUE_SRC = [
  "'use strict';",
  "const parseLine = require('./parse-line.js');",
  "const invoiceTotal = require('./invoice-total.js');",
  "const formatCents = require('./format-cents.js');",
  "module.exports = function invoice(csv) {",
  "  const items = String(csv).split('\\n').map((l) => l.trim()).filter((l) => l.length > 0).map((l) => parseLine(l));",
  "  const t = invoiceTotal(items);",
  "  return { count: t.count, totalCents: t.totalCents, display: formatCents(t.totalCents) };",
  "};",
].join("\n");

const C = (entry: string, args: any[], expect: any) => ({ entry, member: null, args, expect });
// Integration (cross-part) cases. Each is PROJECTED onto every part through the declared interface: the expected LineItems
// for each line (part A), the expected totals for those LineItems (part B), the expected display for the total (part C).
const INTEGRATION = [
  { csv: "X9 , 3 , 0.29\nK,10,1.5\nZ,1,19.99", items: [{ sku: "X9", qty: 3, unitCents: 29 }, { sku: "K", qty: 10, unitCents: 150 }, { sku: "Z", qty: 1, unitCents: 1999 }], total: { count: 3, totalCents: 3586 }, display: "35.86" },
  { csv: "A-1,2,3.50\nB,1,4", items: [{ sku: "A-1", qty: 2, unitCents: 350 }, { sku: "B", qty: 1, unitCents: 400 }], total: { count: 2, totalCents: 1100 }, display: "11.00" },
];
// HELD-OUT integration set: never shown to any generator (not in prompts, not in feedback) — the final independent check.
const HELD_OUT = [
  { csv: "P,7,0.07\n\nQ, 2 ,10", expect: { count: 2, totalCents: 2049, display: "20.49" } },
  { csv: "S,1,0.1", expect: { count: 1, totalCents: 10, display: "0.10" } },
];
const integrationCases = () => INTEGRATION.map((x) => C(GLUE_PATH, [x.csv], { ...x.total, display: x.display }));
const heldOutCases = () => HELD_OUT.map((x) => C(GLUE_PATH, [x.csv], x.expect));

function baseParts(): any[] {
  return [
    { id: "A", path: "src/parse-line.js", role: "parse one CSV invoice line into a LineItem", contract: CONTRACT_A, difficulty: "easy",
      ownCases: [C("src/parse-line.js", ["A-1,2,3.50"], { sku: "A-1", qty: 2, unitCents: 350 }), C("src/parse-line.js", ["B,1,4"], { sku: "B", qty: 1, unitCents: 400 })],
      interfaceCases: INTEGRATION.flatMap((x) => x.csv.split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) => C("src/parse-line.js", [l], x.items[i]))) },
    { id: "B", path: "src/invoice-total.js", role: "total a list of LineItems", contract: CONTRACT_B, difficulty: "moderate",
      ownCases: [C("src/invoice-total.js", [[{ sku: "a", qty: 2, unitCents: 350 }]], { count: 1, totalCents: 700 }), C("src/invoice-total.js", [[]], { count: 0, totalCents: 0 })],
      interfaceCases: INTEGRATION.map((x) => C("src/invoice-total.js", [x.items], x.total)) },
    { id: "C", path: "src/format-cents.js", role: "format integer cents as a euro string", contract: CONTRACT_C, difficulty: "easy",
      ownCases: [C("src/format-cents.js", [725], "7.25"), C("src/format-cents.js", [100], "1.00")],
      interfaceCases: INTEGRATION.map((x) => C("src/format-cents.js", [x.total.totalCents], x.display)).concat([C("src/format-cents.js", [5], "0.05")]) },
  ];
}

/** CONTROLLED perturbation: the contract DELIVERED to part A's provider differs from the declared shared interface
 *  (price in euros instead of unitCents). Its own cases follow the delivered (perturbed) contract. Labelled CONTROLLED. */
function perturbA(parts: any[]): any[] {
  return parts.map((p) => p.id !== "A" ? p : { ...p, deliveredContract: CONTRACT_A_PERTURBED,
    ownCases: [C("src/parse-line.js", ["A-1,2,3.50"], { sku: "A-1", qty: 2, price: 3.5 }), C("src/parse-line.js", ["B,1,4"], { sku: "B", qty: 1, price: 4 })] });
}

// ---- providers --------------------------------------------------------------------------------------------------------
/** loopbackFetch(url, init) — minimal fetch-shaped adapter over node:http for 127.0.0.1 ONLY (injected into
 *  local-model-generator's fetchImpl seam). ROOT CAUSE (first live run): the global fetch (undici) enforces a 300 s
 *  headersTimeout, SHORTER than the generator's own timeout; under a contended shared Ollama a non-streaming generation
 *  sends no headers until done ⇒ "fetch failed" at ~300 s (3 lost generations). node:http has no such cap; the
 *  generator's AbortController timeout still bounds the call. No proxy is consulted (loopback only). */
function loopbackFetch(url: string, init: any = {}): Promise<any> {
  const http = require("http");
  return new Promise((resolve, reject) => {
    let u: any; try { u = new URL(url); } catch (e) { reject(e); return; }
    if (u.hostname !== "127.0.0.1" || u.protocol !== "http:") { reject(new Error("loopbackFetch: 127.0.0.1 http only")); return; }
    const req = http.request({ host: "127.0.0.1", port: Number(u.port) || 80, path: u.pathname + u.search, method: init.method || "GET", headers: init.headers || {} }, (res: any) => {
      let d = ""; let bytes = 0; res.setEncoding("utf8");
      res.on("data", (c: string) => { bytes += c.length; if (bytes > 4_000_000) { req.destroy(new Error("response exceeded size cap")); return; } d += c; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(d) }));
    });
    req.on("error", reject);
    if (init.signal) init.signal.addEventListener("abort", () => req.destroy(new Error("aborted (generator timeout)")));
    req.end(init.body);
  });
}
/** liveProviders(models) -> { [model]: generateFile } over local-model-generator (Ollama loopback only). */
function liveProviders(models: string[], opts: any = {}): any {
  const out: any = {};
  for (const m of models) out[m] = GEN.makeLocalGenerator({ model: m, timeoutMs: opts.timeoutMs || 900000, numPredict: opts.numPredict || 512, temperature: opts.temperature ?? 0.2 }, loopbackFetch);
  return out;
}
/** modelDigests() -> { name: digest } from the local daemon's /api/tags (loopback, no proxy). NOT_MEASURED on failure. */
function modelDigests(): any {
  try {
    const r = cp.spawnSync("curl", ["--noproxy", "*", "-s", "-m", "10", "http://127.0.0.1:11434/api/tags"], { encoding: "utf8" });
    const j = JSON.parse(r.stdout); const o: any = {};
    for (const m of j.models || []) o[m.name] = m.digest;
    return o;
  } catch { return null; }
}

// ---- supervisor (repo mode) --------------------------------------------------------------------------------------------
/** supervisorContext(opts) -> { ctx, mode, realRepoAttempt }. The REAL repo is tried first with a probe assignment; when it
 *  refuses fail-closed (concurrent sibling worktrees hold UNKNOWN write-sets), that refusal is recorded and the scenario's
 *  OWN throw-away git workspace is used, still in REPO mode (real collectEvidence), with staleMs=1000 so the freshly
 *  created workspace is idle at assignment time. heartbeatOnly (test-only) is NEVER used by the live run. */
async function supervisorContext(base: string, opts: any = {}): Promise<any> {
  if (opts.supervisorCtx) return { ctx: opts.supervisorCtx, mode: opts.supervisorMode || "INJECTED", realRepoAttempt: null };
  let realRepoAttempt: any = null;
  if (opts.tryRealRepo !== false) {
    const pctx = { heartbeatDir: path.join(base, "probe-hb"), locksDir: path.join(base, "probe-locks"), repo: path.resolve(ROOT) };
    const r = SUP.assign({ id: "v161-f-probe", workItem: "V161-F/real-repo-probe", writeSet: ["scenario-f/probe/src/x.js"], owner: "odg-scenario-f" }, pctx);
    realRepoAttempt = { repo: "the ODG repository checkout running this bin", outcome: r.outcome, conflicts: (r.conflicts || []).map((c: any) => ({ with: String(c.with).replace(/^.*\//, "…/"), reason: c.reason })) };
    if (r.outcome === "ASSIGNED") return { ctx: pctx, mode: "REPO_MODE_REAL_REPOSITORY", realRepoAttempt };
  }
  const repo = path.join(base, "scenario-workspace");
  fs.mkdirSync(repo, { recursive: true });
  cp.spawnSync("git", ["-C", repo, "init", "-q", "-b", "main"]);
  cp.spawnSync("git", ["-C", repo, "-c", "user.email=odg@localhost", "-c", "user.name=ODG", "commit", "-q", "--allow-empty", "-m", "scenario-f workspace"]);
  await new Promise((res) => setTimeout(res, 1500));
  return { ctx: { heartbeatDir: path.join(base, "hb"), locksDir: path.join(base, "locks"), repo, staleMs: 1000 }, mode: "REPO_MODE_SCENARIO_WORKSPACE", realRepoAttempt };
}

// ---- detection (ODG sandbox + host oracle) -----------------------------------------------------------------------------
function sandboxCases(files: any, cases: any[], runner: any): any {
  const r = NBS.runIsolated(files, { kind: "cases", cases }, runner ? { runner } : {});
  return { status: r.status, outcome: r.outcome, pass: r.status === "EXECUTED" ? r.verified === true : null, error: r.buildError || r.verifyError || r.reason || null, wallMs: r.wallMs };
}

/** detect(files, parts, ownResults, runner) — per part: own (buildProject verdict) + SHARED-INTERFACE cases in the sandbox;
 *  integrated project: cross-part cases in the sandbox. Classification is a pure function of those verdicts. */
function detect(files: any, parts: any[], own: any, runner: any): any {
  const perPart: any = {};
  for (const p of parts) {
    if (typeof files[p.path] !== "string") { perPart[p.id] = { received: false }; continue; }
    perPart[p.id] = { received: true, ownPass: own[p.id] === true, interface: sandboxCases({ [p.path]: files[p.path] }, p.interfaceCases, runner) };
  }
  const all = { ...files, [GLUE_PATH]: GLUE_SRC };
  const integration = parts.every((p) => typeof files[p.path] === "string") ? sandboxCases(all, integrationCases(), runner) : { status: "NOT_RUN", pass: null, error: "a part was not received" };
  const notRun = integration.status === "NOT_RUN" || Object.values(perPart).some((x: any) => x.received && x.interface.status === "NOT_RUN");
  let classification: string; let offending: string[] = [];
  const ids = parts.map((p) => p.id);
  if (notRun && ids.every((i) => perPart[i].received)) classification = "NOT_RUN_NO_SANDBOX";
  else if (!ids.every((i) => perPart[i].received)) { classification = "PART_NOT_RECEIVED"; offending = ids.filter((i) => !perPart[i].received); }
  else if (ids.some((i) => !perPart[i].ownPass)) { classification = "PART_OWN_CONTRACT_FAILED"; offending = ids.filter((i) => !perPart[i].ownPass || perPart[i].interface.pass !== true); }
  else if (ids.some((i) => perPart[i].interface.pass !== true)) { classification = "INCOMPATIBLE_INTERFACE_VIOLATION"; offending = ids.filter((i) => perPart[i].interface.pass !== true); }
  else if (integration.pass !== true) classification = "INCOMPATIBLE_INTEGRATION_UNLOCALISED";
  else classification = "COMPATIBLE";
  const incompatible = classification.startsWith("INCOMPATIBLE");
  return { classification, incompatible, offending, perPart, integration,
    detectedBy: incompatible || classification === "PART_OWN_CONTRACT_FAILED" ? "odg-native-build-sandbox.runIsolated (bwrap) + host gradeCases oracle over the declared shared-interface / cross-part cases" : null };
}

// ---- one trial ---------------------------------------------------------------------------------------------------------
async function runTrial(trialId: string, kind: string, parts: any[], deps: any): Promise<any> {
  const t0 = Date.now();
  const providers = deps.providers || {};
  const runner = deps.sandboxRunner || null;
  const genLog: any[] = [];

  // DECOMPOSE (canonical planner) + write-set contention (parts are one parallel layer; the integrator follows)
  const spec = { name: "invoice pipeline (scenario F)", architecture: [...parts.map((p) => ({ path: p.path, role: p.role, contract: p.contract })), { path: GLUE_PATH, role: "integrate the parts", contract: "harness-authored integration", dependsOn: parts.map((p) => p.path) }] };
  const strategy = PLANNER.chooseStrategy(spec);
  const missions = [...parts.map((p) => ({ id: p.id, authorizedPaths: p.writeSet || [p.path] })), { id: "INTEGRATOR", authorizedPaths: [GLUE_PATH] }];
  const contention = CONT.computeLayerContention([parts.map((p) => p.id), ["INTEGRATOR"]], missions);
  const decomposition = { strategy: strategy.strategy, complexity: strategy.complexity, reason: strategy.reason, files: spec.architecture.map((a: any) => a.path), writeSets: Object.fromEntries(missions.map((m) => [m.id, m.authorizedPaths])), contention: { ok: contention.ok, anyContention: contention.anyContention, layer0ParallelSafe: contention.ok ? contention.layers[0].parallelSafe : false, contentions: contention.ok ? contention.layers[0].contentions : null } };
  const base = { trialId, kind, decomposition };
  if (!contention.ok || contention.anyContention) return { ...base, verdict: "REFUSED_WRITESET_CONFLICT", generated: 0, wallMs: Date.now() - t0 };
  const ownWriteSetBad = parts.filter((p) => Array.isArray(p.writeSet) && !p.writeSet.includes(p.path));

  // ASSIGN: router chooses the cheapest covering LOCAL model per declared difficulty; supervisor records heartbeats
  const assignments: any[] = [];
  for (const p of parts) {
    const d = ROUTER.selectModel({ difficulty: p.difficulty, requireLocal: true });
    const model = d && d.decision === "LOCAL" ? d.model : null;
    const hbId = `v161-f-${deps.runId}-${trialId}-${p.id}`;
    const sup = deps.supervisor ? SUP.assign({ id: hbId, workItem: `V161-F/${deps.runId}/${trialId}/${p.id}`, writeSet: (p.writeSet || [p.path]).map((x: string) => `scenario-f/${trialId}/${x}`), owner: `provider:${model}`, parentId: "odg-scenario-f-coordinator" }, deps.supervisor.ctx) : { outcome: "NO_SUPERVISOR" };
    assignments.push({ part: p.id, path: p.path, difficulty: p.difficulty, routerDecision: d.decision, model, supervisor: { id: hbId, outcome: sup.outcome, writeSet: sup.writeSet || null, conflicts: sup.conflicts || null } });
  }
  const modelOf = (pathName: string) => { const p = parts.find((x) => x.path === pathName); const a = p && assignments.find((x) => x.part === p.id); return a ? a.model : null; };
  const generateFile = async (fileSpec: any, ctx: any) => {
    const m = modelOf(fileSpec.path); const g = m && typeof providers[m] === "function" ? providers[m] : null;
    if (!g) return { ok: false, reason: "no provider for assigned model " + m };
    const t = Date.now(); const r = await g(fileSpec, ctx);
    if (deps.log) deps.log(`[${trialId}] gen ${fileSpec.path} model=${m} ok=${!!(r && r.ok)} ${Date.now() - t}ms${fileSpec.verifyError || fileSpec.buildError ? " (repair)" : ""}${r && !r.ok ? " reason=" + r.reason : ""}`);
    genLog.push({ part: (parts.find((x) => x.path === fileSpec.path) || {}).id, path: fileSpec.path, model: m, ok: !!(r && r.ok), repairHint: !!(fileSpec.verifyError || fileSpec.buildError), sha256: r && r.ok ? sha256(r.content) : null, bytes: r && r.ok ? Buffer.byteLength(r.content) : 0, ms: Date.now() - t, evalCount: r && r.provenance ? r.provenance.evalCount ?? null : null, servedModel: r && r.provenance ? r.provenance.model ?? null : null, reason: r && !r.ok ? r.reason || null : null });
    return r;
  };

  // RECEIVE via the canonical decomposed execution (one sub-problem per part, own contract cases, bounded own repair)
  const captured: any = {};
  const subproblems = parts.map((p) => ({ id: p.id, required: false, spec: { name: p.id, architecture: [{ path: p.path, role: p.role, contract: p.deliveredContract || p.contract }], writeSet: p.writeSet || [p.path], independentTestCases: p.ownCases } }));
  const dres = await DEC.runDecomposed(subproblems, { generateFile, maxRepair: PART_MAX_REPAIR, buildProject: async (s: any, d: any) => { const r = await B.buildProject(s, { ...d, ...(runner ? { sandboxRunner: runner } : {}) }); captured[s.name] = r; return r; } });
  const files: any = {}; const own: any = {}; const receipt: any = {};
  for (const p of parts) {
    const r = captured[p.id] || {};
    const content = r.files ? r.files[p.path] : undefined;
    const violation = (r.fileStatus || []).some((f: any) => f.stage === "WRITE_SET_VIOLATION");
    if (typeof content === "string" && !violation) files[p.path] = content;
    own[p.id] = r.accepted === true;
    receipt[p.id] = { received: typeof content === "string" && !violation, writeSetViolation: violation, executionMode: r.executionMode || null, executionStatus: r.executionStatus || null, ownAccepted: r.accepted === true, ownRepairs: r.repairs ?? null, sha256: typeof content === "string" ? sha256(content) : null };
    if (deps.supervisor && assignments.find((a) => a.part === p.id).supervisor.outcome === "ASSIGNED") {
      const a = assignments.find((x) => x.part === p.id);
      a.supervisor.renew = SUP.renew(a.supervisor.id, deps.supervisor.ctx, { owner: `provider:${a.model}`, progress: true, finalReport: true, testEvidence: { ownContract: r.accepted === true, sha256: receipt[p.id].sha256 } }).outcome;
    }
  }
  if (ownWriteSetBad.length || parts.some((p) => receipt[p.id].writeSetViolation)) {
    return { ...base, assignments, receipt, generations: genLog, verdict: "REFUSED_WRITESET_VIOLATION", violating: parts.filter((p) => receipt[p.id].writeSetViolation).map((p) => p.id), wallMs: Date.now() - t0 };
  }
  if (parts.some((p) => receipt[p.id].executionStatus === "NOT_RUN")) {
    return { ...base, assignments, receipt, generations: genLog, verdict: "NOT_RUN", reason: "sandbox unavailable — model code was not executed (no in-process fallback)", decomposedExecution: { verifiedCount: dres.verifiedCount, total: dres.total }, wallMs: Date.now() - t0 };
  }

  // DETECT
  const initial = detect(files, parts, own, runner);
  const rounds: any[] = [];
  let cur = initial; let stop: string | null = null;
  // REPAIR: regenerate ONLY the offending part(s) with the sandbox failure as feedback and the CANONICAL contract
  for (let round = 1; round <= MAX_INTEGRATION_ROUNDS && cur.classification !== "COMPATIBLE"; round++) {
    if (cur.classification === "NOT_RUN_NO_SANDBOX") { stop = "NOT_RUN_NO_SANDBOX"; break; }
    if (!cur.offending.length) { stop = "UNLOCALISED_NO_TARGETED_REPAIR"; break; }
    const changed: string[] = []; const regen: any[] = [];
    for (const id of cur.offending) {
      const p = parts.find((x) => x.id === id);
      const pp = cur.perPart[id] || {};
      const feedback = `ODG integration check (sandbox) FAILED for this part against the SHARED INTERFACE ${SHARED_INTERFACE}: ` + String((pp.interface && pp.interface.error) || (cur.integration && cur.integration.error) || "not received").slice(0, 400);
      const s = { name: id, architecture: [{ path: p.path, role: p.role, contract: p.contract, verifyError: feedback }], writeSet: p.writeSet || [p.path], independentTestCases: [...p.interfaceCases, ...baseParts().find((x) => x.id === id).ownCases] };
      const r = await B.buildProject(s, { generateFile, maxRepair: PART_MAX_REPAIR, ...(runner ? { sandboxRunner: runner } : {}) });
      const content = r.files ? r.files[p.path] : undefined;
      regen.push({ part: id, model: modelOf(p.path), feedbackSha256: sha256(feedback), accepted: r.accepted === true, repairs: r.repairs, repairStopReason: r.repairStopReason, executionStatus: r.executionStatus, sha256: typeof content === "string" ? sha256(content) : null });
      if (typeof content === "string" && content !== files[p.path]) { files[p.path] = content; changed.push(id); }
      own[id] = r.accepted === true || (r.verified === true);
    }
    const before = cur.classification;
    cur = detect(files, parts.map((p) => cur.offending.includes(p.id) ? { ...p, deliveredContract: undefined } : p), own, runner);
    rounds.push({ round, regenerated: regen, changed, before, after: cur.classification, integrationPass: cur.integration.pass });
    if (!changed.length) { stop = regen.every((x) => x.sha256 === null) ? "REGENERATION_FAILED_NO_CONTENT" : "NO_PROGRESS_IDENTICAL_REGENERATION"; break; }
  }
  if (cur.classification !== "COMPATIBLE" && stop === null) stop = "INTEGRATION_ROUNDS_EXHAUSTED";

  // ACCEPT: integration passes AND the held-out set (never shown to a generator) passes in the sandbox
  const heldOut = cur.classification === "COMPATIBLE" ? sandboxCases({ ...files, [GLUE_PATH]: GLUE_SRC }, heldOutCases(), runner) : { status: "SKIPPED", pass: null };
  const accepted = cur.classification === "COMPATIBLE" && heldOut.pass === true;
  const verdict = accepted ? (initial.incompatible || rounds.length ? "ACCEPTED_AFTER_REPAIR" : "ACCEPTED_FIRST_PASS") : (cur.classification === "NOT_RUN_NO_SANDBOX" || heldOut.status === "NOT_RUN" ? "NOT_RUN" : "REJECTED");

  // supervisor close with the ODG check as the inspector (independent of the provider owners)
  if (deps.supervisor) {
    if (deps.supervisorCloseDelayMs) await new Promise((res) => setTimeout(res, deps.supervisorCloseDelayMs));
    for (const a of assignments) if (a.supervisor.outcome === "ASSIGNED") {
      const okPart = accepted || (cur.perPart[a.part] && cur.perPart[a.part].interface && cur.perPart[a.part].interface.pass === true);
      const c = SUP.close(a.supervisor.id, { inspector: "odg-scenario-f-integration-check(odg-native-build-sandbox)", verdict: okPart ? "ACCEPT" : "REJECT" }, deps.supervisor.ctx);
      a.supervisor.close = { outcome: c.outcome, state: c.state || null, reason: c.reason || null };
    }
  }
  const codeOf = (src: any) => (typeof src === "string" && Buffer.byteLength(src) <= CODE_CAP ? src : null);
  return { ...base, assignments, receipt, generations: genLog, decomposedExecution: { verifiedCount: dres.verifiedCount, total: dres.total, note: dres.note },
    initialDetection: summarizeDetection(initial), repairRounds: rounds, repairStopReason: accepted ? null : stop, finalDetection: summarizeDetection(cur),
    heldOut, accepted, verdict, finalFiles: Object.fromEntries(parts.map((p) => [p.path, { sha256: files[p.path] ? sha256(files[p.path]) : null, code: codeOf(files[p.path]) }])), glue: { path: GLUE_PATH, sha256: sha256(GLUE_SRC), author: "SCENARIO_HARNESS" }, wallMs: Date.now() - t0 };
}
function summarizeDetection(d: any): any {
  return { classification: d.classification, incompatible: d.incompatible, offending: d.offending, detectedBy: d.detectedBy,
    perPart: Object.fromEntries(Object.entries(d.perPart).map(([k, v]: any) => [k, v.received ? { ownPass: v.ownPass, interfacePass: v.interface.pass, interfaceStatus: v.interface.status, interfaceError: v.interface.error ? String(v.interface.error).slice(0, 300) : null } : { received: false }])),
    integration: { status: d.integration.status, pass: d.integration.pass, error: d.integration.error ? String(d.integration.error).slice(0, 300) : null } };
}

/** runScenarioF(opts) — opts: { providers{model:generateFile}, sandboxRunner?, natural=3, controlled=true, parts?, supervisor:true|false, supervisorCtx?, tryRealRepo? } */
async function runScenarioF(opts: any = {}): Promise<any> {
  const runId = opts.runId || Date.now().toString(36);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "odg-v161-f-"));
  const sup = opts.supervisor === false ? null : await supervisorContext(base, opts);
  const deps = { providers: opts.providers || {}, sandboxRunner: opts.sandboxRunner || null, runId, log: typeof opts.log === "function" ? opts.log : null, supervisor: sup, supervisorCloseDelayMs: opts.supervisorCloseDelayMs ?? (sup && sup.ctx.staleMs ? sup.ctx.staleMs + 200 : 0) };
  const probe = NBS.probeSandbox(opts.sandboxRunner || undefined);
  const trials: any[] = [];
  const natural = Number.isInteger(opts.natural) ? opts.natural : 3;
  const parts0 = opts.parts || baseParts();
  for (let i = 1; i <= natural; i++) { trials.push(await runTrial(`T${i}`, "REAL", parts0, deps)); if (deps.log) deps.log(`[T${i}] verdict=${trials[trials.length - 1].verdict}`); }
  const anyNaturalIncompat = trials.some((t) => t.initialDetection && t.initialDetection.incompatible);
  if (opts.controlled !== false) trials.push(await runTrial(`T${natural + 1}-CONTROLLED`, "CONTROLLED", perturbA(parts0), deps));
  for (const t of trials) {
    if (t.verdict === "NOT_RUN") t.classification = "NOT_MEASURABLE";
    else if (t.kind === "CONTROLLED") t.classification = "CONTROLLED";
    else t.classification = "REAL";
    if (t.generations && t.generations.length && t.generations.every((g: any) => !g.ok)) t.classification = "NOT_MEASURABLE";
  }
  try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best-effort */ }
  return { runId, sandboxProbe: probe, supervisor: sup ? { mode: sup.mode, realRepoAttempt: sup.realRepoAttempt } : null, trials, anyNaturalIncompatibility: anyNaturalIncompat };
}

module.exports = { runScenarioF, runTrial, detect, baseParts, perturbA, liveProviders, loopbackFetch, GLUE_SRC, GLUE_PATH, SHARED_INTERFACE, INTEGRATION, HELD_OUT };

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const nIdx = argv.indexOf("--natural");
    const natural = nIdx >= 0 ? parseInt(argv[nIdx + 1], 10) : 3;
    const models = ["qwen2.5-coder:3b", "qwen2.5-coder:7b"];
    const startedAt = new Date().toISOString();
    const head = (() => { try { return cp.execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "NOT_MEASURED"; } })();
    const digests = modelDigests();
    const res = await runScenarioF({ providers: liveProviders(models), natural, controlled: !argv.includes("--no-controlled"), log: (l: string) => process.stderr.write(new Date().toISOString() + " " + l + "\n") });
    const t = res.trials;
    const evidence = {
      schema: "V161_SCENARIO_F_EVIDENCE",
      scenario: "V15.0 §45 F — multi-agents",
      ownerText: "ODG décompose une mission, affecte des fournisseurs, réceptionne leurs résultats, détecte les incompatibilités et valide l'intégration.",
      contractRef: "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#F (contract write_set names V160_SCENARIO_F.json / odg-v160-scenario-f-run.ts; this owner-directed V161 run uses the V161 names — recorded, not hidden)",
      startedAt, finishedAt: new Date().toISOString(), head, node: process.version,
      providers: models.map((m) => ({ model: m, digest: digests ? digests[m] || "NOT_MEASURED" : "NOT_MEASURED", endpoint: "127.0.0.1:11434 (loopback Ollama, local, no paid/external provider)" })),
      task: { sharedInterface: SHARED_INTERFACE, parts: baseParts().map((p) => ({ id: p.id, path: p.path, difficulty: p.difficulty, contract: p.contract, ownCases: p.ownCases.length, interfaceCases: p.interfaceCases.length })), integrationFile: { path: GLUE_PATH, author: "SCENARIO_HARNESS", sha256: sha256(GLUE_SRC) }, integrationCases: INTEGRATION.length, heldOutCases: HELD_OUT.length, controlledPerturbation: { part: "A", deliveredContract: CONTRACT_A_PERTURBED, note: "CONTROLLED: the contract delivered to part A's provider deliberately differs from the declared shared interface (price in euros instead of unitCents). Labelled CONTROLLED; never counted as a natural incompatibility." } },
      sandboxProbe: res.sandboxProbe,
      supervisor: res.supervisor,
      summary: {
        trials: t.length,
        byClassification: t.reduce((a: any, x: any) => { a[x.classification] = (a[x.classification] || 0) + 1; return a; }, {}),
        verdicts: t.map((x: any) => ({ trial: x.trialId, kind: x.kind, classification: x.classification, initial: x.initialDetection ? x.initialDetection.classification : null, repairRounds: x.repairRounds ? x.repairRounds.length : 0, verdict: x.verdict, wallMs: x.wallMs })),
        naturalIncompatibilitiesObserved: t.filter((x: any) => x.kind === "REAL" && x.initialDetection && x.initialDetection.incompatible).length,
        controlledIncompatibilitiesDetected: t.filter((x: any) => x.kind === "CONTROLLED" && x.initialDetection && x.initialDetection.incompatible).length,
        accepted: t.filter((x: any) => x.accepted).length,
      },
      trials: t,
      attribution: {
        ODG_NATIVE_COMPONENT: ["decomposition-planner.chooseStrategy", "odg-writeset-contention.computeLayerContention", "odg-model-router.selectModel", "odg-agent-supervisor.assign/renew/close", "odg-decomposed-execution.runDecomposed", "native-project-builder.buildProject (own + targeted repair)", "odg-native-build-sandbox.runIsolated + gradeCases (detection + acceptance)"],
        PROVIDER: ["part source code: generated by the local models qwen2.5-coder:3b / :7b (provider work, NOT counted as ODG-native)"],
        SCENARIO_HARNESS: ["the task definition, shared-interface cross-part case projection, the integration file src/invoice.js, the classification mapping of sandbox verdicts, the CONTROLLED perturbation"],
      },
      priorRun: {
        note: "FIRST live run (same code minus the loopbackFetch fix), discarded as evidence of record but reported: 3 generations (T3 part C x2, T4 part A) failed with 'fetch failed' at ~300 s = undici's headersTimeout under a contended shared Ollama (load ~16 on 8 cores). Root-caused and fixed by injecting loopbackFetch (node:http) into local-model-generator's fetchImpl seam.",
        verdicts: { T1: "ACCEPTED_FIRST_PASS (COMPATIBLE)", T2: "ACCEPTED_AFTER_REPAIR (part C failed its OWN contract: formatCents(1100) returned '11' — integration also failed; targeted regeneration of C only fixed it)", T3: "REJECTED (part C never received — fetch timeout)", "T4-CONTROLLED": "ACCEPTED_AFTER_REPAIR but the perturbation was NOT observed (part A never received on first generation — fetch timeout)" },
        naturalIncompatibilitiesObserved: 0,
      },
      honestLimits: [
        "one small task (3 model parts + 1 harness-authored integration file); results are not a statistical capability measure",
        "the incompatibility classification is a deterministic mapping in this bin over the sandbox+oracle verdicts; the verdicts themselves come from odg-native-build-sandbox (bwrap) and its host-side gradeCases",
        "part difficulty ('easy' / 'moderate') is DECLARED by the scenario to route the parts to two different providers via odg-model-router — not a measured difficulty",
        "the real repository's supervisor refused (fail-closed) because concurrent sibling worktrees hold UNKNOWN write-sets; assignments were then recorded in REPO mode against the scenario's own throw-away git workspace (staleMs=1000) — not against the live repository",
        "supervisor write-sets are namespaced virtual paths (scenario-f/<trial>/src/…); generated code lives only in memory + the sandbox, never in the repository",
        "the integration repair feedback includes the failing interface case (input/expected/actual) — the held-out set is the only check never shown to a generator",
        "no independent human/agent inspection of the generated code is claimed beyond the sandbox held-out check and the supervisor close inspector identity (a declared string, not cryptographically bound)",
      ],
    };
    if (argv.includes("--write-evidence")) { fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n"); process.stdout.write("wrote " + EVIDENCE_PATH + "\n"); }
    process.stdout.write(JSON.stringify(evidence.summary, null, 2) + "\n");
  })().catch((e) => { process.stderr.write(String((e && e.stack) || e) + "\n"); process.exit(1); });
}
export {};

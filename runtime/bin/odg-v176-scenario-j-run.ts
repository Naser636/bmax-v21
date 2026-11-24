#!/usr/bin/env node
"use strict";
/*
 * V17.6 — SCENARIO J single initial execution (REPLICATION of J's protocol), contract
 * docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json#J, owner V176 « DÉBLOCAGE FINAL » item 2
 * (docs/odg/V176_OWNER_AUTHORIZATION_J.json): « GO peut le sélectionner et l'exécuter selon son contrat, dès que les
 * conditions requises sont conformes. Une seule exécution initiale, avec résultat enregistré honnêtement. »
 *
 * NO SECOND ENGINE: every trial is runtime/bin/odg-v161-scenario-j-run.ts `runTrial` (the J protocol that produced
 * V161_SCENARIO_J.json: default via odg-intelligent-native-cycle → ODG stop in native-project-builder → rule-selected
 * alternative via odg-decomposed-execution or the policy max-local tier → evidence-gated escalation RECORD, no provider).
 * This file adds only what the V161 CLI could not give GO (#993 proposedRevision M1–M3, M7):
 *   - a POSITIONAL output path = the declared writeSet entry (V161's CLI writes only with --write, to V161_SCENARIO_J.json);
 *   - the record carries contractSha256 + a mechanically graded `outcome` (pre-registered thresholds, contract J);
 *   - NEVER writes V161_SCENARIO_J.json; refuses ALREADY_RECORDED if the result record exists;
 *   - ONE-SHOT: refuses if any GO / runner claim for J exists, then creates (O_EXCL) <git common dir>/odg-go-claims/
 *     <contractSha256[0..16]>-J-runner.claim right before the run (odg-go.makeClaimStore — never deleted);
 *   - HOST-1 idle-host start rule (odg-native-design-pipeline.hostLoad): busy host ⇒ refuse to START (no claim, no write);
 *   - network guard: exact allowlist POST http://127.0.0.1:11434/api/generate + GET /api/tags (model presence) over
 *     scenario F's node:http loopbackFetch; caps maxModelCallsTotal / perTrialWallMs / maxRunWallMs; 0 provider calls;
 *   - model code runs only in the bwrap native-build sandbox (native-project-builder default; probe required).
 *
 * MODES:
 *   <out>          NATIVE run (GO dispatch). <out> must be docs/odg/evidence/V176_J_EXPERIMENT.json (exit 3). Refused unless
 *                  odg-authorization-scope derives RUN_CONTROLLED_EXPERIMENTS as J's current execution-authorized step
 *                  (exit 2); ALREADY_RECORDED / ALREADY_CLAIMED (exit 4); HOST_BUSY / PRECONDITION (exit 5).
 *   --selftest     offline FAKE model behind the real guard, real sandbox, subset plan; nothing written; no claim.
 * Exit 0 = record written with outcome PASS; 1 = record written with another outcome (or error).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const V161 = require("./odg-v161-scenario-j-run.ts");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");
const PIPE = require("../core/odg-native-design-pipeline.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const POL = require("../core/odg-local-model-execution-policy.js");
const GEN = require("../core/local-model-generator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SELF = "runtime/bin/odg-v176-scenario-j-run.ts";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V176_J_CONTRACT_INSPECTION.json";   // written by an independent inspector, never here
const PRIOR = "docs/odg/evidence/V161_SCENARIO_J.json";                     // J's prior result — read-only, never written
const OUT = "docs/odg/evidence/V176_J_EXPERIMENT.json";
const SCENARIO = "J";
const STEP = "RUN_CONTROLLED_EXPERIMENTS";
const HOST = "http://127.0.0.1:11434";
const DECODING = Object.freeze({ temperature: 0, seed: 42, num_predict: 600 });   // = V161 OPTIONS (not exported there)
const C1_TRIGGERS = Object.freeze(["NO_PROGRESS_IDENTICAL_REGENERATION"]);        // + any stopReason starting NO_QUALIFIED
const ALT_EXECUTED = Object.freeze(["DECOMPOSED_INTERMEDIATE_VERIFICATION", "LARGER_MODEL_REPAIR_DEPTH"]);
const CLAIM_RE = /^[0-9a-f]{16}-J(-runner)?\.claim$/;

const sha256 = (s: any) => crypto.createHash("sha256").update(s).digest("hex");
function sha256File(p: string): string | null { try { return sha256(fs.readFileSync(p)); } catch { return null; } }
function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
const arr = (v: any) => (Array.isArray(v) ? v : []);
const posInt = (v: any) => Number.isInteger(v) && v > 0;

/* planOf(contract) — the executable plan read from J's pre-registration (single source: the inspected contract). */
function planOf(contract: any): any {
  const pr = contract && contract.WORK_ITEM_CONTRACT && contract.WORK_ITEM_CONTRACT.preRegistration;
  if (!pr || !pr.dataset || !pr.caps) return { ok: false, reason: "WORK_ITEM_CONTRACT.preRegistration (dataset, caps) missing" };
  const tasks = arr(pr.dataset.tasks).map(String), trials = pr.dataset.trialsPerTask, pins = arr(pr.dataset.pins), c = pr.caps;
  if (!tasks.length || !posInt(trials)) return { ok: false, reason: "preRegistration.dataset.tasks / trialsPerTask invalid" };
  if (!pins.length || !pins.every((p: any) => p && typeof p.file === "string" && /^[0-9a-f]{64}$/.test(String(p.sha256)))) return { ok: false, reason: "preRegistration.dataset.pins invalid" };
  for (const k of ["maxRunWallMs", "perTrialWallMs", "maxModelCallsTotal", "perCallTimeoutMs"]) if (!posInt(c[k])) return { ok: false, reason: `preRegistration.caps.${k} invalid` };
  if (!(typeof c.hostIdleFactor === "number" && c.hostIdleFactor > 0)) return { ok: false, reason: "preRegistration.caps.hostIdleFactor invalid" };
  return { ok: true, tasks, trials, pins, caps: c };
}

/* makeGuard(transport, caps) — exact allowlist + caps; every refused URL / transport error / cap hit recorded. */
function makeGuard(transport: any, caps: any, now: () => number = Date.now): any {
  const st: any = { modelCalls: 0, tagsCalls: 0, refused: [] as string[], transportErrors: [] as any[], capHit: null as string | null, runDeadline: now() + caps.maxRunWallMs, trialDeadline: Infinity, trialCapHit: null as string | null };
  const fetchImpl = async (url: any, init: any = {}): Promise<any> => {
    let u: any = null; try { u = new URL(String(url)); } catch { /* refused below */ }
    const method = String((init && init.method) || "GET").toUpperCase();
    const ok = !!u && u.protocol === "http:" && u.hostname === "127.0.0.1" && u.port === "11434" && ((u.pathname === "/api/generate" && method === "POST") || (u.pathname === "/api/tags" && method === "GET")) && !u.search;
    if (!ok) { st.refused.push(String(url).slice(0, 200)); throw new Error("V176-J network guard: only POST 127.0.0.1:11434/api/generate and GET /api/tags"); }
    if (u.pathname === "/api/tags") { st.tagsCalls++; return transport(String(url), init); }
    const cap = (why: string) => { st.capHit = st.capHit || why; st.trialCapHit = st.trialCapHit || why; throw new Error("V176-J cap: " + why); };
    if (st.modelCalls >= caps.maxModelCallsTotal) cap("maxModelCallsTotal");
    if (now() > st.runDeadline) cap("maxRunWallMs");
    if (now() > st.trialDeadline) cap("perTrialWallMs");
    const body = init && typeof init.body === "string" ? JSON.parse(init.body) : {};
    body.options = { ...(body.options || {}), seed: DECODING.seed, temperature: DECODING.temperature };   // as V161's loopbackFetch
    st.modelCalls++;
    try {
      const r = await transport(String(url), { ...init, body: JSON.stringify(body) });
      if (!r || r.ok !== true) st.transportErrors.push({ call: st.modelCalls, status: r ? r.status : null });
      return r;
    } catch (e: any) { st.transportErrors.push({ call: st.modelCalls, error: String((e && e.message) || e).slice(0, 200) }); throw e; }
  };
  return { fetchImpl, st };
}

/* gradeRows(rows, plan, incidents) — the PRE-REGISTERED decision rule (contract J preRegistration.thresholds), mechanical. */
function gradeRows(rows: any[], plan: any, incidents: string[]): any {
  const planned = plan.tasks.length * plan.trials;
  const measured = (r: any) => r.default && r.default.executionStatus === "EXECUTED" && r.selection && r.selection.strategy !== "NOT_RUN" && (!r.alternative || r.alternative.executionStatus === "EXECUTED") && !r.capHit && !(r.transportErrors > 0);
  const stopped = rows.filter((r) => !r.default.accepted && V161.ODG_STOPS.includes(r.default.stopReason));
  const altRan = (r: any) => ALT_EXECUTED.includes(r.selection.strategy) && r.alternative && r.alternative.executionStatus === "EXECUTED";
  const c1Rows = rows.filter((r) => altRan(r) && (C1_TRIGGERS.includes(r.default.stopReason) || /^NO_QUALIFIED/.test(String(r.default.stopReason || ""))));
  const C1 = { text: "stop triggered by NO_PROGRESS_IDENTICAL_REGENERATION or NO_QUALIFIED on a real task", met: c1Rows.length > 0, rows: c1Rows.map((r) => `${r.task}#${r.trial}`),
    reportOnly: { defaultStops: rows.map((r) => r.default.stopReason), policyNoQualified: rows.filter((r) => /^NO_QUALIFIED/.test(String(r.policy && r.policy.measuredDecision || ""))).length, alternativeNoProgress: rows.filter((r) => r.alternative && r.alternative.stopReason === "NO_PROGRESS_IDENTICAL_REGENERATION").length } };
  const C2 = { text: "alternative (decomposition / different model / repair depth) actually executed", met: stopped.length > 0 && stopped.every(altRan), stoppedRows: stopped.length, alternativesExecuted: stopped.filter(altRan).length };
  const withAlt = rows.filter(altRan);
  const C3 = { text: "outcome compared on the same task and recorded with n", met: withAlt.length > 0 && withAlt.every((r) => typeof r.default.accepted === "boolean" && typeof r.alternative.accepted === "boolean"),
    n: rows.length, defaultPasses: rows.filter((r) => r.default.accepted).length, alternativePasses: withAlt.filter((r) => r.alternative.accepted).length, alternativeN: withAlt.length };
  const criteria = { C1, C2, C3 };
  if (incidents.length) return { outcome: "NOT_MEASURED", reason: "incident(s): " + incidents.join("; "), criteria };
  if (rows.length < planned) return { outcome: "NOT_MEASURED", reason: `${rows.length}/${planned} planned rows`, criteria };
  const bad = rows.filter((r) => !measured(r));
  if (bad.length) return { outcome: "NOT_MEASURED", reason: `${bad.length} row(s) without a clean sandbox verdict (NOT_RUN / cap / transport error): ${bad.map((r) => `${r.task}#${r.trial}`).join(", ")}`, criteria };
  if (C1.met && C2.met && C3.met) return { outcome: "PASS", reason: "C1 ∧ C2 ∧ C3 met as worded", criteria };
  if (C2.met && C3.met) return { outcome: "PARTIAL", reason: "C2 ∧ C3 met; C1 NOT met as worded (no alternative triggered by NO_PROGRESS_IDENTICAL_REGENERATION / NO_QUALIFIED — the V161 / CP8 reading)", criteria };
  return { outcome: "FAIL", reason: `measured, but ${!C2.met ? "C2 (alternative executed after every ODG stop)" : "C3 (comparison with n)"} not met`, criteria };
}

/* replicationCheck(grade, prior) — REPORT ONLY (never changes the outcome): does this run reproduce V161's pattern? */
function replicationCheck(g: any, prior: any): any {
  const p = prior && prior.summary && prior.summary.overall ? prior.summary.overall : null;
  const pred = { outcome: "PARTIAL", defaultPasses: 0, alternativePasses: 0, source: `${PRIOR} (0/8 default, 0/8 alternative; CP8 grade PARTIAL: C1 not met as worded)` };
  const same = g.outcome === pred.outcome && g.criteria.C3.defaultPasses === pred.defaultPasses && g.criteria.C3.alternativePasses === pred.alternativePasses;
  return { hypothesis: "H-REP (pre-registered prediction, report-only): the V161 pattern is reproduced — outcome PARTIAL, 0 default passes, 0 alternative passes", prediction: pred, priorOverall: p,
    observed: { outcome: g.outcome, defaultPasses: g.criteria.C3.defaultPasses, alternativePasses: g.criteria.C3.alternativePasses }, verdict: g.outcome === "NOT_MEASURED" ? "NOT_MEASURED" : same ? "REPRODUCED" : "NOT_REPRODUCED" };
}

/* runScenarioJ(o) — o: { root, plan, transport, loadProbe?, sandboxRunner?, label, contractSha256 } → the result record. */
async function runScenarioJ(o: any): Promise<any> {
  const t0 = Date.now(); const plan = o.plan; const incidents: string[] = [];
  const base: any = { schema: "odg-v176-scenario-j-result/1", scenario: SCENARIO, label: o.label, contractSha256: o.contractSha256 || null,
    ownerText: "ODG détecte une stratégie inefficace, arrête les tentatives répétitives, construit une alternative et mesure le résultat.",
    run: { head: PIPE.headOf(o.root), startedAt: new Date(t0).toISOString(), runner: SELF, protocol: "runtime/bin/odg-v161-scenario-j-run.ts runTrial (J's protocol, unchanged)" },
    plan: { tasks: plan.tasks, trialsPerTask: plan.trials, decoding: DECODING, caps: plan.caps }, priorResult: { path: PRIOR, note: "J's prior execution (V161) — read only, never written or re-graded" } };
  const pins = plan.pins.map((p: any) => ({ file: p.file, expected: p.sha256, actual: sha256File(path.join(o.root, p.file)) }));
  if (pins.some((p: any) => p.actual !== p.expected)) incidents.push("pinned sha256 differs: " + pins.filter((p: any) => p.actual !== p.expected).map((p: any) => p.file).join(", "));
  const host = PIPE.hostLoad(plan.caps.hostIdleFactor, o.loadProbe);
  if (host.aboveThreshold) incidents.push(`HOST-1 busy host at start (loadavg-1m ${host.load1} > ${host.threshold})`);
  const g = makeGuard(o.transport, plan.caps);
  const finish = (rows: any[], extra: any) => {
    const summary = V161.summarize(rows);
    if (g.st.refused.length) incidents.push(`non-allowlisted request(s) refused: ${g.st.refused.length}`);
    if (g.st.capHit) incidents.push("cap hit: " + g.st.capHit);
    const grade = gradeRows(rows, plan, incidents);
    return { ...base, ...extra, pins, hostAtStart: host, rows, summary, criteria: grade.criteria, outcome: grade.outcome, outcomeReason: grade.reason, replication: replicationCheck(grade, readJson(path.join(o.root, PRIOR))),
      network: { modelCalls: g.st.modelCalls, tagsCalls: g.st.tagsCalls, refused: g.st.refused, transportErrors: g.st.transportErrors, capHit: g.st.capHit, providerCalls: 0, allowlist: ["POST http://127.0.0.1:11434/api/generate", "GET http://127.0.0.1:11434/api/tags"] },
      wallMs: Date.now() - t0, generatedAt: new Date().toISOString() };
  };
  if (incidents.length) return finish([], { stage: "PRECONDITION" });
  const probe = NBS.probeSandbox(o.sandboxRunner);
  if (!probe.ok) { incidents.push("sandbox unavailable: " + probe.reason); return finish([], { stage: "PRECONDITION", sandbox: { ok: false, reason: probe.reason } }); }
  let tasks: any[] = [];
  try { tasks = V161.buildTasks(plan.tasks); } catch (e: any) { incidents.push("task build failed: " + String(e && e.message)); }
  if (tasks.length !== plan.tasks.length) { incidents.push("unknown task id(s)"); return finish([], { stage: "PRECONDITION" }); }
  const sb = o.sandboxRunner ? { runner: o.sandboxRunner } : {};
  const graderSelfTest = tasks.map((t: any) => {   // as V161: reference passes, broken fails (repo strings, never model code)
    const ref = NBS.runIsolated(t.reference, { kind: "source", source: t.wholeTestSource }, sb);
    const broken = NBS.runIsolated(t.broken || { ...t.reference, [t.entry]: "module.exports = () => null;" }, { kind: "source", source: t.wholeTestSource }, sb);
    return { id: t.id, referencePasses: ref.verified === true, brokenFails: broken.status === "EXECUTED" && broken.verified !== true };
  });
  if (!graderSelfTest.every((x: any) => x.referencePasses && x.brokenFails)) { incidents.push("grader self-test failed"); return finish([], { stage: "PRECONDITION", graderSelfTest }); }
  const tags = await g.fetchImpl(HOST + "/api/tags", { method: "GET" }).then((r: any) => r.json()).catch(() => null);
  const installed = tags && Array.isArray(tags.models) ? tags.models.map((m: any) => m.name) : [];
  if (!installed.includes(POL.MODEL.SMALL) || !installed.includes(POL.MODEL.LARGE)) { incidents.push("required local models not installed / Ollama unreachable"); return finish([], { stage: "PRECONDITION", graderSelfTest, installed }); }
  const ctx = { generatorFor: (model: string) => GEN.makeLocalGenerator({ model, host: HOST, timeoutMs: plan.caps.perCallTimeoutMs, numPredict: DECODING.num_predict, temperature: DECODING.temperature }, g.fetchImpl),
    calls: () => g.st.modelCalls, sandboxDeps: o.sandboxRunner ? { sandboxRunner: o.sandboxRunner } : {}, measured: POL.loadMeasuredRegistry(), now: Date.now() };
  const rows: any[] = [];
  for (const t of tasks) for (let k = 1; k <= plan.trials; k++) {
    if (g.st.capHit) break;
    g.st.trialDeadline = Date.now() + plan.caps.perTrialWallMs; g.st.trialCapHit = null; const e0 = g.st.transportErrors.length;
    const row = await V161.runTrial(t, k, ctx);
    rows.push({ ...row, capHit: g.st.trialCapHit, transportErrors: g.st.transportErrors.length - e0 });
  }
  return finish(rows, { stage: "RUN", graderSelfTest, installed, sandbox: { ok: true } });
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
function guardedLoopback(): any { return require("./odg-v161-scenario-f-run.js").loopbackFetch; }

async function main(argv: string[], o: any = {}): Promise<number> {
  const root = o.root || ROOT;
  const say = (s: string) => process.stdout.write(s + "\n");
  if (argv[0] === "--selftest") return (await selftest()) === 0 ? 0 : 1;
  if (argv[0] !== OUT || argv.length !== 1) { say(`REFUSED: the only argument must be the declared writeSet entry ${OUT}`); return 3; }
  if (fs.existsSync(path.join(root, OUT))) { say(`ALREADY_RECORDED: ${OUT} exists — the single initial execution is recorded; never overwritten (a re-run needs a new owner decision)`); return 4; }
  if (process.env.ODG_TEST_NO_NATIVE === "1" && !(o.allowUnderTest && typeof o.transport === "function" && o.root && o.root !== ROOT)) { say("REFUSED: ODG_TEST_NO_NATIVE=1 (test process) — the NATIVE path is never started from a test (only a fake transport on a temp root)"); return 2; }
  const c = readContract(root);
  const g = gate(c, readInspection(root), o.probes !== undefined ? o.probes : OCUR.localGitProbes(root));
  if (!g.ok) { say(`NOT_AUTHORIZED: ${g.reason}`); return 2; }
  const plan = planOf(c);
  if (!plan.ok) { say(`NOT_AUTHORIZED: ${plan.reason}`); return 2; }
  const GO = require("./odg-go.ts");
  const dir = o.claimDir !== undefined ? o.claimDir : GO.claimDirOf(root);
  if (!dir) { say("PRECONDITION: no claim store (git common dir) — refused (fail-closed)"); return 5; }
  const prior = existingClaims(dir);
  if (prior.length) { say(`ALREADY_CLAIMED: one-shot claim(s) for J exist (${prior.join(", ")}) — refused`); return 4; }
  const host = PIPE.hostLoad(plan.caps.hostIdleFactor, o.loadProbe);
  if (host.aboveThreshold) { say(`HOST_BUSY: HOST-1 loadavg-1m ${host.load1} > nproc ${host.nproc} × ${plan.caps.hostIdleFactor} — not started (no claim, nothing written)`); return 5; }
  const key = `${g.contractSha256.slice(0, 16)}-J-runner`;
  const cl = GO.makeClaimStore(dir).claim({ key, item: SCENARIO, workspace: root, data: { item: SCENARIO, contractSha256: g.contractSha256, runner: SELF, at: new Date().toISOString(), root } });
  if (!cl || cl.ok !== true) { say(`ALREADY_CLAIMED: ${(cl && cl.code) || "CLAIM_ERROR"} ${(cl && cl.reason) || ""}`); return 4; }
  const r = await runScenarioJ({ root, plan, transport: o.transport || guardedLoopback(), loadProbe: o.loadProbe, label: "NATIVE (ODG GO dispatch) — J single initial execution (replication)", contractSha256: g.contractSha256 });
  fs.writeFileSync(path.join(root, OUT), JSON.stringify({ ...r, oneShotClaim: { key, path: cl.path } }, null, 2) + "\n");
  say(`NATIVE outcome ${r.outcome} (${r.outcomeReason}) → ${OUT}`);
  return r.outcome === "PASS" ? 0 : 1;
}

/* ---------------- selftest (FAKE model answers — fixtures, NOT results) ---------------- */
const IDLE = () => ({ loadavg: [0.1, 0.1, 0.1], nproc: 8 });
function makeFake(answer: (prompt: string, n: number) => string): any {
  const seen: string[] = []; let n = 0;
  const fake = async (url: string, init: any) => {
    seen.push(`${(init && init.method) || "GET"} ${url}`);
    if (url.endsWith("/api/tags")) return { ok: true, status: 200, json: async () => ({ models: [{ name: POL.MODEL.SMALL }, { name: POL.MODEL.LARGE }] }) };
    const b = JSON.parse(init.body); n++;
    return { ok: true, status: 200, json: async () => ({ model: b.model, eval_count: 1, response: "```js\n" + answer(b.prompt, n) + "\n```" }) };
  };
  return { fake, seen };
}
function selftestPlan(contract: any): any { const p = planOf(contract); return p.ok ? { ...p, tasks: ["v159-implement-parse-range"], trials: 1 } : p; }
async function selftest(): Promise<number> {
  let f = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; };
  const plan = selftestPlan(readContract(ROOT));
  if (!plan.ok) { check("selftest needs the contract pre-registration: " + plan.reason, false); return f; }
  const same = makeFake(() => "module.exports = function parseRange(s) { return s.split(',').map(Number); };");
  const r = await runScenarioJ({ root: ROOT, plan, transport: same.fake, loadProbe: IDLE, label: "SELFTEST (fake model)" });
  if (r.stage === "PRECONDITION" && r.sandbox && r.sandbox.ok === false) { check("no sandbox ⇒ NOT_MEASURED", r.outcome === "NOT_MEASURED"); return f; }
  check("fake identical answers ⇒ rows measured; only allowlisted URLs requested", r.rows.length === 1 && same.seen.every((s: string) => s === "GET http://127.0.0.1:11434/api/tags" || s === "POST http://127.0.0.1:11434/api/generate"));
  return f;
}

module.exports = { runScenarioJ, gradeRows, replicationCheck, makeGuard, planOf, gate, main, makeFake, selftestPlan, IDLE, existingClaims, SELF, OUT, PRIOR, INSPECTION, CONTRACTS, SCENARIO, STEP, DECODING, C1_TRIGGERS, CLAIM_RE };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { process.stdout.write("ERROR " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};

#!/usr/bin/env node
"use strict";
/*
 * V16.4 §2 "ODG GO" — CLI over runtime/core/odg-go-cycle.ts (ONE bounded governed cycle; see the core header).
 *
 * Usage:
 *   npx tsx runtime/bin/odg-go.ts [--dry] [--execute] [--repo <dir>] [--out <dir>] [--max-steps N] [--deadline-ms MS]
 *                                 [--scratch <isolated git worktree>] [--step-delay-ms MS]
 *   npx tsx runtime/bin/odg-go.ts --scenario-evidence --repo <dir> --out <dir> [--evidence-out <file>]   (real I/J harness)
 *   npx tsx runtime/bin/odg-go.ts --check --repo <dir>          (re-run a dry cycle; compare its decisions digest with
 *                                                               docs/odg/evidence/V164_GO_CYCLE.json — host-dependent)
 *
 *  --dry (DEFAULT) plan-only: every step runs, schedulerStep's dispatch is a recorder (nothing executed).
 *  --execute       dispatch allowed ONLY for a canonically authorized NATIVE mission in the isolated --scratch worktree
 *                  (odg-run there, bounded, SIGKILL on timeout). PROVIDER/HYBRID ⇒ delegation record only. No commit/merge.
 *  --repo          the repository whose STATE is read (READ-ONLY) and Truth-Locked; default = this code tree.
 *  --out           trace/summary directory (default <os.tmpdir()>/odg-go). REFUSED inside the main checkout (its
 *                  runtime/generated + runtime/dist feed the live root timer) and inside any runtime/governance.
 *  STOP            touch <out>/STOP, send SIGINT/SIGTERM, or set ODG_SCHEDULER_STOP=1 — checked between every step.
 * No network, no model, no provider call, no git write.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const GO = require("../core/odg-go-cycle.js");
const { truthLockGate } = require("../core/truth-lock-gate.js");
const LEDGER = require("../core/mission-ledger.js");
const MAL = require("../core/mission-attempt-log.js");
const POL = require("../core/odg-local-model-execution-policy.js");
const K = require("../core/odg-knowledge-intelligence.js");
const SS = require("./odg-strategic-select.ts");
const SMR = require("./odg-strategy-mode-run.ts");
const KR = require("./odg-v160-practices-knowledge-run.ts");
const SG = require("./odg-v160-scenario-g-run.ts");

const EVIDENCE_REL = "docs/odg/evidence/V164_GO_CYCLE.json";
const F = Object.freeze({
  REGISTER: "docs/odg/evidence/V164_STRATEGIC_REGISTER.json",
  STRATEGY: "docs/odg/evidence/V164_STRATEGY_MODE_SELECTION.json",
  ADMISSION: "docs/odg/evidence/V164_RADAR_SOURCE_ADMISSION.json",
  GRANT: "docs/odg/V164_RESEARCH_GRANT_BROAD_ADMISSION.json",
  MEASURED: "docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json",
  COLLECTION: "docs/odg/evidence/V160_PRACTICES_COLLECTION.json",
  COLLECTION_REGISTRY: "docs/odg/evidence/COLLECTION_REGISTRY.json",
});
const UNIT_SYSTEM = "/etc/systemd/system/odg-mission-runner.service";
const UNIT_REPO = "deploy/odg-mission-runner.service";
const MAX_STEP_DELAY_MS = 5000;
const DISPATCH_TIMEOUT_MS = 600000;

// ---- PRE-REGISTERED pass criteria (V16.4 §10 I and J) — fixed in this file BEFORE the first real run; do not edit after.
const PRE_REGISTERED = Object.freeze({
  registeredIn: "runtime/bin/odg-go.ts (same commit as the first evidence write; precedence over the results is asserted, not cryptographically provable)",
  I: Object.freeze({
    scenario: "V16.4 §10 I — ODG sélectionne et prépare la mission suivante",
    criteria: Object.freeze([
      { id: "I1", test: "the real dry cycle's SELECT step is mission-priority-selector.selectNextExplained over odg-strategic-register built from the real repo state; decision SELECTED or TIE_EXPLAINED (tiedSet + resolvedBy recorded) — never an id pick; the selected item is not owner-gated" },
      { id: "I2", test: "the selected item is PREPARED: NEXT_SELECTION.preparedMission carries the contract (objective, write_set, acceptance_criteria), the decomposition-planner verdict, the strategy-mode-selector verdict and an explicit authorizationNeeded when unauthorized" },
      { id: "I3", test: "consistency: the SELECT decision equals the committed V164_STRATEGIC_REGISTER decisionRecord and the STRATEGY verdict equals the committed V164_STRATEGY_MODE_SELECTION entry for that item" },
      { id: "I4", test: "the selector's next choice after the current item is recorded (NEXT_SELECTION.nextAfterCurrent)" },
    ]),
    gradingRule: "FAIL if I1 fails or an owner-gated item is selected; PASS iff I1–I4 pass; otherwise PARTIAL (a DECISION_REQUIRED that is explained ⇒ PARTIAL)",
  }),
  J: Object.freeze({
    scenario: "V16.4 §10 J — le bouton GO déclenche réellement ce cycle, avec traces et possibilité d'arrêt",
    criteria: Object.freeze([
      { id: "J1", test: "a real `odg-go` run (child process) on the real repo state performs the 10 steps in order, each STEP trace entry carrying step, inputsSha256, decision, rationale, decidedBy, startedAt, endedAt" },
      { id: "J2", test: "unauthorized work halts at the authorization gate: AUTHORIZE stops the intelligence loop at PROPOSED for the unauthorized selected item, and EXECUTE records NOTHING_EXECUTED (or the run is HALTED_DECISION_REQUIRED)" },
      { id: "J3", test: "nothing unauthorized executed: dispatchCalls=0 and providerLaunched=0 in every run whose selected item is unauthorized; every file written by every run is inside its --out dir; the main checkout's git status and mission-ledger sha256 are unchanged" },
      { id: "J4", test: "a STOP file created mid-cycle (after ≥3 steps) stops the real run before step 10 with a STOP trace entry and CYCLE_END status STOPPED" },
      { id: "J5", test: "SIGTERM sent mid-cycle (after ≥3 steps) stops the real run cleanly: STOP trace entry + CYCLE_END STOPPED, process exit code 3" },
      { id: "J6", test: "canonical emergency stop ODG_SCHEDULER_STOP=1 ⇒ STOPPED with trace; --max-steps and --deadline-ms bounds ⇒ STOPPED (MAX_STEPS / DEADLINE) with trace" },
      { id: "J7", test: "re-running the same dry cycle on the same state is idempotent: same runId + same decisionsDigest, CYCLE_END.idempotent=true (duplicateOf recorded), no dispatch" },
      { id: "J8", test: "EXECUTE path proven for real: an `--execute` run dispatches a canonically authorized NATIVE mission in an isolated scratch worktree and records its verified outcome — NOT_MEASURED when no canonically authorized native mission exists (an authorization is never created to make it pass)" },
    ]),
    gradingRule: "FAIL if any of J1–J7 fails; PASS iff J1–J7 pass AND J8 passes; J8 NOT_MEASURED ⇒ PARTIAL (the governed cycle and its stop are proven; the execution leg is not)",
  }),
});

function sha256File(p: string): string | null { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch { return null; } }
function readJson(p: string): any { return JSON.parse(fs.readFileSync(p, "utf8")); }
function git(dir: string, args: string[]): string | null { try { return String(cp.execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim(); } catch { return null; } }
function arg(argv: string[], name: string): string | null { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; }
function numArg(argv: string[], name: string, d: number): number { const v = arg(argv, name); const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? n : d; }

/* the main checkout of a repo = parent of its git common dir (worktrees share it). null if not a git repo. */
function mainCheckoutOf(dir: string): string | null {
  const c = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return c ? path.dirname(c) : null;
}
function forbiddenRoots(repo: string): string[] {
  const out = new Set<string>([path.join(ROOT, "runtime", "governance"), path.join(repo, "runtime", "governance")]);
  for (const r of [mainCheckoutOf(repo), mainCheckoutOf(ROOT)]) if (r) { out.add(path.join(r, "runtime", "generated")); out.add(path.join(r, "runtime", "dist")); out.add(path.join(r, "runtime", "governance")); }
  return [...out];
}
/* out dir refusal: never inside a main checkout (live root timer state), never inside a forbidden root. */
function validateOutDir(outDir: string, repo: string): { ok: boolean; reason: string } {
  const od = path.resolve(outDir);
  const inside = (a: string, b: string) => a === b || a.startsWith(b + path.sep);
  for (const f of forbiddenRoots(repo)) if (inside(od, f)) return { ok: false, reason: `out dir ${od} is inside protected ${f}` };
  for (const m of [mainCheckoutOf(repo), mainCheckoutOf(ROOT)]) if (m && inside(od, m)) return { ok: false, reason: `out dir ${od} is inside the main checkout ${m} (live root timer state)` };
  return { ok: true, reason: "confined" };
}

function readAllowlist(): any {
  if (process.env.ODG_CANARY_ALLOWLIST !== undefined) return { ids: process.env.ODG_CANARY_ALLOWLIST.split(",").map((s: string) => s.trim()).filter(Boolean), source: "env ODG_CANARY_ALLOWLIST" };
  for (const [p, label] of [[UNIT_SYSTEM, `${UNIT_SYSTEM} (installed live unit, read-only)`], [path.join(ROOT, UNIT_REPO), `${UNIT_REPO} (repo unit template)`]]) {
    try { const m = /^Environment=ODG_CANARY_ALLOWLIST=(.*)$/m.exec(fs.readFileSync(p, "utf8")); if (m) return { ids: m[1].split(",").map((s: string) => s.trim()).filter(Boolean), source: label }; } catch { /* next */ }
  }
  return { ids: [], source: "none found ⇒ empty (deny-by-default)" };
}

/* readState(repo) — canonical evidence + registers + ledger/attempt-log, all READ-ONLY. */
function readState(repo: string): any {
  const src = SS.loadSources(repo);
  const inputs = src.inputs.slice();
  const add = (rel: string) => { const p = path.join(repo, rel); const h = sha256File(p); inputs.push({ source: rel, sha256: h }); return h ? readJson(p) : null; };
  const registerEvidence = add(F.REGISTER);
  const strategyEvidence = add(F.STRATEGY);
  const admission = add(F.ADMISSION);
  const grant = add(F.GRANT);
  inputs.push({ source: F.MEASURED, sha256: sha256File(path.join(repo, F.MEASURED)) });
  let ledgerPayload: any = null;
  try { ledgerPayload = readJson(path.join(repo, "runtime", "generated", "mission-ledger.json")); } catch { ledgerPayload = null; }
  const entries = ledgerPayload ? (Array.isArray(ledgerPayload) ? ledgerPayload : (ledgerPayload.entries || ledgerPayload.missions || [])) : [];
  const proven = [...new Set(entries.filter((x: any) => x && x.proven === true).map((x: any) => String(x.mission)))].sort();
  let integrity: any = { ok: false, reason: "ledger absent" };
  if (ledgerPayload) { try { const v = LEDGER.verifyLedger(ledgerPayload); integrity = { ok: v.ok === true, total: v.total, verified: v.verified, legacyUnsealed: v.legacyUnsealed, reason: v.reason || null }; } catch (e: any) { integrity = { ok: false, reason: String(e && e.message) }; } }
  const att = MAL.readAttempts(path.join(repo, "runtime", "generated", "mission-attempt-log.jsonl"));
  const last = att.length ? att[att.length - 1] : null;
  const smr = SMR.loadSources();   // canonical strategy-mode evaluation instant (code tree; parity recorded below)
  const parity = (Object.values(F) as string[]).concat(["docs/odg/evidence/V159_MEASURED_MODEL_POLICY.json", "docs/odg/evidence/V161_SCENARIO_J.json"]).map((rel: string) => ({ file: rel, codeTreeEqualsRepo: sha256File(path.join(ROOT, rel)) === sha256File(path.join(repo, rel)) }));
  return {
    repo, inputs, sources: { contracts: src.contracts, v150: src.v150, cp8: src.cp8, scenarioEvidence: src.scenarioEvidence },
    registerEvidence, strategyEvidence, radar: { grant, admission },
    ledger: { proven, integrity }, attempts: { count: att.length, last: last ? { mission: last.mission, status: last.status, recordedAt: last.recordedAt } : null },
    allowlist: readAllowlist(), measured: POL.loadMeasuredRegistry(F.MEASURED, { root: repo }), strategyNow: smr.now, codeTreeParity: parity,
  };
}

/* knowledge(repo, useAt) — the scenario-G canonical path (attestCollection → assessClaim → toMemory → usableFor) on the
 * pinned collection, plus admissible() (admission AS FACT). No network. */
function knowledge(repo: string, useAt: number): any {
  const col = readJson(path.join(repo, F.COLLECTION)); const reg = readJson(path.join(repo, F.COLLECTION_REGISTRY));
  const pins = (reg.collections || []).filter((c: any) => c.path === F.COLLECTION).map((c: any) => c.sha256);
  const collection = K.attestCollection(col, { pinnedDigests: pins });
  if (!collection.attested) return { ok: false, collection: F.COLLECTION, reason: "collection NOT authenticated against COLLECTION_REGISTRY", claims: [] };
  const asOf = Date.parse(col.consultedDate + "T12:00:00Z");
  const claims = SG.CLAIMS.map((id: string) => {
    const cy = (col.cycles || []).find((c: any) => String(c.query).endsWith(":: " + id)); const st = KR.STRUCT[id];
    if (!cy || !st) return { id, status: "NOT_FOUND" };
    const a = K.assessClaim({ ...st, nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) }, { asOfEpochMs: asOf, collection, quarantined: [], missionAuthorization: "DESIGN_PROPOSAL" });
    const mem = K.toMemory(a, asOf);
    const use = K.usableFor(mem, "DESIGN_PROPOSAL", useAt, { assessment: a });
    const adm = K.admissible(mem, useAt, { assessment: a });
    return { id, epistemic: a.dimensions.epistemic, isFact: a.isFact === true, useAuthorization: use.authorization, useReason: use.reason, admissible: { trusted: adm.trusted === true, verdict: adm.verdict } };
  });
  return { ok: claims.every((c: any) => c.useAuthorization === "DESIGN_PROPOSAL"), collection: F.COLLECTION, claims };
}

/* buildPorts — every effect of a real cycle; all writes go through the confined writer. */
function buildPorts(o: any): any {
  const { repo, outDir, scratch, stepDelayMs, signalState } = o;
  const forb = forbiddenRoots(repo);
  const writes: string[] = [];
  const guard = (p: string) => { GO.assertConfinedWrite(p, outDir, forb, path); if (!writes.includes(path.resolve(p))) writes.push(path.resolve(p)); };
  const tracePath = path.join(outDir, "go-trace.jsonl");
  const stopPath = path.join(outDir, "STOP");
  return {
    writes,
    now: () => Date.now(),
    truthLock: () => truthLockGate({ mutating: true, enforce: true, exec: (args: string[]) => git(repo, args) }),
    readState: () => readState(repo),
    knowledge: () => knowledge(repo, Date.now()),
    stopRequested: () => {
      if (signalState.signal) return { stop: true, reason: "SIGNAL", source: signalState.signal };
      if (fs.existsSync(stopPath)) return { stop: true, reason: "STOP_FILE", source: stopPath };
      return { stop: false };
    },
    trace: {
      append: (e: any) => { guard(tracePath); fs.appendFileSync(tracePath, JSON.stringify(e) + "\n"); },
      readPrior: () => { try { return fs.readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } },
    },
    writeSummary: (s: any) => { const p = path.join(outDir, "go-cycle.json"); const tmp = `${p}.tmp-${process.pid}`; guard(tmp); guard(p); fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n"); fs.renameSync(tmp, p); },
    isolation: (next: any) => {
      if (!scratch) return { ok: false, reason: "no --scratch isolated worktree given" };
      const s = path.resolve(scratch);
      if (git(s, ["rev-parse", "--is-inside-work-tree"]) !== "true") return { ok: false, reason: `${s} is not a git worktree` };
      const top = git(s, ["rev-parse", "--show-toplevel"]);
      const main = mainCheckoutOf(s);
      if (!top || path.resolve(top) === main || path.resolve(top) === path.resolve(repo) || path.resolve(top) === ROOT) return { ok: false, reason: `${s} is not an isolated scratch worktree (it is the main checkout, the state repo or this code tree)` };
      if (!fs.existsSync(path.join(s, "runtime", "missions", `${next.mission}.json`))) return { ok: false, reason: `NOT_RUNNABLE: no runtime/missions/${next.mission}.json in the scratch worktree (not a governed-pipeline mission)` };
      return { ok: true, workspace: s };
    },
    dispatchNative: (next: any, c: any) => {
      // governed pipeline in the ISOLATED worktree only (never the main checkout); bounded; nothing committed/merged.
      const r = cp.spawnSync("npx", ["tsx", "runtime/bin/odg-run.ts", next.mission], { cwd: c.workspace, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: DISPATCH_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
      let report: any = null; try { report = readJson(path.join(c.workspace, "runtime", "generated", "mission-report.json")); } catch { report = null; }
      const verified = r.status === 0 && !!report && report.mission === next.mission && report.validated === true && report.status === "SUCCESS";
      return { verified, detail: report ? `odg-run status ${report.status} (exit ${r.status}) in ${c.workspace}` : `odg-run exit ${r.status} (no report) in ${c.workspace}` };
    },
    pause: () => new Promise((res) => setTimeout(res, Math.max(0, Math.min(MAX_STEP_DELAY_MS, stepDelayMs || 0)))),
  };
}

async function runOnce(argv: string[]): Promise<{ code: number; result: any; writes: string[] }> {
  const repo = path.resolve(arg(argv, "--repo") || ROOT);
  const outDir = path.resolve(arg(argv, "--out") || path.join(os.tmpdir(), "odg-go"));
  const v = validateOutDir(outDir, repo);
  if (!v.ok) { process.stderr.write(`REFUSED: ${v.reason}\n`); return { code: 2, result: null, writes: [] }; }
  fs.mkdirSync(outDir, { recursive: true });
  const signalState: any = { signal: null };
  const onSig = (s: string) => () => { signalState.signal = s; };
  const hInt = onSig("SIGINT"), hTerm = onSig("SIGTERM");
  process.on("SIGINT", hInt); process.on("SIGTERM", hTerm);
  const ports = buildPorts({ repo, outDir, scratch: arg(argv, "--scratch"), stepDelayMs: numArg(argv, "--step-delay-ms", 0), signalState });
  try {
    const result = await GO.runGoCycle({ mode: argv.includes("--execute") ? "EXECUTE" : "DRY", maxSteps: numArg(argv, "--max-steps", GO.DEFAULTS.maxSteps), deadlineMs: numArg(argv, "--deadline-ms", GO.DEFAULTS.deadlineMs) }, ports);
    const code = result.status === "STARTUP_REFUSED" ? 2 : result.status === "STOPPED" ? 3 : 0;
    return { code, result, writes: ports.writes };
  } finally { process.removeListener("SIGINT", hInt); process.removeListener("SIGTERM", hTerm); }
}

// ---- real scenario harness (child processes of this very CLI) -----------------------------------------------------
function childArgs(extra: string[]): string[] { return [...process.execArgv, __filename, ...extra]; }
function readTrace(dir: string): any[] { try { return fs.readFileSync(path.join(dir, "go-trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); } catch { return []; } }
function lastCycle(trace: any[]): any[] { let i = -1; trace.forEach((e, k) => { if (e.kind === "CYCLE_START") i = k; }); return i >= 0 ? trace.slice(i) : []; }
function runChild(extra: string[], env: any = {}): Promise<any> {
  return new Promise((resolve) => {
    const ch = cp.spawn(process.execPath, childArgs(extra), { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    ch.stdout.on("data", (d: any) => { out += d; }); ch.stderr.on("data", (d: any) => { err += d; });
    const kill = setTimeout(() => ch.kill("SIGKILL"), 300000);
    ch.on("close", (code: number) => { clearTimeout(kill); resolve({ code, out, err }); });
  });
}
/* start a child with a step delay, wait (bounded) until ≥ minSteps STEP entries are traced, then act. */
function runChildInterrupted(extra: string[], outDir: string, minSteps: number, act: (ch: any) => void): Promise<any> {
  return new Promise((resolve) => {
    const ch = cp.spawn(process.execPath, childArgs(extra), { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", acted: any = null; const t0 = Date.now();
    ch.stdout.on("data", (d: any) => { out += d; });
    const poll = setInterval(() => {
      const n = lastCycle(readTrace(outDir)).filter((e) => e.kind === "STEP").length;
      if (!acted && n >= minSteps) { acted = { afterSteps: n, at: new Date().toISOString() }; act(ch); }
      if (Date.now() - t0 > 120000) { clearInterval(poll); ch.kill("SIGKILL"); }
    }, 50);
    ch.on("close", (code: number) => { clearInterval(poll); resolve({ code, out, acted }); });
  });
}
function summarizeRun(dir: string, child: any): any {
  const cyc = lastCycle(readTrace(dir));
  const end = cyc.find((e) => e.kind === "CYCLE_END") || null;
  let final: any = null; try { final = JSON.parse(String(child.out).trim().split("\n").pop() || "null"); } catch { final = null; }
  return { exitCode: child.code, status: end && end.status, stepsRun: end && end.stepsRun, stop: (cyc.find((e) => e.kind === "STOP") || null), runId: end && end.runId, decisionsDigest: end && end.decisionsDigest, idempotent: end && end.idempotent, duplicateOf: end && end.duplicateOf, dispatchCalls: end && end.dispatchCalls, providerLaunched: end && end.providerLaunched, writes: final && final.writes, writesConfined: !!(final && Array.isArray(final.writes) && final.writes.every((w: string) => w.startsWith(path.resolve(dir) + path.sep))), traceEntries: cyc.length, acted: child.acted || null };
}

function gradeI(dry: any[], st: any): any {
  const by = (s: string) => dry.find((e) => e.kind === "STEP" && e.step === s);
  const sel = by("SELECT"), next = by("NEXT_SELECTION"), strat = by("STRATEGY");
  const d = sel && sel.decision;
  const I1 = !!d && (d.decision === "SELECTED" || (d.decision === "TIE_EXPLAINED" && d.tiedSet.length > 1 && !!d.resolvedBy)) && !!d.selected && !d.ownerAuthorizationRequired.includes(d.selected);
  const pm = next && next.decision && next.decision.preparedMission;
  const I2 = !!pm && !!pm.contract && !!pm.contract.objective && Array.isArray(pm.contract.write_set) && Array.isArray(pm.contract.acceptance_criteria) && !!pm.decomposition && !!pm.strategy && (pm.authorizationNeeded !== undefined);
  const I3 = !!d && d.consistentWithCommittedRegisterEvidence === true && !!strat && strat.decision.consistentWithCommittedStrategyEvidence === true;
  const I4 = !!next && !!next.decision.nextAfterCurrent && typeof next.decision.nextAfterCurrent.decision === "string";
  const res = { I1: I1 ? "PASS" : "FAIL", I2: I2 ? "PASS" : "FAIL", I3: I3 ? "PASS" : "FAIL", I4: I4 ? "PASS" : "FAIL" };
  const grade = !I1 ? "FAIL" : (I2 && I3 && I4) ? "PASS" : "PARTIAL";
  return { results: res, grade, rule: PRE_REGISTERED.I.gradingRule, selection: d ? { decision: d.decision, selected: d.selected, tiedSet: d.tiedSet, resolvedBy: d.resolvedBy } : null, preparedMission: pm || null, nextAfterCurrent: next ? next.decision.nextAfterCurrent : null, stateNote: st };
}

async function scenarioEvidence(argv: string[]): Promise<number> {
  const repo = path.resolve(arg(argv, "--repo") || ROOT);
  const base = path.resolve(arg(argv, "--out") || path.join(os.tmpdir(), "odg-go-scenario"));
  const v = validateOutDir(base, repo); if (!v.ok) { process.stderr.write(`REFUSED: ${v.reason}\n`); return 2; }
  fs.mkdirSync(base, { recursive: true });
  const evOut = path.resolve(arg(argv, "--evidence-out") || path.join(ROOT, EVIDENCE_REL));
  const main = mainCheckoutOf(repo);
  const ledgerPath = main ? path.join(main, "runtime", "generated", "mission-ledger.json") : null;
  const before = { gitStatus: main ? git(main, ["status", "--porcelain"]) : null, head: main ? git(main, ["rev-parse", "HEAD"]) : null, ledgerSha256: ledgerPath ? sha256File(ledgerPath) : null };
  const dir = (n: string) => { const d = path.join(base, n); fs.rmSync(d, { recursive: true, force: true }); return d; };
  const runs: any = {};
  // R0 fail-closed startup on this code tree (feature branch ⇒ Truth-Lock refuses)
  const d0 = dir("r0-truthlock-codetree"); runs.truthLockOnCodeTree = summarizeRun(d0, await runChild(["--repo", ROOT, "--out", d0]));
  // R1 dry, R2 dry re-run (idempotence) on the real repo state
  const d1 = dir("r1-dry"); runs.dry = summarizeRun(d1, await runChild(["--repo", repo, "--out", d1]));
  runs.dryRerun = summarizeRun(d1, await runChild(["--repo", repo, "--out", d1]));
  // R3 --execute (no --scratch is needed to SHOW the gate; one is passed when a canonically authorized native mission exists)
  const d3 = dir("r3-execute"); runs.execute = summarizeRun(d3, await runChild(["--execute", "--repo", repo, "--out", d3]));
  // R4 STOP file mid-cycle, R5 SIGTERM mid-cycle
  const d4 = dir("r4-stopfile"); runs.stopFile = summarizeRun(d4, await runChildInterrupted(["--repo", repo, "--out", d4, "--step-delay-ms", "700"], d4, 3, () => fs.writeFileSync(path.join(d4, "STOP"), "stop requested by harness\n")));
  const d5 = dir("r5-sigterm"); runs.sigterm = summarizeRun(d5, await runChildInterrupted(["--repo", repo, "--out", d5, "--step-delay-ms", "700"], d5, 3, (ch: any) => ch.kill("SIGTERM")));
  // R6 canonical emergency stop, R7 max-steps, R8 deadline
  const d6 = dir("r6-emergency"); runs.emergencyStop = summarizeRun(d6, await runChild(["--repo", repo, "--out", d6], { ODG_SCHEDULER_STOP: "1" }));
  const d7 = dir("r7-maxsteps"); runs.maxSteps = summarizeRun(d7, await runChild(["--repo", repo, "--out", d7, "--max-steps", "4"]));
  const d8 = dir("r8-deadline"); runs.deadline = summarizeRun(d8, await runChild(["--repo", repo, "--out", d8, "--deadline-ms", "1500", "--step-delay-ms", "600"]));
  const after = { gitStatus: main ? git(main, ["status", "--porcelain"]) : null, head: main ? git(main, ["rev-parse", "HEAD"]) : null, ledgerSha256: ledgerPath ? sha256File(ledgerPath) : null };

  const dryTrace = lastCycle(readTrace(d1).slice(0, readTrace(d1).findIndex((e: any) => e.kind === "CYCLE_END") + 1));
  const steps = dryTrace.filter((e) => e.kind === "STEP");
  const execTrace = lastCycle(readTrace(d3));
  const stepOf = (t: any[], s: string) => t.find((e) => e.kind === "STEP" && e.step === s);
  const fields = ["step", "inputsSha256", "decision", "rationale", "decidedBy", "startedAt", "endedAt"];
  const J1 = runs.dry.status !== "STARTUP_REFUSED" && steps.length === 10 && steps.every((e, i) => e.step === GO.STEPS[i] && fields.every((f) => e[f] !== undefined && e[f] !== null));
  const auth = stepOf(dryTrace, "AUTHORIZE"), ex = stepOf(dryTrace, "EXECUTE"), exX = stepOf(execTrace, "EXECUTE");
  const selAuthorized = !!(auth && auth.decision.selectedAuthorized);
  const J2 = runs.dry.status === "HALTED_DECISION_REQUIRED" || (!selAuthorized && auth && auth.decision.intelligenceLoop && auth.decision.intelligenceLoop.stage === "AUTHORIZE" && auth.decision.intelligenceLoop.proposedOnly === true && ex && ex.status === "NOTHING_EXECUTED" && exX && exX.status === "NOTHING_EXECUTED");
  const allRuns = Object.values(runs) as any[];
  const J3 = !selAuthorized && allRuns.every((r) => (r.dispatchCalls || 0) === 0 && (r.providerLaunched || 0) === 0 && (r.writes === null || r.writes === undefined || r.writesConfined)) && before.gitStatus === after.gitStatus && before.ledgerSha256 === after.ledgerSha256;
  const midStop = (r: any, reason: string) => r.status === "STOPPED" && !!r.stop && r.stop.reason === reason && Array.isArray(r.stepsRun) && r.stepsRun.length >= 3 && r.stepsRun.length < 10;
  const J4 = midStop(runs.stopFile, "STOP_FILE");
  const J5 = midStop(runs.sigterm, "SIGNAL") && runs.sigterm.exitCode === 3;
  const J6 = runs.emergencyStop.status === "STOPPED" && runs.emergencyStop.stop && runs.emergencyStop.stop.reason === "EMERGENCY_STOP" && runs.maxSteps.status === "STOPPED" && runs.maxSteps.stop && runs.maxSteps.stop.reason === "MAX_STEPS" && runs.maxSteps.stepsRun.length === 4 && runs.deadline.status === "STOPPED" && runs.deadline.stop && runs.deadline.stop.reason === "DEADLINE";
  const J7 = runs.dryRerun.runId === runs.dry.runId && runs.dryRerun.decisionsDigest === runs.dry.decisionsDigest && runs.dryRerun.idempotent === true && (runs.dryRerun.dispatchCalls || 0) === 0;
  const J8 = selAuthorized ? (exX && /^EXECUTED_PASS/.test(exX.status) ? "PASS" : "FAIL") : "NOT_MEASURED";
  const P = (b: any) => (b ? "PASS" : "FAIL");
  const jr: any = { J1: P(J1), J2: P(J2), J3: P(J3), J4: P(J4), J5: P(J5), J6: P(J6), J7: P(J7), J8 };
  const jFail = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"].some((k) => jr[k] === "FAIL");
  const J = { results: jr, grade: jFail ? "FAIL" : J8 === "PASS" ? "PASS" : "PARTIAL", rule: PRE_REGISTERED.J.gradingRule };
  const elig = auth ? auth.decision.schedulerEligibility : [];
  const I = gradeI(dryTrace, null);

  const ev = {
    schema: "V164_GO_CYCLE_EVIDENCE/1",
    directive: "owner V16.4 §2 ODG GO + §7 close the loop + §10 scenarios I and J",
    component: GO.GO_CYCLE_CONTRACT,
    preRegistration: PRE_REGISTERED,
    host: { stateRepo: repo, mainCheckout: main, codeTreeHead: git(ROOT, ["rev-parse", "HEAD"]), stateRepoHead: before.head, generatedAt: new Date().toISOString() },
    mainCheckoutUntouched: { before, after, equal: before.gitStatus === after.gitStatus && before.ledgerSha256 === after.ledgerSha256 && before.head === after.head },
    runs,
    realDryCycleTrace: dryTrace,
    executeRunExecuteStep: exX || null,
    executionCandidates: { selectedItem: I.selection && I.selection.selected, selectedAuthorized: selAuthorized, schedulerEligibility: elig, finding: selAuthorized ? "an authorized item exists" : "NO canonically authorized native mission exists: the selected item is PROPOSED with authorizedBy=null (every A–P contract is PROPOSED); the canonical pre-authorized allowlist (live unit ODG_CANARY_ALLOWLIST) holds only already-proven read-only canaries ⇒ --execute dispatched nothing; no authorization was created" },
    scenarioI: I,
    scenarioJ: J,
    decidedByOdgVsProvider: {
      odgComponents: ["truth-lock-gate (startup verdict)", "odg-strategic-register + mission-priority-selector.selectNextExplained (selection, tie resolution)", "decomposition-planner.chooseStrategy", "odg-strategy-mode-selector.selectStrategyMode (mode + M0 DECISION_REQUIRED)", "intelligence-loop.runCycle (halt at PROPOSED)", "mission-scheduler.evaluateEligibility/schedulerStep (allowlist, proven dedup, emergency stop, dispatch gate)", "odg-knowledge-intelligence.usableFor/admissible", "mission-ledger.verifyLedger"],
      providerRules: ["the 10-step order and the composition itself (odg-go-cycle.ts)", GO.SPEC_RULE, "stop rules (STOP file, signals, deadline, max steps) and the out-dir confinement", "the state reader (which files are canonical inputs) and the allowlist source order (env → installed unit → repo unit)", "the pre-registered I/J criteria and this harness", "the decisions-digest definition (excludes TRUTH_LOCK git details and the volatile attempt-log size)"],
    },
    providerCalls: 0, modelCalls: 0, networkCalls: 0, commits: 0,
    honestLimits: [
      "J8 NOT_MEASURED: no canonically authorized NATIVE mission exists, so the dispatch leg (odg-run in an isolated scratch worktree) was never exercised for real — it is covered only by offline tests with injected ports",
      "the selected item and its preparation are a PROPOSAL; ODG did not (and cannot) authorize it; whether the prepared mission would succeed is not measured",
      "state is read from the main checkout READ-ONLY (Truth-Lock passes there); the code runs from the feature worktree, whose own Truth-Lock refuses (branch ≠ main) — recorded as run truthLockOnCodeTree; loaders that read the code tree (strategy-mode evaluation instant) are parity-checked against the state repo (STATE_READ codeTreeParity)",
      "the canonical allowlist was read from the installed systemd unit file (read-only); in CI/another host the source and therefore runId differ — --check is host-dependent",
      "stop is cooperative (between steps); a step already running (e.g. a dispatched odg-run) is bounded by its own timeout, not interrupted",
      "the live root timer appends to the attempt-log independently; its size is recorded as volatile and excluded from the decisions digest",
      "pre-registration is in the same commit as the first evidence write; its precedence is asserted, not cryptographically provable",
    ],
  };
  fs.writeFileSync(evOut, JSON.stringify(ev, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ evidence: evOut, I: I.grade, Iresults: I.results, J: J.grade, Jresults: jr, dry: { status: runs.dry.status, steps: runs.dry.stepsRun }, selection: I.selection }, null, 1) + "\n");
  return 0;
}

async function check(argv: string[]): Promise<number> {
  const evp = path.resolve(arg(argv, "--evidence-out") || path.join(ROOT, EVIDENCE_REL));
  let ev: any; try { ev = readJson(evp); } catch { process.stdout.write("CHECK FAILED: evidence unreadable\n"); return 1; }
  const repo = path.resolve(arg(argv, "--repo") || ev.host.stateRepo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-check-"));
  const r = await runOnce(["--repo", repo, "--out", tmp]);
  const ok = !!r.result && r.result.decisionsDigest === ev.runs.dry.decisionsDigest && r.result.runId === ev.runs.dry.runId;
  process.stdout.write(ok ? `CHECK OK (runId ${r.result.runId}, digest ${r.result.decisionsDigest.slice(0, 12)})\n` : `CHECK FAILED: re-run ${r.result ? r.result.status + " " + r.result.decisionsDigest : "refused"} ≠ committed ${ev.runs.dry.decisionsDigest} (state or host changed)\n`);
  return ok ? 0 : 1;
}

module.exports = { PRE_REGISTERED, runOnce, readState, knowledge, buildPorts, validateOutDir, forbiddenRoots, mainCheckoutOf, readAllowlist, gradeI, EVIDENCE_REL };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const p = argv.includes("--scenario-evidence") ? scenarioEvidence(argv) : argv.includes("--check") ? check(argv) : runOnce(argv).then((r) => {
    if (r.result) process.stdout.write(JSON.stringify({ status: r.result.status, runId: r.result.runId, cycleSeq: r.result.cycleSeq, stepsRun: r.result.stepsRun, stop: r.result.stop || null, idempotent: r.result.idempotent, dispatchCalls: r.result.dispatchCalls, writes: r.writes }) + "\n");
    return r.code;
  });
  p.then((c: number) => { process.exitCode = c; }, (e: any) => { process.stderr.write(`odg-go error: ${(e && e.stack) || e}\n`); process.exitCode = 1; });
}
export {};

#!/usr/bin/env node
"use strict";
/*
 * V15.0 §45 SCENARIO E — SELF-HEALING, END-TO-END + REPRODUCIBLE. This bin builds NO repair engine: it drives the EXISTING
 * runtime/core components over a throw-away sandbox git repo (tmp dir) with a small module + tests and a CONTROLLED,
 * injected defect:
 *   DETECT      — real test run (code-execution.defaultRunner) + rce-signal-collector.collect
 *   DIAGNOSE    — failing case / file / function parsed from the REAL test output → repair-planner.planRepair (root cause)
 *   GENERATE    — a deterministic candidate-fix SEAM (a scripted child process written by the PROVIDER, NO model), bounded
 *                 by code-execution.defaultRunner's timeout. ODG does NOT generate the fix — attribution says so.
 *   AUTHORIZE   — repair-planner.planRepair over the candidate's paths (repair-workflow.makeWriteSetGuard inside)
 *   CHECKPOINT  — checkpoint-engine.begin/stageRunning/stageDone (resumable stage state) + a sha256-manifested tree copy
 *   APPLY+TEST  — fdir-engine.runFdir → recover = repair-workflow.runRepairWorkflow (isolated, reproduce-before-modify,
 *                 targeted test, rollback on non-acceptance)
 *   ACCEPT      — fdir-engine.runFdir → verify = an INDEPENDENT verifier (fresh copy, targeted + regression tests, diff
 *                 confined to the write-set) — distinct from the acceptance command runRepairWorkflow used
 *   ROLLBACK    — fdir-engine VERIFIED_ROLLBACK (only with a verified reference) + whole-tree sha256 equality check
 * Eight cases, each its own sandbox and recorded run. Usage: npx tsx runtime/bin/odg-scenario-e-self-healing.ts [--write-evidence]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const CORE = (m: string) => path.join(ROOT, "runtime", "core", m);
const RW = require(CORE("repair-workflow.js"));
const CK = require(CORE("checkpoint-engine.js"));
const FDIR = require(CORE("fdir-engine.js"));
const EXEC = require(CORE("code-execution.js"));
const SIG = require(CORE("rce-signal-collector.js"));
const PLAN = require(CORE("repair-planner.js"));

const NODE = process.execPath;
const WRITE_SET = ["src/"];
const TARGET_TEST = "test/target.test.js";
const REGRESSION_TEST = "test/regression.test.js";
const STAGES = ["detect", "diagnose", "checkpoint", "generate", "authorize", "apply", "verify", "accept"];
const SEAM_TIMEOUT_MS = 1500;
const TEST_TIMEOUT_MS = 15000;
const NATIVE = "ODG_NATIVE_COMPONENT";
const PROVIDER = "PROVIDER";
const HARNESS = "SCENARIO_HARNESS";   // glue written in THIS bin (verifier composition, fault injection) — not an existing core decision

const CALC_OK = `"use strict";\nfunction add(a, b) { return a + b; }\nfunction mul(a, b) { return a * b; }\nmodule.exports = { add, mul };\n`;
const CALC_DEFECT = CALC_OK.replace("return a + b;", "return a - b;");   // the controlled, injected defect
const TEST_TARGET = `"use strict";\nconst { add } = require("../src/calc.js");\nfor (const [a, b, e] of [[2, 3, 5], [-1, 1, 0], [0, 0, 0]]) {\n  const g = add(a, b);\n  if (g !== e) { console.error("FAIL target add(" + a + "," + b + ") expected " + e + " got " + g + " [src/calc.js:add]"); process.exit(1); }\n}\nconsole.log("PASS target");\n`;
const TEST_REGRESSION = `"use strict";\nconst { mul } = require("../src/calc.js");\nfor (const [a, b, e] of [[2, 3, 6], [4, 0, 0], [-2, 5, -10]]) {\n  const g = mul(a, b);\n  if (g !== e) { console.error("FAIL regression mul(" + a + "," + b + ") expected " + e + " got " + g + " [src/calc.js:mul]"); process.exit(1); }\n}\nconsole.log("PASS regression");\n`;

// PROVIDER-written scripted seams (deterministic, no model). Each prints {"edits":[{path,content}]} or fails/hangs.
const editsOut = (edits: any[]) => `process.stdout.write(${JSON.stringify(JSON.stringify({ edits }))});\n`;
const SEAMS: Record<string, string> = {
  good: editsOut([{ path: "src/calc.js", content: CALC_OK }]),
  ineffective: editsOut([{ path: "src/calc.js", content: CALC_OK.replace("return a + b;", "return b - a;") }]),
  breaksRegression: editsOut([{ path: "src/calc.js", content: CALC_OK.replace("return a * b;", "return a + b;") }]),
  genError: `process.stderr.write("seam: generation failed (scripted provider error)\\n"); process.exit(3);\n`,
  hang: `setInterval(() => {}, 1000);\n`,
  outsideWriteSet: editsOut([{ path: TARGET_TEST, content: `console.log("PASS target");\n` }]),
};

function sha256(b: any): string { return crypto.createHash("sha256").update(b).digest("hex"); }
/** Whole-tree manifest (every file incl. .git) → { files:{rel:sha256}, treeHash }. Byte-level, deterministic order. */
function manifest(dir: string): any {
  const files: Record<string, string> = {};
  (function walk(d: string) {
    for (const n of fs.readdirSync(d).sort()) {
      const a = path.join(d, n); const st = fs.lstatSync(a);
      if (st.isDirectory()) walk(a); else files[path.relative(dir, a)] = sha256(fs.readFileSync(a));
    }
  })(dir);
  const treeHash = sha256(Object.keys(files).sort().map((k) => `${k}\0${files[k]}\n`).join(""));
  return { files, treeHash, fileCount: Object.keys(files).length };
}
function diffManifest(a: any, b: any): string[] {
  const keys = new Set([...Object.keys(a.files), ...Object.keys(b.files)]);
  return [...keys].filter((k) => a.files[k] !== b.files[k]).sort();
}
function inDir<T>(dir: string, f: () => T): T { const prev = process.cwd(); process.chdir(dir); try { return f(); } finally { process.chdir(prev); } }
function runTest(ws: string, test: string): any { return EXEC.defaultRunner(NODE, [test], { cwd: ws, timeoutMs: TEST_TIMEOUT_MS, maxBytes: 1_000_000 }); }

/** Build the throw-away sandbox repo: git init, correct module committed, then the controlled defect injected. */
function buildSandbox(caseDir: string): any {
  const ws = path.join(caseDir, "ws"); const control = path.join(caseDir, "control");
  fs.mkdirSync(path.join(ws, "src"), { recursive: true }); fs.mkdirSync(path.join(ws, "test"), { recursive: true });
  fs.mkdirSync(path.join(control, "seams"), { recursive: true });
  fs.writeFileSync(path.join(ws, "src", "calc.js"), CALC_OK);
  fs.writeFileSync(path.join(ws, TARGET_TEST), TEST_TARGET);
  fs.writeFileSync(path.join(ws, REGRESSION_TEST), TEST_REGRESSION);
  const g = (args: string[]) => cp.execFileSync("git", ["-c", "user.name=odg-sandbox", "-c", "user.email=sandbox@localhost", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: ws, stdio: "ignore" });
  g(["init", "-q"]); g(["add", "-A"]); g(["commit", "-q", "-m", "sandbox: correct calc"]);
  fs.writeFileSync(path.join(ws, "src", "calc.js"), CALC_DEFECT);   // INJECT the controlled defect (uncommitted diff)
  for (const [k, v] of Object.entries(SEAMS)) fs.writeFileSync(path.join(control, "seams", `${k}.js`), v);
  return { ws, control };
}

/** DETECT + DIAGNOSE from the REAL test output. */
function detectAndDiagnose(ws: string): any {
  const t1 = runTest(ws, TARGET_TEST); const t2 = runTest(ws, TARGET_TEST); const reg = runTest(ws, REGRESSION_TEST);
  const out = String(t1.stderr || "") + String(t1.stdout || "");
  const m = /FAIL target (\S+) expected (\S+) got (\S+) \[([^:\]]+):(\w+)\]/.exec(out);
  const detection = SIG.collect({ signals: t1.exitCode !== 0 ? [{ source: "node-test", provenance: `run:${TARGET_TEST}`, kind: "LOGIC", detail: out.trim(), severity: "HIGH" }] : [] });
  const file = m ? m[4] : null;
  const evidence = {
    reproduces: t1.exitCode !== 0 && t2.exitCode !== 0,                          // fails twice, deterministically
    isolated: t1.exitCode !== 0 && reg.exitCode === 0,                           // regression suite green ⇒ fault isolated to `add`
    corroborated: !!(file && fs.existsSync(path.join(ws, file)) && new RegExp(`function ${m![5]}\\b`).test(fs.readFileSync(path.join(ws, file), "utf8"))),
    upstreamCauses: 0, downstreamEffects: 1,
  };
  const plan = PLAN.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [{ id: `logic-defect:${file}:${m ? m[5] : "?"}`, evidence }], allowedWriteSet: WRITE_SET, proposedChanges: [] });
  return {
    detected: t1.exitCode !== 0, confirmedSignals: detection.counts.confirmed,
    failingCase: m ? `${m[1]} expected ${m[2]} got ${m[3]}` : null, file, fn: m ? m[5] : null,
    hypothesisEvidence: evidence, rootCause: plan.rootCause, planVerdict: plan.verdict, regressionBaseline: reg.exitCode === 0 ? "PASS" : "FAIL",
  };
}

/** Call the PROVIDER seam (child process, bounded by defaultRunner timeout). */
function generateCandidate(control: string, seam: string): any {
  const r = EXEC.defaultRunner(NODE, [path.join(control, "seams", `${seam}.js`)], { cwd: control, timeoutMs: SEAM_TIMEOUT_MS, maxBytes: 1_000_000 });
  if (r.timedOut) return { ok: false, kind: "TIMEOUT", detail: `seam exceeded ${SEAM_TIMEOUT_MS}ms — killed (bounded)` };
  if (r.spawnError) return { ok: false, kind: "SPAWN_ERROR", detail: r.spawnError };
  if (r.exitCode !== 0) return { ok: false, kind: "GENERATION_ERROR", detail: `seam exit ${r.exitCode}: ${String(r.stderr || "").trim()}` };
  try { const p = JSON.parse(r.stdout); if (!Array.isArray(p.edits) || p.edits.length === 0) throw new Error("no edits"); return { ok: true, edits: p.edits }; }
  catch (e: any) { return { ok: false, kind: "GENERATION_ERROR", detail: `unparseable seam output: ${e.message}` }; }
}

/** INDEPENDENT verifier — distinct from runRepairWorkflow's acceptance: fresh copy, targeted + regression, confined diff. */
function independentVerify(ws: string, refManifest: any, verifierDir: string): any {
  fs.rmSync(verifierDir, { recursive: true, force: true }); fs.cpSync(ws, verifierDir, { recursive: true });
  const target = runTest(verifierDir, TARGET_TEST); const regression = runTest(verifierDir, REGRESSION_TEST);
  const guard = RW.makeWriteSetGuard(WRITE_SET);
  const changed = diffManifest(refManifest, manifest(ws)); const stray = changed.filter((p) => !guard(p));
  fs.rmSync(verifierDir, { recursive: true, force: true });
  const ok = target.exitCode === 0 && regression.exitCode === 0 && stray.length === 0 && changed.length > 0;
  return { ok, target: target.exitCode === 0 ? "PASS" : "FAIL", regression: regression.exitCode === 0 ? "PASS" : "FAIL", changed, stray,
    detail: (String(target.stderr || "") + String(regression.stderr || "")).trim() || null };
}

/** fdir VERIFIED_ROLLBACK to the checkpoint tree; only with a verified reference (manifest of the copy == recorded). */
function verifiedRollback(ws: string, ckTree: string, ckManifest: any, cleanup: string[] = []): any {
  const refOk = manifest(ckTree).treeHash === ckManifest.treeHash;
  const fd = FDIR.runFdir({ type: "STATE_INCOHERENCE", evidence: "workspace diverges from the verified pre-change checkpoint" }, {
    ctx: { hasVerifiedReference: refOk }, permissions: { canRecover: true },
    recover: () => { fs.rmSync(ws, { recursive: true, force: true }); fs.cpSync(ckTree, ws, { recursive: true }); for (const c of cleanup) fs.rmSync(c, { recursive: true, force: true }); return { ok: true, stateRef: ws }; },
    verify: (ref: string) => ({ ok: manifest(ref).treeHash === ckManifest.treeHash }),
  });
  return { fdirStatus: fd.status, action: fd.action, verified: fd.verified, referenceVerified: refOk };
}

/** One case = one sandbox + one recorded run. */
function runCase(id: number, name: string, seam: string, opts: any = {}): any {
  const t0 = Date.now();
  const caseDir = fs.mkdtempSync(path.join(opts.baseDir || os.tmpdir(), `odg-scen-e-${id}-`));
  const { ws, control } = buildSandbox(caseDir);
  const steps: any[] = []; const step = (s: string, by: string, attribution: string, data: any) => steps.push({ step: s, decidedBy: by, attribution, ...data });
  const mission = `scenario-e-case-${id}`;
  let outcome = "UNDETERMINED"; let decidedBy = ""; const extra: any = {};
  try {
    // 1-2) DETECT + DIAGNOSE
    let ck = inDir(control, () => CK.begin(mission, STAGES).cp);
    ck = inDir(control, () => CK.stageRunning(ck, 0));
    const diag = detectAndDiagnose(ws);
    step("detect", "code-execution.defaultRunner + rce-signal-collector.collect", NATIVE, { detected: diag.detected, confirmedSignals: diag.confirmedSignals });
    inDir(control, () => CK.stageDone(ck, 0));
    step("diagnose", "repair-planner.planRepair (rce-root-cause-intelligence)", NATIVE, { failingCase: diag.failingCase, file: diag.file, fn: diag.fn, rootCause: diag.rootCause, planVerdict: diag.planVerdict, regressionBaseline: diag.regressionBaseline });
    inDir(control, () => CK.stageDone(ck, 1));
    if (!diag.detected || diag.planVerdict !== "PLAN_READY") throw new Error(`precondition: defect not detected/diagnosed (${diag.planVerdict})`);

    // 3) CHECKPOINT before any change
    const ckTree = path.join(control, "checkpoint-tree"); fs.cpSync(ws, ckTree, { recursive: true });
    const ckManifest = manifest(ckTree);
    fs.writeFileSync(path.join(control, "checkpoint-manifest.json"), JSON.stringify(ckManifest));
    inDir(control, () => CK.stageDone(ck, 2));
    step("checkpoint", "checkpoint-engine (stage state) + scenario sha256 tree manifest/copy (rollback reference)", NATIVE, { treeHash: ckManifest.treeHash, fileCount: ckManifest.fileCount });

    // 4) GENERATE — PROVIDER seam
    inDir(control, () => CK.stageRunning(ck, 3));
    const cand = generateCandidate(control, seam);
    step("generate", `scripted seam '${seam}' (no model)`, PROVIDER, { ok: cand.ok, kind: cand.kind || "CANDIDATE", detail: cand.detail || null, paths: cand.ok ? cand.edits.map((e: any) => e.path) : [] });

    const task = (edits: any[]) => ({ workspaceDir: ws, acceptance: { command: [NODE, TARGET_TEST], timeoutMs: TEST_TIMEOUT_MS }, writeSet: WRITE_SET, change: { source: "edits", edits } });

    if (opts.crash && cand.ok) {
      // 6) INTERRUPTION: a child process applies via runRepairWorkflow and is SIGKILLed between apply and verify.
      inDir(control, () => CK.stageDone(ck, 3));
      const authz = PLAN.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [{ id: "h", evidence: diag.hypothesisEvidence }], allowedWriteSet: WRITE_SET, proposedChanges: cand.edits.map((e: any) => e.path) });
      step("authorize", "repair-planner.planRepair (repair-workflow.makeWriteSetGuard)", NATIVE, { verdict: authz.verdict });
      if (authz.verdict !== "PLAN_READY") throw new Error("crash case: candidate not authorized");
      inDir(control, () => { CK.stageDone(ck, 4); CK.stageRunning(ck, 5); });
      const taskFile = path.join(control, "task.json"); fs.writeFileSync(taskFile, JSON.stringify(task(cand.edits)));
      const child = path.join(control, "crash-child.ts");
      fs.writeFileSync(child, `const RW = require(${JSON.stringify(CORE("repair-workflow.js"))});\nconst EXEC = require(${JSON.stringify(CORE("code-execution.js"))});\nlet n = 0;\nRW.runRepairWorkflow(JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")), { runner: (b: any, a: any, o: any) => { n++; if (n === 2) process.kill(process.pid, "SIGKILL"); return EXEC.defaultRunner(b, a, o); } });\n`);
      // node --import tsx (no tsx CLI wrapper) so the SIGKILL is observed on THIS child, not relayed as an exit code.
      const r = cp.spawnSync(NODE, ["--import", "tsx", child, taskFile], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
      const staleSnap = ws + ".snapshot-ws";
      const halfApplied = diffManifest(ckManifest, manifest(ws));
      step("apply(crash)", "simulated fault: child running runRepairWorkflow SIGKILLed after apply, before verify", HARNESS, { childSignal: r.signal, childStatus: r.status, halfAppliedFiles: halfApplied, staleSnapshotLeft: fs.existsSync(staleSnap) });
      // RESTART: checkpoint-engine resume detection; repair-workflow refuses to run over the stale snapshot.
      const ckBefore = inDir(control, () => CK.load());
      const resumed = inDir(control, () => CK.begin(mission, STAGES));
      const retry = RW.runRepairWorkflow(task(cand.edits));
      step("restart", "checkpoint-engine.begin (resume detection) + repair-workflow stale-snapshot guard", NATIVE, { checkpointStatusBefore: ckBefore && ckBefore.status, stageBefore: ckBefore && ckBefore.step ? ckBefore.step.name : null, resumeIndex: resumed.resumeIndex, resumeStage: STAGES[resumed.resumeIndex], retryStatus: retry.status, retryCode: retry.code || null });
      // apply never verified ⇒ never resumed forward: restore the verified pre-change checkpoint.
      const rb = verifiedRollback(ws, ckTree, ckManifest, [staleSnap]);
      const after = manifest(ws);
      step("rollback", "fdir-engine.runFdir VERIFIED_ROLLBACK", NATIVE, rb);
      inDir(control, () => CK.stageFailed(resumed.cp, 5, "interrupted mid-repair; restored to checkpoint"));
      extra.crash = { childSignal: r.signal, halfAppliedFiles: halfApplied, resumeStage: STAGES[resumed.resumeIndex], retryCode: retry.code || null };
      extra.rollback = { identical: after.treeHash === ckManifest.treeHash, treeHash: after.treeHash, staleSnapshotRemoved: !fs.existsSync(staleSnap) };
      outcome = retry.code === "INTERRUPTED_PRIOR_RUN" && rb.fdirStatus === "RECOVERED" && extra.rollback.identical && halfApplied.length > 0 ? "INTERRUPTED_RESTORED" : "INTERRUPTION_NOT_RECOVERED";
      decidedBy = "checkpoint-engine (resume) + repair-workflow (INTERRUPTED_PRIOR_RUN) + fdir-engine (VERIFIED_ROLLBACK)";
    } else {
      // 5-7) AUTHORIZE → APPLY+TEST → INDEPENDENT ACCEPT, all decided by fdir-engine.runFdir over the native components.
      let authz: any = null; let rw: any = null; let iv: any = null;
      const fd = FDIR.runFdir({ type: "CONTRACT_ERROR", severity: 6, evidence: diag.failingCase }, {
        ctx: { maxRetries: 1 }, permissions: { canRecover: diag.planVerdict === "PLAN_READY" },
        recover: () => {
          if (!cand.ok) return { ok: false };
          inDir(control, () => CK.stageDone(ck, 3));
          authz = PLAN.planRepair({ signal: { kind: "LOGIC" }, hypotheses: [{ id: "h", evidence: diag.hypothesisEvidence }], allowedWriteSet: WRITE_SET, proposedChanges: cand.edits.map((e: any) => e.path) });
          if (authz.verdict !== "PLAN_READY") return { ok: false };
          inDir(control, () => { CK.stageDone(ck, 4); CK.stageRunning(ck, 5); });
          rw = RW.runRepairWorkflow(task(cand.edits));
          return { ok: rw.status === "ACCEPTED", stateRef: ws };
        },
        verify: () => { inDir(control, () => CK.stageRunning(ck, 6)); iv = independentVerify(ws, ckManifest, path.join(caseDir, "verifier")); return { ok: iv.ok }; },
      });
      if (authz) step("authorize", "repair-planner.planRepair (repair-workflow.makeWriteSetGuard)", NATIVE, { verdict: authz.verdict, rejected: authz.workspace ? authz.workspace.rejectedChanges : [] });
      if (rw) step("apply+targeted-test", "repair-workflow.runRepairWorkflow", NATIVE, { status: rw.status, code: rw.code || null, baseline: rw.baseline, post: rw.post, rolledBack: rw.rolledBack, changedFiles: rw.changedFiles });
      if (iv) step("independent-acceptance", "independent verifier (fresh copy; targeted+regression via code-execution; confined diff via makeWriteSetGuard) consumed as fdir verify", HARNESS, iv);
      step("decision", "fdir-engine.runFdir", NATIVE, { fdirStatus: fd.status, action: fd.action, verified: fd.verified, operational: fd.operational });

      if (opts.defenseInDepth && cand.ok) {   // 7) the same out-of-write-set change handed straight to runRepairWorkflow
        const direct = RW.runRepairWorkflow(task(cand.edits));
        step("defense-in-depth", "repair-workflow.runRepairWorkflow (direct)", NATIVE, { status: direct.status, code: direct.code || null });
        extra.directRepairWorkflow = { status: direct.status, code: direct.code || null };
      }
      let rb: any = null;
      if (fd.status === "UNVERIFIED") { rb = verifiedRollback(ws, ckTree, ckManifest); step("rollback", "fdir-engine.runFdir VERIFIED_ROLLBACK", NATIVE, rb); }
      const after = manifest(ws);
      extra.rollback = { identical: after.treeHash === ckManifest.treeHash, treeHash: after.treeHash, changedVsCheckpoint: diffManifest(ckManifest, after), by: rb ? "fdir VERIFIED_ROLLBACK" : (rw && rw.rolledBack ? "repair-workflow snapshot restore" : "no change applied") };
      if (opts.tamperControl) {   // 8) negative control: the hash check is not vacuous — a 1-byte change is detected
        const t = path.join(caseDir, "tamper"); fs.cpSync(ws, t, { recursive: true });
        const f = path.join(t, "src", "calc.js"); const b = fs.readFileSync(f); b[b.length - 1] = b[b.length - 1] ^ 1; fs.writeFileSync(f, b);
        const tm = manifest(t); extra.tamperControl = { detected: tm.treeHash !== ckManifest.treeHash, differing: diffManifest(ckManifest, tm) };
      }
      extra.fdir = fd.status;
      if (fd.status === "RECOVERED") { inDir(control, () => { CK.stageDone(ck, 5); CK.stageDone(ck, 6); CK.complete(ck); }); outcome = "ACCEPTED"; decidedBy = "repair-workflow ACCEPTED + independent verifier PASS ⇒ fdir RECOVERED"; }
      else {
        inDir(control, () => CK.stageFailed(ck, 5, fd.reason));
        if (!cand.ok) { outcome = cand.kind === "TIMEOUT" ? "REJECTED_TIMEOUT" : "REJECTED_GENERATION_ERROR"; decidedBy = "code-execution.defaultRunner (seam bounded) ⇒ fdir RECOVERY_FAILED"; }
        else if (authz && authz.verdict !== "PLAN_READY") { outcome = "REFUSED_WRITE_SET"; decidedBy = "repair-planner WRITE_SET_VIOLATION ⇒ fdir RECOVERY_FAILED"; }
        else if (rw && rw.status !== "ACCEPTED") { outcome = "REJECTED_ROLLED_BACK"; decidedBy = `repair-workflow ${rw.status} (own snapshot rollback) ⇒ fdir RECOVERY_FAILED`; }
        else if (fd.status === "UNVERIFIED") { outcome = "REJECTED_ROLLED_BACK"; decidedBy = "independent verifier FAIL ⇒ fdir UNVERIFIED ⇒ fdir VERIFIED_ROLLBACK"; }
        if (!extra.rollback.identical) outcome = "ROLLBACK_FAILED";
      }
      const finalCk = inDir(control, () => CK.load());
      extra.checkpointFinal = finalCk ? finalCk.status : null;
      if (iv) extra.independent = { target: iv.target, regression: iv.regression };
      if (rw) extra.repairWorkflow = { status: rw.status, rolledBack: rw.rolledBack };
    }
  } catch (e: any) { outcome = "ERROR"; decidedBy = `scenario runner: ${(e && e.message) || e}`; }
  finally { if (!opts.keep) fs.rmSync(caseDir, { recursive: true, force: true }); }
  return { id, name, seam, outcome, durationMs: Date.now() - t0, decidedBy, steps, ...extra };
}

const CASES: Array<[number, string, string, any, string]> = [
  [1, "successful repair", "good", {}, "ACCEPTED"],
  [2, "ineffective fix (still failing)", "ineffective", {}, "REJECTED_ROLLED_BACK"],
  [3, "fix passes target but breaks regression", "breaksRegression", {}, "REJECTED_ROLLED_BACK"],
  [4, "generation error (seam returns error)", "genError", {}, "REJECTED_GENERATION_ERROR"],
  [5, "timeout (seam hangs, bounded)", "hang", {}, "REJECTED_TIMEOUT"],
  [6, "interruption mid-repair (crash between apply and verify)", "good", { crash: true }, "INTERRUPTED_RESTORED"],
  [7, "permission refused (change outside write-set)", "outsideWriteSet", { defenseInDepth: true }, "REFUSED_WRITE_SET"],
  [8, "rollback verified by hash (rejected repair + tamper control)", "ineffective", { tamperControl: true }, "REJECTED_ROLLED_BACK"],
];

function runScenarioE(opts: any = {}): any {
  const cases = CASES.map(([id, name, seam, o, expected]) => ({ ...runCase(id, name, seam, { ...o, baseDir: opts.baseDir }), expected }));
  return { cases, allAsExpected: cases.every((c: any) => c.outcome === c.expected) };
}

module.exports = { runScenarioE, runCase, manifest, CASES };

if (require.main === module) {
  const res = runScenarioE();
  for (const c of res.cases) process.stdout.write(`case ${c.id} ${c.outcome.padEnd(26)} ${String(c.durationMs).padStart(6)}ms  ${c.decidedBy}\n`);
  if (process.argv.includes("--write-evidence")) {
    const evPath = path.join(ROOT, "docs", "odg", "evidence", "V150_SCENARIO_E_SELF_HEALING.json");
    const prev = fs.existsSync(evPath) ? JSON.parse(fs.readFileSync(evPath, "utf8")) : {};
    fs.writeFileSync(evPath, JSON.stringify({ ...prev, run: { node: process.version, platform: process.platform, allAsExpected: res.allAsExpected, cases: res.cases } }, null, 2) + "\n");
  }
  process.exit(res.allAsExpected ? 0 : 1);
}
export {};

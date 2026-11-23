#!/usr/bin/env node
// @ts-nocheck — runs under tsx. V15.1 RUN-OUTPUT ISOLATION (opt-in ODG_RUN_OUTPUT_DIR) of the REAL governed odg-run.
//
// HERMETIC: every odg-run below is the REAL compiled pipeline (runtime/dist/bin/odg-run.js, 14 stages → Validation
// Engine verdict → Mission Ledger) executed in a THROW-AWAY os.tmpdir() sandbox (own git repo, own runtime/generated),
// FLEET_BRIDGE_MOCK=1, no network, no provider. The repository's runtime/generated is never written.
// Requires `npm run build:runtime` (CI builds it before test:report).
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const DIST = path.join(REPO, "runtime", "dist");
const ISO = require(path.join(DIST, "core", "run-output-isolation.js"));
const LEDGER = require(path.join(DIST, "core", "mission-ledger.js"));
const tick = require("./odg-schedule-tick.js");

let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "odg-iso-"));
if (TMP.startsWith(REPO + path.sep)) throw new Error("sandbox must live OUTSIDE the repository");
const REAL_GEN = path.join(REPO, "runtime", "generated");
const realGenBefore = fs.existsSync(path.join(REAL_GEN, "mission-ledger.json")) ? fs.statSync(path.join(REAL_GEN, "mission-ledger.json")).mtimeMs : null;

// Paths written by ONE default (unset) governed read-only canary run — captured from origin/main @9ae54e1b (PRE-change
// odg-run) in a fresh sandbox; the post-change default run must write exactly this set (contents: see differential (2)).
const GOLDEN_DEFAULT_PATHS = ["capability-registry.json", "clean-workspace-scan.json", "decision.json", "execution-plan.json", "fidelity-verdict.json", "knowledge.json", "logs/<M>.run.log", "mission-context.json", "mission-interpretation.json", "mission-ledger.json", "mission-lifecycle.json", "mission-plan.json", "mission-report.json", "patch-execution.json", "patch-plan.json", "pipeline-checkpoint.json", "project-context.json", "reports/<M>.final-report.md", "runtime-context.json", "runtime-pipeline.json", "runtime-verify.json", "truth-lock.json"];

const contract = (mission, ws) => ({
  mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
  ...(ws ? { write_set: ws } : {}),
  objectives: [{ id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).", done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } }],
  verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
});
const GIT_ENV = { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
function sandbox(contracts) {
  const sb = fs.mkdtempSync(path.join(TMP, "sb-"));
  for (const d of ["core", "bin", "constitution", "policies", "governance", "brain"]) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  for (const c of contracts) fs.writeFileSync(path.join(sb, "runtime", "missions", c.mission + ".json"), JSON.stringify(c, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nruntime/dist/\nnode_modules/\n");
  const g = (a) => cp.execFileSync("git", ["-c", "user.email=t@l", "-c", "user.name=t", ...a], { cwd: sb, env: GIT_ENV, stdio: ["ignore", "pipe", "ignore"] });
  g(["init", "-q"]); g(["add", "-A"]); g(["commit", "-q", "-m", "baseline"]);
  fs.cpSync(DIST, path.join(sb, "runtime", "dist"), { recursive: true });
  return sb;
}
function runEnv(extra = {}) {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1", ...extra };
  for (const k of ["ODG_FLEET", "ODG_VERBOSE", "ODG_RUNTIME_ENTRY", "ODG_RUN_OUTPUT_DIR", "ODG_RUN_OUTPUT_ROOT", "NODE_OPTIONS", "ODG_STAGE_BASE"]) if (!(k in extra)) delete env[k];
  return env;
}
const runSync = (sb, m, extra) => cp.spawnSync("node", ["runtime/dist/bin/odg-run.js", m], { cwd: sb, encoding: "utf8", env: runEnv(extra) });
function walk(d, b = d, o = []) { if (!fs.existsSync(d)) return o; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f, b, o); else o.push(path.relative(b, f).split(path.sep).join("/")); } return o.sort(); }
const norm = (t, sb, out) => t.split(out || "\u0000").join("<GEN>").split(path.join(sb, "runtime", "generated")).join("<GEN>").split(sb).join("<SB>")
  .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, "<TS>").replace(/\b[0-9a-f]{64}\b/g, "<H>").replace(/\(\d+(\.\d+)?m?s\)/g, "(<D>)").replace(/\d+(\.\d+)?ms\b/g, "<D>");
const readJ = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const ledgerOf = (sb) => readJ(path.join(sb, "runtime", "generated", "mission-ledger.json"));

(async () => {
  // (1) PURE config/classification — fail-closed refusals, inventory classes.
  {
    const root = "/r";
    ok("config: unset/blank ⇒ isolation OFF (null)", ISO.resolveConfig({}, root) === null && ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "  " }, root) === null);
    ok("config: = shared generated / its ancestor / tracked repo space ⇒ REFUSED (throws)", [ "runtime/generated", "runtime", "/r", "src/out" ].every((v) => { try { ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: v }, root); return false; } catch { return true; } }));
    ok("config: under runtime/generated/** or outside the repo ⇒ accepted", ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "runtime/generated/wave-runs/t/A" }, root).out === "/r/runtime/generated/wave-runs/t/A" && ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "/tmp/x" }, root).out === "/tmp/x");
    ok("classify: mission-ledger(.lock/.tmp-*) SHARED; run artifacts + logs/reports PER_RUN; the rest INPUT (read-only fall-through)",
      ["mission-ledger.json", "mission-ledger.json.lock", "mission-ledger.json.tmp-1-2"].every((r) => ISO.classifyRel(r) === "SHARED")
      && ["mission-report.json", "pipeline-checkpoint.json.tmp-9", "logs/x.run.log", "reports/x.md", "truth-lock.json"].every((r) => ISO.classifyRel(r) === "PER_RUN")
      && ["project-context.json", "autonomy/patch-memory.json", "present-state-reconciliation.json"].every((r) => ISO.classifyRel(r) === "INPUT"));
    const ctx = { root, gen: "/r/runtime/generated", out: "/r/runtime/generated/wave-runs/t/A" };
    ok("mapPath: a path inside the run dir or outside generated is untouched; generated paths map to the run dir",
      ISO.mapPath("/r/runtime/generated/wave-runs/t/A/x.json", ctx).kind === "OUTSIDE" && ISO.mapPath("src/a.ts", ctx).kind === "OUTSIDE"
      && ISO.mapPath("runtime/generated/mission-plan.json", ctx).upper === "/r/runtime/generated/wave-runs/t/A/mission-plan.json");
  }

  // (2) DEFAULT PATH UNCHANGED + ISOLATED FIDELITY — same sandbox content, one default run vs one isolated run.
  let tDefault = 0;
  {
    const M = "ISO_GOLDEN_CANARY";
    const sa = sandbox([contract(M)]), sbx = sandbox([contract(M)]);
    const t0 = Date.now(); const ra = runSync(sa, M, {}); tDefault = Date.now() - t0;
    const out = path.join(TMP, "iso-out-golden");
    const rb = runSync(sbx, M, { ODG_RUN_OUTPUT_DIR: out });
    const pa = walk(path.join(sa, "runtime", "generated"));
    ok("default (unset): real governed run exit 0, report SUCCESS+validated", ra.status === 0 && readJ(path.join(sa, "runtime", "generated", "mission-report.json")).validated === true);
    ok(`default (unset): writes EXACTLY the golden ${GOLDEN_DEFAULT_PATHS.length}-path set captured from pre-change origin/main`, JSON.stringify(pa) === JSON.stringify(GOLDEN_DEFAULT_PATHS.map((p) => p.replace("<M>", M))));
    ok("default (unset): no isolation trace (no 'Output dir : ISOLATED' line, no NODE_OPTIONS preload)", !/ISOLATED/.test(ra.stdout));
    const pbShared = walk(path.join(sbx, "runtime", "generated")), pbOut = walk(out);
    ok("isolated: exit 0; shared runtime/generated receives ONLY the shared ledger (+ the absent-input bootstrap seed project-context.json is per-run)", rb.status === 0 && JSON.stringify(pbShared) === '["mission-ledger.json"]');
    ok("isolated: per-run dir ∪ shared ledger = EXACTLY the default path set", JSON.stringify([...pbOut, ...pbShared].sort()) === JSON.stringify(pa));
    let diffs = [];
    for (const f of pbOut) if (norm(fs.readFileSync(path.join(out, f), "utf8"), sbx, out) !== norm(fs.readFileSync(path.join(sa, "runtime", "generated", f), "utf8"), sa)) diffs.push(f);
    if (norm(fs.readFileSync(path.join(sbx, "runtime", "generated", "mission-ledger.json"), "utf8"), sbx) !== norm(fs.readFileSync(path.join(sa, "runtime", "generated", "mission-ledger.json"), "utf8"), sa)) diffs.push("mission-ledger.json");
    // The ONLY expected divergence: the Clean-Workspace OBSERVATION lists transient files via `git ls-files --others
    // --ignored` (a non-node process — physical workspace, not the overlay), so under isolation the run's own outputs are
    // not at runtime/generated/<x> and the candidate list/count differ; its 3 textual echoes (report detail, run-log,
    // final report) carry that count. Every OTHER artifact must be identical.
    const OBSERVATION = new Set(["clean-workspace-scan.json", "mission-report.json", `logs/${M}.run.log`, `reports/${M}.final-report.md`]);
    const strip = (t) => t.replace(/\d+ transient candidate\(s\)/g, "<N> transient candidate(s)").replace(/"candidateCount": \d+/g, '"candidateCount": <N>').replace(/"candidatesScanned": \d+/g, '"candidatesScanned": <N>').replace(/"confirmedCovered": \d+/g, '"confirmedCovered": <N>');
    const echoDiffs = diffs.filter((f) => f !== "clean-workspace-scan.json" && strip(norm(fs.readFileSync(path.join(out, f), "utf8"), sbx, out)) !== strip(norm(fs.readFileSync(path.join(sa, "runtime", "generated", f), "utf8"), sa)));
    ok(`isolated: every artifact identical to the default run after normalising timestamps/hashes/durations/paths, except the git-based workspace observation (diffs: ${JSON.stringify(diffs)}; residual after count-normalisation: ${JSON.stringify(echoDiffs)})`, diffs.every((f) => OBSERVATION.has(f)) && echoDiffs.length === 0);
  }

  // (3) CONCURRENT REAL GOVERNED RUNS via the wave tick (real async spawn, real odg-run, distinct ODG_RUN_OUTPUT_DIR).
  {
    const A = "ISO_CANARY_ALPHA", B = "ISO_CANARY_BRAVO";
    const sb = sandbox([contract(A, ["reports/iso-alpha"]), contract(B, ["reports/iso-bravo"])]);
    const seedRun = runSync(sb, "ISO_SEED_NONE", {}); void seedRun;   // unknown mission: not proven, nothing recorded
    const ledgerBefore = fs.existsSync(path.join(sb, "runtime", "generated", "mission-ledger.json")) ? ledgerOf(sb).count : 0;
    const sharedBefore = new Map(walk(path.join(sb, "runtime", "generated")).map((f) => [f, fs.readFileSync(path.join(sb, "runtime", "generated", f), "utf8")]));
    const logPath = path.join(sb, "attempts.jsonl");
    const d = await tick.tickWave({
      allow: new Set([A, B]), proven: new Set(), loadMission: (id) => { try { return readJ(path.join(sb, "runtime", "missions", id + ".json")); } catch { return null; } },
      runBin: "runtime/dist/bin/odg-run.js", cwd: sb, env: runEnv({}), isolate: true, runOutputBase: path.join(sb, "runtime", "generated", "wave-runs", "t1"),
      logPath, chain: [], timeoutMs: 120000,
    });
    const byId = Object.fromEntries(d.results.map((r) => [r.mission, r]));
    ok("wave+isolation: write-sets are the children's OWN run dirs ⇒ both missions in ONE write-safe sub-wave", JSON.stringify(d.wave) === JSON.stringify([A, B]) && d.deferred.length === 0 && d.contentions.length === 0 && d.isolated === true);
    ok("wave+isolation: both REAL governed runs PASS (report read from each child's own dir)", d.status === "PASS" && byId[A].status === "PASS" && byId[B].status === "PASS");
    const a = byId[A], b = byId[B];
    const overlapMs = Math.min(a.endedAt, b.endedAt) - Math.max(a.startedAt, b.startedAt);
    console.log(`    measured: wave wall ${d.wallMs}ms for 2 real runs; single default run ${tDefault}ms; interval overlap ${overlapMs}ms`);
    ok("wave+isolation: [start,end] intervals OVERLAP ⇒ the two real runs executed CONCURRENTLY", overlapMs > 0);
    for (const [id, dir] of Object.entries(d.runDirs)) {
      const plan = readJ(path.join(dir, "mission-plan.json")), rep = readJ(path.join(dir, "mission-report.json")), chk = readJ(path.join(dir, "pipeline-checkpoint.json"));
      ok(`no clobber: ${id}'s run dir holds ONLY its own plan/report/checkpoint/log/final-report`, plan.mission === id && rep.mission === id && rep.validated === true && chk.mission === id
        && fs.existsSync(path.join(dir, "logs", id + ".run.log")) && fs.existsSync(path.join(dir, "reports", id + ".final-report.md")));
    }
    const sharedAfter = walk(path.join(sb, "runtime", "generated")).filter((f) => !f.startsWith("wave-runs/"));
    const changed = sharedAfter.filter((f) => !sharedBefore.has(f) || sharedBefore.get(f) !== fs.readFileSync(path.join(sb, "runtime", "generated", f), "utf8"));
    ok(`shared runtime/generated: the ONLY changed file is the shared ledger (changed: ${JSON.stringify(changed)})`, JSON.stringify(changed) === '["mission-ledger.json"]');
    const L = ledgerOf(sb), v = LEDGER.verifyLedger(L);
    ok("shared ledger: lock-serialized RMW ⇒ +2 entries (no lost update), one per mission, seal chain verifies", L.count === ledgerBefore + 2 && L.entries.length === L.count && L.entries.slice(-2).map((e) => e.mission).sort().join() === [A, B].sort().join() && v.ok === true && !fs.existsSync(path.join(sb, "runtime", "generated", "mission-ledger.json.lock")));
    const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    ok("shared attempt log: line count = 2 (one per child), every line valid JSON with the default row shape", lines.length === 2 && lines.every((l) => { const r = JSON.parse(l); return JSON.stringify(Object.keys(r)) === '["mission","recordedAt","status","reason"]' && r.status === "PASS"; }));
  }

  // (4) SHARED APPEND-ONLY LOG under REAL process concurrency: N processes × K recordAttempt appends to ONE jsonl.
  {
    const log = path.join(TMP, "concurrent-attempts.jsonl"), N = 6, K = 150;
    const script = `const {recordAttempt}=require(${JSON.stringify(path.join(DIST, "core", "mission-attempt-log.js"))});const w=process.argv[1];for(let i=0;i<${K};i++)recordAttempt(${JSON.stringify(log)},{mission:"W"+w,recordedAt:new Date().toISOString(),status:"PASS",reason:"x".repeat(300)+"#"+i});`;
    await Promise.all(Array.from({ length: N }, (_, w) => new Promise((res) => cp.spawn("node", ["-e", script, String(w)], { stdio: "ignore" }).on("close", res))));
    const lines = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
    let valid = 0; const per = {};
    for (const l of lines) { try { const r = JSON.parse(l); valid++; per[r.mission] = (per[r.mission] || 0) + 1; } catch { /* torn */ } }
    ok(`attempt log: ${N} concurrent writers × ${K} O_APPEND lines ⇒ line count = sum (${lines.length}/${N * K}), every line valid JSON, none torn/interleaved`, lines.length === N * K && valid === N * K && Object.values(per).every((c) => c === K));
  }

  // (5) withExclusiveLock under REAL process concurrency: read-modify-write counter, no lost update.
  {
    const ctr = path.join(TMP, "ctr.json"), lock = ctr + ".lock", N = 5, K = 40;
    fs.writeFileSync(ctr, JSON.stringify({ n: 0 }));
    const script = `const fs=require("fs");const I=require(${JSON.stringify(path.join(DIST, "core", "run-output-isolation.js"))});for(let i=0;i<${K};i++)I.withExclusiveLock(${JSON.stringify(lock)},()=>{const v=JSON.parse(fs.readFileSync(${JSON.stringify(ctr)},"utf8"));fs.writeFileSync(${JSON.stringify(ctr)}+".t",JSON.stringify({n:v.n+1}));fs.renameSync(${JSON.stringify(ctr)}+".t",${JSON.stringify(ctr)});});`;
    await Promise.all(Array.from({ length: N }, () => new Promise((res) => cp.spawn("node", ["-e", script], { stdio: "ignore" }).on("close", res))));
    ok(`withExclusiveLock: ${N} processes × ${K} locked RMW increments ⇒ ${N * K} (got ${readJ(ctr).n}), lock released`, readJ(ctr).n === N * K && !fs.existsSync(lock));
    fs.writeFileSync(lock, "stale"); const old = (Date.now() - 600000) / 1000; fs.utimesSync(lock, old, old);
    ok("withExclusiveLock: a stale lock (crashed holder) is broken, not waited on forever", ISO.withExclusiveLock(lock, () => 42, { staleMs: 1000, timeoutMs: 2000 }) === 42);
    fs.writeFileSync(lock, "held");
    let threw = false; try { ISO.withExclusiveLock(lock, () => 1, { staleMs: 600000, timeoutMs: 150 }); } catch { threw = true; }
    ok("withExclusiveLock: a live lock ⇒ bounded wait then THROW (never proceeds unlocked)", threw); fs.rmSync(lock, { force: true });
  }

  // (6) Wave default contract preserved: an injected runner without opts.isolate ⇒ isolation OFF, shared write-set kept.
  {
    const sel = tick.selectWave(["X1", "X2"], { REC: require(path.join(DIST, "core", "odg-open-mission-recovery.js")), MO: require(path.join(DIST, "core", "odg-mission-orchestrator.js")), loadMission: () => ({ write_set: ["a"] }), waveMax: 2 });
    ok("selectWave without isolation: real-runner shared runtime/generated still serializes (one per sub-wave)", JSON.stringify(sel.subWaves) === '[["X1"],["X2"]]');
    ok("ISOLATED_RUNNER_SHARED_WRITESET is empty (the ledger is lock-serialized, not wave-serialized)", Array.isArray(tick.ISOLATED_RUNNER_SHARED_WRITESET) && tick.ISOLATED_RUNNER_SHARED_WRITESET.length === 0);
  }

  const realGenAfter = fs.existsSync(path.join(REAL_GEN, "mission-ledger.json")) ? fs.statSync(path.join(REAL_GEN, "mission-ledger.json")).mtimeMs : null;
  ok("the repository's own runtime/generated/mission-ledger.json was not touched", realGenBefore === realGenAfter);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`\n${pass} assertions passed`);
})().catch((e) => { console.error(e); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } process.exit(1); });

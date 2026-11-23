#!/usr/bin/env node
// @ts-nocheck — runs under tsx. V15.1 WAVE MODE of odg-schedule-tick (opt-in ODG_TICK_WAVE=1), in a THROW-AWAY state.
//
// ATTRIBUTION (honest): the DECISIONS exercised here are ODG core components — admission = mission-scheduler.schedulerStep
// + canary-decision-pack read-only authorize + proven-dedup; inventory = odg-open-mission-recovery.classifyOpenMission;
// wave = odg-mission-orchestrator.buildDispatchPlan → odg-writeset-contention; outcome = mission-scheduler.classifyDispatch;
// audit = mission-attempt-log.recordAttempt + audit-log chain. The real async cp.spawn path (runGovernedChild) is used.
// The WORKLOAD is a PROVIDER-WRITTEN STUB standing in for odg-run (sleeps, stamps its own [start,end], writes its own
// report) — NO real odg-run / mission is executed, nothing is written under the repo's runtime/generated.
"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const tick = require("./odg-schedule-tick.js");
const AUDIT = require("../core/audit-log.js");

let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "odg-wave-"));
const STUB = path.join(TMP, "stub-odg-run.js");
fs.writeFileSync(STUB, `
const fs = require("fs"), path = require("path");
const id = process.argv[2], dir = process.env.STUB_DIR;
const start = Date.now();
const ms = parseInt(process.env["STUB_SLEEP_" + id] || process.env.STUB_SLEEP_MS || "300", 10);
const fail = (process.env.STUB_FAIL || "").split(",").includes(id);
setTimeout(() => {
  const end = Date.now();
  fs.writeFileSync(path.join(dir, "ts-" + id + ".json"), JSON.stringify({ id, start, end, pid: process.pid }));
  fs.writeFileSync(path.join(dir, "report-" + id + ".json"), JSON.stringify({ mission: id, validated: !fail, status: fail ? "FAIL" : "SUCCESS" }));
  process.exit(fail ? 1 : 0);
}, ms);
`);

let runN = 0;
function freshDir() { const d = path.join(TMP, "run-" + (++runN)); fs.mkdirSync(d); return d; }
const defs = (spec) => (id) => (spec[id] ? { mission: id, mode: "AUDIT", ...spec[id] } : null);
function waveOpts(dir, spec, extra = {}) {
  return {
    allow: new Set(Object.keys(spec)), proven: new Set(), loadMission: defs(spec),
    runBin: STUB, cwd: TMP, env: { ...process.env, STUB_DIR: dir, ...(extra.env || {}) },
    readReport: (id) => JSON.parse(fs.readFileSync(path.join(dir, "report-" + id + ".json"), "utf8")),
    logPath: path.join(dir, "attempts.jsonl"), runnerSharedWriteSet: [], chain: [], timeoutMs: 20000,
    ...extra, env: { ...process.env, STUB_DIR: dir, ...(extra.env || {}) },
  };
}
const stamps = (dir, id) => JSON.parse(fs.readFileSync(path.join(dir, "ts-" + id + ".json"), "utf8"));
const rows = (dir) => fs.readFileSync(path.join(dir, "attempts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ran = (dir, id) => fs.existsSync(path.join(dir, "ts-" + id + ".json"));

// Default-mode golden captured from origin/main @876a8ee5 (pre-change odg-schedule-tick.ts) with these exact scenarios.
const GOLDEN = {"out":[{"status":"IDLE","mission":null,"reason":"no eligible pre-authorized PENDING mission (empty queue)","chainLen":1},{"status":"PASS","mission":"M1","reason":"ok","excellence":{"verdict":"MEETS","staleReferences":[],"openGaps":0,"recommendation":"current practices meet the selected references' adopted principles and all pre-fixed thresholds; keep evidence + re-review at nextReviewDate","admit":true},"chainLen":1},{"status":"IDLE","mission":null,"reason":"no eligible pre-authorized PENDING mission [M1: ALREADY_PROVEN (dedup): M1]","chainLen":1},{"status":"FAIL","mission":"M1","reason":"status FAIL","excellence":{"verdict":"MEETS","staleReferences":[],"openGaps":0,"recommendation":"current practices meet the selected references' adopted principles and all pre-fixed thresholds; keep evidence + re-review at nextReviewDate","admit":true},"chainLen":1},{"status":"FAIL","mission":"M1","reason":"dispatch threw: boom","excellence":{"verdict":"MEETS","staleReferences":[],"openGaps":0,"recommendation":"current practices meet the selected references' adopted principles and all pre-fixed thresholds; keep evidence + re-review at nextReviewDate","admit":true},"chainLen":1},{"status":"BLOCKED","mission":"M1","reason":"AUTHORIZATION_DENIED: CANARY_REFUSES_NON_READONLY: mission id 'M1' is not a valid canonical id; mission is NOT read-only (requiresEngineering/authorizedPaths present) — out of canary scope","chainLen":1},{"status":"BLOCKED","mission":"M1","reason":"AUTHORIZATION_DENIED: CANARY_SPEC_UNAVAILABLE: M1 (no mission definition — refused fail-closed)","chainLen":1}],"rows":[{"mission":"(none)","status":"IDLE","reason":"no eligible pre-authorized PENDING mission (empty queue)"},{"mission":"M1","status":"PASS","reason":"ok"},{"mission":"(none)","status":"IDLE","reason":"no eligible pre-authorized PENDING mission [M1: ALREADY_PROVEN (dedup): M1]"},{"mission":"M1","status":"FAIL","reason":"status FAIL"},{"mission":"M1","status":"FAIL","reason":"dispatch threw: boom"},{"mission":"M1","status":"BLOCKED","reason":"AUTHORIZATION_DENIED: CANARY_REFUSES_NON_READONLY: mission id 'M1' is not a valid canonical id; mission is NOT read-only (requiresEngineering/authorizedPaths present) — out of canary scope"},{"mission":"M1","status":"BLOCKED","reason":"AUTHORIZATION_DENIED: CANARY_SPEC_UNAVAILABLE: M1 (no mission definition — refused fail-closed)"}]};

(async () => {
  // (1) CONCURRENCY: 2 independent read-only canary missions, disjoint declared write-sets ⇒ ONE wave, overlapping intervals.
  {
    const dir = freshDir();
    const d = await tick.tickWave(waveOpts(dir, { W9001: { write_set: ["out/a"] }, W9002: { write_set: ["out/b"] } }, { env: { STUB_SLEEP_MS: "600" } }));
    const a = stamps(dir, "W9001"), b = stamps(dir, "W9002");
    ok("wave: disjoint write-sets ⇒ both in ONE write-safe sub-wave", JSON.stringify(d.wave) === '["W9001","W9002"]' && d.deferred.length === 0);
    ok(`wave: [start,end] intervals OVERLAP (max start ${Math.max(a.start, b.start) - Math.min(a.start, b.start)}ms after min start < min end) ⇒ ran CONCURRENTLY in 2 distinct processes`, Math.max(a.start, b.start) < Math.min(a.end, b.end) && a.pid !== b.pid);
    ok("wave: both PASS via canonical classifyDispatch; tick PASS", d.status === "PASS" && d.results.every((r) => r.status === "PASS"));
    const r = rows(dir);
    ok("wave: each attempt recorded in the REDIRECTED attempt log with the default row shape {mission,recordedAt,status,reason}", r.length === 2 && r.every((x) => JSON.stringify(Object.keys(x)) === '["mission","recordedAt","status","reason"]' && x.status === "PASS"));
    ok("wave: decisions hash-chained + verifiable", d.auditChain.length === 2 && AUDIT.verifyChain(d.auditChain).ok === true);
  }

  // (2) CONFLICT: overlapping write-sets (ancestor containment) ⇒ serialized across ticks, never concurrent.
  {
    const dir = freshDir();
    const spec = { W9003: { write_set: ["out/c"] }, W9004: { write_set: ["out/c/x.json"] } };
    const d1 = await tick.tickWave(waveOpts(dir, spec, { env: { STUB_SLEEP_MS: "200" } }));
    ok("conflict: overlapping pair ⇒ first tick runs ONLY W9003, W9004 deferred (not spawned)", JSON.stringify(d1.wave) === '["W9003"]' && JSON.stringify(d1.deferred) === '["W9004"]' && !ran(dir, "W9004"));
    ok("conflict: contention reported by odg-writeset-contention (WRITESET_OVERLAP)", d1.contentions.length === 1 && d1.contentions[0].reason === "WRITESET_OVERLAP" && JSON.stringify(d1.subWaves) === '[["W9003"],["W9004"]]');
    const d2 = await tick.tickWave(waveOpts(dir, spec, { proven: new Set(["W9003"]), env: { STUB_SLEEP_MS: "200" } }));
    const a = stamps(dir, "W9003"), b = stamps(dir, "W9004");
    ok("conflict: proven W9003 is skipped (dedup as today); next tick runs W9004; intervals DISJOINT (serialized)", JSON.stringify(d2.wave) === '["W9004"]' && a.end <= b.start);
  }

  // (3) FAILURE ISOLATION: a failing child does not affect the other.
  {
    const dir = freshDir();
    const d = await tick.tickWave(waveOpts(dir, { W9005: { write_set: ["out/e"] }, W9006: { write_set: ["out/f"] } }, { env: { STUB_FAIL: "W9005", STUB_SLEEP_W9005: "50", STUB_SLEEP_W9006: "400" } }));
    const byId = Object.fromEntries(d.results.map((r) => [r.mission, r]));
    ok("isolation: failing W9005 ⇒ FAIL, concurrent W9006 still ran to completion ⇒ PASS; tick FAIL (non-zero, no false success)", byId.W9005.status === "FAIL" && byId.W9006.status === "PASS" && ran(dir, "W9006") && d.status === "FAIL");
    const r = rows(dir);
    ok("isolation: both attempts recorded", r.length === 2 && r.some((x) => x.mission === "W9005" && x.status === "FAIL") && r.some((x) => x.mission === "W9006" && x.status === "PASS"));
  }

  // (4) TIMEOUT: a hung child is SIGKILLed at its own timeout; the sibling is unaffected.
  {
    const dir = freshDir();
    const d = await tick.tickWave(waveOpts(dir, { W9007: { write_set: ["out/g"] }, W9008: { write_set: ["out/h"] } }, { timeoutMs: 700, env: { STUB_SLEEP_W9007: "8000", STUB_SLEEP_W9008: "100" } }));
    const byId = Object.fromEntries(d.results.map((r) => [r.mission, r]));
    ok("timeout: hung W9007 killed ⇒ FAIL 'TIMED OUT'; W9008 PASS; tick bounded (<5s)", byId.W9007.status === "FAIL" && /TIMED OUT/.test(byId.W9007.reason) && byId.W9008.status === "PASS" && d.wallMs < 5000);
  }

  // (5) FAIL-CLOSED write-set: REAL runner shared write-set (runtime/generated) or undeclared write-set ⇒ serialized.
  {
    const dir = freshDir();
    const spec = { W9009: { write_set: ["out/i"] }, W9010: { write_set: ["out/j"] } };
    const o = waveOpts(dir, spec, { env: { STUB_SLEEP_MS: "50" } }); delete o.runnerSharedWriteSet;   // default = REAL odg-run shared dir
    const d = await tick.tickWave(o);
    ok("fail-closed: with the REAL odg-run's shared runtime/generated write-set, disjoint declared outputs STILL serialize (wave of 1)", JSON.stringify(d.wave) === '["W9009"]' && d.contentions.length === 1);
    const dir2 = freshDir();
    const d2 = await tick.tickWave(waveOpts(dir2, { W9011: {}, W9012: {} }, { env: { STUB_SLEEP_MS: "50" } }));
    ok("fail-closed: undeclared write-sets ⇒ UNKNOWN ⇒ serialized (wave of 1)", d2.wave.length === 1 && d2.contentions.length === 1 && d2.contentions[0].reason === "UNKNOWN_WRITESET");
  }

  // (6) ADMISSION = the default tick's gates: non-read-only refused + recorded, proven skipped, neither spawned.
  {
    const dir = freshDir();
    const spec = { W9013: { write_set: ["out/k"] }, W9014: { mode: "ENGINEERING", write_set: ["out/l"] }, W9015: { write_set: ["out/m"] } };
    const d = await tick.tickWave(waveOpts(dir, spec, { proven: new Set(["W9015"]), env: { STUB_SLEEP_MS: "50" } }));
    ok("admission: ENGINEERING mission BLOCKED by canary read-only authorize, never spawned", d.refused.length === 1 && d.refused[0].mission === "W9014" && /CANARY_REFUSES_NON_READONLY/.test(d.refused[0].reason) && !ran(dir, "W9014"));
    ok("admission: proven W9015 skipped (dedup), never spawned; W9013 ran", !ran(dir, "W9015") && JSON.stringify(d.wave) === '["W9013"]' && ran(dir, "W9013"));
    const dI = await tick.tickWave(waveOpts(freshDir(), {}, {}));
    ok("admission: empty allowlist ⇒ IDLE, same reason as the default tick, nothing spawned", dI.status === "IDLE" && dI.reason === "no eligible pre-authorized PENDING mission (empty queue)" && dI.wave.length === 0);
    process.env.ODG_SCHEDULER_STOP = "1";
    const dS = await tick.tickWave(waveOpts(freshDir(), spec, {}));
    delete process.env.ODG_SCHEDULER_STOP;
    ok("admission: emergency stop ⇒ STOPPED, nothing spawned", dS.status === "STOPPED" && dS.wave.length === 0);
  }

  // (7) CAP: ODG_TICK_WAVE_MAX bounds concurrency (default 2, hard max 6).
  {
    ok("cap: env parse — unset/garbage ⇒ 2, '3' ⇒ 3, '99' ⇒ 6, '0' ⇒ 2", tick.waveMaxFromEnv(undefined) === 2 && tick.waveMaxFromEnv("x") === 2 && tick.waveMaxFromEnv("3") === 3 && tick.waveMaxFromEnv("99") === 6 && tick.waveMaxFromEnv("0") === 2);
    const dir = freshDir();
    const o = waveOpts(dir, { W9016: { write_set: ["o/1"] }, W9017: { write_set: ["o/2"] }, W9018: { write_set: ["o/3"] } }, { env: { STUB_SLEEP_MS: "50" } }); delete o.waveMax;
    const prev = process.env.ODG_TICK_WAVE_MAX; delete process.env.ODG_TICK_WAVE_MAX;
    const d = await tick.tickWave(o);
    if (prev !== undefined) process.env.ODG_TICK_WAVE_MAX = prev;
    ok("cap: 3 write-safe missions, default cap 2 ⇒ 2 launched, 1 deferred (not spawned)", d.wave.length === 2 && JSON.stringify(d.deferred) === '["W9018"]' && !ran(dir, "W9018"));
  }

  // (8) MEASURED: sequential (default-style: one blocking spawnSync per tick) vs one wave tick, SAME 3 stub missions.
  {
    const SLEEP = 500;
    const spec = { W9021: { write_set: ["p/1"] }, W9022: { write_set: ["p/2"] }, W9023: { write_set: ["p/3"] } };
    const dirS = freshDir();
    const envS = { ...process.env, STUB_DIR: dirS, STUB_SLEEP_MS: String(SLEEP) };
    const proven = new Set();
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) {
      const d = tick.tickOnce({ allow: new Set(Object.keys(spec)), proven, recordAttempt: () => {}, chain: [], loadSpec: (id) => tick.canarySpecFromMission({ mission: id, mode: "AUDIT" }, id),
        dispatch: (item) => { const r = cp.spawnSync("node", [STUB, item.mission], { cwd: TMP, env: envS, encoding: "utf8" }); proven.add(item.mission); return { verified: r.status === 0, detail: "stub" }; } });
      assert.ok(d.status === "PASS");
    }
    const seqMs = Date.now() - t0;
    const dirW = freshDir();
    const t1 = Date.now();
    const d = await tick.tickWave(waveOpts(dirW, spec, { waveMax: 3, env: { STUB_SLEEP_MS: String(SLEEP) } }));
    const waveMs = Date.now() - t1;
    console.log(`  MEASURED (3 stub missions × ${SLEEP}ms): sequential default-style ticks = ${seqMs}ms ; one wave tick (cap 3) = ${waveMs}ms ; speedup ×${(seqMs / waveMs).toFixed(2)}`);
    ok("measured: wave of 3 finishes all 3 PASS and is markedly faster than 3 sequential ticks (< 0.7×)", d.status === "PASS" && d.wave.length === 3 && waveMs < seqMs * 0.7);
  }

  // (9) DEFAULT MODE UNCHANGED — golden comparison of the non-wave tickOnce path vs origin/main @876a8ee5.
  {
    const out = []; const rowsG = [];
    const rec = (d) => rowsG.push({ mission: (d && d.mission) || "(none)", status: d && d.status, reason: d && d.reason });
    const safe = () => ({ safe: true, reason: "golden: read-only" });
    const sc = [
      { allow: new Set(), proven: new Set(), dispatch: () => ({ verified: true }) },
      { allow: new Set(["M1"]), proven: new Set(), dispatch: () => ({ verified: true, detail: "ok" }), assessSafety: safe },
      { allow: new Set(["M1"]), proven: new Set(["M1"]), dispatch: () => ({ verified: true }), assessSafety: safe },
      { allow: new Set(["M1", "M2"]), proven: new Set(), dispatch: () => ({ verified: false, detail: "status FAIL" }), assessSafety: safe },
      { allow: new Set(["M1"]), proven: new Set(), dispatch: () => { throw new Error("boom"); }, assessSafety: safe },
      { allow: new Set(["M1"]), proven: new Set(), dispatch: () => ({ verified: true }), loadSpec: (id) => ({ mission: id, requiresEngineering: true, authorizedPaths: ["x"] }) },
      { allow: new Set(["M1"]), proven: new Set(), dispatch: () => ({ verified: true }), loadSpec: () => null },
    ];
    for (const o of sc) { const d = tick.tickOnce({ ...o, recordAttempt: rec, reviewExcellence: undefined, chain: [] }); const { auditChain, ...rest } = d; out.push({ ...rest, chainLen: (auditChain || []).length }); }
    ok("default: tickOnce decisions + log rows byte-identical to the origin/main golden (7 scenarios)", JSON.stringify({ out, rows: rowsG }) === JSON.stringify(GOLDEN));

    // CLI in a throw-away ROOT (dist symlinked; its own runtime/generated) — default vs ODG_TICK_WAVE=0 vs unset.
    const distBin = path.join(__dirname, "..", "dist", "bin", "odg-schedule-tick.js");
    if (fs.existsSync(distBin)) {
      const runCli = (extraEnv) => {
        const root = fs.mkdtempSync(path.join(TMP, "root-"));
        fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true });
        fs.symlinkSync(path.resolve(__dirname, "..", "dist"), path.join(root, "runtime", "dist"));
        const env = { ...process.env, ODG_TRUTH_LOCK_ENFORCE: "0", ODG_CANARY_ALLOWLIST: "", ...extraEnv };
        delete env.ODG_SCHEDULER_STOP; if (extraEnv.ODG_TICK_WAVE === undefined) delete env.ODG_TICK_WAVE;
        const r = cp.spawnSync("node", [distBin], { cwd: root, env, encoding: "utf8" });
        const log = fs.readFileSync(path.join(root, "runtime", "generated", "mission-attempt-log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { const x = JSON.parse(l); delete x.recordedAt; return x; });
        return { status: r.status, stdout: r.stdout, log };
      };
      const unset = runCli({ ODG_TICK_WAVE: undefined }), zero = runCli({ ODG_TICK_WAVE: "0" });
      ok("default CLI (unit-like env, ODG_TICK_WAVE unset): exit 0, golden stdout line, one IDLE row in its OWN throw-away log", unset.status === 0 && unset.stdout === "[odg-schedule-tick] IDLE — no eligible pre-authorized PENDING mission (empty queue)\n" && JSON.stringify(unset.log) === '[{"mission":"(none)","status":"IDLE","reason":"no eligible pre-authorized PENDING mission (empty queue)"}]');
      ok("default CLI: ODG_TICK_WAVE=0 ≡ unset (only the exact value '1' opts in)", JSON.stringify(zero) === JSON.stringify(unset));
      const wave = runCli({ ODG_TICK_WAVE: "1" });
      ok("opt-in CLI ODG_TICK_WAVE=1: wave entry taken, same IDLE row shape", wave.status === 0 && /^\[odg-schedule-tick wave\] IDLE/.test(wave.stdout) && JSON.stringify(wave.log) === JSON.stringify(unset.log));
    } else console.log("  (skip CLI checks: runtime/dist not built)");
  }

  // (9) V15.5 DECLARED WRITE-SETS — validation (pure), projection honesty, refusal, and ENFORCEMENT of actual writes.
  {
    const V = tick.validateWriteSet;
    const kind = (m) => V(m).kind;
    ok("write_set validation: absent (no key / null mission) ⇒ ABSENT (⇒ UNKNOWN ⇒ serialized)", kind({ mission: "X" }) === "ABSENT" && kind(null) === "ABSENT" && tick.declaredWriteSet({ mission: "X" }) === null);
    const bad = [{ write_set: "mission-report.json" }, { write_set: null }, { write_set: {} }, { write_set: [] }, { write_set: [1] }, { write_set: [null] }, { write_set: [""] }, { write_set: ["  "] }, { write_set: [" a"] },
      { write_set: ["/etc/passwd"] }, { write_set: ["C:/x"] }, { write_set: ["../x"] }, { write_set: ["a/../../x"] }, { write_set: ["a/./b"] }, { write_set: ["."] }, { write_set: ["a\\b"] }, { write_set: ["a\u0000b"] },
      { writeSet: 7 }, { write_set: ["a"], writeSet: ["b"] }];
    ok(`write_set validation: ${bad.length} malformed shapes (non-array, empty, non-string, blank/padded, absolute, drive, '..', '.', backslash, NUL, ambiguous dual key) ⇒ MALFORMED, never DECLARED`, bad.every((m) => kind(m) === "MALFORMED" && tick.declaredWriteSet(m) === null));
    const g = V({ write_set: ["reports//x.md", "logs/", "mission-report.json", "mission-report.json"] });
    ok("write_set validation: well-formed ⇒ DECLARED, normalised (// collapsed, dir '/' kept) and de-duplicated", g.kind === "DECLARED" && JSON.stringify(g.paths) === '["reports/x.md","logs/","mission-report.json"]' && kind({ writeSet: ["a"] }) === "DECLARED" && kind({ write_set: ["a"], writeSet: ["a"] }) === "DECLARED");
    ok("writeSetCovers: exact file or 'dir/' prefix only (no sibling-prefix leak)", tick.writeSetCovers(["logs/", "a.json"], "logs/M.run.log") && tick.writeSetCovers(["a.json"], "a.json") && !tick.writeSetCovers(["a.json"], "a.json.tmp-1") && !tick.writeSetCovers(["logs/"], "logsX/y") && !tick.writeSetCovers(["logs"], "logs/y"));
    const A = tick.auditRunWrites;
    ok("auditRunWrites: ⊆ declared + ledger delta 0/1 ⇒ OK; undeclared file ⇒ VIOLATION; ledger delta 2 ⇒ VIOLATION; no declaration ⇒ UNDECLARED",
      A(["a", "b"], ["a"], 1).status === "OK" && A(["a"], ["a"], 0).status === "OK" && A(["a"], ["a", "z"], 1).status === "VIOLATION" && JSON.stringify(A(["a"], ["a", "z"], 1).undeclared) === '["z"]'
      && A(["a"], ["a"], 2).status === "VIOLATION" && A(["a"], ["a"], -1).status === "VIOLATION" && A(null, ["a"], 1).status === "UNDECLARED");

    // Projection honesty (selectWave, pure): the SAME logical names overlap on the shared root (⇒ serialized) and are
    // disjoint only when each child writes its OWN physical run dir.
    const REC = require(path.join(__dirname, "..", "dist", "core", "odg-open-mission-recovery.js"));
    const MO = require(path.join(__dirname, "..", "dist", "core", "odg-mission-orchestrator.js"));
    const same = (id) => ({ mission: id, mode: "AUDIT", write_set: ["mission-report.json", "logs/" + id + ".run.log"] });
    const sh = tick.selectWave(["S1", "S2"], { REC, MO, loadMission: same, waveMax: 6, runnerSharedWriteSet: [] });
    ok("overlap: identical declared outputs on the SHARED root (no isolation) ⇒ WRITESET_OVERLAP ⇒ serialized", JSON.stringify(sh.subWaves) === '[["S1"],["S2"]]' && sh.contentions[0].reason === "WRITESET_OVERLAP");
    const iso = tick.selectWave(["S1", "S2"], { REC, MO, loadMission: same, waveMax: 6, runnerSharedWriteSet: [], writeRootFor: (id) => "runtime/generated/wave-runs/t/" + id, runnerWriteSetFor: (id) => ["runtime/generated/wave-runs/t/" + id] });
    ok("projection: the same logical outputs under DISTINCT per-run roots ⇒ physically disjoint ⇒ one wave", JSON.stringify(iso.wave) === '["S1","S2"]' && iso.contentions.length === 0);
    const isoU = tick.selectWave(["S1", "S2"], { REC, MO, loadMission: (id) => ({ mission: id, mode: "AUDIT" }), waveMax: 6, runnerSharedWriteSet: [], writeRootFor: (id) => "r/" + id, runnerWriteSetFor: (id) => ["r/" + id] });
    ok("absent write_set ⇒ UNKNOWN ⇒ serialized EVEN WITH distinct isolated run dirs", isoU.wave.length === 1 && isoU.contentions[0].reason === "UNKNOWN_WRITESET");

    // REAL async spawn path, ISOLATED, with a stub that honours ODG_RUN_OUTPUT_DIR (writes its report + extra files there).
    const ISTUB = path.join(TMP, "stub-isolated-run.js");
    fs.writeFileSync(ISTUB, `
const fs = require("fs"), path = require("path");
const id = process.argv[2], out = process.env.ODG_RUN_OUTPUT_DIR;
fs.mkdirSync(path.join(out, "logs"), { recursive: true });
fs.writeFileSync(path.join(out, "logs", id + ".run.log"), "log");
for (const f of (process.env["STUB_EXTRA_" + id] || "").split(",").filter(Boolean)) fs.writeFileSync(path.join(out, f), "x");
const n = parseInt(process.env["STUB_LEDGER_" + id] || "0", 10);
if (n > 0) { const lp = path.join(process.cwd(), "runtime", "generated", "mission-ledger.json"); fs.mkdirSync(path.dirname(lp), { recursive: true });
  let l = { entries: [] }; try { l = JSON.parse(fs.readFileSync(lp, "utf8")); } catch {} for (let i = 0; i < n; i++) l.entries.push({ mission: id, proven: true }); fs.writeFileSync(lp, JSON.stringify(l)); }
const act = (process.env["STUB_ACT_" + id] || "").split(",").filter(Boolean);
const lp = path.join(process.cwd(), "runtime", "generated", "mission-ledger.json");
const rep = JSON.stringify({ mission: id, validated: true, status: "SUCCESS" });
for (const a of act) {
  if (a === "symlink") fs.symlinkSync("/etc/passwd", path.join(out, "decision.json"));
  if (a === "hardlink") { const ext = path.join(process.cwd(), "outside-" + id + ".json"); fs.writeFileSync(ext, "{}"); fs.linkSync(ext, path.join(out, "decision.json")); }
  if (a === "fifo") require("child_process").execFileSync("mkfifo", [path.join(out, "decision.json")]);
  if (a === "foreign") { fs.mkdirSync(path.dirname(lp), { recursive: true }); let l = { entries: [] }; try { l = JSON.parse(fs.readFileSync(lp, "utf8")); } catch {} l.entries.push({ mission: "NOT_IN_WAVE", proven: true }); fs.writeFileSync(lp, JSON.stringify(l)); }
  if (a === "garbleLedger") { fs.mkdirSync(path.dirname(lp), { recursive: true }); fs.writeFileSync(lp, "{not json"); }
  if (a === "unreadableSub") { fs.mkdirSync(path.join(out, "sub")); fs.chmodSync(path.join(out, "sub"), 0); }
}
if (act.includes("symlinkReport")) { const ext = path.join(process.cwd(), "elsewhere-" + id + ".json"); fs.writeFileSync(ext, rep); fs.symlinkSync(ext, path.join(out, "mission-report.json")); }
else fs.writeFileSync(path.join(out, "mission-report.json"), rep);
setTimeout(() => process.exit(0), parseInt(process.env["STUB_SLEEP_" + id] || "150", 10));
`);
    const isoOpts = (dir, spec, env) => ({ ...waveOpts(dir, spec, { env }), runBin: ISTUB, isolate: true, readReport: undefined, cwd: dir, runOutputBase: path.join(dir, "runtime", "generated", "wave-runs", "t") });
    const decl = (id) => ({ write_set: ["mission-report.json", "logs/" + id + ".run.log"] });
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9101: decl("W9101"), W9102: decl("W9102") }, { STUB_EXTRA_W9101: "undeclared.json", STUB_LEDGER_W9102: "1" }));
      const by = Object.fromEntries(d.results.map((r) => [r.mission, r]));
      ok("enforcement: both declared isolated children ran in ONE wave (same logical names, distinct run dirs)", JSON.stringify(d.wave) === '["W9101","W9102"]' && d.isolated === true);
      ok(`enforcement: W9101 left an UNDECLARED file ⇒ FAIL WRITE_SET_VIOLATION although it reported SUCCESS (${by.W9101.reason})`, by.W9101.status === "FAIL" && /^WRITE_SET_VIOLATION: undeclared writes \["undeclared.json"\]/.test(by.W9101.reason) && by.W9101.writeSetCheck.status === "VIOLATION");
      ok("enforcement: compliant sibling W9102 (declared files + exactly ONE ledger entry) ⇒ PASS, check OK; tick FAIL (no false success)", by.W9102.status === "PASS" && by.W9102.writeSetCheck.status === "OK" && by.W9102.writeSetCheck.ledgerDelta === 1 && d.status === "FAIL");
      const r = rows(dir);
      ok("enforcement: the violation is RECORDED in the attempt log (FAIL + WRITE_SET_VIOLATION reason) and in the audit chain", r.some((x) => x.mission === "W9101" && x.status === "FAIL" && /WRITE_SET_VIOLATION/.test(x.reason)) && d.auditChain.length === 2 && AUDIT.verifyChain(d.auditChain).ok === true);
      const sum = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "wave-runs", "t", "wave-summary.json"), "utf8"));
      ok("enforcement: per-tick wave-summary.json carries each child's writeSetCheck", sum.results.length === 2 && sum.results.some((x) => x.mission === "W9101" && x.writeSetCheck.status === "VIOLATION"));
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9103: decl("W9103") }, { STUB_LEDGER_W9103: "2" }));
      ok(`enforcement: a child appending TWO ledger entries (duplicate) ⇒ FAIL WRITE_SET_VIOLATION (${d.results[0].reason})`, d.results[0].status === "FAIL" && /ledger delta 2/.test(d.results[0].reason));
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9104: { write_set: ["../escape.json"] }, W9105: decl("W9105") }, {}));
      ok("refusal: MALFORMED write_set ('..') ⇒ BLOCKED WRITE_SET_MALFORMED, never spawned; the valid sibling still runs", d.refused.length === 1 && d.refused[0].mission === "W9104" && d.refused[0].status === "BLOCKED" && /^WRITE_SET_MALFORMED/.test(d.refused[0].reason)
        && JSON.stringify(d.wave) === '["W9105"]' && !fs.existsSync(path.join(dir, "runtime", "generated", "wave-runs", "t", "W9104")) && d.results[0].status === "PASS");
      const dir2 = freshDir();
      const d2 = await tick.tickWave(isoOpts(dir2, { W9106: { write_set: "mission-report.json" } }, {}));
      ok("refusal: only-mission MALFORMED (non-array) ⇒ tick BLOCKED, nothing spawned", d2.status === "BLOCKED" && d2.wave.length === 0 && /WRITE_SET_MALFORMED: write_set is not an array/.test(d2.refused[0].reason));
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9107: { }, W9108: { } }, {}));
      ok("absent write_set (isolated, real spawn) ⇒ serialized wave of 1, check UNDECLARED (not enforced, not violated)", d.wave.length === 1 && d.results[0].writeSetCheck.status === "UNDECLARED" && d.results[0].status === "PASS");
    }
    // ---- inspection hardening (MED + LOW1..3) ----
    {
      const dir = freshDir();
      const spec = { W9201: decl("W9201"), W9202: decl("W9202"), W9203: decl("W9203") };
      const d = await tick.tickWave({ ...isoOpts(dir, spec, { STUB_ACT_W9201: "symlink", STUB_ACT_W9202: "hardlink", STUB_ACT_W9203: "fifo" }), waveMax: 3 });
      const by = Object.fromEntries(d.results.map((r) => [r.mission, r]));
      ok(`MED: decision.json -> /etc/passwd SYMLINK in the run dir ⇒ FAIL WRITE_SET_VIOLATION (not counted as a declared file) (${by.W9201.reason.slice(0, 90)})`, by.W9201.status === "FAIL" && by.W9201.writeSetCheck.status === "VIOLATION" && /decision\.json \(symlink\)/.test(by.W9201.reason) && !by.W9201.writeSetCheck.actual.includes("decision.json"));
      ok("MED: a HARD-LINKED declared file (nlink 2, inode shared with a file outside the run dir) ⇒ VIOLATION", by.W9202.status === "FAIL" && /hard link, nlink 2/.test(by.W9202.reason));
      ok("MED: a non-regular entry (FIFO) under a declared name ⇒ VIOLATION", by.W9203.status === "FAIL" && /decision\.json \(non-regular\)/.test(by.W9203.reason));
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9204: decl("W9204") }, { STUB_ACT_W9204: "symlinkReport" }));
      ok(`MED: a SYMLINKED mission-report.json (pointing at a SUCCESS report elsewhere) is REFUSED by readReport ⇒ not verified ⇒ FAIL (${d.results[0].reason.slice(0, 80)})`, d.results[0].status === "FAIL" && d.results[0].writeSetCheck.status === "VIOLATION" && /mission-report\.json \(symlink\)/.test(d.results[0].reason));
      const t = path.join(dir, "real.json"); fs.writeFileSync(t, '{"a":1}'); fs.symlinkSync(t, path.join(dir, "ln.json")); fs.linkSync(t, path.join(dir, "hl.json"));
      let e1 = null, e2 = null; try { tick.readRegularJson(path.join(dir, "ln.json")); } catch (e) { e1 = e; } try { tick.readRegularJson(path.join(dir, "hl.json")); } catch (e) { e2 = e; }
      fs.rmSync(path.join(dir, "hl.json")); 
      ok("MED: readRegularJson refuses a symlink (O_NOFOLLOW) and a hard-linked file; reads a plain regular file", e1 && e2 && tick.readRegularJson(t).a === 1);
    }
    {
      const dir = freshDir();
      let gone = false;
      const spec = { W9205: decl("W9205") };
      const o = isoOpts(dir, spec, { STUB_ACT_W9205: "", STUB_EXTRA_W9205: "undeclared.json", STUB_SLEEP_W9205: "400" });
      o.loadMission = (id) => (gone ? null : (spec[id] ? { mission: id, mode: "AUDIT", ...spec[id] } : null));
      const timer = setTimeout(() => { gone = true; }, 150);   // mission definition deleted/broken MID-RUN
      const d = await tick.tickWave(o); clearTimeout(timer);
      ok(`LOW1: write_set captured at selection — a mission JSON deleted mid-run does NOT downgrade to UNDECLARED; the undeclared write is still a VIOLATION (${d.results[0].writeSetCheck.status})`, gone && d.results[0].status === "FAIL" && d.results[0].writeSetCheck.status === "VIOLATION" && JSON.stringify(d.results[0].writeSetCheck.undeclared) === '["undeclared.json"]');
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9206: decl("W9206"), W9207: decl("W9207") }, { STUB_ACT_W9206: "garbleLedger" }));
      ok(`LOW2: ledger unparsable after the wave ⇒ every attempt UNVERIFIABLE ⇒ FAIL, never OK (${d.results[0].reason.slice(0, 70)})`, d.results.length === 2 && d.results.every((r) => r.status === "FAIL" && r.writeSetCheck.status === "UNVERIFIABLE" && /^WRITE_SET_UNVERIFIABLE: ledger unparsable/.test(r.reason)));
      const dir2 = freshDir();
      const d2 = await tick.tickWave(isoOpts(dir2, { W9208: decl("W9208") }, { STUB_ACT_W9208: "unreadableSub" }));
      try { fs.chmodSync(path.join(dir2, "runtime", "generated", "wave-runs", "t", "W9208", "sub"), 0o755); } catch {}
      const rootUser = typeof process.getuid === "function" && process.getuid() === 0;
      ok(`LOW2: an unreadable sub-dir in the run dir ⇒ UNVERIFIABLE ⇒ FAIL${rootUser ? " (skipped: root reads mode-000 dirs)" : ""}`, rootUser || (d2.results[0].status === "FAIL" && d2.results[0].writeSetCheck.status === "UNVERIFIABLE"));
      const miss = tick.inspectRunDir(path.join(dir2, "does-not-exist"));
      ok("LOW2: a missing run dir ⇒ unreadable reported ⇒ auditRunWrites UNVERIFIABLE (not OK by absence)", miss.unreadable && tick.auditRunWrites(["a"], miss.files, 1, { unverifiable: miss.unreadable }).status === "UNVERIFIABLE" && tick.ledgerCounts(path.join(dir2, "nope.json")).ok === true);
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(isoOpts(dir, { W9209: decl("W9209"), W9210: decl("W9210") }, { STUB_ACT_W9209: "foreign" }));
      ok(`LOW3: a ledger append under an id OUTSIDE the wave ⇒ every attempt FAIL LEDGER_FOREIGN_APPEND (distinct reason) (${d.results[1].reason.slice(0, 90)})`, d.results.every((r) => r.status === "FAIL" && r.writeSetCheck.status === "VIOLATION" && /LEDGER_FOREIGN_APPEND: 1 ledger entry/.test(r.reason)));
      ok("LOW3: ledgerForeignDelta = total delta − Σ wave deltas (id-less entries count as foreign)", tick.ledgerForeignDelta({ per: { A: 1 }, total: 1 }, { per: { A: 2, B: 1 }, total: 4 }, ["A"]) === 2 && tick.ledgerForeignDelta({ per: {}, total: 0 }, { per: { A: 1 }, total: 1 }, ["A"]) === 0);
    }
    {
      const dir = freshDir();
      const d = await tick.tickWave(waveOpts(dir, { W9109: { write_set: ["out/q"] } }, { env: { STUB_SLEEP_MS: "50" } }));
      ok("non-isolated wave (injected runner, no per-child dir) ⇒ writeSetCheck NOT_ENFORCED_NON_ISOLATED (stated, not faked)", d.results[0].writeSetCheck.status === "NOT_ENFORCED_NON_ISOLATED" && d.results[0].status === "PASS");
    }
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nODG-SCHEDULE-TICK WAVE — ${pass} assertions passed. (stub workload only; NO real odg-run/mission executed; throw-away state.)`);
})().catch((e) => { console.error(e); process.exit(1); });
export {};

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
// V15.5: the MEASURED output footprint of this sandbox read-only Clean-Workspace mission (run-output-root-relative), declared
// as its write_set — the isolated wave now ENFORCES actual-run-dir-files ⊆ write_set (an undeclared file ⇒ WRITE_SET_VIOLATION).
const FOOT = (id) => ["capability-registry.json", "clean-workspace-scan.json", "decision.json", "execution-plan.json", "fidelity-verdict.json", "knowledge.json",
  "mission-context.json", "mission-interpretation.json", "mission-lifecycle.json", "mission-plan.json", "mission-report.json", "patch-execution.json",
  "patch-plan.json", "pipeline-checkpoint.json", "project-context.json", "runtime-context.json", "runtime-pipeline.json", "runtime-verify.json",
  "truth-lock.json", `logs/${id}.run.log`, `reports/${id}.final-report.md`];
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
const BRIDGE = require(path.join(DIST, "core", "fleet-bridge.js"));
const LEDGER_CUR = (sb) => BRIDGE.currentClaim({ locksDir: path.join(sb, "runtime", "generated", "fleet", "locks") }, "mission-ledger");
const spawnP = (args, o = {}) => new Promise((res) => { const c = cp.spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], ...o }); let out = ""; c.stdout.on("data", (b) => (out += b)); c.stderr.on("data", (b) => (out += b)); c.on("close", (code) => res({ code, out })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // (1) PURE config/classification — fail-closed refusals, inventory classes.
  {
    const root = "/r";
    ok("config: unset/blank ⇒ isolation OFF (null)", ISO.resolveConfig({}, root) === null && ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "  " }, root) === null);
    ok("config: = shared generated / its ancestor / tracked repo space ⇒ REFUSED (throws)", [ "runtime/generated", "runtime", "/r", "src/out" ].every((v) => { try { ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: v }, root); return false; } catch { return true; } }));
    ok("config: under runtime/generated/** or outside the repo ⇒ accepted", ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "runtime/generated/wave-runs/t/A" }, root).out === "/r/runtime/generated/wave-runs/t/A" && ISO.resolveConfig({ ODG_RUN_OUTPUT_DIR: "/tmp/x" }, root).out === "/tmp/x");
    ok("classify: mission-ledger(.tmp-*) + its fleet-bridge claims SHARED; run artifacts + logs/reports PER_RUN; the rest INPUT (read-only fall-through)",
      ["mission-ledger.json", "fleet/locks/mission-ledger.lock.3", "mission-ledger.json.tmp-1-2"].every((r) => ISO.classifyRel(r) === "SHARED")
      && ["mission-report.json", "pipeline-checkpoint.json.tmp-9", "logs/x.run.log", "reports/x.md", "truth-lock.json"].every((r) => ISO.classifyRel(r) === "PER_RUN")
      && ["project-context.json", "autonomy/patch-memory.json", "present-state-reconciliation.json"].every((r) => ISO.classifyRel(r) === "INPUT"));
    const ctx = { root, gen: "/r/runtime/generated", out: "/r/runtime/generated/wave-runs/t/A" };
    ok("mapPath: a path inside the run dir or outside generated is untouched; generated paths map to the run dir",
      ISO.mapPath("/r/runtime/generated/wave-runs/t/A/x.json", ctx).kind === "OUTSIDE" && ISO.mapPath("src/a.ts", ctx).kind === "OUTSIDE"
      && ISO.mapPath("runtime/generated/mission-plan.json", ctx, "/r").upper === "/r/runtime/generated/wave-runs/t/A/mission-plan.json");
    ok("mapPath: RELATIVE paths resolve against the calling process cwd (not the pinned root)",
      ISO.mapPath("generated/x.json", ctx, "/r/runtime").upper === "/r/runtime/generated/wave-runs/t/A/x.json" && ISO.mapPath("runtime/generated/x.json", ctx, "/elsewhere").kind === "OUTSIDE");
  }

  // (2) DEFAULT PATH UNCHANGED + ISOLATED FIDELITY — same sandbox content, one default run vs one isolated run.
  let tDefault = 0;
  {
    const M = "ISO_GOLDEN_CANARY";
    const sa = sandbox([contract(M)]), sbx = sandbox([contract(M)]);
    const t0 = Date.now(); const ra = runSync(sa, M, {}); tDefault = Date.now() - t0;
    const out = path.join(TMP, "iso-out-golden");
    const rb = runSync(sbx, M, { ODG_RUN_OUTPUT_DIR: out });
    const paAll = walk(path.join(sa, "runtime", "generated"));
    const CLAIM = /^fleet\/locks\/mission-ledger\.lock\.\d+$/;
    const claims = paAll.filter((f) => CLAIM.test(f)), pa = paAll.filter((f) => !CLAIM.test(f));
    ok("default (unset): real governed run exit 0, report SUCCESS+validated", ra.status === 0 && readJ(path.join(sa, "runtime", "generated", "mission-report.json")).validated === true);
    ok(`default (unset): writes EXACTLY the golden ${GOLDEN_DEFAULT_PATHS.length}-path set captured from pre-change origin/main`, JSON.stringify(pa) === JSON.stringify(GOLDEN_DEFAULT_PATHS.map((p) => p.replace("<M>", M))));
    ok(`default (unset): the ONLY accepted addition is the ledger's fleet-bridge claim under fleet/locks, RELEASED (mtime=epoch) (${JSON.stringify(claims)})`, claims.length >= 1 && claims.length <= 2 && claims.every((f) => fs.statSync(path.join(sa, "runtime", "generated", f)).mtimeMs === 0));
    ok("default (unset): no isolation trace (no 'Output dir : ISOLATED' line, no NODE_OPTIONS preload)", !/ISOLATED/.test(ra.stdout));
    const pbSharedAll = walk(path.join(sbx, "runtime", "generated")), pbOut = walk(out), pbShared = pbSharedAll.filter((f) => !CLAIM.test(f));
    ok("isolated: exit 0; shared runtime/generated receives ONLY the shared ledger + its claim (the bootstrap seed project-context.json is per-run)", rb.status === 0 && JSON.stringify(pbShared) === '["mission-ledger.json"]' && pbSharedAll.some((f) => CLAIM.test(f)) && !pbOut.some((f) => f.startsWith("fleet/")));
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
    const sb = sandbox([contract(A, FOOT(A)), contract(B, FOOT(B))]);
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
    ok(`V15.5 enforcement on the REAL path: each child's actual run-dir files ⊆ its declared write_set, ledger delta 1 (${JSON.stringify(d.results.map((r) => [r.mission, r.writeSetCheck && r.writeSetCheck.status, r.writeSetCheck && r.writeSetCheck.undeclared, r.writeSetCheck && r.writeSetCheck.ledgerDelta]))})`,
      d.results.every((r) => r.writeSetCheck && r.writeSetCheck.status === "OK" && r.writeSetCheck.undeclared.length === 0 && r.writeSetCheck.ledgerDelta === 1 && r.writeSetCheck.actual.length > 0 && r.writeSetCheck.actual.every((f) => FOOT(r.mission).includes(f))));
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
    const changed = sharedAfter.filter((f) => !/^fleet\/locks\/mission-ledger\.lock\.\d+$/.test(f)).filter((f) => !sharedBefore.has(f) || sharedBefore.get(f) !== fs.readFileSync(path.join(sb, "runtime", "generated", f), "utf8"));
    ok(`shared runtime/generated: the ONLY changed file is the shared ledger (+ its claim generations) (changed: ${JSON.stringify(changed)})`, JSON.stringify(changed) === '["mission-ledger.json"]');
    const L = ledgerOf(sb), v = LEDGER.verifyLedger(L);
    const cur = LEDGER_CUR(sb);
    ok("shared ledger: claim-serialized RMW ⇒ +2 entries (no lost update), one per mission, seal chain verifies, claim released", L.count === ledgerBefore + 2 && L.entries.length === L.count && L.entries.slice(-2).map((e) => e.mission).sort().join() === [A, B].sort().join() && v.ok === true && cur && cur.mtimeMs === 0);
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

  // (5) LEDGER CLAIM (reuses fleet-bridge generation claims) under REAL process concurrency.
  {
    const LJS = JSON.stringify(path.join(DIST, "core", "mission-ledger.js"));
    // (a) claim-serialized read-modify-write counter: N processes × K increments ⇒ no lost update.
    {
      const locksDir = path.join(TMP, "claims-a"), ctr = path.join(TMP, "ctr.json"), N = 5, K = 20;
      fs.writeFileSync(ctr, JSON.stringify({ n: 0 }));
      const script = `const fs=require("fs");const L=require(${LJS});for(let i=0;i<${K};i++)L.withLedgerClaim(()=>{const v=JSON.parse(fs.readFileSync(${JSON.stringify(ctr)},"utf8"));fs.writeFileSync(${JSON.stringify(ctr)}+".t"+process.pid,JSON.stringify({n:v.n+1}));fs.renameSync(${JSON.stringify(ctr)}+".t"+process.pid,${JSON.stringify(ctr)});},{locksDir:${JSON.stringify(locksDir)}});`;
      const rs = await Promise.all(Array.from({ length: N }, () => spawnP(["-e", script])));
      ok(`ledger claim: ${N} processes × ${K} claim-serialized RMW increments ⇒ ${N * K} (got ${readJ(ctr).n}), all exit 0`, readJ(ctr).n === N * K && rs.every((r) => r.code === 0));
    }
    // (b) STALE-CLAIM TAKEOVER RACE: 3 claimants hit one stale generation at the same instant ⇒ exactly ONE holder.
    {
      const locksDir = path.join(TMP, "claims-b"); fs.mkdirSync(locksDir, { recursive: true });
      const stale = path.join(locksDir, "mission-ledger.lock.1"); fs.writeFileSync(stale, JSON.stringify({ pid: 999999, token: "dead" }));
      const old = (Date.now() - 3600000) / 1000; fs.utimesSync(stale, old, old);
      const startAt = Date.now() + 800;
      const script = `const L=require(${LJS});while(Date.now()<${startAt});let c=null;try{c=L.claimLedger({locksDir:${JSON.stringify(locksDir)},timeoutMs:0});}catch(e){console.log("LOST "+e.message.split(":")[0]);process.exit(0);}const t0=Date.now();while(Date.now()-t0<400);console.log("HELD "+c.gen);c.release();`;
      const rs = await Promise.all([0, 1, 2].map(() => spawnP(["-e", script])));
      const held = rs.filter((r) => /^HELD/m.test(r.out)), lost = rs.filter((r) => /^LOST LEDGER_CLAIM_TIMEOUT/m.test(r.out));
      ok(`stale takeover race (3 claimants, same instant): exactly ONE holder, 2 refused (${rs.map((r) => r.out.trim()).join(" | ")})`, held.length === 1 && lost.length === 2);
    }
    // (c) OUTLIVED HOLDER: A outlives its TTL; B takes over; A cannot write (LOST) and its release cannot touch B's claim.
    {
      const locksDir = path.join(TMP, "claims-c"), flag = path.join(TMP, "a-claimed");
      const script = `const fs=require("fs");const L=require(${LJS});const c=L.claimLedger({locksDir:${JSON.stringify(locksDir)},ttlMs:300,marginMs:0});fs.writeFileSync(${JSON.stringify(flag)},String(c.gen));const t0=Date.now();while(Date.now()-t0<900);let r="HELD";try{c.assertHeld();}catch(e){r=e.message.split(":")[0];}c.release();console.log(r);`;
      const pa = spawnP(["-e", script]);
      while (!fs.existsSync(flag)) await sleep(10);
      await sleep(450);   // A's claim is now stale (ttl 300ms) but A is still running
      const pb = spawnP(["-e", `const L=require(${LJS});const c=L.claimLedger({locksDir:${JSON.stringify(locksDir)},ttlMs:300,timeoutMs:0});console.log(JSON.stringify({gen:c.gen}));const t0=Date.now();while(Date.now()-t0<1200);`]);
      const ra = await pa;
      const cur = BRIDGE.currentClaim({ locksDir }, "mission-ledger");
      const bLiveAfterARelease = !!cur && cur.gen === Number(fs.readFileSync(flag, "utf8")) + 1 && cur.mtimeMs > 0;
      const rb = await pb;
      ok(`outlived holder: A ⇒ ${ra.out.trim()} (no write after losing the claim); B ⇒ ${rb.out.trim()}; A's release left B's claim LIVE`, /LEDGER_CLAIM_LOST/.test(ra.out) && bLiveAfterARelease);
    }
    // (d) bounded wait: a LIVE claim held elsewhere ⇒ a clear LEDGER_CLAIM_TIMEOUT, never a hang.
    {
      const locksDir = path.join(TMP, "claims-d"), flag = path.join(TMP, "d-held");
      const pa = spawnP(["-e", `const fs=require("fs");const L=require(${LJS});const c=L.claimLedger({locksDir:${JSON.stringify(locksDir)}});fs.writeFileSync(${JSON.stringify(flag)},"1");const t0=Date.now();while(Date.now()-t0<1500);c.release();`]);
      while (!fs.existsSync(flag)) await sleep(10);
      const t0 = Date.now(); let msg = "";
      try { LEDGER.claimLedger({ locksDir, timeoutMs: 200 }); } catch (e) { msg = e.message; }
      const took = Date.now() - t0;
      ok(`bounded wait: live claim elsewhere ⇒ LEDGER_CLAIM_TIMEOUT after ${took}ms (timeout 200ms), not a hang`, /^LEDGER_CLAIM_TIMEOUT/.test(msg) && took < 2000);
      await pa;
    }
  }

  // (7) DEFAULT odg-run (live mission-runner path, no isolation) CONCURRENT with an isolated wave of 2 ⇒ ledger intact.
  {
    const A = "ISO_MIX_ALPHA", B = "ISO_MIX_BRAVO", C = "ISO_MIX_DEFAULT";
    const sb = sandbox([contract(A, FOOT(A)), contract(B, FOOT(B)), contract(C)]);
    const before = fs.existsSync(path.join(sb, "runtime", "generated", "mission-ledger.json")) ? ledgerOf(sb).count : 0;
    const pDefault = spawnP(["runtime/dist/bin/odg-run.js", C], { cwd: sb, env: runEnv({}) });
    const d = await tick.tickWave({ allow: new Set([A, B]), proven: new Set(), loadMission: (id) => { try { return readJ(path.join(sb, "runtime", "missions", id + ".json")); } catch { return null; } },
      runBin: "runtime/dist/bin/odg-run.js", cwd: sb, env: runEnv({}), isolate: true, runOutputBase: path.join(sb, "runtime", "generated", "wave-runs", "mix"), logPath: path.join(sb, "mix.jsonl"), chain: [], timeoutMs: 120000 });
    const rd = await pDefault;
    const L = ledgerOf(sb), v = LEDGER.verifyLedger(L);
    const counts = [A, B, C].map((m) => L.entries.filter((e) => e.mission === m).length);
    ok(`default + wave concurrent: all 3 runs complete; ledger count = ${before} + 3 = ${L.count}, each mission exactly once, seal chain verifies`, rd.code === 0 && L.count === before + 3 && L.entries.length === L.count && counts.every((c) => c === 1) && v.ok === true);
    // V15.5 LOW3: the default run's append lands INSIDE the wave window (both take ~the same time) ⇒ it is FOREIGN to the
    // wave ⇒ the wave attempts fail closed with LEDGER_FOREIGN_APPEND (the documented root-timer false-positive). Any
    // wave attempt that is not PASS must fail for exactly that reason — never for a lost/duplicated entry.
    ok(`default + wave concurrent: wave attempts are PASS or fail-closed ONLY for LEDGER_FOREIGN_APPEND (${JSON.stringify(d.results.map((r) => [r.mission, r.status, r.writeSetCheck && r.writeSetCheck.status]))})`,
      d.results.length === 2 && d.results.every((r) => r.status === "PASS" || (r.writeSetCheck && r.writeSetCheck.status === "VIOLATION" && /LEDGER_FOREIGN_APPEND/.test(r.reason) && r.writeSetCheck.undeclared.length === 0 && r.writeSetCheck.nonRegular.length === 0 && r.writeSetCheck.ledgerDelta === 1)));
  }

  // (8) fs API COVERAGE — (a) static scan of the odg-run stage closure; (b) the non-trivial APIs exercised under isolation.
  {
    const okFs = new Set([...ISO.PATCHED_APIS.sync, ...ISO.PATCHED_APIS.callback, ...ISO.PATH_FREE_APIS]);
    const okP = new Set([...ISO.PATCHED_APIS.promises, ...ISO.PATH_FREE_APIS]);
    const scan = (src) => {
      const bad = [], used = [], al = [];
      for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(__importStar\(|__importDefault\()?require\("(?:node:)?fs(\/promises)?"\)\)?/g)) al.push({ n: m[2] && m[2].startsWith("__importDefault") ? m[1] + ".default" : m[1], p: !!m[3] });
      for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\("(?:node:)?fs(\/promises)?"\)/g)) for (const n of m[1].split(",").map((x) => x.split(":")[0].trim()).filter(Boolean)) { used.push(n); if (!(m[2] ? okP : okFs).has(n)) bad.push("destructured " + n); }
      for (const a of al) for (const m of src.matchAll(new RegExp("\\b" + a.n.replace(".", "\\.") + "\\.(promises\\.)?(\\w+)", "g"))) { const n = m[2]; used.push(n); if (!((a.p || m[1]) ? okP : okFs).has(n)) bad.push(a.n + "." + (m[1] || "") + n); }
      return { bad, used };
    };
    ok("closure scan self-check: an unpatched path API (fs.fooSync / fsp.lchownX) IS detected", scan('const fs = require("fs");\nconst fsp = require("fs/promises");\nfs.fooSync("runtime/generated/x");fsp.lchownX("a");').bad.length === 2);
    const files = [...fs.readdirSync(path.join(DIST, "core")).filter((f) => f.endsWith(".js")).map((f) => path.join(DIST, "core", f)), path.join(DIST, "bin", "odg-run.js"), path.join(DIST, "bin", "odg-bootstrap.js")];
    const bad = [], usedAll = [];
    for (const f of files) { const r = scan(fs.readFileSync(f, "utf8")); usedAll.push(...r.used); for (const b of r.bad) bad.push(path.basename(f) + ": " + b); }
    ok(`closure scan: ${files.length} dist modules, ${usedAll.length} fs call sites — every fs API used is patched or path-free (unpatched: ${JSON.stringify([...new Set(bad)])})`, bad.length === 0 && usedAll.length > 300);

    const R = fs.mkdtempSync(path.join(TMP, "api-")), OUT = path.join(TMP, "api-out-" + path.basename(R));
    fs.mkdirSync(path.join(R, "runtime", "generated", "seed-dir"), { recursive: true });
    fs.writeFileSync(path.join(R, "runtime", "generated", "seed.txt"), "shared");
    fs.writeFileSync(path.join(R, "runtime", "generated", "seed-dir", "a.txt"), "a");
    const before = walk(path.join(R, "runtime", "generated"));
    const script = `const fs=require("fs"),fsp=require("fs/promises");const G="runtime/generated";(async()=>{
await new Promise((r,j)=>fs.writeFile(G+"/cb.txt","1",(e)=>e?j(e):r()));
await new Promise((r,j)=>fs.appendFile(G+"/cb-append.txt","1",(e)=>e?j(e):r()));
await new Promise((r)=>{const w=fs.createWriteStream(G+"/stream.txt");w.end("s",r);});
const h=await fsp.open(G+"/p-open.txt","w");await h.writeFile("p");await h.close();
await fsp.copyFile(G+"/seed.txt",G+"/p-copy.txt");
fs.symlinkSync("seed.txt",G+"/sym.txt");fs.linkSync(G+"/seed.txt",G+"/hard.txt");
const t=fs.mkdtempSync(G+"/tmp-");fs.writeFileSync(t+"/in.txt","t");
fs.cpSync(G+"/seed-dir",G+"/seed-copy",{recursive:true});
process.chdir("runtime");fs.writeFileSync("generated/rel.txt","rel");
console.log("DONE",fs.readFileSync("generated/rel.txt","utf8"),fs.readFileSync("generated/seed.txt","utf8"));})().catch((e)=>{console.log("ERR",e.message);process.exit(1);});`;
    const r = await spawnP(["--require", path.join(DIST, "core", "run-output-isolation.js"), "-e", script], { cwd: R, env: { ...runEnv({}), ODG_RUN_OUTPUT_DIR: OUT, ODG_RUN_OUTPUT_ROOT: R } });
    const after = walk(path.join(R, "runtime", "generated")), outFiles = walk(OUT);
    const expect = ["cb.txt", "cb-append.txt", "stream.txt", "p-open.txt", "p-copy.txt", "sym.txt", "hard.txt", "rel.txt", "seed-copy/a.txt"];
    ok(`API coverage: callback writeFile/appendFile, createWriteStream, promises.open/copyFile, symlinkSync, linkSync, mkdtempSync, cpSync and a cwd-RELATIVE write all land in the run dir; the shared dir is untouched (${r.out.trim()})`,
      r.code === 0 && /^DONE rel shared/.test(r.out.trim()) && JSON.stringify(after) === JSON.stringify(before) && expect.every((f) => outFiles.includes(f)) && outFiles.some((f) => /^tmp-[^/]+\/in\.txt$/.test(f)));
  }

  // (6) Wave default contract preserved: an injected runner without opts.isolate ⇒ isolation OFF, shared write-set kept.
  {
    const sel = tick.selectWave(["X1", "X2"], { REC: require(path.join(DIST, "core", "odg-open-mission-recovery.js")), MO: require(path.join(DIST, "core", "odg-mission-orchestrator.js")), loadMission: () => ({ write_set: ["a"] }), waveMax: 2 });
    ok("selectWave without isolation: real-runner shared runtime/generated still serializes (one per sub-wave)", JSON.stringify(sel.subWaves) === '[["X1"],["X2"]]');
    ok("ISOLATED_RUNNER_SHARED_WRITESET is empty (the ledger is claim-serialized, not wave-serialized)", Array.isArray(tick.ISOLATED_RUNNER_SHARED_WRITESET) && tick.ISOLATED_RUNNER_SHARED_WRITESET.length === 0);
  }

  const realGenAfter = fs.existsSync(path.join(REAL_GEN, "mission-ledger.json")) ? fs.statSync(path.join(REAL_GEN, "mission-ledger.json")).mtimeMs : null;
  ok("the repository's own runtime/generated/mission-ledger.json was not touched", realGenBefore === realGenAfter);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`\n${pass} assertions passed`);
})().catch((e) => { console.error(e); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } process.exit(1); });

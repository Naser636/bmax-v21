#!/usr/bin/env node
"use strict";
/* V17.6 — tests of runtime/core/odg-go-wave.ts (GO parallel waves on independent write zones). Pure selection on fixtures;
 * detection / integration on a TEMP git repository only (never the ODG repository); no network, no model. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const W = require("./odg-go-wave.js");
const CPOL = require("./odg-concurrency-policy.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@localhost", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@localhost" };
const git = (repo: string, args: string[]) => String(cp.execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: ENV })).trim();

(async () => {
  // 1. selectWave — pure
  {
    const c = (id: string, ws: any, o: any = {}) => ({ id, writeSet: ws, actionable: true, ...o });
    const s = W.selectWave([c("A", ["src/a.js"]), c("B", ["src/b.js"]), c("C", ["src/a.js"]), c("D", undefined), c("E", ["src"]), c("F", ["docs/x.md"])], { k: 3 });
    check("disjoint KNOWN write-sets ⇒ PARALLEL wave in GO's rank order, k bound respected", s.mode === "PARALLEL" && JSON.stringify(s.wave) === JSON.stringify(["A", "B", "F"]));
    const why = (id: string) => (s.excluded.find((x: any) => x.id === id) || {}).reason || "";
    check("overlap (equal path / directory ancestor) ⇒ excluded WRITESET_OVERLAP; UNKNOWN ⇒ excluded WRITESET_UNKNOWN", /^WRITESET_OVERLAP with A/.test(why("C")) && /^WRITESET_OVERLAP/.test(why("E")) && /^WRITESET_UNKNOWN/.test(why("D")));
    check("both canonical components re-verified the wave (contention parallelSafe + planner one wave)", s.verification.contention.parallelSafe === true && s.verification.planner.oneWave === true);
    const s2 = W.selectWave([c("A", ["src/a.js"]), c("B", ["src/b.js"]), c("G", ["src/g.js"])], { k: 2 });
    check("k=2 ⇒ the third disjoint candidate is excluded K_REACHED", JSON.stringify(s2.wave) === JSON.stringify(["A", "B"]) && /^K_REACHED/.test(s2.excluded[0].reason));
    const s3 = W.selectWave([c("U", undefined), c("A", ["src/a.js"])], { k: 3 });
    check("leader with UNKNOWN write-set ⇒ SERIAL (leader alone)", s3.mode === "SERIAL" && JSON.stringify(s3.wave) === JSON.stringify(["U"]) && /LEADER_WRITESET_UNKNOWN/.test(s3.excluded[0].reason));
    const s4 = W.selectWave([c("A", ["src/a.js"]), c("B", ["src/b.js"], { deps: ["A"] })], { k: 3 });
    check("a dependency edge to a member ⇒ excluded (a wave holds no dependent pair)", JSON.stringify(s4.wave) === JSON.stringify(["A"]) && /DEPENDENCY_EDGE/.test(s4.excluded[0].reason));
    const s5 = W.selectWave([c("X", ["a"], { actionable: false, reason: "PROPOSED" }), c("A", ["src/a.js"]), c("B", ["src/b.js"])], { k: 3 });
    check("non-actionable candidates never join (GO-ACT-1 feasibility); first actionable leads", JSON.stringify(s5.wave) === JSON.stringify(["A", "B"]) && /^NOT_ACTIONABLE/.test(s5.excluded[0].reason));
    const s6 = W.selectWave([c("R", ["."]), c("A", ["src/a.js"])], { k: 3 });
    check("repo-root write-set ⇒ UNKNOWN (whole-tree writer) ⇒ SERIAL", s6.mode === "SERIAL" && JSON.stringify(s6.wave) === JSON.stringify(["R"]));
    const idle = { cpuCount: 8, loadavg: CPOL.parseLoadavg("0.1 0.1 0.1"), meminfo: CPOL.parseMeminfo("MemTotal: 16000000 kB\nMemAvailable: 12000000 kB\n"), snapshot: { agents: [] } };
    const dec = CPOL.decide(idle);
    const s7 = W.selectWave([c("A", ["src/a.js"]), c("B", ["src/b.js"]), c("G", ["src/g.js"])], { k: 3, concurrencyDecision: dec });
    check("odg-concurrency-policy admitted builders bound k (default 2)", dec.admit.builders === 2 && s7.k === 2 && s7.wave.length === 2 && /concurrency-policy admitted 2/.test(s7.kBasis));
    const busy = CPOL.decide({ ...idle, loadavg: CPOL.parseLoadavg("99 99 99") });
    const s8 = W.selectWave([c("A", ["src/a.js"]), c("B", ["src/b.js"])], { k: 3, concurrencyDecision: busy });
    check("critical host pressure ⇒ policy admits 0 ⇒ no wave (mode NONE)", busy.admit.builders === 0 && s8.mode === "NONE" && s8.wave.length === 0);
    check("empty / garbage input ⇒ NONE, never throws", W.selectWave(null, { k: 2 }).mode === "NONE" && W.selectWave([{}, null, 3], {}).mode === "NONE");
  }
  // 2. dispatchWave — PARALLEL overlaps, SERIAL does not; a throwing port ⇒ ok:false receipt
  {
    const port = { runItem: (it: any) => new Promise((r) => setTimeout(() => r({ ok: true, commit: "c-" + it.id }), 60)) };
    const par = await W.dispatchWave([{ id: "A" }, { id: "B" }], port, "PARALLEL");
    const ser = await W.dispatchWave([{ id: "A" }, { id: "B" }], port, "SERIAL");
    check("PARALLEL: items overlap in time; SERIAL: no overlap and longer wall time", par.concurrentOverlapMs > 0 && ser.concurrentOverlapMs === 0 && ser.wallMs > par.wallMs && par.receipts.every((r: any) => r.ok));
    const bad = await W.dispatchWave([{ id: "A" }], { runItem: () => { throw new Error("boom"); } }, "PARALLEL");
    check("a throwing port ⇒ receipt ok:false with the error (never throws)", bad.receipts[0].ok === false && /boom/.test(bad.receipts[0].error));
  }
  // 3. detectIncompatibilities + integrate on a TEMP git repo
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-wave-")));
    const repo = path.join(tmp, "r"); fs.mkdirSync(repo);
    git(repo, ["init", "-q", "-b", "main"]);
    fs.mkdirSync(path.join(repo, "src")); fs.writeFileSync(path.join(repo, "src/a.js"), "a0\n"); fs.writeFileSync(path.join(repo, "src/b.js"), "b0\n");
    fs.writeFileSync(path.join(repo, "check.js"), "const fs=require('fs');process.exit(fs.readFileSync('src/a.js','utf8')==='a1\\n'&&fs.readFileSync('src/b.js','utf8')==='b1\\n'?0:1);\n");
    git(repo, ["add", "-A"]); git(repo, ["commit", "-q", "-m", "base"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    const commitOn = (branch: string, files: any) => { git(repo, ["checkout", "-q", "-b", branch, base]); for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(repo, f), v as string); git(repo, ["add", "-A"]); git(repo, ["commit", "-q", "-m", branch]); const h = git(repo, ["rev-parse", "HEAD"]); git(repo, ["checkout", "-q", "main"]); return h; };
    const a1 = commitOn("a1", { "src/a.js": "a1\n" }), b1 = commitOn("b1", { "src/b.js": "b1\n" }), bx = commitOn("bx", { "src/b.js": "b1\n", "src/a.js": "a-by-b\n" });
    const declared = { A: ["src/a.js"], B: ["src/b.js"] };
    const runCheck = (commit: string, ch: any) => W.runCheckInScratch(repo, commit, ch, { tmpRoot: tmp });
    check("git merge-tree --write-tree supported on this host", W.mergeTreeSupported(repo) === true);
    const ok = await W.detectIncompatibilities({ repo, base, receipts: [{ id: "A", ok: true, commit: a1 }, { id: "B", ok: true, commit: b1 }], declared, checks: {}, runCheck });
    check("compatible receipts ⇒ no finding, merge CLEAN with a merge commit", ok.incompatible === false && ok.merge.status === "CLEAN" && /^[0-9a-f]{40}$/.test(ok.merge.commit));
    const integ = await W.integrate({ repo, base, detection: ok, checks: [{ id: "both", argv: ["node", "check.js"] }], runCheck });
    check("integrate ⇒ INTEGRATED_VALIDATED (check exit 0 on the merged commit; change-set = union)", integ.status === "INTEGRATED_VALIDATED" && integ.unionOk === true && JSON.stringify(integ.changedFiles) === JSON.stringify(["src/a.js", "src/b.js"]));
    const failInteg = await W.integrate({ repo, base, detection: ok, checks: [{ id: "f", argv: ["node", "-e", "process.exit(3)"] }], runCheck });
    check("a failing integration check ⇒ INTEGRATION_CHECK_FAILED", failInteg.status === "INTEGRATION_CHECK_FAILED" && failInteg.checks[0].exitCode === 3);
    const bad = await W.detectIncompatibilities({ repo, base, receipts: [{ id: "A", ok: true, commit: a1 }, { id: "B", ok: true, commit: bx }], declared, checks: { A: [{ id: "a-ok", argv: ["node", "-e", "process.exit(0)"] }], B: [{ id: "b-iface", argv: ["node", "-e", "process.exit(1)"] }] }, runCheck });
    const kinds = bad.findings.map((f: any) => f.kind);
    check("write outside the declared set ⇒ WRITESET_VIOLATION + OVERLAPPING_WRITES + MERGE_CONFLICT (git merge-tree exit 1) + CHECK_FAILED", ["WRITESET_VIOLATION", "OVERLAPPING_WRITES", "MERGE_CONFLICT", "CHECK_FAILED"].every((k) => kinds.includes(k)) && bad.merge.status === "CONFLICT" && bad.findings.find((f: any) => f.kind === "MERGE_CONFLICT").files.includes("src/a.js"));
    check("offending = the violator only (leader's receipt kept)", JSON.stringify(bad.offending) === JSON.stringify(["B"]));
    check("integration refused on incompatible receipts", (await W.integrate({ repo, base, detection: bad, checks: [{ id: "x", argv: ["node", "-e", "0"] }], runCheck })).status === "INTEGRATION_REFUSED");
    const nr = await W.detectIncompatibilities({ repo, base, receipts: [{ id: "A", ok: true, commit: a1 }, { id: "B", ok: false, error: "timeout" }], declared, checks: {}, runCheck });
    check("an item without a commit ⇒ NOT_RECEIVED, merge NOT_RUN, offending [B]", nr.findings[0].kind === "NOT_RECEIVED" && nr.merge.status === "NOT_RUN" && JSON.stringify(nr.offending) === JSON.stringify(["B"]));
    const wtl = git(repo, ["worktree", "list"]).split("\n").length;
    check("check scratches are removed (only the main worktree remains)", wtl === 1);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // 4. selectWaveFromState — synthetic state: a plain AUTHORIZED contract ⇒ UNKNOWN write-set (serial only); PROPOSED ⇒ not a candidate
  {
    const contracts = [{ scenario: "P1", state: "AUTHORIZED", authorizedBy: "OWNER test", WORK_ITEM_CONTRACT: { write_set: ["a"] } }, { scenario: "P2", state: "PROPOSED", authorizedBy: null, WORK_ITEM_CONTRACT: { write_set: ["b"] } }];
    const state = { sources: { contracts: { data: { contracts } } } };
    const r = W.selectWaveFromState(state, { items: [{ id: "P1", deps: [] }, { id: "P2", deps: [] }] }, { k: 3 });
    check("plain AUTHORIZED ⇒ candidate with UNKNOWN write-set ⇒ SERIAL; PROPOSED never a candidate", r.mode === "SERIAL" && JSON.stringify(r.wave) === JSON.stringify(["P1"]) && r.candidates.length === 1 && r.candidates[0].writeSet === "UNKNOWN");
  }
  process.stdout.write(failures ? `${failures} FAILED\n` : "ALL PASS — odg-go-wave\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { process.stdout.write("NOT OK - threw " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};

#!/usr/bin/env node
"use strict";
/* V16.4 ODG GO CLI — OFFLINE tests (no network, no model, no provider, no git write): out-dir refusal for the main
 * checkout / runtime/generated / runtime/dist / governance; a real CLI cycle against a NON-git directory is refused at
 * Truth-Lock with a trace confined to --out; allowlist source precedence; pre-registration shape; and, when the committed
 * evidence exists, that its grades follow the pre-registered rules. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("./odg-go.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

(async () => {
  const main = B.mainCheckoutOf(ROOT);
  check("main checkout resolvable from this tree", typeof main === "string" && main.length > 0);
  check("out dir in main checkout runtime/generated ⇒ refused", B.validateOutDir(path.join(main, "runtime", "generated", "go"), ROOT).ok === false);
  check("out dir in main checkout runtime/dist ⇒ refused", B.validateOutDir(path.join(main, "runtime", "dist", "go"), ROOT).ok === false);
  check("out dir anywhere in the main checkout ⇒ refused", B.validateOutDir(path.join(main, "tmp-go"), ROOT).ok === false);
  check("out dir in runtime/governance ⇒ refused", B.validateOutDir(path.join(ROOT, "runtime", "governance", "x"), ROOT).ok === false);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-test-"));
  check("out dir in a temp dir ⇒ allowed", B.validateOutDir(path.join(tmp, "out"), ROOT).ok === true);

  // GO's in-cycle register is built from EXACTLY the canonical loader's sources ⇒ equals the committed register record
  {
    const REG = require("../core/odg-strategic-register.js");
    const SS = require("./odg-strategic-select.ts");
    const st = B.readState(ROOT);
    const canon = SS.loadSources(ROOT);
    check("V17.4/V17.8 readState loads the declared owner order-decision records (committed, recordPath, kind OWNER_ORDER_DECISION; [0] G2→J2, [1] P1 first, [2] P4 first (V19)) and lists them as inputs", B.OWNER_ORDER_DECISIONS.length === 9 && st.ownerOrderDecisions.length === 9 && st.ownerOrderDecisions[4].order.join(",") === "V178-P1-R" && st.ownerOrderDecisions[5].order.join(",") === "V19-EXP-B" && st.ownerOrderDecisions[6].order.join(",") === "V19-MEM-2" && st.ownerOrderDecisions[7].order.join(",") === "V178-P2,V176-NB3" && st.ownerOrderDecisions[8].order.join(",") === "V178-P5,V176-NB3" && st.ownerOrderDecisions[3].order.join(",") === "V178-P4-INT" && st.ownerOrderDecisions[2].order.join(",") === "V178-P4" && st.ownerOrderDecisions[1].order.join(",") === "V178-P1" && st.inputs.some((i: any) => i.source === B.OWNER_ORDER_DECISIONS[1]) && st.ownerOrderDecisions[0].recordPath === B.OWNER_ORDER_DECISIONS[0] && st.ownerOrderDecisions[0].kind === "OWNER_ORDER_DECISION" && st.ownerOrderDecisions[0].order.join(",") === "G2,J2" && st.inputs.some((i: any) => i.source === B.OWNER_ORDER_DECISIONS[0] && /^[0-9a-f]{64}$/.test(String(i.sha256))));
    check("GO register sources = canonical loadSources keys minus inputs (no hand-picked subset)", JSON.stringify(Object.keys(st.sources).sort()) === JSON.stringify(Object.keys(canon).filter((k) => k !== "inputs").sort()));
    const inCycle = JSON.parse(JSON.stringify(REG.buildRegister(st.sources)));
    const committedPath = path.join(ROOT, SS.OUT_REL);
    const committed = JSON.parse(fs.readFileSync(committedPath, "utf8"));
    check("GO in-cycle register (items + criteria scores + sources) equals the committed V164_STRATEGIC_REGISTER register", JSON.stringify(inCycle) === JSON.stringify(committed.register));
    check("GO in-cycle register items equal the committed items (scores included)", JSON.stringify(inCycle.items) === JSON.stringify(committed.register.items));
    const dropped = Object.keys(st.sources).filter((k) => {
      const { [k]: _gone, ...rest } = st.sources;
      try { return JSON.stringify(REG.buildRegister(rest)) === JSON.stringify(inCycle); } catch { return false; }
    });
    // V17.6 (labelled change): sources.outcomeFeedback is consumed by the SELECTOR (odg-outcome-feedback.selectorOptions), not by
    // buildRegister ⇒ it is exempt here and checked below on the selector output instead.
    check("dropping ANY register source key (incl. laterEvidence / benefitEvidence) is detected (register differs or build refuses)", dropped.filter((k) => k !== "outcomeFeedback").length === 0 && ["laterEvidence", "benefitEvidence"].every((k) => k in st.sources));
    {
      const SEL = require("../core/mission-priority-selector.js"); const GOC = require("../core/odg-go-cycle.js");
      const withFb = JSON.stringify(SEL.selectNextExplained(REG.toSelectorCandidates(inCycle), GOC.selectorOptions(st)).ranking);
      const { outcomeFeedback: _fb, ...noFb } = st.sources;
      const without = JSON.stringify(SEL.selectNextExplained(REG.toSelectorCandidates(inCycle), GOC.selectorOptions({ ...st, sources: noFb })).ranking);
      const effective = st.sources.outcomeFeedback.state.active === true && Object.values(st.sources.outcomeFeedback.multipliers || {}).some((m: any) => m !== 1);
      check("V17.6 sources.outcomeFeedback reaches GO's selector: ACTIVE with an attributable multiplier ⇒ dropping it changes the ranking scores; OFF or all ×1 ⇒ identical", "outcomeFeedback" in st.sources && (effective ? withFb !== without : withFb === without));
      check("V17.6 GO SELECT ranking (with outcome feedback) equals the committed register ranking", withFb === JSON.stringify(committed.decision.ranking));
    }
  }

  // a refused out dir exits 2 and writes nothing
  const bad = path.join(main, "runtime", "generated", "odg-go-should-not-exist");
  const rb = await B.runOnce(["--repo", ROOT, "--out", bad]);
  check("refused out dir ⇒ exit 2, nothing created", rb.code === 2 && !fs.existsSync(bad));

  // a real CLI cycle on a NON-git state dir ⇒ Truth-Lock refuses (fail-closed), trace confined to --out
  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-norepo-"));
  const out = path.join(tmp, "out");
  const r = await B.runOnce(["--repo", notRepo, "--out", out, "--execute"]);
  check("non-git state repo ⇒ STARTUP_REFUSED, exit 2", r.code === 2 && r.result.status === "STARTUP_REFUSED");
  check("refused cycle traced (CYCLE_START, TRUTH_LOCK REFUSED, CYCLE_END)", (() => { const t = fs.readFileSync(path.join(out, "go-trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); return t[0].kind === "CYCLE_START" && t[1].step === "TRUTH_LOCK" && t[1].status === "REFUSED" && t[t.length - 1].status === "STARTUP_REFUSED"; })());
  check("every write is inside --out", r.writes.length > 0 && r.writes.every((w: string) => w.startsWith(path.resolve(out) + path.sep)));
  check("no dispatch on refusal", r.result.dispatchCalls === 0 && r.result.providerLaunched === 0);

  // STOP file present before the run ⇒ STOPPED before TRUTH_LOCK, exit 3
  const out2 = path.join(tmp, "out2"); fs.mkdirSync(out2, { recursive: true }); fs.writeFileSync(path.join(out2, "STOP"), "x");
  const r2 = await B.runOnce(["--repo", notRepo, "--out", out2]);
  check("STOP file ⇒ STOPPED (STOP_FILE), exit 3, no step run", r2.code === 3 && r2.result.status === "STOPPED" && r2.result.stop.reason === "STOP_FILE" && r2.result.steps.length === 0);

  // ---- symlink / traversal confinement (REINFORCED inspection regression) ----
  {
    const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-link-")));
    const target = path.join(T, "victim-dir"); fs.mkdirSync(target);
    const link = path.join(T, "out-link"); fs.symlinkSync(target, link);
    check("symlinked out dir ⇒ refused by validateOutDir", B.validateOutDir(link, ROOT).ok === false);
    const rl = await B.runOnce(["--repo", notRepo, "--out", link]);
    check("symlinked out dir ⇒ runOnce exit 2, nothing written through the link", rl.code === 2 && fs.readdirSync(target).length === 0);
    const genLink = path.join(T, "gen-link"); fs.symlinkSync(path.join(main, "runtime", "generated"), genLink);
    check("symlink to the main checkout runtime/generated ⇒ refused", B.validateOutDir(genLink, ROOT).ok === false && B.validateOutDir(path.join(genLink, "sub"), ROOT).ok === false);
    const midLink = path.join(T, "mid-link"); fs.symlinkSync(target, midLink);
    check("symlinked INTERMEDIATE dir ⇒ refused", B.validateOutDir(path.join(midLink, "a", "b"), ROOT).ok === false);
    const ro = await B.runOnce(["--repo", notRepo, "--out", path.join(midLink, "a")]);
    check("symlinked intermediate dir ⇒ runOnce exit 2, target untouched", ro.code === 2 && fs.readdirSync(target).length === 0);
    const realOut = path.join(T, "real-out"); fs.mkdirSync(realOut);
    const victim = path.join(T, "victim.txt"); fs.writeFileSync(victim, "orig");
    fs.symlinkSync(victim, path.join(realOut, "go-trace.jsonl"));
    const forb = B.forbiddenRoots(ROOT);
    const thrown = (fn: () => void) => { try { fn(); return ""; } catch (e: any) { return String(e.message); } };
    check("symlinked FINAL file ⇒ safeWrite refuses, victim unchanged", /SYMLINK_TARGET_REFUSED|ELOOP/.test(thrown(() => B.safeWrite(path.join(realOut, "go-trace.jsonl"), "x\n", "append", realOut, forb))) && fs.readFileSync(victim, "utf8") === "orig");
    let rejected = false; let rf: any = null; try { rf = await B.runOnce(["--repo", notRepo, "--out", realOut]); } catch { rejected = true; }
    check("symlinked final trace file ⇒ real cycle refuses to write through it: clean REFUSED exit 4 (GO-WR-1), no throw", !rejected && rf.code === B.WRITE_REFUSED_EXIT && rf.code === 4 && rf.result.status === "REFUSED" && fs.readFileSync(victim, "utf8") === "orig");
    check("symlinked final trace file ⇒ out dir still validates ⇒ final record attempted (trace refused again, summary written)", rf.result.outDirStillValid === true && rf.result.traceWritten === false && rf.result.summaryWritten === true && JSON.parse(fs.readFileSync(path.join(realOut, "go-cycle.json"), "utf8")).status === "REFUSED");
    // GO-WR-1: --out swapped for a symlink AFTER validation (mid-run) ⇒ REFUSED exit 4, nothing written into the swap target
    {
      const swapOut = path.join(T, "swap-out"); const swapTarget = path.join(T, "swap-target"); fs.mkdirSync(swapTarget);
      const errs: string[] = []; const origErr = process.stderr.write.bind(process.stderr);
      (process.stderr as any).write = (c: any) => { errs.push(String(c)); return true; };
      let sw: any = null; let threw = false;
      try {
        const pr = B.runOnce(["--repo", notRepo, "--out", swapOut, "--step-delay-ms", "200"]);   // CYCLE_START + TRUTH_LOCK written, now paused
        fs.renameSync(swapOut, swapOut + ".orig"); fs.symlinkSync(swapTarget, swapOut);       // the swap, after validation
        sw = await pr;
      } catch { threw = true; } finally { (process.stderr as any).write = origErr; }
      check("swap-after-validate ⇒ resolves (no throw), status REFUSED, exit code 4", !threw && sw && sw.code === 4 && sw.result.status === "REFUSED");
      check("swap-after-validate ⇒ nothing written into the swap target", fs.readdirSync(swapTarget).length === 0);
      check("swap-after-validate ⇒ final record skipped (out dir no longer validates)", sw && sw.result.outDirStillValid === false && sw.result.traceWritten === undefined);
      check("swap-after-validate ⇒ one-line REFUSED reason on stderr, no stack trace", errs.length === 1 && /^REFUSED: write refused mid-run/.test(errs[0]) && errs[0].trim().split("\n").length === 1 && !/\n\s+at /.test(errs[0]));
      check("swap-after-validate ⇒ the pre-swap trace (in the original dir) has no CYCLE_END", !fs.readFileSync(path.join(swapOut + ".orig", "go-trace.jsonl"), "utf8").includes("CYCLE_END"));
      check("GO-WR-1 rule states the realpath→open O_NOFOLLOW residual", /O_NOFOLLOW covers only the FINAL component/.test(B.WRITE_REFUSAL_RULE) && /openat/.test(B.WRITE_REFUSAL_RULE));
    }
    // process level: the real CLI exits 4 with no stack trace on a mid-run write refusal
    {
      const cp = require("child_process");
      const pOut = path.join(T, "proc-out"); fs.mkdirSync(pOut); const v2 = path.join(T, "victim2.txt"); fs.writeFileSync(v2, "orig");
      fs.symlinkSync(v2, path.join(pOut, "go-trace.jsonl"));
      const pr = cp.spawnSync(process.execPath, [...process.execArgv, path.join(__dirname, "odg-go.ts"), "--repo", notRepo, "--out", pOut], { encoding: "utf8", timeout: 60000 });
      check("CLI process: mid-run write refusal ⇒ exit 4, one-line REFUSED stderr, no stack, victim unchanged", pr.status === 4 && /^REFUSED: /.test(pr.stderr) && !/\n\s+at |odg-go error/.test(pr.stderr) && fs.readFileSync(v2, "utf8") === "orig");
    }
    // CLI flags: --help/-h ⇒ usage, exit 0, no cycle; unknown flag ⇒ usage on stderr, exit 2, no cycle
    {
      const cp = require("child_process");
      const hOut = path.join(T, "help-out"); fs.mkdirSync(hOut);
      const run = (...a: string[]) => cp.spawnSync(process.execPath, [...process.execArgv, path.join(__dirname, "odg-go.ts"), ...a], { encoding: "utf8", timeout: 60000 });
      for (const h of ["--help", "-h"]) {
        const pr = run(h, "--repo", notRepo, "--out", hOut);
        check(`CLI ${h} ⇒ usage on stdout, exit 0, no cycle (no trace written)`, pr.status === 0 && /^Usage:/.test(pr.stdout) && !/"status"/.test(pr.stdout) && fs.readdirSync(hOut).length === 0);
      }
      const bad = run("--repo", notRepo, "--out", hOut, "--exectue");
      check("CLI unknown flag ⇒ usage on stderr, exit 2, no cycle (no trace written)", bad.status === 2 && /unknown argument: --exectue/.test(bad.stderr) && /Usage:/.test(bad.stderr) && bad.stdout === "" && fs.readdirSync(hOut).length === 0);
      const miss = run("--out");
      check("CLI value flag missing its value ⇒ exit 2, no cycle", miss.status === 2 && /requires a value/.test(miss.stderr));
      check("parseCliFlags accepts every documented flag", B.parseCliFlags(["--dry", "--execute", "--resume", "--allow-unsandboxed-target", "--repo", "x", "--out", "y", "--max-steps", "3", "--deadline-ms", "9", "--scratch", "s", "--step-delay-ms", "1", "--evidence-out", "e"]).error === null);
    }
    check("'..' traversal ⇒ safeWrite refuses", /WRITE_OUTSIDE_OUT_DIR|WRITE_PARENT_NOT_OUT_DIR/.test(thrown(() => B.safeWrite(path.join(realOut, "..", "evil.txt"), "x", "truncate", realOut, forb))) && !fs.existsSync(path.join(T, "evil.txt")));
    fs.mkdirSync(path.join(realOut, "sub"));
    check("write into a sub-dir (parent ≠ out dir) ⇒ refused", /WRITE_PARENT_NOT_OUT_DIR/.test(thrown(() => B.safeWrite(path.join(realOut, "sub", "f"), "x", "truncate", realOut, forb))));
    check("plain write inside the physical out dir ⇒ allowed", thrown(() => B.safeWrite(path.join(realOut, "ok.json"), "{}", "truncate", realOut, forb)) === "" && fs.readFileSync(path.join(realOut, "ok.json"), "utf8") === "{}");
    check("out dir inside the code tree ⇒ refused", B.validateOutDir(path.join(ROOT, "docs", "go-out"), ROOT).ok === false);
  }

  // ---- allowlist: installed unit authoritative, env may only NARROW ----
  {
    const T = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-unit-"));
    const unit = path.join(T, "u.service"); fs.writeFileSync(unit, "[Service]\nEnvironment=ODG_CANARY_ALLOWLIST=M0001,M9\n");
    const U = [[unit, "test unit"]];
    check("no env ⇒ unit allowlist", B.readAllowlist({ unitPaths: U, env: {} }).ids.join(",") === "M0001,M9");
    const n = B.readAllowlist({ unitPaths: U, env: { ODG_CANARY_ALLOWLIST: "M9,MX" } });
    check("env narrows (intersection) and can never widen", n.ids.join(",") === "M9" && n.refusedWidening.join(",") === "MX");
    check("env '' ⇒ empty (narrowed to nothing)", B.readAllowlist({ unitPaths: U, env: { ODG_CANARY_ALLOWLIST: "" } }).ids.length === 0);
    check("no unit ⇒ env cannot create an allowlist", B.readAllowlist({ unitPaths: [[path.join(T, "absent"), "x"]], env: { ODG_CANARY_ALLOWLIST: "M1" } }).ids.length === 0);
  }

  // ---- --execute scratch worktree must be fresh + unshared ----
  {
    const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-wt-")));
    const g = (cwd: string, ...a: string[]) => require("child_process").execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString();
    const repo = path.join(T, "repo"); fs.mkdirSync(path.join(repo, "runtime", "missions"), { recursive: true });
    fs.writeFileSync(path.join(repo, "runtime", "missions", "MX.json"), "{}");
    g(repo, "init", "-q", "-b", "main"); g(repo, "add", "."); g(repo, "commit", "-q", "-m", "c");
    const wt = path.join(T, "scratch"); g(repo, "worktree", "add", "-q", "--detach", wt);
    check("fresh detached clean linked worktree ⇒ isolated ok", B.isolationCheck(wt, "MX", ROOT).ok === true);
    check("main checkout as scratch ⇒ refused", B.isolationCheck(repo, "MX", ROOT).ok === false);
    check("this code tree as scratch ⇒ refused", B.isolationCheck(ROOT, "MX", ROOT).ok === false);
    check("missing mission file ⇒ NOT_RUNNABLE", /NOT_RUNNABLE/.test(B.isolationCheck(wt, "NOPE", ROOT).reason));
    // GO-DT-1: a declared dispatch target replaces the missions/<id>.json runnability check; odg-run is never the fallback
    const T1 = { command: "runtime/bin/exp.ts", args: ["out/e.json"], writeSet: ["out/e.json"] };
    check("GO-DT-1: declared target absent in scratch ⇒ NOT_RUNNABLE even though runtime/missions/MX.json exists", /NOT_RUNNABLE: declared dispatch target/.test(B.isolationCheck(wt, "MX", ROOT, T1).reason));
    check("GO-DT-1: dispatchArgv with target ⇒ exactly the declared command; without ⇒ odg-run <id> (plain AUTHORIZED path)", B.dispatchArgv({ mission: "G" }, { dispatchTarget: T1 }).join(" ") === "tsx runtime/bin/exp.ts out/e.json" && B.dispatchArgv({ mission: "MX" }, {}).join(" ") === "tsx runtime/bin/odg-run.ts MX");
    check("GO-DTO-1 LOW-2: plain dispatch timeout unchanged 600000; a declared target's timeout is accepted only as a positive integer ≤ the 12 h ceiling, otherwise null (⇒ refused, never a silent 600000)", B.DISPATCH_TIMEOUT_MS === 600000 && B.targetTimeoutMs({ dispatchTimeoutMs: 43200000 }) === 43200000 && B.targetTimeoutMs({}) === null && B.targetTimeoutMs({ dispatchTimeoutMs: 43200001 }) === null && B.targetTimeoutMs({ dispatchTimeoutMs: "9" }) === null && B.targetTimeoutMs({ dispatchTimeoutMs: -5 }) === null && B.targetTimeoutMs({ dispatchTimeoutMs: 1.5 }) === null);
    fs.mkdirSync(path.join(wt, "out")); fs.writeFileSync(path.join(wt, "out", "e.json"), "{}");
    check("GO-DT-1: writes ⊆ target writeSet ⇒ confined", B.targetWriteConfinement(wt, T1).ok === true);
    fs.writeFileSync(path.join(wt, "out", "other.json"), "{}");
    check("GO-DT-1: write outside the target writeSet ⇒ WRITE_OUTSIDE_TARGET_WRITE_SET", /WRITE_OUTSIDE_TARGET_WRITE_SET: out\/other\.json/.test(B.targetWriteConfinement(wt, T1).reason));
    fs.rmSync(path.join(wt, "out", "other.json"));
    // gitignored writes (runtime/generated, dist) are NOT hidden from the confinement check
    fs.writeFileSync(path.join(wt, ".gitignore"), "runtime/generated/\ndist/\n"); g(wt, "add", ".gitignore"); g(wt, "commit", "-q", "-m", "ignore");
    fs.mkdirSync(path.join(wt, "runtime", "generated"), { recursive: true }); fs.writeFileSync(path.join(wt, "runtime", "generated", "x.json"), "{}");
    check("GO-DT-1: runner writing gitignored runtime/generated/x ⇒ WRITE_OUTSIDE_TARGET_WRITE_SET", /WRITE_OUTSIDE_TARGET_WRITE_SET: .*runtime\/generated\/x\.json/.test(String(B.targetWriteConfinement(wt, T1).reason)));
    fs.rmSync(path.join(wt, "runtime", "generated"), { recursive: true });
    fs.mkdirSync(path.join(wt, "dist")); fs.writeFileSync(path.join(wt, "dist", "a.js"), "x");
    check("GO-DT-1: runner writing an ignored dist file ⇒ WRITE_OUTSIDE_TARGET_WRITE_SET", /WRITE_OUTSIDE_TARGET_WRITE_SET: .*dist\/a\.js/.test(String(B.targetWriteConfinement(wt, T1).reason)));
    fs.rmSync(path.join(wt, "out"), { recursive: true });
    check("GO-DT-1: non-pristine scratch (ignored dist entry) refused for a declared target", /not pristine/.test(B.isolationCheck(wt, "MX", ROOT, T1).reason));
    fs.rmSync(path.join(wt, "dist"), { recursive: true });
    check("GO-DT-1: parsePorcelainZ keeps the status column and BOTH rename sides", B.parsePorcelainZ(" M a.ts\0R  new.ts\0old.ts\0!! runtime/generated/x\0").join(",") === "a.ts,new.ts,old.ts,runtime/generated/x");
    g(wt, "reset", "-q", "--hard", "HEAD~1");
    fs.writeFileSync(path.join(wt, "dirty.txt"), "x");
    check("dirty (untracked) scratch ⇒ refused (shared/used)", /not clean/.test(B.isolationCheck(wt, "MX", ROOT).reason));
    fs.rmSync(path.join(wt, "dirty.txt"));
    fs.mkdirSync(path.join(wt, "runtime", "generated"));
    check("scratch with runtime/generated (used before) ⇒ refused", /not fresh|not clean/.test(B.isolationCheck(wt, "MX", ROOT).reason));
    fs.rmSync(path.join(wt, "runtime", "generated"), { recursive: true });
    g(wt, "checkout", "-q", "-b", "someone-branch");
    check("scratch on a branch (active working worktree) ⇒ refused", /on a branch/.test(B.isolationCheck(wt, "MX", ROOT).reason));
    const wl = path.join(T, "wt-link"); fs.symlinkSync(wt, wl);
    check("symlinked scratch path ⇒ refused", /symlink/.test(B.isolationCheck(wl, "MX", ROOT).reason));
  }

  // pre-registration
  check("pre-registered I1..I4", B.PRE_REGISTERED.I.criteria.map((c: any) => c.id).join(",") === "I1,I2,I3,I4");
  check("pre-registered J1..J8", B.PRE_REGISTERED.J.criteria.map((c: any) => c.id).join(",") === "J1,J2,J3,J4,J5,J6,J7,J8");

  // committed evidence (host-independent structural checks)
  const evp = path.join(ROOT, B.EVIDENCE_REL);
  if (fs.existsSync(evp)) {
    const ev = JSON.parse(fs.readFileSync(evp, "utf8"));
    check("evidence pre-registration recorded verbatim", JSON.stringify(ev.preRegistration) === JSON.stringify(B.PRE_REGISTERED));
    const jr = ev.scenarioJ.results;
    const jFail = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"].some((k) => jr[k] === "FAIL");
    check("J grade follows the declared rule", ev.scenarioJ.grade === (jFail ? "FAIL" : jr.J8 === "PASS" ? "PASS" : "PARTIAL"));
    const ir = ev.scenarioI.results;
    check("I grade follows the declared rule", ev.scenarioI.grade === (ir.I1 === "FAIL" ? "FAIL" : ["I2", "I3", "I4"].every((k) => ir[k] === "PASS") ? "PASS" : "PARTIAL"));
    check("real dry trace has the 10 steps in order", ev.realDryCycleTrace.filter((e: any) => e.kind === "STEP").map((e: any) => e.step).join(",") === require("../core/odg-go-cycle.js").STEPS.join(","));
    check("no provider/model/network call, no commit", ev.providerCalls === 0 && ev.modelCalls === 0 && ev.networkCalls === 0 && ev.commits === 0);
    const raw = fs.readFileSync(evp, "utf8");
    check("evidence has no /home/… or /tmp/… host path (redacted)", !/\/home\/|\/tmp\//.test(raw));
    check("re-derived I grade from the committed trace equals the recorded one", B.gradeI(ev.realDryCycleTrace, null).grade === ev.scenarioI.grade);
  } else process.stdout.write("# evidence not yet written — evidence checks skipped\n");

  // ---- V17.4 GO-ORD-2: owner SELECTION record on the REAL committed state of this tree (in-memory ports; no write) ----
  {
    const GOC = require("../core/odg-go-cycle.js");
    const ASc = require("../core/odg-authorization-scope.js");
    const real = B.readState(ROOT);
    // shallow copies only: the state carries live proof-probe functions (R7) that a JSON clone would drop
    const cloneS = (o: any) => ({ ...o, authorizationEvidence: { ...o.authorizationEvidence } });
    const tmpClaims = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-claims-")));
    const runCycle = async (state: any, o: any = {}) => {
      const prior = o.prior || []; const trace: any[] = prior.slice(); let t = 1_000_000; const calls = { dispatch: 0, missions: [] as string[] };
      const ports = { now: () => (t += 5), truthLock: () => ({ ok: true, blocked: false, status: "PASS", gitState: {} }), readState: () => state, knowledge: () => ({ ok: true, claims: [] }), stopRequested: () => ({ stop: false }),
        trace: { append: (e: any) => trace.push(JSON.parse(JSON.stringify(e))), readPrior: () => prior.slice() }, writeSummary: () => {},
        isolation: o.isolation || (() => ({ ok: false, reason: "test: no scratch" })), dispatchNative: (n: any) => { calls.dispatch++; calls.missions.push(n.mission); if (!o.mode) throw new Error("must not dispatch"); return { verified: true, detail: "fake dispatch PASS" }; }, pause: () => Promise.resolve(),
        ...(o.noClaims ? {} : { claims: o.claims || B.makeClaimStore(tmpClaims()) }) };
      const r = await GOC.runGoCycle({ mode: o.mode || "DRY", allowUnsandboxedTarget: !!o.mode }, ports);
      const cur = trace.slice(prior.length); const st = (k: string) => cur.find((e: any) => e.kind === "STEP" && e.step === k);
      return { r, sel: st("SELECT"), auth: st("AUTHORIZE"), exec: st("EXECUTE"), trace: cur, calls };
    };
    const runDry = (state: any, prior: any[] = []) => runCycle(state, { prior });
    // V17.5: J2 has now RUN (committed V172_J2_EXPERIMENT.json) ⇒ on the REAL state GO-ORD-2's one-shot rule must refuse (asserted below).
    // The GO-ORD-2 behaviour tests that follow run on a LABELLED fixture = the real state with only J2's experiment record removed
    // (the pre-run state GO actually saw at deaf0844); V17.5: J2's validation record (CLOSED_FAIL) is removed too.
    // V17.6: J is now owner-authorized (V176) and actionable at REVISE_CONTRACT; the GO-ORD-2 fixture keeps J as committed
    // BEFORE V176 (PROPOSED, no authorization) so the actionable selection is still the DECISION_REQUIRED these tests exercise.
    // V17.6 F: F likewise as committed BEFORE its V176 BUILD_MISSIONS revision (PROPOSED, original write_set, no preRegistration).
    const preV176J = (c: any) => { const cs = JSON.parse(JSON.stringify(c.sources.contracts)); const j = cs.data.contracts.find((x: any) => x.scenario === "J"); j.state = "PROPOSED"; j.authorizedBy = null; delete j.authorization; delete j.revisionHistory; delete j.proposedRevision; const f = cs.data.contracts.find((x: any) => x.scenario === "F"); if (f) { f.state = "PROPOSED"; f.authorizedBy = null; delete f.authorization; delete f.revisionHistory; if (f.WORK_ITEM_CONTRACT) { delete f.WORK_ITEM_CONTRACT.preRegistration; f.WORK_ITEM_CONTRACT.write_set = ["docs/odg/evidence/V160_SCENARIO_F.json", "runtime/bin/odg-v160-scenario-f-run.ts"]; } } c.sources = { ...c.sources, contracts: cs }; return c; };
    const preRun = (() => { const c = preV176J(cloneS(real)); c.authorizationEvidence.J2 = { ...c.authorizationEvidence.J2, experiment: null, validation: null }; if (c.sources && c.sources.authorizationEvidence && c.sources.authorizationEvidence.J2) c.sources = { ...c.sources, authorizationEvidence: { ...c.sources.authorizationEvidence, J2: { ...c.sources.authorizationEvidence.J2, experiment: null, validation: null } } }; return c; })();
    const j2c = real.sources.contracts.data.contracts.find((x: any) => x.scenario === "J2");
    check("GO-ORD-2: committed record loaded from the declared list (OWNER_SELECTION_DECISIONS) and bound to the CURRENT J2 contract sha", B.OWNER_SELECTION_DECISIONS[0] === "docs/odg/V174_OWNER_DECISION_SELECT_J2.json" && real.ownerSelectionDecisions[0].item === "J2" && real.ownerSelectionDecisions[0].contractSha256 === ASc.contractSha256(j2c) && real.ownerSelectionDecisions[0].contractSha256 === "d5a8b0db7f776da69b11a45f470a871cfcb4b2ab4b543fbeda6fdb2eeb5bcc6b");
    const base = await runDry((() => { const c = cloneS(preRun); c.ownerSelectionDecisions = []; return c; })());
    const ba = base.sel.decision.actionableSelection;
    check("GO-ORD-2 baseline (no selection record): actionable DECISION_REQUIRED, no tie, proposed J2 (uncertainty) ⇒ nothing worked on", ba.selection.decision === "DECISION_REQUIRED" && ba.selection.tiedSet.length <= 1 && ba.selection.proposed === "J2" && ba.item === null && !("ownerSelectionDecision" in ba));
    {
      const after = await runDry(real); const aa = after.sel.decision.actionableSelection; const ad = aa.ownerSelectionDecision;
      check("GO-ORD-2 REAL state after the J2 run (experiment record committed) ⇒ one-shot: record NOT applied, J2 not worked on via GO-ORD-2", !(ad && ad.applied && ad.chosen === "J2") && after.sel.decision.workingOn !== "J2");
    }
    const ok = await runDry(preRun);
    const oa = ok.sel.decision.actionableSelection; const osd = oa.ownerSelectionDecision;
    check("GO-ORD-2 real state ⇒ GO dry selects J2 (ownerSelection applied, actionable, resolvedBy the record, quotes + selector uncertainty justification kept verbatim)", oa.item === "J2" && ok.sel.decision.workingOn === "J2" && osd.applied === true && osd.chosen === "J2" && oa.resolvedBy === "OWNER_SELECTION_DECISION docs/odg/V174_OWNER_DECISION_SELECT_J2.json" && osd.quote.length === 5 && osd.quote[3] === "Ne pas lancer plusieurs expériences concurrentes. Un seul envoi J2 autorisé." && osd.selector.justification === base.sel.decision.actionableSelection.selection.justification && osd.actionability.actionable === true && /GO-ORD-2/.test(osd.rule) && /GO-ORD-2/.test(ok.sel.rationale));
    check("GO-ORD-2 real state ⇒ AUTHORIZE passes on J2's own scoped authorization (no authorization created), dry ⇒ nothing dispatched", ok.auth.status === "DONE" && ok.auth.decision.scopedAuthorization.scenario === "J2" && ok.auth.decision.selfAuthorized === false && ok.r.dispatchCalls === 0);
    check("GO-ORD-2 strategicSelection + the actionable selector decision unchanged by the record", JSON.stringify(ok.sel.decision.strategicSelection) === JSON.stringify(base.sel.decision.strategicSelection) && ok.sel.decision.decision === base.sel.decision.decision && oa.selection.decision === "DECISION_REQUIRED" && oa.selection.proposed === "J2");
    const rec0 = real.ownerSelectionDecisions[0]; const os0 = osd;
    const withRec = (o: any, mut?: (c: any) => void) => { const c = cloneS(preRun); c.ownerSelectionDecisions = [{ ...rec0, ...o }]; if (mut) mut(c); return c; };
    for (const [label, o, mut, re] of [
      ["wrong item", { item: "G2" }, null, /record item G2 ≠ proposed J2/],
      ["stale contract sha", { contractSha256: "0".repeat(64) }, null, /STALE/],
      ["non-OWNER issuer", { issuer: "PROVIDER (Claude Code)" }, null, /issuer is not the OWNER/],
      ["missing schema", { schema: undefined }, null, /schema/],
      ["no quote", { quote: [] }, null, /verbatim quotes/],
      ["wrong schema", { schema: "odg-owner-order-decision/1" }, null, /schema/],
      ["wrong kind", { kind: "OWNER_ORDER_DECISION" }, null, /kind/],
      ["precondition not verifiable (unknown PR)", { precondition: { pr: 1, merged: true } }, null, /precondition not met/],
      ["precondition merged=false", { precondition: { pr: 965, merged: false } }, null, /precondition not met/],
      ["ledger proven", {}, (c: any) => { c.ledger = { ...c.ledger, proven: [...(c.ledger.proven || []), "J2"] }; }, /proven in the ledger/],
      ["experiment record already present in state", {}, (c: any) => { c.authorizationEvidence.J2 = { ...c.authorizationEvidence.J2, experiment: { scenario: "J2", recordPath: "docs/odg/evidence/V172_J2_EXPERIMENT.json" } }; }, /committed experiment record present/],
    ] as any[]) {
      const x = await runDry(withRec(o, mut || undefined));
      const xa = x.sel.decision.actionableSelection; const xs = xa.ownerSelectionDecision;
      const reason = xs && xs.considered && xs.considered[0] ? xs.considered[0].reason : "";
      check(`GO-ORD-2 refusal: ${label} ⇒ not applied (reason recorded), J2 not worked on via the record`, (!xs || xs.applied === false) && xa.item !== "J2" && (re ? re.test(reason) : true));
    }
    // maxDispatches 1: a prior DISPATCHED J2 in the GO trace ⇒ not applied
    const prior = [{ kind: "CYCLE_START", runId: "r0", cycleSeq: 1 }, { kind: "DISPATCHED", mission: "J2", runId: "r0", cycleSeq: 1 }, { kind: "CYCLE_END", status: "EXECUTED_FAIL", runId: "r0", cycleSeq: 1, decisionsDigest: "x" }];
    const pd = await runDry(preRun, prior);
    check("GO-ORD-2 refusal: J2 already DISPATCHED in the GO trace ⇒ maxDispatches 1 used, not applied", pd.sel.decision.actionableSelection.ownerSelectionDecision.applied === false && /maxDispatches 1 already used: DISPATCHED in the GO trace/.test(pd.sel.decision.actionableSelection.ownerSelectionDecision.considered[0].reason) && pd.sel.decision.actionableSelection.item !== "J2");
    // tie present ⇒ GO-ORD-2 not applicable (unit, exported resolver)
    const reg = require("../core/odg-strategic-register.js").buildRegister(preRun.sources);
    const tie = GOC.resolveOwnerSelection(preRun, reg, { decision: "DECISION_REQUIRED", tiedSet: [{ id: "J2" }, { id: "G2" }], proposed: null }, []);
    check("GO-ORD-2: an actionable TIE ⇒ not applicable (GO-ORD-1 territory), nothing chosen", tie.applied === false && /tie \(J2\/G2\)/.test(tie.notApplicable));
    const sing = GOC.resolveOwnerSelection(preRun, reg, { decision: "DECISION_REQUIRED", tiedSet: [{ id: "J2" }], proposed: { id: "J2", uncertainty: 0.6 } }, [], B.makeClaimStore(tmpClaims()));
    check("GO-ORD-2: singleton tiedSet with proposed J2 ⇒ applicable (applied)", sing.applied === true && sing.chosen === "J2");
    const gated = { ...reg, items: reg.items.map((it: any) => (it.id === "J2" ? { ...it, requiresOwnerAuthorization: true, ownerReason: "test fixture gate" } : it)) };
    const ng = GOC.resolveOwnerSelection(real, gated, { decision: "DECISION_REQUIRED", tiedSet: [], proposed: { id: "J2", uncertainty: 0.6 } }, [], B.makeClaimStore(tmpClaims()));
    check("GO-ORD-2 refusal: item not actionable (owner-gated fixture) ⇒ not applied, reason names actionability (never creates authorization)", ng.applied === false && /not actionable: owner-gated/.test(ng.considered[0].reason));
    const noInsp = await runDry((() => { const c = cloneS(preRun); c.authorizationEvidence.J2 = { ...c.authorizationEvidence.J2, inspection: null }; return c; })());
    check("GO-ORD-2: J2 inspection record absent ⇒ J2 actionable only at its INSPECT step ⇒ selected, but AUTHORIZE grants no execution (scope current step INSPECT_REVISED_CONTRACT)", noInsp.sel.decision.actionableSelection.item === "J2" && noInsp.auth.decision.scopedAuthorization.currentStep === "INSPECT_REVISED_CONTRACT" && noInsp.auth.decision.scopedAuthorization.executionAuthorized === false);
    check("GO-ORD-2 LOW: precondition {pr 965, merged} verified BY CODE (GO-DTO-1 present) and recorded", osd.preconditionCheck.ok === true && osd.preconditionCheck.pr === 965 && /GO-DTO-1/.test(osd.preconditionCheck.evidence));
    {
      const nc = await runCycle(preRun, { noClaims: true });
      check("GO-ORD-2: no claim store port ⇒ not applied (GO-ORD-2_NO_CLAIM_STORE, fail-closed)", nc.sel.decision.actionableSelection.item !== "J2" && /GO-ORD-2_NO_CLAIM_STORE/.test(nc.sel.decision.actionableSelection.ownerSelectionDecision.considered[0].reason));
      // one-shot claim, independent of --out: two EXECUTE runs with DIFFERENT traces (fresh out dirs) and the SAME claim store
      const dir = tmpClaims(); const store = B.makeClaimStore(dir);
      const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-ws-")));
      const iso = () => ({ ok: true, workspace: ws });
      const dry = await runCycle(preRun, { claims: store, isolation: iso });
      check("GO-ORD-2: DRY never claims (claim dir empty after a dry run that selected J2)", dry.sel.decision.workingOn === "J2" && (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) && dry.calls.dispatch === 0);
      const r1 = await runCycle(preRun, { claims: store, isolation: iso, mode: "EXECUTE" });
      const files = fs.readdirSync(dir); const claim = files.length ? JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8")) : null;
      check("GO-ORD-2 run 1 (out A) EXECUTE ⇒ claim created atomically right before dispatch (record, record sha, item, contract sha, runId, at, scratch), J2 dispatched exactly once", r1.calls.missions.filter((m: string) => m === "J2").length === 1 && files.length === 1 && files[0] === `${os0.claimKey}.claim` && claim.item === "J2" && claim.contractSha256 === rec0.contractSha256 && claim.record === "docs/odg/V174_OWNER_DECISION_SELECT_J2.json" && /^[0-9a-f]{64}$/.test(claim.recordSha256) && claim.scratch === ws && !!claim.runId && !!claim.at && r1.trace.some((e: any) => e.kind === "OWNER_SELECTION_CLAIMED"));
      const r2 = await runCycle(preRun, { claims: store, isolation: iso, mode: "EXECUTE" });
      check("GO-ORD-2 run 2 (different out B, empty trace) ⇒ claim exists ⇒ GO-ORD-2_ALREADY_CLAIMED at SELECT, J2 NOT dispatched", !r2.calls.missions.includes("J2") && r2.sel.decision.actionableSelection.item !== "J2" && /GO-ORD-2_ALREADY_CLAIMED/.test(r2.sel.decision.actionableSelection.ownerSelectionDecision.considered[0].reason));
      // race: claim appears between SELECT and EXECUTE ⇒ the O_EXCL create fails ⇒ refused, 0 dispatch
      const dir3 = tmpClaims(); const s3 = B.makeClaimStore(dir3);
      const racy = { exists: () => null, claim: (q: any) => { fs.writeFileSync(path.join(dir3, `${q.key}.claim`), "{}"); return s3.claim(q); } };
      const r3 = await runCycle(preRun, { claims: racy, isolation: iso, mode: "EXECUTE" });
      check("GO-ORD-2: claim created by another run after SELECT ⇒ EEXIST ⇒ dispatch REFUSED GO-ORD-2_ALREADY_CLAIMED (J2 not dispatched, recorded)", !r3.calls.missions.includes("J2") && r3.exec.decision.ownerSelectionClaim.code === "GO-ORD-2_ALREADY_CLAIMED" && /GO-ORD-2_ALREADY_CLAIMED/.test(r3.exec.decision.scheduler.reason));
      // the declared scratch already holds the J2 experiment record ⇒ refused before any claim
      const ws4 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-ws4-"))); fs.mkdirSync(path.join(ws4, "docs", "odg", "evidence"), { recursive: true }); fs.writeFileSync(path.join(ws4, "docs", "odg", "evidence", "V172_J2_EXPERIMENT.json"), "{}");
      const dir4 = tmpClaims();
      const r4 = await runCycle(preRun, { claims: B.makeClaimStore(dir4), isolation: () => ({ ok: true, workspace: ws4 }), mode: "EXECUTE" });
      check("GO-ORD-2: scratch already contains docs/odg/evidence/V172_J2_EXPERIMENT.json ⇒ REFUSED GO-ORD-2_SCRATCH_EXPERIMENT_PRESENT, no claim, J2 not dispatched", !r4.calls.missions.includes("J2") && r4.exec.decision.ownerSelectionClaim.code === "GO-ORD-2_SCRATCH_EXPERIMENT_PRESENT" && (!fs.existsSync(dir4) || fs.readdirSync(dir4).length === 0));
      check("GO-ORD-2: claim dir = <git common dir>/odg-go-claims (fixed, independent of --out, outside the worktree)", B.claimDirOf(ROOT) === path.join(String(require("child_process").execFileSync("git", ["-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })).trim(), "odg-go-claims"));
    }
    // ---- V17.5 V175-NB1 (first ODG-native build) on the REAL committed state: GO selects it via its own owner selection
    // record (GO-ORD-2), AUTHORIZE stops at INSPECT without an inspection record; with a LABELLED simulated inspection ACCEPT
    // (fixture — the real record is written by an independent inspector) RUN_CONTROLLED_EXPERIMENTS is derived and the
    // declared dispatch target (the V175 runner, writeSet = the result record) is resolved; dry ⇒ nothing dispatched.
    // V17.5: NB1 has now RUN natively (committed V175_NATIVE_BUILD_RESULT.json) ⇒ on the REAL state GO-ORD-2's one-shot rule refuses (asserted);
    // the NB1 GO-path behaviour tests below run on a LABELLED fixture = real state with only NB1's result record removed (the pre-run state GO saw).
    const nbStrip = (c: any) => { c.authorizationEvidence["V175-NB1"] = { ...c.authorizationEvidence["V175-NB1"], experiment: null, validation: null }; if (c.sources && c.sources.authorizationEvidence && c.sources.authorizationEvidence["V175-NB1"]) c.sources = { ...c.sources, authorizationEvidence: { ...c.sources.authorizationEvidence, "V175-NB1": { ...c.sources.authorizationEvidence["V175-NB1"], experiment: null, validation: null } } }; return c; };
    const nbPre = nbStrip(preV176J(cloneS(real)));   // V17.6: J pre-V176 (see preV176J)
    {
      const after = await runDry(real); const aa = after.sel.decision.actionableSelection; const ad = aa.ownerSelectionDecision;
      check("V175-NB1 REAL state after the native run (result committed) ⇒ one-shot: GO-ORD-2 NOT applied, NB1 not worked on via the record", !(ad && ad.applied && ad.chosen === "V175-NB1") && after.sel.decision.workingOn !== "V175-NB1");
    }
    {
      const nb1c = real.sources.contracts.data.contracts.find((x: any) => x.scenario === "V175-NB1");
      const nbRec = real.ownerSelectionDecisions.find((x: any) => x.item === "V175-NB1");
      check("V175-NB1: owner selection record declared in OWNER_SELECTION_DECISIONS, loaded, bound to the CURRENT NB1 contract sha", B.OWNER_SELECTION_DECISIONS.includes("docs/odg/V175_OWNER_DECISION_SELECT_NB1.json") && !!nbRec && nbRec.contractSha256 === ASc.contractSha256(nb1c));
      const noRec = await runDry((() => { const c = cloneS(nbPre); c.ownerSelectionDecisions = c.ownerSelectionDecisions.filter((x: any) => x.item !== "V175-NB1"); return c; })());
      const na = noRec.sel.decision.actionableSelection;
      check("V175-NB1 baseline (no NB1 selection record): actionable DECISION_REQUIRED, no tie, proposed V175-NB1 ⇒ nothing worked on", na.selection.decision === "DECISION_REQUIRED" && na.selection.tiedSet.length <= 1 && na.selection.proposed === "V175-NB1" && na.item === null);
      const d0 = await runDry(nbPre);
      const a0 = d0.sel.decision.actionableSelection;
      check("V175-NB1 real state ⇒ GO dry selects V175-NB1 via GO-ORD-2 (record applied); strategic selection unchanged", a0.item === "V175-NB1" && d0.sel.decision.workingOn === "V175-NB1" && a0.ownerSelectionDecision.applied === true && a0.resolvedBy === "OWNER_SELECTION_DECISION docs/odg/V175_OWNER_DECISION_SELECT_NB1.json" && JSON.stringify(d0.sel.decision.strategicSelection) === JSON.stringify(noRec.sel.decision.strategicSelection));
      // V17.5: the NB1 contract inspection (ACCEPT, #975) is now committed ⇒ on the REAL state AUTHORIZE grants RUN (asserted);
      // the "no inspection" refusal is kept on a LABELLED fixture = real state with only NB1's inspection record removed.
      check("V175-NB1 REAL state (inspection ACCEPT committed) ⇒ AUTHORIZE: RUN_CONTROLLED_EXPERIMENTS authorized under owner V175", d0.auth.decision.scopedAuthorization.scenario === "V175-NB1" && d0.auth.decision.scopedAuthorization.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && d0.auth.decision.scopedAuthorization.executionAuthorized === true);
      const d0x = await runDry((() => { const c = cloneS(nbPre); c.authorizationEvidence["V175-NB1"] = { ...c.authorizationEvidence["V175-NB1"], inspection: null }; if (c.sources && c.sources.authorizationEvidence && c.sources.authorizationEvidence["V175-NB1"]) c.sources = { ...c.sources, authorizationEvidence: { ...c.sources.authorizationEvidence, "V175-NB1": { ...c.sources.authorizationEvidence["V175-NB1"], inspection: null } } }; return c; })());
      check("V175-NB1 without inspection record (labelled fixture) ⇒ AUTHORIZE: current step INSPECT_REVISED_CONTRACT, execution NOT authorized (refused)", d0x.auth.decision.scopedAuthorization.scenario === "V175-NB1" && d0x.auth.decision.scopedAuthorization.currentStep === "INSPECT_REVISED_CONTRACT" && d0x.auth.decision.scopedAuthorization.executionAuthorized === false && d0.r.dispatchCalls === 0);
      const H40 = "a".repeat(40);
      const fixtureProbes = { label: "TEST FIXTURE — commit 'a'×40 declared present + ancestor of main", mainRef: "fixture-main", commitExists: (x: string) => x === H40, isAncestorOfMain: (x: string) => x === H40, fileSha256: (rel: string) => { try { return require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex"); } catch { return null; } } };
      const simInsp = { scenario: "V175-NB1", verdict: "ACCEPT", contractSha256: ASc.contractSha256(nb1c), inspector: "SIMULATED (test fixture)", inspectorSessionId: "sim-inspector-nb1-01", authorSessionId: nb1c.revisionHistory[nb1c.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: H40, inspectedPr: 997, recordPath: "docs/odg/evidence/V175_NB1_CONTRACT_INSPECTION.json" };
      const withInsp = (() => { const c = cloneS(nbPre); c.authorizationEvidence["V175-NB1"] = { ...c.authorizationEvidence["V175-NB1"], inspection: simInsp, probes: fixtureProbes }; return c; })();
      const d1 = await runDry(withInsp);
      const sa = d1.auth.decision.scopedAuthorization;
      check("V175-NB1 with SIMULATED inspection ACCEPT ⇒ selected, AUTHORIZE derives RUN_CONTROLLED_EXPERIMENTS (execution authorized by owner V175), dry ⇒ 0 dispatch", d1.sel.decision.workingOn === "V175-NB1" && sa.scenario === "V175-NB1" && sa.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && sa.executionAuthorized === true && d1.r.dispatchCalls === 0);
      const dt = d1.exec && d1.exec.decision && d1.exec.decision.dispatchTarget;
      check("V175-NB1 EXECUTE (dry) resolves the declared target: runner + [result record] (dry, no opt-in ⇒ UNSANDBOXED_TARGET_NOT_OPTED_IN, never a fallback)", !!dt && (dt.ok === true || dt.code === "UNSANDBOXED_TARGET_NOT_OPTED_IN") && !!dt.target && dt.target.command === "runtime/bin/odg-v175-native-build-run.ts" && JSON.stringify(dt.target.writeSet) === JSON.stringify(["docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json"]));
      check("V175-NB1 GO-DTO-1: dispatch kill bound derived from preRegistration.caps.maxRunWallMs (1 800 000 + 120 000 margin)", (() => { const x = GOC.deriveDispatchTimeout(nb1c, dt && dt.target); return x.ok === true && x.basis === "MAX_RUN_WALL_MS" && x.timeoutMs === 1920000; })());
    }
    check("GO-ORD-2: a non-DECISION_REQUIRED selection ⇒ resolver returns null (not consulted)", GOC.resolveOwnerSelection(real, reg, { decision: "SELECTED", selected: { id: "J2" } }, []) === null);
  }

  // ---- V17.4 GO-DTO-1 MED-2: process-group dispatch (real tiny processes; bounded; no network) ----
  {
    const cpm = require("child_process");
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) { return !!e && e.code === "EPERM"; } };
    const D = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-pg-")));
    for (const [label, ignoreTerm] of [["SIGTERM honoured", false], ["SIGTERM ignored ⇒ SIGKILL after grace", true]] as any[]) {
      const pidf = path.join(D, `pids-${ignoreTerm ? 1 : 0}.json`); const sc = path.join(D, `child-${ignoreTerm ? 1 : 0}.js`);
      fs.writeFileSync(sc, `const cp=require("child_process"),fs=require("fs");${ignoreTerm ? "process.on('SIGTERM',()=>{});" : ""}const g=cp.spawn(process.execPath,["-e",${JSON.stringify(ignoreTerm ? "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)" : "setInterval(()=>{},1000)")}],{stdio:"ignore"});fs.writeFileSync(${JSON.stringify(pidf)},JSON.stringify({child:process.pid,grand:g.pid}));setInterval(()=>{},1000);`);
      const r = await B.runGroup(process.execPath, [sc], { cwd: D, timeoutMs: 800, graceMs: 400, pollMs: 50 });
      const pids = JSON.parse(fs.readFileSync(pidf, "utf8"));
      check(`GO-DTO-1 MED-2 (${label}): timeout ⇒ the whole process group is gone when runGroup resolves (child AND grandchild dead), killedBy TIMEOUT recorded`, r.killedBy === "TIMEOUT" && r.groupGone === true && !alive(pids.child) && !alive(pids.grand) && r.termSignal === "SIGTERM" && r.killSignalSent === ignoreTerm);
    }
    {
      const pidf = path.join(D, "pids-stop.json"); const sc = path.join(D, "child-stop.js");
      fs.writeFileSync(sc, `const cp=require("child_process"),fs=require("fs");const g=cp.spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync(${JSON.stringify(pidf)},JSON.stringify({child:process.pid,grand:g.pid}));setInterval(()=>{},1000);`);
      let stop = false; setTimeout(() => { stop = true; }, 600);
      const r = await B.runGroup(process.execPath, [sc], { cwd: D, timeoutMs: 60000, graceMs: 400, pollMs: 50, stopRequested: () => (stop ? { reason: "SIGNAL", source: "SIGTERM" } : null) });
      const pids = JSON.parse(fs.readFileSync(pidf, "utf8"));
      check("GO-DTO-1 MED-2: STOP/SIGTERM to GO mid-dispatch ⇒ group SIGTERMed and gone (killedBy STOP, reason recorded)", r.killedBy === "STOP" && /SIGNAL/.test(r.reason) && r.groupGone === true && !alive(pids.child) && !alive(pids.grand));
    }
    {
      const pidf = path.join(D, "pids-orphan.json"); const sc = path.join(D, "child-orphan.js");
      fs.writeFileSync(sc, `const cp=require("child_process"),fs=require("fs");const g=cp.spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});g.unref();fs.writeFileSync(${JSON.stringify(pidf)},JSON.stringify({child:process.pid,grand:g.pid}));process.exit(0);`);
      const r = await B.runGroup(process.execPath, [sc], { cwd: D, timeoutMs: 60000, graceMs: 400, pollMs: 50 });
      const pids = JSON.parse(fs.readFileSync(pidf, "utf8"));
      check("GO-DTO-1 MED-2: leader exits 0 leaving a grandchild ⇒ group terminated before resolve (ORPHANED_GROUP), grandchild dead", r.killedBy === "ORPHANED_GROUP" && r.status === 0 && r.groupGone === true && !alive(pids.grand));
    }
    // dispatchNative end-to-end on a real scratch worktree: the confinement check runs AFTER the group is gone — proven by a
    // write the grandchild makes only when it receives SIGTERM (outside the target writeSet ⇒ must be seen)
    {
      const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-dn-")));
      const g = (cwd: string, ...a: string[]) => cpm.execFileSync("git", a, { cwd, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString();
      const repo = path.join(T, "repo"); fs.mkdirSync(path.join(repo, "runtime", "bin"), { recursive: true });
      fs.writeFileSync(path.join(repo, "runtime", "bin", "exp.js"), `const cp=require("child_process"),fs=require("fs"),path=require("path");fs.mkdirSync("out",{recursive:true});const g=cp.spawn(process.execPath,["-e","process.on('SIGTERM',()=>{require('fs').writeFileSync(require('path').join(process.cwd(),'late.txt'),'x');process.exit(0)});setInterval(()=>{},1000)"],{stdio:"ignore",cwd:process.cwd()});fs.writeFileSync(path.join("out","pids.json"),JSON.stringify({child:process.pid,grand:g.pid}));setInterval(()=>{},1000);`);
      g(repo, "init", "-q", "-b", "main"); g(repo, "add", "."); g(repo, "commit", "-q", "-m", "c");
      const wt = path.join(T, "scratch"); g(repo, "worktree", "add", "-q", "--detach", wt);
      const out = path.join(T, "out"); fs.mkdirSync(out);
      const ports = B.buildPorts({ repo, outDir: out, scratch: wt, stepDelayMs: 0, signalState: { signal: null } });
      const tgt = { command: "runtime/bin/exp.js", args: [], writeSet: ["out/"] };
      const savedPath = process.env.PATH, savedOff = process.env.npm_config_offline;
      process.env.PATH = `${path.join(ROOT, "node_modules", ".bin")}${path.delimiter}${savedPath}`; process.env.npm_config_offline = "true";   // tsx resolved locally; no network
      let res: any;
      try { res = await ports.dispatchNative({ mission: "G" }, { workspace: wt, dispatchTarget: tgt, allowUnsandboxedTarget: true, dispatchTimeoutMs: 5000 }); } finally { process.env.PATH = savedPath; if (savedOff === undefined) delete process.env.npm_config_offline; else process.env.npm_config_offline = savedOff; }
      let pids: any = null; try { pids = JSON.parse(fs.readFileSync(path.join(wt, "out", "pids.json"), "utf8")); } catch { pids = null; }
      check("GO-DTO-1 MED-2: dispatchNative (declared target, real npx → tsx → node → grandchild) timeout ⇒ EXECUTED_FAIL-classifiable (verified false), killedBy TIMEOUT, child + grandchild dead", !!pids && res.verified === false && res.process.killedBy === "TIMEOUT" && res.process.groupGone === true && !alive(pids.child) && !alive(pids.grand));
      check("GO-DTO-1 MED-2: the writes-confinement check ran AFTER the group exited (sees late.txt written by the grandchild on SIGTERM)", /WRITE_OUTSIDE_TARGET_WRITE_SET: late\.txt/.test(res.detail));
      const bad = await ports.dispatchNative({ mission: "G" }, { workspace: wt, dispatchTarget: tgt, allowUnsandboxedTarget: true, dispatchTimeoutMs: 1234.5 });
      check("GO-DTO-1 LOW-2: non-integer dispatchTimeoutMs at the port ⇒ REFUSED (GO-DTO-1_TIMEOUT_MISMATCH), nothing spawned", bad.verified === false && /GO-DTO-1_TIMEOUT_MISMATCH/.test(bad.detail));
    }
  }
  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall odg-go CLI tests passed\n");
})().catch((e) => { process.stdout.write(`NOT OK - threw ${e && e.stack}\n`); process.exit(1); });
export {};

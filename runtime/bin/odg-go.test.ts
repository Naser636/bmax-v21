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
    let rejected = false; try { await B.runOnce(["--repo", notRepo, "--out", realOut]); } catch { rejected = true; }
    check("symlinked final trace file ⇒ real cycle refuses to write through it", rejected && fs.readFileSync(victim, "utf8") === "orig");
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

  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall odg-go CLI tests passed\n");
})().catch((e) => { process.stdout.write(`NOT OK - threw ${e && e.stack}\n`); process.exit(1); });
export {};

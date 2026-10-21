/*
 * R3 Lot B — odg-delegate HISTORICAL-mode repo-safety (Truth-Lock) acceptance (bin-level, hermetic).
 *
 * In historical mode the delegated WRITE happens out-of-band in the provider; odg-delegate runs AFTER it and
 * PROMOTES the change (conformance → verify → converge → archive). That promotion carried no repo-safety
 * check. This proves the opt-in canonical Truth-Lock pre-flight now REFUSES promotion on a non-conforming repo
 * BEFORE any verify/converge/archive, is inert by default (record-only), and preserves legitimate behaviour —
 * on BOTH maintained ports (.js source via ODG_RUNTIME=js, compiled dist by default).
 *
 * Hermetic: a throwaway git repo with the real gate/scope/lifecycle module closures copied in, and STUB
 * mission-loader / odg-verify / odg-converge binaries (exit 0) so the delegate reaches its promotion point
 * without a live runtime or network. We assert on exit code + stdout markers (the Truth-Lock refusal prints
 * and exits BEFORE the "WRITE-SET CONFORMANCE" banner).
 *
 * Run: node_modules/.bin/tsx src/runtime/odg-delegate-truth-lock.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const REPO = process.cwd();
// Union of the dist require-closures for the modules odg-delegate loads in-process up to and past the gate.
const MODULES = ["truth-lock-gate", "truth-lock", "delegate-isolation", "scope-observer", "mission-lifecycle",
  "action-gate", "bash-command-governor", "evidence-provenance", "provider-sandbox", "state-transition", "governance-kernel"];

function git(dir: string, args: string[]): void { spawnSync("git", args, { cwd: dir, stdio: "ignore" }); }

function copyModules(destCore: string, srcCore: string): void {
  fs.mkdirSync(destCore, { recursive: true });
  for (const m of MODULES) { const s = path.join(srcCore, m + ".js"); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(destCore, m + ".js")); }
}

// A stub mission-loader that writes a minimal valid mission-plan.json and exits 0.
const LOADER_STUB = `const fs=require("fs"),path=require("path");
const plan={mission:"M",mode:"IMPLEMENT",requiresEngineering:true,authorizedPaths:["src/app"],objectives:[{id:"m_1",goal:"deliver",done_when:["ok"]}],definition_of_done:["ok"]};
fs.mkdirSync(path.join("runtime","generated"),{recursive:true});
fs.writeFileSync(path.join("runtime","generated","mission-plan.json"),JSON.stringify(plan,null,2));
process.exit(0);
`;
const EXIT0_STUB = `process.exit(0);\n`;

/** state: conforming | wrong-branch | staged-index | non-repo. Returns the sandbox dir. */
function sandbox(state: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r3-deleg-"));
  for (const sub of ["runtime/core", "runtime/dist/core", "runtime/bin", "runtime/dist/bin", "runtime/generated", "runtime/missions", "src/app"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  // Real module closures into BOTH source and dist core (ports resolve to their own tree).
  copyModules(path.join(dir, "runtime", "core"), path.join(REPO, "runtime", "core"));
  copyModules(path.join(dir, "runtime", "dist", "core"), path.join(REPO, "runtime", "dist", "core"));
  // Stub sub-binaries in BOTH trees.
  for (const base of ["runtime", "runtime/dist"]) {
    fs.writeFileSync(path.join(dir, base, "core", "mission-loader.js"), LOADER_STUB);
    fs.writeFileSync(path.join(dir, base, "bin", "odg-verify.js"), EXIT0_STUB);
    fs.writeFileSync(path.join(dir, base, "bin", "odg-converge.js"), EXIT0_STUB);
  }
  // The odg-delegate ports under test.
  fs.copyFileSync(path.join(REPO, "runtime", "bin", "odg-delegate.js"), path.join(dir, "runtime", "bin", "odg-delegate.js"));
  fs.copyFileSync(path.join(REPO, "runtime", "dist", "bin", "odg-delegate.js"), path.join(dir, "runtime", "dist", "bin", "odg-delegate.js"));
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify({ mission: "M", mode: "IMPLEMENT", requires_engineering: true, authorized_paths: ["src/app"], objectives: [{ id: "m_1", goal: "deliver", done_when: ["ok"] }] }));
  if (state === "non-repo") return dir;
  git(dir, ["init", "-q"]); git(dir, ["config", "user.email", "t@t.t"]); git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n"); git(dir, ["add", "-A"]); git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  git(dir, ["branch", "-m", "main"]);
  if (state === "conforming") git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  else if (state === "wrong-branch") git(dir, ["checkout", "-q", "-b", "feature/x"]);
  else if (state === "staged-index") { git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]); fs.writeFileSync(path.join(dir, "staged.txt"), "x"); git(dir, ["add", "staged.txt"]); }
  // The delegated (out-of-band) in-scope working change the historical flow would promote.
  fs.writeFileSync(path.join(dir, "src", "app", "deliverable.ts"), "export const x = 1;\n");
  return dir;
}

type PortKey = "dist" | "js";
function run(dir: string, port: PortKey, enforce: boolean): { exit: number; out: string; refused: boolean; reachedConformance: boolean } {
  const bin = port === "dist" ? "runtime/dist/bin/odg-delegate.js" : "runtime/bin/odg-delegate.js";
  const env = { ...process.env };
  if (enforce) env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete env.ODG_TRUTH_LOCK_ENFORCE;
  if (port === "js") env.ODG_RUNTIME = "js"; else delete env.ODG_RUNTIME;
  const r = spawnSync("node", [bin, "M"], { cwd: dir, encoding: "utf8", env });
  const out = (r.stdout || "") + (r.stderr || "");
  return { exit: r.status ?? -1, out, refused: /refused by Truth-Lock repo-safety/.test(out), reachedConformance: /WRITE-SET CONFORMANCE/.test(out) };
}

function suite(port: PortKey): void {
  console.log(`\n[${port}-port]`);

  // wrong-branch + enforce ⇒ REFUSE before any promotion (no WRITE-SET CONFORMANCE reached).
  { const dir = sandbox("wrong-branch"); const r = run(dir, port, true);
    check(r.refused && r.exit === 2 && !r.reachedConformance, `${port}: wrong-branch + enforce ⇒ refused before any verify/converge/archive`); fs.rmSync(dir, { recursive: true, force: true }); }

  // staged-index + enforce ⇒ REFUSE (canonical policy).
  { const dir = sandbox("staged-index"); const r = run(dir, port, true);
    check(r.refused && !r.reachedConformance, `${port}: staged-index + enforce ⇒ refused before promotion`); fs.rmSync(dir, { recursive: true, force: true }); }

  // non-repo (unverifiable) + enforce ⇒ REFUSE in strict mode.
  { const dir = sandbox("non-repo"); const r = run(dir, port, true);
    check(r.refused && !r.reachedConformance, `${port}: non-repo (unverifiable) + enforce ⇒ refused in strict mode`); fs.rmSync(dir, { recursive: true, force: true }); }

  // conforming + enforce ⇒ repo-safety PASSES; promotion proceeds (reaches WRITE-SET CONFORMANCE).
  { const dir = sandbox("conforming"); const r = run(dir, port, true);
    check(!r.refused && r.reachedConformance, `${port}: conforming + enforce ⇒ repo-safety passes, promotion proceeds`); fs.rmSync(dir, { recursive: true, force: true }); }

  // record-only (NO enforce) + wrong-branch ⇒ historical behaviour preserved (gate inert; promotion proceeds).
  { const dir = sandbox("wrong-branch"); const r = run(dir, port, false);
    check(!r.refused && r.reachedConformance, `${port}: record-only (no enforce) ⇒ historical behaviour preserved (gate inert)`); fs.rmSync(dir, { recursive: true, force: true }); }

  // refuse-then-retry ⇒ no bypass on resume.
  { const dir = sandbox("wrong-branch"); const a = run(dir, port, true); const b = run(dir, port, true);
    check(a.refused && b.refused && !a.reachedConformance && !b.reachedConformance, `${port}: refuse-then-retry ⇒ both refused, no bypass`); fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log("R3 Lot B — odg-delegate historical-mode Truth-Lock");
suite("dist");
suite("js");
console.log(failures === 0 ? "\nALL PASS — R3 Lot B odg-delegate Truth-Lock" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);

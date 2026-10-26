#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * Delegate Isolation — NEGATIVE security tests (PROVIDER_ISOLATION_E1_E4).
 *
 * Proves the isolated delegate path actually CONFINES the provider, on a DISPOSABLE git repo, using
 * REAL bubblewrap with harmless `node -e` fake providers (never a real network call succeeds, never a
 * real secret is exposed). The six required restrictions are asserted:
 *   1. the REAL repo's .git is unreadable from the sandbox,
 *   2. an out-of-scope write is refused (never applied to the real repo),
 *   3. a mixed authorized/forbidden patch is refused ATOMICALLY (nothing applied),
 *   4. the Docker socket is absent,
 *   5. host secrets (env + on-disk) are absent,
 *   6. outbound network is blocked.
 * Real-bwrap cases self-SKIP honestly (reported, never silently passed) when bubblewrap is unavailable;
 * the pure scope/fail-closed logic always runs.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const iso = require("./delegate-isolation");
const bashGov = require("./bash-command-governor");

let passed = 0;
let skipped = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
function skip(name, why) { console.log("  SKIP -", name, "::", why); skipped += 1; }

const hasBwrap = bashGov.detectSandbox({}).available;

// Disposable repo: git init + one authorized file (src/app.js) + a root secret file (never in scope).
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-iso-repo-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "app.js"), "// original\n");
  fs.writeFileSync(path.join(dir, "secret.env"), "TOKEN=super-secret-value-xyz\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}
// A `node -e "<body>"` provider command. Body uses ONLY single quotes so it survives provider-sandbox
// parseCommand (double-quoted token; inner metachars literal). cwd inside the sandbox is the work copy.
function nodeProvider(body) { return 'node -e "' + body + '"'; }

// ── PURE / FAIL-CLOSED (always run; no bwrap needed) ───────────────────────────────────────────────
console.log("A — write-set resolution is fail-closed");
{
  const repo = makeRepo();
  ok("concrete existing file ⇒ resolved", iso.resolveWriteSet(repo, ["src/app.js"]).ok === true);
  ok("glob/boundary write-set ⇒ refused", iso.resolveWriteSet(repo, ["src/**"]).ok === false);
  ok("empty write-set ⇒ refused", iso.resolveWriteSet(repo, []).ok === false);
  ok("path escaping root ⇒ refused", iso.resolveWriteSet(repo, ["../../etc/passwd"]).ok === false);
  ok("missing file ⇒ refused", iso.resolveWriteSet(repo, ["src/nope.js"]).ok === false);
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log("B — isolated bwrap argv never exposes the real repo / whole FS");
{
  const repo = makeRepo();
  const args = iso.buildIsolatedArgs("/tmp/work-copy", ["node", "-e", "1"]);
  ok("--unshare-all present (no network)", args.includes("--unshare-all"));
  ok("--clearenv present (no host secrets)", args.includes("--clearenv"));
  ok("NO --ro-bind / / (whole FS never exposed)", !args.some((a, i) => a === "--ro-bind" && args[i + 1] === "/" && args[i + 2] === "/"));
  ok("real repo path never bound", !args.some((a) => typeof a === "string" && a.includes(repo)));
  ok("docker socket never bound", !args.some((a) => typeof a === "string" && /docker\.sock/.test(a)));
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log("C — scope validation (pure) refuses out-of-scope and mixed changes");
{
  const inScope = [{ rel: "src/app.js", kind: "modified" }];
  const mixed = [{ rel: "src/app.js", kind: "modified" }, { rel: "evil.js", kind: "added" }];
  ok("all-in-scope ⇒ ok", iso.validateScope(inScope, ["src/app.js"]).ok === true);
  ok("out-of-scope ⇒ refused, names file", (() => { const r = iso.validateScope(mixed, ["src/app.js"]); return r.ok === false && r.outOfScope.join() === "evil.js"; })());
  ok("added unauthorized file ⇒ refused", iso.validateScope([{ rel: "evil.js", kind: "added" }], ["src/app.js"]).ok === false);
}

console.log("D — fail-closed: no sandbox / bad command / bad write-set ⇒ REFUSE, never unisolated");
{
  const repo = makeRepo();
  const r1 = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: "node -e 1", spawn: () => ({ status: 1, stdout: "" }) });
  ok("bwrap absent ⇒ refused (no fallback)", r1.ok === false && r1.refused === true && r1.launched === false && /sandbox unavailable/.test(r1.reason));
  const r2 = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: "foo | bar", sandboxRunner: () => ({}) });
  ok("shell-expression command ⇒ refused", r2.ok === false && r2.refused === true && /invalid isolated provider command/.test(r2.reason));
  const r3 = iso.runIsolated({ root: repo, writeSet: ["src/**"], command: "node -e 1", sandboxRunner: () => ({}) });
  ok("glob write-set ⇒ refused (not isolable)", r3.ok === false && r3.refused === true && /not isolable/.test(r3.reason));
  // exit-0 WITHOUT the --info-fd launch handshake must NOT be trusted.
  const r4 = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: "node -e 1", sandboxRunner: () => ({}), spawn: () => ({ status: 0, stdout: "", output: [null, "", "", ""] }) });
  ok("exit-0 without launch handshake ⇒ refused", r4.ok === false && r4.refused === true && r4.launched === false);
  fs.rmSync(repo, { recursive: true, force: true });
}

// ── REAL bubblewrap: the six isolation guarantees ──────────────────────────────────────────────────
if (hasBwrap) {
  console.log("E — REAL sandbox: .git / docker / secrets / network all denied (one provider run)");
  {
    const repo = makeRepo();
    const body = [
      "const fs=require('fs');const net=require('net');const o={};",
      "o.workGit=fs.existsSync('.git');",
      "o.realGit=fs.existsSync('" + repo + "/.git');",
      "o.realSecretFile=fs.existsSync('" + repo + "/secret.env');",
      "o.docker=fs.existsSync('/var/run/docker.sock')||fs.existsSync('/run/docker.sock');",
      "o.envSecret=Object.keys(process.env).indexOf('ODG_FAKE_SECRET')>=0;",
      "const s=net.connect(80,'1.1.1.1');s.setTimeout(2500);",
      "const done=()=>{try{fs.writeFileSync('src/app.js',JSON.stringify(o))}catch(e){}process.exit(0)};",
      "s.on('connect',()=>{o.net='LEAK';done()});",
      "s.on('error',e=>{o.net='BLOCKED:'+e.code;done()});",
      "s.on('timeout',()=>{o.net='BLOCKED:TIMEOUT';s.destroy();done()});",
    ].join("");
    process.env.ODG_FAKE_SECRET = "s3cr3t-value-xyz";
    const r = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: nodeProvider(body), apply: true, timeoutMs: 20000 });
    delete process.env.ODG_FAKE_SECRET;
    ok("sandbox launched (observed --info-fd child-pid)", r.launched === true);
    ok("isolation marks realRepoBound=false", r.isolation && r.isolation.realRepoBound === false);
    ok("provider effect is in-scope ⇒ applied src/app.js", r.ok === true && r.applied.applied.join() === "src/app.js");
    const report = JSON.parse(fs.readFileSync(path.join(repo, "src", "app.js"), "utf8"));
    ok("1. real repo .git UNREADABLE from sandbox", report.realGit === false);
    ok("   work copy is NOT a git repo (no .git copied)", report.workGit === false);
    ok("4. Docker socket ABSENT", report.docker === false);
    ok("5a. host env secret ABSENT (env cleared)", report.envSecret === false);
    ok("5b. on-disk secret file UNREADABLE", report.realSecretFile === false);
    ok("6. outbound network BLOCKED", typeof report.net === "string" && report.net.indexOf("BLOCKED") === 0);
    fs.rmSync(repo, { recursive: true, force: true });
  }

  console.log("F — REAL sandbox: out-of-scope write refused, never reaches the real repo");
  {
    const repo = makeRepo();
    const body = "const fs=require('fs');fs.writeFileSync('evil.js','pwned');process.exit(0)";
    const r = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: nodeProvider(body), apply: true, timeoutMs: 20000 });
    ok("2. out-of-scope add ⇒ refused", r.refused === true && r.scope.ok === false && r.scope.outOfScope.join() === "evil.js");
    ok("   nothing applied", r.applied.applied.length === 0);
    ok("   real repo never gained evil.js", fs.existsSync(path.join(repo, "evil.js")) === false);
    fs.rmSync(repo, { recursive: true, force: true });
  }

  console.log("G — REAL sandbox: mixed authorized+forbidden patch refused ATOMICALLY");
  {
    const repo = makeRepo();
    const body = "const fs=require('fs');fs.writeFileSync('src/app.js','// changed');fs.writeFileSync('evil.js','pwned');process.exit(0)";
    const r = iso.runIsolated({ root: repo, writeSet: ["src/app.js"], command: nodeProvider(body), apply: true, timeoutMs: 20000 });
    ok("3. mixed patch ⇒ whole proposal refused", r.refused === true && r.scope.ok === false);
    ok("   authorized file NOT applied (atomic)", fs.readFileSync(path.join(repo, "src", "app.js"), "utf8") === "// original\n");
    ok("   forbidden file absent from real repo", fs.existsSync(path.join(repo, "evil.js")) === false);
    fs.rmSync(repo, { recursive: true, force: true });
  }
} else {
  skip("E real .git/docker/secret/network denial", "bubblewrap unavailable");
  skip("F real out-of-scope write refusal", "bubblewrap unavailable");
  skip("G real mixed-patch atomic refusal", "bubblewrap unavailable");
}

// ── E5: provider selection + no-silent-fallback + historical never presented as isolated ───────────
console.log("H — provider selection (pure) refuses every un-guaranteeable isolation, never downgrades");
{
  const S = iso.selectDelegateMode;
  // flag OFF ⇒ historical, explicitly NOT isolated (default).
  const hist = S({ isolationRequested: false });
  ok("flag OFF ⇒ historical & isolated=false", hist.mode === "historical" && hist.isolated === false);
  ok("historical reason says NOT isolated", /NOT isolated/.test(hist.reason));
  // isolation requested but un-guaranteeable ⇒ REFUSED (not historical, not isolated).
  ok("no provider command ⇒ refused", (() => { const r = S({ isolationRequested: true, writeSet: ["a.js"] }); return r.mode === "refused" && r.isolated === false; })());
  ok("incompatible (network) provider ⇒ refused", (() => { const r = S({ isolationRequested: true, command: "claude", declaredOffline: false, writeSet: ["a.js"] }); return r.mode === "refused" && /isolation-compatible|no-network/.test(r.reason); })());
  ok("empty write-set ⇒ refused", S({ isolationRequested: true, command: "m", declaredOffline: true, writeSet: [] }).mode === "refused");
  ok("glob write-set ⇒ refused", (() => { const r = S({ isolationRequested: true, command: "m", declaredOffline: true, writeSet: ["runtime/**"] }); return r.mode === "refused" && /not isolable/.test(r.reason); })());
  // fully guaranteeable ⇒ isolated.
  const good = S({ isolationRequested: true, command: "/opt/m/llama", declaredOffline: true, writeSet: ["src/app.js"] });
  ok("concrete + offline + command ⇒ isolated", good.mode === "isolated" && good.isolated === true);
  ok("isolated mode is NEVER returned without an explicit offline assertion", S({ isolationRequested: true, command: "m", writeSet: ["a.js"] }).isolated === false);
}

console.log("I — REAL odg-delegate entrypoint: flag OFF ⇒ NOT isolated; requested-but-unmet ⇒ explicit refusal");
{
  const cp = require("child_process");
  const repoRoot = path.resolve(__dirname, "..", "..");
  const bin = path.join(repoRoot, "runtime", "dist", "bin", "odg-delegate.js"); // JS rollback twin (always present)
  const M = "ACTIVATE_EXTERNAL_RESEARCH_CAPABILITY";
  const gen = path.join(repoRoot, "runtime", "generated");
  const artefacts = [path.join(gen, "mission-plan.json"), path.join(gen, "mission-context.json"), path.join(gen, "delegation", M + ".brief.json"), path.join(gen, "delegation", M + ".brief.md")];
  const snap = artefacts.map((p) => ({ p, exists: fs.existsSync(p), data: fs.existsSync(p) ? fs.readFileSync(p) : null }));
  const restore = () => { for (const e of snap) { try { if (e.exists) { fs.mkdirSync(path.dirname(e.p), { recursive: true }); fs.writeFileSync(e.p, e.data); } else if (fs.existsSync(e.p)) fs.unlinkSync(e.p); } catch { /**/ } } };
  if (!fs.existsSync(path.join(repoRoot, "runtime", "missions", M + ".json"))) {
    skip("real odg-delegate integration", "test mission absent");
  } else {
    // 1) flag OFF ⇒ historical, labelled NOT isolated, never prints the isolated banner.
    const envOff = { ...process.env }; delete envOff.ODG_DELEGATE_ISOLATION; delete envOff.ODG_ISOLATED_PROVIDER_CMD; delete envOff.ODG_ISOLATED_PROVIDER_OFFLINE;
    const r1 = cp.spawnSync(process.execPath, [bin, M, "--prepare-only"], { cwd: repoRoot, encoding: "utf8", timeout: 60000, env: envOff });
    const out1 = String(r1.stdout || "") + String(r1.stderr || "");
    ok("flag OFF ⇒ exit 0 (historical prepare)", r1.status === 0);
    ok("flag OFF ⇒ output labels mode HISTORICAL / NOT isolated", /HISTORICAL/.test(out1) && /NOT isolated/.test(out1));
    ok("flag OFF ⇒ historical path NEVER prints the isolated banner", !/ISOLATED PROVIDER/.test(out1));
    restore();
    // 2) isolation requested but provider command unset ⇒ explicit refusal, NO silent fallback, NO verify.
    const envReq = { ...process.env, ODG_DELEGATE_ISOLATION: "1" }; delete envReq.ODG_ISOLATED_PROVIDER_CMD;
    const r2 = cp.spawnSync(process.execPath, [bin, M, "--prepare-only"], { cwd: repoRoot, encoding: "utf8", timeout: 60000, env: envReq });
    const out2 = String(r2.stdout || "") + String(r2.stderr || "");
    ok("isolation requested but unmet ⇒ non-zero exit (refused)", r2.status !== 0);
    ok("refusal is explicit + names no-silent-fallback", /cannot be guaranteed/.test(out2) && /no silent fallback/.test(out2));
    ok("refused run NEVER claims isolation succeeded", !/Applied :/.test(out2));
    restore();
  }
}

// ── FINAL_GOVERNANCE_GATE: human acceptance gate resolves apply↔verify↔converge without bypassing gitClean ─
console.log("J — acceptance gate: proposed / accepted / out-of-scope / unauthorized-commit / verify-failure");
{
  const G = iso.acceptanceGate;
  const gitC = (repo, args) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: repo, encoding: "utf8" });
  const head = (repo) => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

  // J1 — applied in-scope but UNCOMMITTED ⇒ PROPOSED, and the gate performs NO commit (ODG never auto-commits).
  {
    const repo = makeRepo(); const baseline = head(repo);
    fs.writeFileSync(path.join(repo, "src", "app.js"), "// proposed change");
    const g = G({ root: repo, writeSet: ["src/app.js"], baselineRef: baseline });
    ok("J1 uncommitted in-scope ⇒ PROPOSED_AWAITING_ACCEPTANCE", g.state === "PROPOSED_AWAITING_ACCEPTANCE" && g.ok === false);
    ok("J1 gate performed NO commit (HEAD unchanged — ODG never auto-commits)", head(repo) === baseline);
    ok("J1 verify would BLOCK on this state (gitClean=false ⇒ verifyExitCode 1)", (() => { const porc = execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim(); return porc.length > 0; })());
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J2 — human ACCEPTS by committing the in-scope change ⇒ ACCEPTED (clean tree; verify may proceed).
  {
    const repo = makeRepo(); const baseline = head(repo);
    fs.writeFileSync(path.join(repo, "src", "app.js"), "// accepted change");
    gitC(repo, ["add", "src/app.js"]); gitC(repo, ["commit", "-qm", "accept in-scope"]);
    const g = G({ root: repo, writeSet: ["src/app.js"], baselineRef: baseline });
    ok("J2 committed in-scope ⇒ ACCEPTED", g.state === "ACCEPTED" && g.ok === true && g.accepted.indexOf("src/app.js") >= 0);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J3 — out-of-scope WORKING change ⇒ BLOCKED (always).
  {
    const repo = makeRepo(); const baseline = head(repo);
    fs.writeFileSync(path.join(repo, "secret.env"), "TOKEN=tampered");
    const g = G({ root: repo, writeSet: ["src/app.js"], baselineRef: baseline });
    ok("J3 out-of-scope working change ⇒ BLOCKED", g.state === "BLOCKED" && /secret\.env/.test(g.reason));
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J4 — UNAUTHORIZED COMMIT (committed an out-of-scope file) ⇒ BLOCKED even though the tree is clean.
  {
    const repo = makeRepo(); const baseline = head(repo);
    fs.writeFileSync(path.join(repo, "secret.env"), "TOKEN=exfil");
    gitC(repo, ["add", "secret.env"]); gitC(repo, ["commit", "-qm", "unauthorized out-of-scope commit"]);
    const g = G({ root: repo, writeSet: ["src/app.js"], baselineRef: baseline });
    ok("J4 unauthorized commit (out-of-scope) ⇒ BLOCKED", g.state === "BLOCKED" && /UNAUTHORIZED COMMIT/.test(g.reason) && /secret\.env/.test(g.reason));
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J5 — empty write-set + any change ⇒ BLOCKED (nothing may change).
  {
    const repo = makeRepo(); const baseline = head(repo);
    fs.writeFileSync(path.join(repo, "src", "app.js"), "// change with no authorized scope");
    const g = G({ root: repo, writeSet: [], baselineRef: baseline });
    ok("J5 empty write-set + change ⇒ BLOCKED", g.state === "BLOCKED");
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J6 — clean tree, nothing committed since baseline ⇒ NO_PROPOSAL (nothing to accept, verify not entitled).
  {
    const repo = makeRepo(); const baseline = head(repo);
    const g = G({ root: repo, writeSet: ["src/app.js"], baselineRef: baseline });
    ok("J6 clean tree + no commit ⇒ NO_PROPOSAL (not ACCEPTED)", g.state === "NO_PROPOSAL" && g.ok === false);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // J7 — verify-failure always blocks the pipeline: verifyExitCode is 1 whenever any gate is red (enforcing).
  {
    const verify = require(path.resolve(__dirname, "..", "bin", "odg-verify.js"));
    ok("J7 verify blocks when gitClean=false (uncommitted proposal)", verify.verifyExitCode({ build: true, typescript: true, gitClean: false }, false) === 1);
    ok("J7 verify blocks when build red", verify.verifyExitCode({ build: false, typescript: true, gitClean: true }, false) === 1);
    ok("J7 verify blocks when typescript red", verify.verifyExitCode({ build: true, typescript: false, gitClean: true }, false) === 1);
  }
  // J8 — injected git seam (pure, deterministic): the gate never touches a real repo when seamed.
  {
    const seam = (working, committed) => ({ status: () => working, diffNames: () => committed });
    ok("J8 seam: in-scope uncommitted ⇒ PROPOSED", G({ writeSet: ["a.js"], git: seam(["a.js"], []) }).state === "PROPOSED_AWAITING_ACCEPTANCE");
    ok("J8 seam: out-of-scope working ⇒ BLOCKED", G({ writeSet: ["a.js"], git: seam(["b.js"], []) }).state === "BLOCKED");
    ok("J8 seam: committed in-scope ⇒ ACCEPTED", G({ writeSet: ["a.js"], baselineRef: "B0", git: seam([], ["a.js"]) }).state === "ACCEPTED");
    ok("J8 seam: committed out-of-scope ⇒ BLOCKED", G({ writeSet: ["a.js"], baselineRef: "B0", git: seam([], ["evil.js"]) }).state === "BLOCKED");
  }
}

console.log(`\nDELEGATE ISOLATION — ${passed} assertions passed, ${skipped} skipped.`);
if (skipped > 0) console.log("NOTE: skipped cases require bubblewrap; they are NOT counted as passes.");

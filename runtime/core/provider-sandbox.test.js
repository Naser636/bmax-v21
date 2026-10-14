#!/usr/bin/env node

/* Provider Sandbox — security behavioural test (η3-B124). No real provider/model call, no
 * network, no real secret. Real bubblewrap is exercised ONLY with harmless fake binaries
 * (cat/env) to prove the sandbox actually launches; those cases self-skip (reported, never
 * silently passed) when bubblewrap is unavailable. */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ps = require("./provider-sandbox");
const bashGov = require("./bash-command-governor");

let passed = 0;
let skipped = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
function skip(name, why) { console.log("  SKIP -", name, "::", why); skipped += 1; }

const hasBwrap = bashGov.detectSandbox({}).available;
// Fake runner: never spawns anything. Records argv, returns a canned launched result.
function fakeRunner(record) {
  return (bwrapArgs, io) => { record.args = bwrapArgs; record.io = io; return { launched: true, status: 0, stdout: io.input }; };
}

console.log("A — bwrap args constructed correctly");
{
  const args = ps.buildBwrapArgs({ argv: ["mybin", "--flag", "x"], work: "/tmp/work", realWork: "/tmp/w" });
  ok("has --info-fd 3 (launch handshake)", args.includes("--info-fd") && args[args.indexOf("--info-fd") + 1] === "3");
  ok("has --unshare-all", args.includes("--unshare-all"));
  ok("has --clearenv", args.includes("--clearenv"));
  ok("has --die-with-parent", args.includes("--die-with-parent"));
  ok("binds system code dir /usr ro", (() => { for (let i = 0; i < args.length - 2; i++) if (args[i] === "--ro-bind" && args[i + 1] === "/usr" && args[i + 2] === "/usr") return true; return false; })());
  const dd = args.indexOf("--");
  ok("argv passed after -- verbatim", dd !== -1 && args[dd + 1] === "mybin" && args[dd + 2] === "--flag" && args[dd + 3] === "x");
}

console.log("B — argv only; no shell interpretation");
{
  const p1 = ps.parseCommand("tr '[:lower:]' '[:upper:]'");
  ok("quoted glob chars preserved literally", p1.ok && p1.argv.length === 3 && p1.argv[0] === "tr" && p1.argv[1] === "[:lower:]" && p1.argv[2] === "[:upper:]");
  ok("pipe rejected", ps.parseCommand("foo | bar").ok === false);
  ok("and-operator rejected", ps.parseCommand("foo && bar").ok === false);
  ok("command-substitution rejected", ps.parseCommand("$(evil)").ok === false);
  ok("backtick rejected", ps.parseCommand("foo `evil`").ok === false);
  ok("redirect rejected", ps.parseCommand("foo > /etc/passwd").ok === false);
  ok("semicolon rejected", ps.parseCommand("foo; rm -rf /").ok === false);
  ok("plain binary + args accepted", (() => { const r = ps.parseCommand("/opt/m/llama --model x"); return r.ok && r.argv[0] === "/opt/m/llama"; })());
}

console.log("D — network denied and NO whole-filesystem mount");
{
  const args = ps.buildBwrapArgs({ argv: ["b"], work: "/tmp/work", realWork: "/tmp/w" });
  ok("--unshare-all present (unshares net)", args.includes("--unshare-all"));
  const hasRoBindRoot = (() => { for (let i = 0; i < args.length - 2; i++) if (args[i] === "--ro-bind" && args[i + 1] === "/" && args[i + 2] === "/") return true; return false; })();
  ok("NO --ro-bind / / (whole FS never exposed)", hasRoBindRoot === false);
  ok("no confidential dir (/etc,/home,/root) bound", !args.some((a, i) => a === "--ro-bind" && /^\/(etc|home|root)(\/|$)/.test(args[i + 1] || "")));
}

console.log("C — parent secrets absent from the child by default");
{
  const args = ps.buildBwrapArgs({ argv: ["b"], envAllowlist: [], work: "/tmp/work", realWork: "/tmp/w" });
  // default: only PATH + HOME are set; no arbitrary host env is re-injected.
  const setenvKeys = args.reduce((acc, a, i) => (a === "--setenv" ? [...acc, args[i + 1]] : acc), []);
  ok("only PATH+HOME in --setenv by default", setenvKeys.length === 2 && setenvKeys.includes("PATH") && setenvKeys.includes("HOME"));
  // real proof via a harmless fake binary (env) with a fake secret in the parent environment.
  if (hasBwrap) {
    process.env.ODG_FAKE_SECRET = "s3cr3t-value-xyz";
    const r = ps.runProvider("", { command: "env" });
    delete process.env.ODG_FAKE_SECRET;
    ok("real sandbox launched (env)", r.launched === true);
    ok("fake secret VALUE absent from child env", !/s3cr3t-value-xyz/.test(r.text || ""));
    ok("no inherited ODG_FAKE_SECRET key in child env", !/ODG_FAKE_SECRET/.test(r.text || ""));
  } else { skip("real env-leak proof", "bubblewrap unavailable"); }
}

console.log("E — only the binary + explicitly allowlisted model files are bound");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-model-"));
  const modelFile = path.join(tmp, "weights.bin");
  fs.writeFileSync(modelFile, "x");
  const args = ps.buildBwrapArgs({ argv: ["b"], modelFiles: [modelFile], work: "/tmp/work", realWork: "/tmp/w" });
  ok("allowlisted model file ro-bound", (() => { for (let i = 0; i < args.length - 2; i++) if (args[i] === "--ro-bind" && args[i + 1] === modelFile) return true; return false; })());
  let threwEtc = false;
  try { ps.buildBwrapArgs({ argv: ["b"], modelFiles: ["/etc/passwd"], work: "/tmp/work", realWork: "/tmp/w" }); } catch { threwEtc = true; }
  ok("model file under /etc rejected (confidential)", threwEtc === true);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("F — fail-closed: no sandbox / invalid profile => refuse, never unsandboxed");
{
  // bubblewrap absent (simulated): detectSandbox probe returns non-zero => refuse.
  const r1 = ps.runProvider("hi", { command: "cat", spawn: () => ({ status: 1, stdout: "" }) });
  ok("bwrap absent => refused", r1.ok === false && r1.refused === true && r1.launched === false);
  ok("refusal reason explains missing sandbox", /sandbox unavailable/.test(r1.reason));
  // invalid profile (model file under /etc) with sandbox available (injected) => refuse before run.
  const rec = {};
  const r2 = ps.runProvider("hi", { command: "cat", modelFiles: ["/etc/shadow"], sandboxRunner: fakeRunner(rec) });
  ok("invalid profile => refused", r2.ok === false && r2.refused === true);
  ok("injected runner NOT invoked on invalid profile", rec.args === undefined);
  // unparseable command with sandbox available => refuse.
  const r3 = ps.runProvider("hi", { command: "foo | bar", sandboxRunner: fakeRunner({}) });
  ok("shell-expression command => refused", r3.ok === false && r3.refused === true && /invalid ODG_LOCAL_MODEL_CMD/.test(r3.reason));
}

console.log("G — OBSERVED launch proof (not a zero exit code), via a harmless fake binary");
if (hasBwrap) {
  const r = ps.runProvider("ping-string", { command: "cat" }); // cat echoes stdin => proves stdin + launch
  ok("real bwrap launched (info-fd child-pid)", r.launched === true);
  ok("ok result", r.ok === true);
  ok("stdin delivered & stdout captured through sandbox", r.text === "ping-string");
  ok("isolation marks network false", r.isolation && r.isolation.network === false);
  ok("isolation marks whole-fs NOT exposed", r.isolation && r.isolation.wholeFsExposed === false);
  // A refusal MUST win over a zero exit if the handshake is absent: simulate a spawn that exits 0
  // but writes NO --info-fd payload => must be refused (never trusted).
  const r0 = ps.runProvider("x", { command: "cat", spawn: () => ({ status: 0, stdout: "x", output: [null, "x", "", ""] }) });
  ok("exit-0 without launch handshake => refused", r0.ok === false && r0.refused === true && r0.launched === false);
} else { skip("real launch proof", "bubblewrap unavailable"); skip("exit-0-not-trusted", "covered logically; real bwrap absent"); }

console.log("J — negative config");
{
  ok("empty command => parse error", ps.parseCommand("   ").ok === false);
  ok("unterminated quote => parse error", ps.parseCommand("foo 'bar").ok === false);
  let threwRel = false;
  try { ps.buildBwrapArgs({ argv: ["b"], modelFiles: ["relative/path"] }); } catch { threwRel = true; }
  ok("relative model path rejected", threwRel === true);
  let threwRoot = false;
  try { ps.buildBwrapArgs({ argv: ["b"], roBinds: ["/"] }); } catch { threwRoot = true; }
  ok("roBind '/' rejected", threwRoot === true);
}

console.log(`\nPROVIDER SANDBOX — ${passed} assertions passed, ${skipped} skipped.`);
if (skipped > 0) console.log("NOTE: skipped cases require bubblewrap; they are NOT counted as passes.");

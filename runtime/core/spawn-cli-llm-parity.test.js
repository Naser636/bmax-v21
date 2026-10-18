#!/usr/bin/env node
"use strict";
/*
 * SPAWN-CLI DUAL-PORT PARITY (CTO Track B) — proves the JS rollback ports and the compiled-TS dist ports
 * of the spawn-invoked LLM CLI scripts behave EQUIVALENTLY. Representative + hermetic: each port runs as a
 * real `node <script> [arg]` subprocess in an ISOLATED temp cwd (so cwd-relative writes land in temp, never
 * the repo), and we compare exit code, stdout (verbatim) and any written artifact (timestamp normalized).
 *
 * This is the reusable contract for migrating any spawn-CLI module: JS at runtime/<dir>/X.js (rollback,
 * ODG_RUNTIME=js) and compiled TS at runtime/dist/<dir>/X.js (default) must be observationally identical.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

function run(scriptAbs, args, cwd) {
  const r = cp.spawnSync(process.execPath, [scriptAbs, ...args], { cwd, encoding: "utf8", timeout: 60000 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "spawncli-"));
  return d;
}
// Normalize non-deterministic fields in a written JSON artifact for comparison.
function normArtifact(p) {
  try {
    const o = JSON.parse(fs.readFileSync(p, "utf8"));
    if (o && typeof o === "object" && "generatedAt" in o) o.generatedAt = "<NORM>";
    return JSON.stringify(o);
  } catch {
    return null;
  }
}

const JS = (rel) => path.join(REPO, "runtime", "llm", rel);
const TS = (rel) => path.join(REPO, "runtime", "dist", "llm", rel);

// Guard: both ports must exist on disk (dist built). If dist is absent the test fails honestly (never skips).
ok("both ports present on disk (js rollback + compiled-TS dist)",
  fs.existsSync(JS("response-parser.js")) && fs.existsSync(TS("response-parser.js")) &&
  fs.existsSync(JS("proposal-analyzer.js")) && fs.existsSync(TS("proposal-analyzer.js")));

// 1 — response-parser VALID input: identical exit + stdout + written proposal.json.
{
  const input = JSON.stringify({ mission: "M1", summary: "s", actions: [{ a: 1 }, { b: 2 }] });
  const dj = tmp(), dt = tmp();
  const rj = run(JS("response-parser.js"), [input], dj);
  const rt = run(TS("response-parser.js"), [input], dt);
  ok("response-parser VALID: same exit code", rj.status === rt.status && rj.status === 0);
  ok("response-parser VALID: identical stdout", rj.stdout === rt.stdout);
  ok("response-parser VALID: identical written proposal.json",
    normArtifact(path.join(dj, "runtime/generated/llm/proposal.json")) ===
    normArtifact(path.join(dt, "runtime/generated/llm/proposal.json")));
  fs.rmSync(dj, { recursive: true, force: true }); fs.rmSync(dt, { recursive: true, force: true });
}
// 2 — response-parser INVALID (missing required keys): identical non-zero exit + stdout.
{
  const input = JSON.stringify({ mission: "M1" }); // missing summary, actions
  const dj = tmp(), dt = tmp();
  const rj = run(JS("response-parser.js"), [input], dj);
  const rt = run(TS("response-parser.js"), [input], dt);
  ok("response-parser INVALID: same non-zero exit", rj.status === rt.status && rj.status === 1);
  ok("response-parser INVALID: identical stdout", rj.stdout === rt.stdout);
  fs.rmSync(dj, { recursive: true, force: true }); fs.rmSync(dt, { recursive: true, force: true });
}
// 3 — response-parser bad JSON: identical exit + stderr.
{
  const dj = tmp(), dt = tmp();
  const rj = run(JS("response-parser.js"), ["{not json"], dj);
  const rt = run(TS("response-parser.js"), ["{not json"], dt);
  ok("response-parser bad-JSON: same exit + stderr", rj.status === rt.status && rj.status === 1 && rj.stderr === rt.stderr);
  fs.rmSync(dj, { recursive: true, force: true }); fs.rmSync(dt, { recursive: true, force: true });
}
// 4 — proposal-analyzer with a proposal present: identical exit + stdout + normalized analysis artifact.
{
  function seed(d) {
    fs.mkdirSync(path.join(d, "runtime/generated/llm"), { recursive: true });
    fs.writeFileSync(path.join(d, "runtime/generated/llm/proposal.json"),
      JSON.stringify({ mission: "M2", summary: "s", actions: [{ x: 1 }] }));
  }
  const dj = tmp(), dt = tmp(); seed(dj); seed(dt);
  const rj = run(JS("proposal-analyzer.js"), [], dj);
  const rt = run(TS("proposal-analyzer.js"), [], dt);
  ok("proposal-analyzer: same exit + identical stdout", rj.status === rt.status && rj.status === 0 && rj.stdout === rt.stdout);
  ok("proposal-analyzer: identical analysis (generatedAt normalized)",
    normArtifact(path.join(dj, "runtime/generated/llm/proposal-analysis.json")) ===
    normArtifact(path.join(dt, "runtime/generated/llm/proposal-analysis.json")));
  fs.rmSync(dj, { recursive: true, force: true }); fs.rmSync(dt, { recursive: true, force: true });
}
// 5 — proposal-analyzer with NO proposal: identical non-zero exit + stderr.
{
  const dj = tmp(), dt = tmp();
  const rj = run(JS("proposal-analyzer.js"), [], dj);
  const rt = run(TS("proposal-analyzer.js"), [], dt);
  ok("proposal-analyzer missing: same non-zero exit + stderr", rj.status === rt.status && rj.status === 1 && rj.stderr === rt.stderr);
  fs.rmSync(dj, { recursive: true, force: true }); fs.rmSync(dt, { recursive: true, force: true });
}

console.log(`\nspawn-cli LLM dual-port parity — ${passed} assertions passed.`);

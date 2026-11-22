#!/usr/bin/env node
"use strict";
/*
 * V318 novel-synthesis mission driver — runs INSIDE the certified C6 sandbox child.
 * ODG's OWN path authors the fix: generative-repair-adapter.runGenerativeRepair → ollama-provider.generate
 * (local qwen2.5-coder) → strict parse → validate → repair-workflow (isolated apply, real `node --test`, exact
 * rollback on anything short of ACCEPTED). Claude Code wrote ONLY this harness + the buggy fixtures + acceptance
 * tests; it never writes the fix. Ollama = GENERATOR. Independent evaluator = deterministic node --test +
 * adversarial edge re-tests (NOT a model) — generator != evaluator.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const B = require("./genrepair-bundle.js");

const ROOT = "/work/mission-v318/ws";
const OUT = "/work/mission-v318/evidence.json";

function hashTree(dir) {
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(dir);
  files.sort();
  const h = crypto.createHash("sha256");
  for (const f of files) { h.update(path.relative(dir, f)); h.update(fs.readFileSync(f)); }
  return h.digest("hex");
}
function materialize(id, srcFile, buggy, testBody) {
  const dir = path.join(ROOT, id); fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true }); fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, srcFile), buggy);
  fs.writeFileSync(path.join(dir, "test/acc.test.js"), `const t=require("node:test");const a=require("node:assert");const fn=require("../${srcFile}");t("acc",()=>{ ${testBody} });\n`);
  return dir;
}

// NOVEL defects (NOT in the sealed generative-repair-eval corpus) — deterministic, reproducible.
const CASES = [
  { id: "clamp", file: "src/f.js", buggy: "module.exports = (x, lo, hi) => x;\n",
    instruction: "Return x clamped to the inclusive range [lo, hi]: if x<lo return lo, if x>hi return hi, else x.",
    acc: "a.strictEqual(fn(5,0,10),5);a.strictEqual(fn(-3,0,10),0);a.strictEqual(fn(99,0,10),10);",
    adversarial: "a.strictEqual(fn(0,0,10),0);a.strictEqual(fn(10,0,10),10);a.strictEqual(fn(-5,-10,-1),-5);a.strictEqual(fn(7,-10,-1),-1);" },
  { id: "second-largest", file: "src/f.js", buggy: "module.exports = (arr) => arr[0];\n",
    instruction: "Return the SECOND largest DISTINCT number in a non-empty array of numbers; if there is no distinct second largest, return null.",
    acc: "a.strictEqual(fn([3,9,1]),3);a.strictEqual(fn([9,9,4]),4);a.strictEqual(fn([5]),null);",
    adversarial: "a.strictEqual(fn([7,7,7]),null);a.strictEqual(fn([1,2]),1);a.strictEqual(fn([-1,-2,-3]),-2);" },
  { id: "roman-hard", file: "src/f.js", buggy: "module.exports = (n) => String(n);\n",
    instruction: "Convert a positive integer (1..3999) to its Roman-numeral string (e.g. 4 -> 'IV', 1994 -> 'MCMXCIV').",
    acc: "a.strictEqual(fn(4),'IV');a.strictEqual(fn(1994),'MCMXCIV');a.strictEqual(fn(9),'IX');",
    adversarial: "a.strictEqual(fn(3888),'MMMDCCCLXXXVIII');a.strictEqual(fn(40),'XL');a.strictEqual(fn(2023),'MMXXIII');" },
];

async function runCase(c) {
  const dir = materialize(c.id, c.file, c.buggy, c.acc);
  const initialHash = hashTree(dir);
  const res = await B.runGenerativeRepair({
    workspaceDir: dir, instruction: c.instruction, allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"],
    currentFiles: { [c.file]: c.buggy }, model: "qwen2.5-coder:7b", timeoutMs: 180000,
  });
  const out = { id: c.id, status: res.status, model: res.model || null, edits: res.proposalEdits || null, initialHash };
  if (res.status === "ACCEPTED") {
    const produced = fs.readFileSync(path.join(dir, c.file), "utf8").trim();
    out.producedCode = produced; out.initialCode = c.buggy.trim();
    out.novel = produced !== c.buggy.trim();
    // INDEPENDENT adversarial edge re-test (deterministic, NOT the generator): does the fix generalize?
    const advDir = path.join(ROOT, c.id + "-adv"); fs.rmSync(advDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(advDir, "src"), { recursive: true }); fs.mkdirSync(path.join(advDir, "test"), { recursive: true });
    fs.writeFileSync(path.join(advDir, c.file), produced + "\n");
    fs.writeFileSync(path.join(advDir, "test/adv.test.js"), `const t=require("node:test");const a=require("node:assert");const fn=require("../${c.file}");t("adv",()=>{ ${c.adversarial} });\n`);
    const { spawnSync } = require("child_process");
    const r = spawnSync("node", ["--test"], { cwd: advDir, timeout: 60000, encoding: "utf8" });
    out.adversarialEdgePass = r.status === 0;
    fs.rmSync(advDir, { recursive: true, force: true });
  } else {
    out.restoredExactly = hashTree(dir) === initialHash; // rollback must leave it unchanged
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

// DETERMINISTIC exact-rollback proof: feed a KNOWN-WRONG edit through the real harness; must ABSTAIN + restore byte-for-byte.
function rollbackProof() {
  const c = CASES[0];
  const dir = materialize("rollback", c.file, c.buggy, c.acc);
  const initialHash = hashTree(dir);
  const prep = B.prepareProposalContract({ workspaceDir: dir, instruction: c.instruction, allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"] });
  const wrong = { edits: [{ path: c.file, content: "module.exports = (x, lo, hi) => lo;\n" }] }; // deterministically wrong
  const res = B.applyProposal(prep.contract, wrong, { workspaceDir: dir });
  const after = hashTree(dir);
  const out = { status: res.status, restoredExactly: after === initialHash, initialHash, afterHash: after };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true });
  const cases = [];
  for (const c of CASES) { try { cases.push(await runCase(c)); } catch (e) { cases.push({ id: c.id, status: "ERROR", error: String(e && e.message) }); } }
  const rollback = rollbackProof();
  const summary = {
    novelAccepted: cases.filter((c) => c.status === "ACCEPTED" && c.novel).length,
    acceptedGeneralised: cases.filter((c) => c.status === "ACCEPTED" && c.adversarialEdgePass).length,
    acceptedButOverfit: cases.filter((c) => c.status === "ACCEPTED" && c.adversarialEdgePass === false).length,
    abstained: cases.filter((c) => c.status === "ABSTAINED").length,
    abstainRestoredExactly: cases.filter((c) => c.status === "ABSTAINED").every((c) => c.restoredExactly === true),
    total: cases.length,
    rollbackProof: rollback,
  };
  fs.writeFileSync(OUT, JSON.stringify({ schema: "v318-novel-synthesis", generatedInside: "C6 sandbox child (/work)", cases, rollback, summary }, null, 2) + "\n");
  console.log("V318_DONE " + OUT);
  console.log(JSON.stringify(summary));
}
main().catch((e) => { console.error("V318_ERROR", e && e.message); process.exit(1); });

#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the generative proposal→edits adapter: a well-formed provider proposal flows
// through the PROVEN repair harness (ACCEPT on a correct edit via injected runner); out-of-write-set / too-many /
// malformed / empty proposals are REJECTED before anything is applied; invokeProvider is honestly BLOCKED with no
// authorized provider (never faked). Real fs on an isolated tmp workspace; zero subprocess.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const A = require("./generative-repair-adapter.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

function mkWorkspace(buggy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-genadapter-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "f.js"), buggy);
  return dir;
}
const addRunner = (bin, args, opts) => { const c = fs.readFileSync(path.join(opts.cwd, "src", "f.js"), "utf8"); return { exitCode: /a\s*\+\s*b/.test(c) ? 0 : 1, stdout: "", stderr: "" }; };
const BUGGY = "module.exports = (a, b) => a - b;\n";
const CORRECT = "module.exports = (a, b) => a + b;\n";

// (1) prepareProposalContract: structured, bounded contract.
const c = A.prepareProposalContract({ workspaceDir: "/ws", acceptanceCommand: ["node", "--test"], allowedFiles: ["src/"], maxEdits: 3, instruction: "fix add" });
ok("contract has allowedFiles, acceptanceCommand, maxEdits, format", c.ok && c.contract.allowedFiles[0] === "src/" && c.contract.maxEdits === 3 && /edits/.test(c.contract.format));
ok("contract fail-closed without allowedFiles", A.prepareProposalContract({ workspaceDir: "/ws", acceptanceCommand: ["node"] }).code === "INVALID_INPUT");

// (2) valid proposal ⇒ routes through repair harness ⇒ ACCEPTED (correct edit) with fix on disk.
{
  const ws = mkWorkspace(BUGGY);
  const ct = A.prepareProposalContract({ workspaceDir: ws, acceptanceCommand: ["node", "--test"], allowedFiles: ["src/"] }).contract;
  const res = A.applyProposal(ct, { edits: [{ path: "src/f.js", content: CORRECT }] }, { workspaceDir: ws, runner: addRunner });
  ok("valid proposal ⇒ ACCEPTED via repair harness", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("accepted fix is on disk", fs.readFileSync(path.join(ws, "src", "f.js"), "utf8") === CORRECT);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (3) wrong edit ⇒ ABSTAINED + exact rollback (harness guarantees preserved through the adapter).
{
  const ws = mkWorkspace(BUGGY);
  const ct = A.prepareProposalContract({ workspaceDir: ws, acceptanceCommand: ["node", "--test"], allowedFiles: ["src/"] }).contract;
  const res = A.applyProposal(ct, { edits: [{ path: "src/f.js", content: "module.exports = (a,b)=>a*b;\n" }] }, { workspaceDir: ws, runner: addRunner });
  ok("wrong edit ⇒ ABSTAINED + rollback to baseline", res.status === "ABSTAINED" && res.rolledBack === true && fs.readFileSync(path.join(ws, "src", "f.js"), "utf8") === BUGGY);
  fs.rmSync(ws, { recursive: true, force: true });
}

// (4) proposal validation: out-of-write-set, too-many, malformed, empty ⇒ REJECTED (nothing applied).
{
  const ct = A.prepareProposalContract({ workspaceDir: "/ws", acceptanceCommand: ["node"], allowedFiles: ["src/"], maxEdits: 1 }).contract;
  ok("REJECTED: edit outside allowedFiles", A.applyProposal(ct, { edits: [{ path: "evil.js", content: "x" }] }).code === "WRITE_SET_VIOLATION");
  ok("REJECTED: too many edits", A.applyProposal(ct, { edits: [{ path: "src/a.js", content: "x" }, { path: "src/b.js", content: "y" }] }).code === "TOO_MANY_EDITS");
  ok("REJECTED: malformed edit", A.applyProposal(ct, { edits: [{ path: "src/a.js" }] }).code === "MALFORMED_EDIT");
  ok("REJECTED: empty proposal", A.applyProposal(ct, { edits: [] }).code === "EMPTY_PROPOSAL");
  ok("REJECTED: not a proposal", A.applyProposal(ct, null).code === "MALFORMED_PROPOSAL");
}

// (5) invokeProvider: honestly BLOCKED when no authorized provider (never faked).
{
  const saved = process.env.ODG_LOCAL_MODEL_CMD; delete process.env.ODG_LOCAL_MODEL_CMD;
  const r = A.invokeProvider({ instruction: "x" });
  if (saved !== undefined) process.env.ODG_LOCAL_MODEL_CMD = saved;
  ok("invokeProvider BLOCKED without provider + unblock action", r.status === "BLOCKED" && /ODG_LOCAL_MODEL_CMD/.test(r.reason) && /authorizes/.test(r.unblock));
}

// (6) runGenerativeRepair END-TO-END with an INJECTED generator (deterministic): a correct proposal ⇒ ACCEPTED.
(async () => {
  const ws = mkWorkspace(BUGGY);
  const correctGen = async () => ({ ok: true, model: "fake", text: '```json\n{"edits":[{"path":"src/f.js","content":"module.exports = (a, b) => a + b;\\n"}]}\n```' });
  const res = await A.runGenerativeRepair({ workspaceDir: ws, instruction: "make f add", allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"], currentFiles: { "src/f.js": BUGGY } }, { generate: correctGen, runner: addRunner });
  ok("runGenerativeRepair: correct model proposal ⇒ ACCEPTED (confined apply+accept)", res.status === "ACCEPTED" && res.post.status === "PASS");
  fs.rmSync(ws, { recursive: true, force: true });

  // wrong proposal ⇒ ABSTAINED + rollback (untrusted output cannot force success).
  const ws2 = mkWorkspace(BUGGY);
  const wrongGen = async () => ({ ok: true, model: "fake", text: '{"edits":[{"path":"src/f.js","content":"module.exports=(a,b)=>a*b;\\n"}]}' });
  const res2 = await A.runGenerativeRepair({ workspaceDir: ws2, instruction: "x", allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"], currentFiles: { "src/f.js": BUGGY } }, { generate: wrongGen, runner: addRunner });
  ok("runGenerativeRepair: wrong proposal ⇒ ABSTAINED + rollback", res2.status === "ABSTAINED" && res2.rolledBack === true && fs.readFileSync(path.join(ws2, "src", "f.js"), "utf8") === BUGGY);
  fs.rmSync(ws2, { recursive: true, force: true });

  // out-of-write-set proposal ⇒ REJECTED (model cannot expand its write-set).
  const ws3 = mkWorkspace(BUGGY);
  const escapeGen = async () => ({ ok: true, model: "fake", text: '{"edits":[{"path":"../../etc/evil","content":"x"}]}' });
  const res3 = await A.runGenerativeRepair({ workspaceDir: ws3, instruction: "x", allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"], currentFiles: {} }, { generate: escapeGen, runner: addRunner });
  ok("runGenerativeRepair: out-of-write-set ⇒ REJECTED (no write-set expansion)", res3.status === "REJECTED" && res3.code === "WRITE_SET_VIOLATION");
  fs.rmSync(ws3, { recursive: true, force: true });

  // generator unavailable ⇒ BLOCKED (not faked).
  const ws4 = mkWorkspace(BUGGY);
  const downGen = async () => ({ ok: false, reason: "daemon down" });
  const res4 = await A.runGenerativeRepair({ workspaceDir: ws4, instruction: "x", allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"], currentFiles: {} }, { generate: downGen });
  ok("runGenerativeRepair: generator down ⇒ BLOCKED (not faked)", res4.ok === false && res4.status === "BLOCKED");
  fs.rmSync(ws4, { recursive: true, force: true });

  // malformed model output ⇒ REJECTED.
  const ws5 = mkWorkspace(BUGGY);
  const junkGen = async () => ({ ok: true, model: "fake", text: "I cannot help with that." });
  const res5 = await A.runGenerativeRepair({ workspaceDir: ws5, instruction: "x", allowedFiles: ["src/"], acceptanceCommand: ["node", "--test"], currentFiles: {} }, { generate: junkGen });
  ok("runGenerativeRepair: malformed output ⇒ REJECTED", res5.ok === false && res5.code === "MALFORMED_PROPOSAL");
  fs.rmSync(ws5, { recursive: true, force: true });

  console.log(`\nGENERATIVE-REPAIR-ADAPTER suite — ${pass} assertions passed. (proposal→validate→proven harness; ACCEPT/ABSTAIN+rollback; REJECT out-of-scope; provider BLOCKED not faked; runGenerativeRepair confines untrusted model output)`);
})();

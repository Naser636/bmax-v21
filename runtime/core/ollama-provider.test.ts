#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO network (injected get/post transports). Validates the local provider client:
// detectOllama model selection + fail-closed; generate response handling + fail-closed; STRICT parse of an untrusted
// edits proposal (fenced / bare / prose-wrapped / malformed / empty / string-safe); loopback host is hardcoded.
"use strict";
const assert = require("assert");
const O = require("./ollama-provider.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

(async () => {
  // (1) loopback host is hardcoded to 127.0.0.1 (no SSRF surface).
  ok("loopback host is 127.0.0.1 and port 11434 (hardcoded)", O.OLLAMA_HOST === "127.0.0.1" && O.OLLAMA_PORT === 11434);

  // (2) detectOllama: prefers a coder model; fail-closed when daemon down.
  const det = await O.detectOllama({ get: async () => ({ ok: true, json: { models: [{ name: "qwen2.5:0.5b" }, { name: "qwen2.5-coder:3b" }] } }) });
  ok("detect: picks qwen2.5-coder:3b, usable", det.ok && det.chosenModel === "qwen2.5-coder:3b" && det.usable === true);
  const down = await O.detectOllama({ get: async () => ({ ok: false, reason: "ECONNREFUSED" }) });
  ok("detect: daemon down ⇒ not usable (fail-closed)", down.ok === false && down.usable === false);
  const empty = await O.detectOllama({ get: async () => ({ ok: true, json: { models: [] } }) });
  ok("detect: up but no models ⇒ not usable", empty.usable === false);

  // (3) generate: returns the response text; fail-closed on error / missing field.
  const g = await O.generate({ model: "m", prompt: "hi", post: async () => ({ ok: true, json: { response: "hello" } }) });
  ok("generate ⇒ text", g.ok && g.text === "hello");
  ok("generate requires a prompt", (await O.generate({ post: async () => ({}) })).ok === false);
  ok("generate fail-closed on transport error", (await O.generate({ prompt: "x", post: async () => ({ ok: false, reason: "timeout" }) })).ok === false);
  ok("generate fail-closed when response field missing", (await O.generate({ prompt: "x", post: async () => ({ ok: true, json: {} }) })).ok === false);

  // (4) parseEditsProposal: fenced JSON.
  ok("parse: fenced json block", O.parseEditsProposal('sure:\n```json\n{"edits":[{"path":"src/a.js","content":"x"}]}\n```').ok === true);
  // bare object amid prose.
  const p2 = O.parseEditsProposal('Here is the fix {"edits":[{"path":"a.js","content":"y"}]} done.');
  ok("parse: bare object amid prose", p2.ok && p2.proposal.edits[0].path === "a.js");
  // content containing braces/quotes is preserved by the balanced-object scan.
  const p3 = O.parseEditsProposal('{"edits":[{"path":"a.js","content":"function f(){ return {a:1}; }"}]}');
  ok("parse: content with nested braces preserved", p3.ok && /return \{a:1\}/.test(p3.proposal.edits[0].content));
  // malformed / empty / wrong shape ⇒ rejected.
  ok("parse: no JSON ⇒ reject", O.parseEditsProposal("no json here").ok === false);
  ok("parse: empty edits ⇒ reject", O.parseEditsProposal('{"edits":[]}').ok === false);
  ok("parse: malformed edit ⇒ reject", O.parseEditsProposal('{"edits":[{"path":"a.js"}]}').ok === false);

  // (5) buildRepairPrompt includes the task + allowed files + strict JSON instruction.
  const prompt = O.buildRepairPrompt({ instruction: "fix add", allowedFiles: ["src/add.js"] }, { "src/add.js": "module.exports=(a,b)=>a-b;" });
  ok("prompt carries instruction, allowed files, strict JSON directive", /fix add/.test(prompt) && /src\/add\.js/.test(prompt) && /"edits"/.test(prompt));

  console.log(`\nOLLAMA-PROVIDER suite — ${pass} assertions passed. (loopback-only client; detect/generate fail-closed; strict untrusted-proposal parse; zero network in test)`);
})();

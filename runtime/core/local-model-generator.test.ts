#!/usr/bin/env node
"use strict";
const G = require("./local-model-generator");
const B = require("./native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

// (1) buildPrompt is deterministic and carries contract + dependency context + repair error.
const p = G.buildPrompt({ path: "src/calc.js", role: "compute", contract: "module.exports=(a,b)=>a+b", dependsOn: ["src/ops.js"], buildError: "boom" }, { "src/ops.js": "exports add/sub" });
check(/src\/calc\.js/.test(p) && /module\.exports=\(a,b\)=>a\+b/.test(p), "prompt carries the file path + contract");
check(/require\('\.\/ops\.js'\)[\s\S]*exports add\/sub/.test(p) && /FAILED to build[\s\S]*boom/.test(p), "prompt carries dependency contract + the repair error");
check(G.buildPrompt({ path: "a.js", role: "x", contract: "y" }, {}) === G.buildPrompt({ path: "a.js", role: "x", contract: "y" }, {}), "buildPrompt is deterministic");

// (2) extractCode strips markdown fences and is fail-closed on non-module output.
check(G.extractCode("```javascript\nmodule.exports=1;\n```") === "module.exports=1;", "fenced code is unwrapped");
check(G.extractCode("module.exports = function(){}") === "module.exports = function(){}", "unfenced module passes through");
check(G.extractCode("Here is your answer: 42") === null, "prose (no module.exports) ⇒ null (fail-closed)");
check(G.extractCode("") === null && G.extractCode(null) === null, "empty/null ⇒ null");

// (3) the seam is fail-closed on a non-OK HTTP status / exception (injected fetch — hermetic, NO network).
(async () => {
  const okFetch = async () => ({ ok: true, json: async () => ({ model: "qwen2.5-coder:3b", eval_count: 12, response: "```js\nmodule.exports=(a,b)=>a+b;\n```" }) });
  const httpErr = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const throwFetch = async () => { throw new Error("ECONNREFUSED"); };

  const genOk = G.makeLocalGenerator({ model: "qwen2.5-coder:3b" }, okFetch);
  const r1 = await genOk({ path: "a.js", role: "add", contract: "a+b" }, {});
  check(r1.ok === true && r1.content === "module.exports=(a,b)=>a+b;" && r1.provenance.native === true, "a valid model response ⇒ ok + extracted content + provenance");
  check(r1.provenance.model === "qwen2.5-coder:3b" && r1.provenance.evalCount === 12, "provenance carries the real model + eval_count");

  const genErr = G.makeLocalGenerator({}, httpErr);
  check((await genErr({ path: "a.js" }, {})).ok === false, "HTTP 500 ⇒ ok:false (fail-closed)");
  const genThrow = G.makeLocalGenerator({}, throwFetch);
  check((await genThrow({ path: "a.js" }, {})).ok === false, "connection refused ⇒ ok:false (fail-closed, never fabricated)");

  const genProse = G.makeLocalGenerator({}, async () => ({ ok: true, json: async () => ({ response: "I cannot do that." }) }));
  check((await genProse({ path: "a.js" }, {})).ok === false, "a non-module (prose) response ⇒ ok:false");

  // (4) INTEGRATION — the seam drives native-project-builder; the INDEPENDENT verifier still arbitrates (a wrong model ⇒ REJECT).
  const spec = { name: "calc", writeSet: ["src/calc.js"], architecture: [{ path: "src/calc.js", role: "add", contract: "a+b" }], independentTest: (m: any) => m["src/calc.js"](2, 3) === 5 };
  const rightModel = async () => ({ ok: true, json: async () => ({ response: "module.exports=(a,b)=>a+b;" }) });
  const wrongModel = async () => ({ ok: true, json: async () => ({ response: "module.exports=(a,b)=>a-b;" }) });
  const good = await B.buildProject(spec, { generateFile: G.makeLocalGenerator({}, rightModel) });
  const bad = await B.buildProject(spec, { generateFile: G.makeLocalGenerator({}, wrongModel) });
  check(good.accepted === true, "a correct local-model build ⇒ ACCEPTED by the independent verifier");
  check(bad.accepted === false && bad.buildOk === true, "a compiling-but-wrong local-model build ⇒ REJECTED (generator never self-validates)");

  if (failures === 0) process.stdout.write("ALL PASS — V12.4 LOCAL MODEL GENERATOR (hermetic)\n");
  process.exit(failures === 0 ? 0 : 1);
})();

export {};

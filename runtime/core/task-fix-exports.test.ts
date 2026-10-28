#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Lot A third task family: deterministic repair of a DEFINED-BUT-NOT-EXPORTED symbol.
// Pure detection/fix-gen tested directly; orchestration via runRepairWorkflow with an INJECTED runner (zero
// subprocess) simulating a test that needs `require(mod).fn` — fails until the export exists. Proves ACCEPT on real
// fix, UNSUPPORTED when the symbol is undefined or already exported (no invented implementation), and rollback.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./task-fix-exports.js");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) detectMissingExport: defined + not exported ⇒ repairable.
const srcMissing = "function greet(n){ return 'hi ' + n; }\n";
let d = T.detectMissingExport(srcMissing, "greet");
ok("detect: defined + not exported", d.defined === true && d.exported === false);
// already exported (object literal) ⇒ not repairable.
ok("detect: already exported in object literal", T.detectMissingExport("const greet=()=>1;\nmodule.exports = { greet };\n", "greet").exported === true);
// already exported (property form).
ok("detect: already exported via exports.x", T.detectMissingExport("function f(){}\nmodule.exports.f = f;\n", "f").exported === true);
// not defined at all ⇒ not defined.
ok("detect: symbol not defined", T.detectMissingExport("function other(){}\n", "greet").defined === false);

// (2) generateExportFix: append form + object-literal insert form.
ok("fix: append module.exports.greet when no object export", /module\.exports\.greet = greet;/.test(T.generateExportFix(srcMissing, "greet")));
const objFix = T.generateExportFix("const a=1;\nfunction greet(){}\nmodule.exports = { a };\n", "greet");
ok("fix: insert into existing object literal", /module\.exports = \{\s*a\s*,\s*greet\s*\}/.test(objFix));
const emptyObjFix = T.generateExportFix("function greet(){}\nmodule.exports = {};\n", "greet");
ok("fix: insert into empty object literal", /module\.exports = \{\s*greet\s*\}/.test(emptyObjFix));

// (3) buildFixExportsTask fail-closed / UNSUPPORTED (never invents).
ok("UNSUPPORTED: symbol not defined ⇒ no invented implementation", T.buildFixExportsTask({ workspaceDir: "/tmp/x", modulePath: "src/m.js", symbol: "ghost", acceptanceCommand: ["node", "--test"], source: "function other(){}" }).code === "UNSUPPORTED");
ok("UNSUPPORTED: already exported", T.buildFixExportsTask({ workspaceDir: "/tmp/x", modulePath: "src/m.js", symbol: "greet", acceptanceCommand: ["node", "--test"], source: "function greet(){}\nmodule.exports={greet};" }).code === "UNSUPPORTED");
ok("INVALID: bad symbol", T.buildFixExportsTask({ workspaceDir: "/tmp/x", modulePath: "src/m.js", symbol: "9bad", acceptanceCommand: ["node"], source: "x" }).code === "INVALID_INPUT");
ok("INVALID: missing source", T.buildFixExportsTask({ workspaceDir: "/tmp/x", modulePath: "src/m.js", symbol: "greet", acceptanceCommand: ["node"] }).code === "INVALID_INPUT");

// Runner simulating `node --test`: PASS iff src/m.js exports `greet` (require(mod).greet is a function).
function mkRepo(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-fixexp-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "m.js"), src);
  return dir;
}
const exportRunner = (bin, args, opts) => {
  const s = fs.readFileSync(path.join(opts.cwd, "src", "m.js"), "utf8");
  const exported = /module\.exports\s*=\s*\{[^}]*\bgreet\b[^}]*\}/.test(s) || /(module\.)?exports\.greet\s*=/.test(s);
  return { exitCode: exported ? 0 : 1, stdout: "", stderr: exported ? "" : "TypeError: greet is not a function" };
};

// (4) ACCEPTED — baseline FAIL (greet undefined) → export added → test PASS, fix kept.
{
  const ws = mkRepo(srcMissing);
  const b = T.buildFixExportsTask({ workspaceDir: ws, modulePath: "src/m.js", symbol: "greet", acceptanceCommand: ["node", "--test"], source: srcMissing });
  ok("buildFixExportsTask ok for a genuine missing export", b.ok === true);
  const res = R.runRepairWorkflow(b.task, { runner: exportRunner });
  ok("ACCEPTED: missing-export repair makes the failing test pass", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  ok("ACCEPTED: export actually present on disk", /module\.exports\.greet = greet;/.test(fs.readFileSync(path.join(ws, "src", "m.js"), "utf8")));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (5) ABSTAINED + rollback — runner that never passes (defect is NOT a missing export) ⇒ exact rollback.
{
  const ws = mkRepo(srcMissing);
  const b = T.buildFixExportsTask({ workspaceDir: ws, modulePath: "src/m.js", symbol: "greet", acceptanceCommand: ["node", "--test"], source: srcMissing });
  const res = R.runRepairWorkflow(b.task, { runner: () => ({ exitCode: 1, stdout: "", stderr: "unrelated failure" }) });
  ok("ABSTAINED + exact rollback when the fix does not satisfy acceptance", res.status === "ABSTAINED" && res.rolledBack === true && fs.readFileSync(path.join(ws, "src", "m.js"), "utf8") === srcMissing);
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nTASK-FIX-EXPORTS suite — ${pass} assertions passed. (deterministic missing-export repair; ACCEPT real fix / UNSUPPORTED no-invent / ABSTAIN+rollback; composes with repair-workflow)`);

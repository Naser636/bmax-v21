#!/usr/bin/env node
// @ts-nocheck — runs under tsx. 6th family: deterministic unused-named-import removal. Pure detection tested directly;
// orchestration via runRepairWorkflow with an INJECTED runner (acceptance FAILs while the unused import is present,
// PASSes once removed). Proves ACCEPT on a proven-unused import, UNSUPPORTED when used or not imported (never removes
// a used import), out-of-scope rollback.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./task-fix-unused-imports.js");
const R = require("./repair-workflow.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const USED = 'import { a, b } from "./x";\nexport const r = a + 1;\nexport const s = b + 2;\n';
const UNUSED = 'import { a, b } from "./x";\nexport const r = a + 1;\n';   // b imported but unused

// (1) detection.
ok("detect: used import ⇒ not unused", T.detectUnusedImport(USED, "b").unused === false && T.detectUnusedImport(USED, "b").referenced === true);
ok("detect: unused import ⇒ unused", T.detectUnusedImport(UNUSED, "b").unused === true && T.detectUnusedImport(UNUSED, "b").imported === true);
ok("detect: not-imported symbol ⇒ imported false", T.detectUnusedImport(UNUSED, "zzz").imported === false);
ok("detect: 'a' still referenced ⇒ not unused", T.detectUnusedImport(UNUSED, "a").unused === false);

// (2) build fail-closed: used ⇒ UNSUPPORTED; not imported ⇒ UNSUPPORTED.
ok("UNSUPPORTED: removing a USED import refused", T.buildFixUnusedImportsTask({ workspaceDir: "/w", modulePath: "m.ts", source: USED, symbols: ["b"], acceptanceCommand: ["lint"] }).code === "UNSUPPORTED");
ok("UNSUPPORTED: symbol not imported", T.buildFixUnusedImportsTask({ workspaceDir: "/w", modulePath: "m.ts", source: UNUSED, symbols: ["zzz"], acceptanceCommand: ["lint"] }).code === "UNSUPPORTED");
ok("INVALID: bad symbol", T.buildFixUnusedImportsTask({ workspaceDir: "/w", modulePath: "m.ts", source: UNUSED, symbols: ["9x"], acceptanceCommand: ["lint"] }).code === "INVALID_INPUT");

// Repo + runner: acceptance (noUnusedLocals oracle) FAILs iff m.ts still imports the unused `b`.
function mkRepo() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-unused-")); fs.writeFileSync(path.join(d, "m.ts"), UNUSED); return d; }
const lintRunner = (bin, args, opts) => { const c = fs.readFileSync(path.join(opts.cwd, "m.ts"), "utf8"); return { exitCode: /\bb\b.*from|import\s*\{[^}]*\bb\b/.test(c) ? 1 : 0, stdout: "", stderr: /import\s*\{[^}]*\bb\b/.test(c) ? "error: 'b' is declared but never used" : "" }; };

// (3) ACCEPTED — unused import removed ⇒ oracle passes; the fixed file no longer imports `b` but keeps `a`.
{
  const ws = mkRepo();
  const b = T.buildFixUnusedImportsTask({ workspaceDir: ws, modulePath: "m.ts", source: UNUSED, symbols: ["b"], acceptanceCommand: ["tsc"] });
  ok("buildFixUnusedImportsTask ok", b.ok && b.removed.includes("b"));
  const res = R.runRepairWorkflow(b.task, { runner: lintRunner });
  ok("ACCEPTED: unused import removed ⇒ oracle passes", res.status === "ACCEPTED" && res.baseline.status === "FAIL" && res.post.status === "PASS");
  const after = fs.readFileSync(path.join(ws, "m.ts"), "utf8");
  ok("ACCEPTED: 'b' removed, 'a' preserved", /import \{ a \} from/.test(after) && !/\bb\b/.test(after.split("\n")[0]));
  fs.rmSync(ws, { recursive: true, force: true });
}

// (4) ABSTAINED + rollback — oracle never passes ⇒ exact rollback to original source.
{
  const ws = mkRepo();
  const b = T.buildFixUnusedImportsTask({ workspaceDir: ws, modulePath: "m.ts", source: UNUSED, symbols: ["b"], acceptanceCommand: ["tsc"] });
  const res = R.runRepairWorkflow(b.task, { runner: () => ({ exitCode: 1, stdout: "", stderr: "unrelated" }) });
  ok("ABSTAINED + exact rollback", res.status === "ABSTAINED" && res.rolledBack === true && fs.readFileSync(path.join(ws, "m.ts"), "utf8") === UNUSED);
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log(`\nTASK-FIX-UNUSED-IMPORTS suite — ${pass} assertions passed. (deterministic unused-import removal; ACCEPT proven-unused / UNSUPPORTED used-or-not-imported; ABSTAIN+rollback; composes local-fixers + repair-workflow)`);

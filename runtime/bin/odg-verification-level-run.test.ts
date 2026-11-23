#!/usr/bin/env node
"use strict";
/* Tests for the verification-level CLI (inspection #902 regressions): rename detection, exit policy, stdout drain. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const C = require("./odg-verification-level-run.ts");
const VL = require("../core/odg-verification-level.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // HIGH: git mv of a control-surface file + edit must list BOTH paths (no rename collapsing)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-vl-"));
  try {
    const g = (args: string[]) => cp.spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
    g(["init", "-q"]); g(["config", "user.email", "t@example.invalid"]); g(["config", "user.name", "t"]);
    fs.mkdirSync(path.join(tmp, "runtime", "core"), { recursive: true });
    const body = Array.from({ length: 40 }, (_, i) => `const line${i} = ${i};`).join("\n") + "\n";
    fs.writeFileSync(path.join(tmp, "runtime", "core", "odg-sandbox-isolation-audit.ts"), body);
    g(["add", "-A"]); g(["commit", "-q", "-m", "a"]);
    g(["mv", "runtime/core/odg-sandbox-isolation-audit.ts", "runtime/core/odg-sia.ts"]);
    fs.appendFileSync(path.join(tmp, "runtime", "core", "odg-sia.ts"), "const edited = 1;\n");
    g(["add", "-A"]); g(["commit", "-q", "-m", "b"]);
    const d = C.changedFilesOf("HEAD~1", "HEAD", tmp);
    check("HIGH: rename lists BOTH old and new path (--no-renames)", d.ok && d.files.includes("runtime/core/odg-sandbox-isolation-audit.ts") && d.files.includes("runtime/core/odg-sia.ts"));
    const p = VL.chooseLevel(d.files, { root: tmp, fullList: ["runtime/core/x.test.ts"] });
    check("HIGH: the renamed control surface ⇒ L3 REINFORCED, inspection MANDATORY", p.level === "L3" && p.reinforced && p.independentInspection === "MANDATORY");
    const bad = C.changedFilesOf("no-such-ref", "HEAD", tmp);
    check("diff failure ⇒ ok:false, empty list, error text (fail closed upstream)", !bad.ok && bad.files.length === 0 && /fail closed/.test(bad.error));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // MED: --measure on an L3 plan is never exit 0
  const L3 = { level: "L3" }, L1 = { level: "L1" };
  let e = C.exitFor(L3, { run: true, measuring: true, executed: true });
  check("MED: measuring L1/L2 on an L3 plan ⇒ exit ≥ 2, MEASUREMENT_ONLY status", e.code >= 2 && /MEASUREMENT_ONLY/.test(e.status));
  check("--run on L3 ⇒ exit 2", C.exitFor(L3, { run: true }).code === 2);
  check("L1 executed green ⇒ exit 0", C.exitFor(L1, { run: true, executed: true }).code === 0);
  check("LOW/MED: executed tier with 0 suites ⇒ non-zero NO_TESTS_SELECTED", (e = C.exitFor(L1, { run: true, executed: true, noTestsSelected: true })).code === 1 && e.status === "NO_TESTS_SELECTED");
  check("suite or tsc failure ⇒ exit 1; diff error ⇒ exit 1", C.exitFor(L1, { run: true, failed: true }).code === 1 && C.exitFor(L1, { errors: true }).code === 1);

  // LOW: a large --json output piped is not truncated (process.exitCode lets stdout drain)
  const root = path.join(__dirname, "..", "..");
  const tsx = path.join(root, "node_modules", ".bin", "tsx");
  const r = cp.spawnSync(tsx, [path.join(root, "runtime", "bin", "odg-verification-level-run.ts"), "--files", ["src/x.ts", ...Array.from({ length: 600 }, (_, i) => `docs/pad-${i}.md`)].join(","), "--json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let parsed: any = null; try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  check(`LOW: piped --json (${(r.stdout || "").length} bytes, > 64 KB) parses completely`, !!parsed && (r.stdout || "").length > 65536 && parsed.plan.level === "L3" && parsed.exitCode === 0);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main();
export {};

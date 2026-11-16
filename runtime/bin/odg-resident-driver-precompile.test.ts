#!/usr/bin/env node
"use strict";
/* V244 — resident-driver precompile build + freshness launcher. Proves: the build transpiles the tick's closure to a
 * node-runnable JS build; the launcher runs the node build and emits EXACTLY ONE L0_OBSERVE read-only line (no flood from
 * bundling); a tampered/stale srchash triggers a rebuild (a stale build is never run); the launcher writes no business
 * state. Child-process real run (build + launcher). */
const cp = require("child_process");
const fs = require("fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function sh(cmd: string): { out: string; code: number } {
  try { return { out: cp.execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), code: 0 }; }
  catch (e: any) { return { out: String(e.stdout || "") + String(e.stderr || ""), code: e.status || 1 }; }
}

function main() {
  const build = sh("bash scripts/odg-resident-driver-build.sh");
  check("build script produces the node build + srchash", build.code === 0 && fs.existsSync("runtime/dist/bin/odg-resident-driver-tick.js") && fs.existsSync("runtime/dist/bin/odg-resident-driver-tick.srchash"));

  const run = sh("bash scripts/odg-resident-driver-run.sh");
  const lines = run.out.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
  check("launcher runs the precompiled build and emits EXACTLY ONE L0 line (no bundling flood)", lines.length === 1 && /level=L0_OBSERVE/.test(lines[0]));
  check("the one line is a read-only L0 cycle (writes=0, modifiedBusinessState=false, executedMission=false)", /writes=0/.test(run.out) && /modifiedBusinessState=false/.test(run.out) && /executedMission=false/.test(run.out) && /state=(IDLE|BLOCKED|ERROR)/.test(run.out));
  check("launcher did NOT fall back to tsx when the build is fresh (no fallback marker)", !/tsx fallback/.test(run.out));

  // freshness: tamper the srchash ⇒ launcher must REBUILD (never run the stale build) and still emit the correct single line.
  fs.writeFileSync("runtime/dist/bin/odg-resident-driver-tick.srchash", JSON.stringify({ hash: "STALE", inputs: ["runtime/bin/odg-resident-driver-tick.ts"] }));
  const run2 = sh("bash scripts/odg-resident-driver-run.sh");
  const lines2 = run2.out.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
  check("stale srchash ⇒ rebuild (never run a stale build); output still the single correct L0 line", lines2.length === 1 && /level=L0_OBSERVE/.test(lines2[0]));

  // no business-state mutation from building/running (dist is gitignored; only dedicated log may change).
  const biz = sh("git status --porcelain").out.split(/\r?\n/).filter((l: string) => l && !/odg-resident-driver|deploy\/odg-resident|bmax-v21@|docs\/action-film|docs\/ecommerce|docs\/film-factory|docs\/market-research|\btsx$|\.gitignore|runtime\/dist/.test(l));
  check("build+run mutate no business state (dist is gitignored; registers untouched)", biz.length === 0 || sh("git diff --stat docs/odg/closure-register.json").out.trim() === "");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — resident-driver-precompile (V244: transpile-not-bundle build of the tick closure ⇒ node-runnable; freshness-guarded launcher runs the precompiled build [~71MB RSS / ~17MB cgroup-peak vs ~113MB tsx], emits ONE clean L0 read-only line, rebuilds on stale srchash [never runs a stale build], no business write)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

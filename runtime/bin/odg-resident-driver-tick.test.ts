#!/usr/bin/env node
"use strict";
/* V242 — resident-driver L0 tick CLI (user-systemd entrypoint). Proves: running the real tick produces an L0_OBSERVE
 * read-only cycle (writes=0, modifiedBusinessState=false, executedMission=false), exits 0, and does NOT mutate any
 * business register/source/config (only the dedicated gitignored technical log may change). Child-process real run. */
const cp = require("child_process");
const fs = require("fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function gitBiz(): string { // business working-tree signature, excluding this checkpoint's own new files + pre-existing untracked noise
  try {
    return cp.execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
      .split(/\r?\n/).filter((l: string) => l && !/odg-resident-driver|deploy\/odg-resident|bmax-v21@|docs\/action-film|docs\/ecommerce|docs\/film-factory|docs\/market-research|\btsx$/.test(l)).sort().join("\n");
  } catch { return "GIT_UNAVAILABLE"; }
}

function main() {
  const before = gitBiz();
  let out = "", code = 0;
  try { out = cp.execFileSync("npx", ["tsx", "runtime/bin/odg-resident-driver-tick.ts"], { encoding: "utf8" }); }
  catch (e: any) { code = e.status || 1; out = String(e.stdout || ""); }
  const after = gitBiz();

  check("tick exits 0", code === 0);
  check("tick prints an L0_OBSERVE read-only cycle (writes=0, modifiedBusinessState=false, executedMission=false)", /level=L0_OBSERVE/.test(out) && /writes=0/.test(out) && /modifiedBusinessState=false/.test(out) && /executedMission=false/.test(out));
  check("tick reports a real state (IDLE/BLOCKED/ERROR) over the committed roadmap", /state=(IDLE|BLOCKED|ERROR)/.test(out));
  check("tick does NOT mutate business state (working tree unchanged except dedicated gitignored log)", before === after || before === "GIT_UNAVAILABLE");
  check("dedicated technical log is gitignored (not a business register)", (() => { try { return cp.execFileSync("git", ["check-ignore", "runtime/logs/resident-driver-l0.log"], { encoding: "utf8" }).trim().length > 0; } catch { return false; } })());

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — resident-driver-tick (V242: the user-systemd L0 entrypoint runs ONE bounded read-only OBSERVE cycle, writes=0, no business-state mutation, exits 0; technical trace in a dedicated gitignored log)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

/*
 * MSE governance-gate exclusion test.
 *
 * Reproduces the release-gate STOP that halted the autonomous loop:
 *   - RootCauseEngine emits a corrective mission → runtime/missions/<MISSION>.json
 *   - the Provider executes it and emits runtime/missions/<MISSION>.evidence.md
 *   - git reports the evidence file as untracked (??)
 *   - the MSE [5/5] GOVERNANCE check (`git status --porcelain -- $ARTIFACT_EXCLUDES`)
 *     saw it as a change OUTSIDE the artifact directories → "STOP: Repository changed unexpectedly"
 *
 * The fix registers runtime/missions/*.evidence.md as a Runtime-owned artifact in the SAME
 * single-source-of-truth exclusion set the gate already uses. This test parses ARTIFACT_EXCLUDES
 * straight out of runtime/bin/odg-local-pipeline.sh (so it stays coupled to the real script) and
 * runs the exact governance pathspec against a throwaway git repo, asserting:
 *   1. an untracked <MISSION>.evidence.md is IGNORED (the mission chains, no false STOP);
 *   2. a stray source edit is STILL reported (the gate has not gone blind);
 *   3. a stray runtime/missions/<MISSION>.json is STILL reported (only evidence is excluded, not
 *      the Mission Loader's input contracts).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

// --- Parse the real exclusion set out of the mse script -----------------------------------------
const mseSource = fs.readFileSync("runtime/bin/odg-local-pipeline.sh", "utf8");
// Match to the closing paren at the start of a line — entries contain `:(exclude)` whose own
// `)` would otherwise end a naive non-greedy match early.
const arrayBlock = mseSource.match(/ARTIFACT_EXCLUDES=\(([\s\S]*?)\n\)/);
check(arrayBlock !== null, "mse: ARTIFACT_EXCLUDES array found");
const excludes = [...(arrayBlock?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
check(
  excludes.includes(":(exclude)runtime/missions/*.evidence.md"),
  "mse: evidence artifact registered in ARTIFACT_EXCLUDES",
);

// --- Fixture repo -------------------------------------------------------------------------------
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mse-gate-"));
function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}
function write(rel: string, body: string): void {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

git("init", "-q");
git("config", "user.email", "t@t");
git("config", "user.name", "t");
// A committed baseline so status only reflects the deltas we introduce below. src/ is committed
// too (as in the real repo) so a new file under it shows with its full path rather than git
// collapsing a wholly-untracked directory to "src/".
write("runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.json", "{}");
write("src/.keep", "");
git("add", "-A");
git("commit", "-qm", "baseline");

// The governance check EXACTLY as mse runs it in [5/5].
function governance(): string {
  return git("status", "--porcelain", "--", ...excludes).trim();
}

// 1. Provider-emitted evidence file, untracked → must NOT trip the gate.
write("runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.evidence.md", "# Evidence\n");
check(governance() === "", "untracked <MISSION>.evidence.md is ignored by governance");

// 2. A stray source edit alongside it → gate MUST still report it.
write("src/stray-source-edit.ts", "export const x = 1;\n");
const withSource = governance();
check(withSource.includes("src/stray-source-edit.ts"), "stray source file still reported");
check(!withSource.includes(".evidence.md"), "evidence file remains excluded even with other changes");

// 3. A stray mission CONTRACT json → still governed (only *.evidence.md is excluded).
fs.rmSync(path.join(repo, "src/stray-source-edit.ts"));
write("runtime/missions/STRAY_CONTRACT.json", "{}");
check(governance().includes("runtime/missions/STRAY_CONTRACT.json"), "stray mission contract json still reported");

fs.rmSync(repo, { recursive: true, force: true });

if (failures > 0) { console.error(`\nMSE governance gate: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nMSE governance gate OK");

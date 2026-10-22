// @ts-nocheck — Lot RESOLVE_GIT_CLEAN_GATE: the gitClean gate scopes out CTO-preserved non-mission state
// (the runtime-updated compass + untracked docs/market-research/) WITHOUT weakening the gate for real work.
/*
 * Proves, in a hermetic temp git repo, that `git status --porcelain -- <gitCleanExcludes()>`:
 *   PASS (clean) — when the ONLY dirty paths are the preserved compass (ODG_PROJECT_STATE.md, tracked+modified),
 *                  untracked docs/market-research/, and runtime-regenerated bookkeeping (*.evidence.md).
 *   FAIL (dirty) — as soon as a TRACKED SOURCE file is modified, or ANY OTHER untracked file appears.
 * This is the anti-bypass guarantee: the gate still fails closed on real uncommitted mission/source work, so a
 * mission can never RELEASE with its deliverable uncommitted. Dual-port (.ts-compiled ≡ historical .js).
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const V_JS = path.join(REPO, "runtime", "bin", "odg-verify.js");
const V_DIST = path.join(REPO, "runtime", "dist", "bin", "odg-verify.js");

console.log("ODG-VERIFY gitClean SCOPE — preserves CTO state, fails closed on real work (both ports)");
ok("prerequisite: compiled dist odg-verify present", fs.existsSync(V_DIST));

// Dual-port: both runtimes expose gitCleanExcludes and agree on the static preserved excludes.
const jsEx = require(V_JS).gitCleanExcludes();
delete require.cache[V_DIST]; const distEx = require(V_DIST).gitCleanExcludes();
ok("both ports exclude the compass", jsEx.includes(":(exclude)ODG_PROJECT_STATE.md") && distEx.includes(":(exclude)ODG_PROJECT_STATE.md"));
ok("both ports exclude the research dir", jsEx.includes(":(exclude)docs/market-research/") && distEx.includes(":(exclude)docs/market-research/"));
ok("both ports keep the existing evidence.md exclude", jsEx.includes(":(exclude)runtime/missions/*.evidence.md") && distEx.includes(":(exclude)runtime/missions/*.evidence.md"));
ok("neither port excludes tracked SOURCE paths (no runtime/core / src exclude)",
    !jsEx.some((e) => /runtime\/core|src\//.test(e)) && !distEx.some((e) => /runtime\/core|src\//.test(e)));

// Behavioural proof in a throwaway git repo.
function git(dir, args) { return cp.execSync(`git ${args}`, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }); }
function porcelain(dir, excludes) {
    return git(dir, `status --porcelain -- ${excludes.map((p) => `'${p}'`).join(" ")}`).trim();
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitclean-"));
try {
    git(dir, "init -q");
    fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "core", "foo.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(dir, "ODG_PROJECT_STATE.md"), "# compass\nv1\n");
    git(dir, "add -A");
    git(dir, "commit -qm base");
    const EX = require(V_JS).gitCleanExcludes(); // runs in REPO cwd; static excludes are cwd-independent

    // Scenario CLEAN: only preserved/regenerated paths dirty.
    fs.writeFileSync(path.join(dir, "ODG_PROJECT_STATE.md"), "# compass\nv2 updated this mission\n"); // tracked M (compass)
    fs.mkdirSync(path.join(dir, "docs", "market-research"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs", "market-research", "note.md"), "research\n");             // untracked (preserved)
    fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "missions", "X.evidence.md"), "evidence\n");           // regenerated bookkeeping
    ok("CLEAN: only compass + research + evidence.md dirty ⇒ gitClean would be TRUE (porcelain empty)",
        porcelain(dir, EX) === "");

    // Scenario DIRTY-SOURCE: a TRACKED source file changes ⇒ still reported ⇒ gitClean FALSE (anti-bypass).
    fs.writeFileSync(path.join(dir, "runtime", "core", "foo.ts"), "export const a = 2; // real work\n");
    ok("DIRTY: a modified TRACKED source file ⇒ gitClean FALSE (gate still fails closed on real work)",
        porcelain(dir, EX).includes("runtime/core/foo.ts"));

    // revert the source change; re-confirm clean, then a STRAY untracked file elsewhere ⇒ still dirty.
    git(dir, "checkout -- runtime/core/foo.ts");
    ok("re-clean after reverting the source change", porcelain(dir, EX) === "");
    fs.writeFileSync(path.join(dir, "stray-deliverable.ts"), "export const leaked = 1;\n");            // untracked, NOT preserved
    ok("DIRTY: a stray untracked file outside the preserved paths ⇒ gitClean FALSE (no untracked blanket pass)",
        porcelain(dir, EX).includes("stray-deliverable.ts"));
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nODG-VERIFY gitClean SCOPE — ${passed} assertions passed.`);

#!/usr/bin/env node
/* TS source (tsx-run). Migration-toolchain optimizer (CTO self-improvement §2). */
/*
 * AFFECTED-TEST SELECTOR — given a set of changed files, return the MINIMAL set of test files that must run
 * to prove parity + non-regression for those changes, so a migration wave validates in seconds instead of
 * re-running the whole ~250-file global suite (measured ~490–560s). It does NOT replace the global suite at
 * integration points — it removes the REPEATED global run after every isolated wave (CTO: cut useless global
 * validations, never a necessary parity/regression test).
 *
 * Reuses the existing require-scanner (scripts/lib/js-require-scan.js) for CJS `require(...)`; adds ESM
 * `import ... from "..."` / `export ... from "..."` / dynamic `import("...")` parsing. A test is AFFECTED
 * when it references a changed file by resolved relative path OR by basename (generous — extra tests are
 * safe; a missed one is not).
 *
 * FAIL-SAFE (never hide a needed test): if ANY changed file is a widely-shared module (referenced by > SHARED
 * threshold of distinct non-test files) OR any test file uses a DYNAMIC require/import (target not a string
 * literal), the tool returns recommendation=FULL_SUITE — the caller must run the whole glob. Output is JSON:
 * { changed, affected, universeCount, recommendation, reason, speedup }.
 *
 * Usage: tsx scripts/affected-tests.ts <file> [<file> ...]      (or: --git  → uses `git diff --name-only`)
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { parseRequiresFromSource } = require("./lib/js-require-scan.js");

const ROOT = process.cwd();
const SHARED_THRESHOLD = 8; // a module referenced by more than this many distinct non-test files ⇒ full suite
const EXCLUDE = /(^|\/)(node_modules|\.git|\.next|runtime\/dist|runtime\/releases|runtime\/local-recovery|\.claude\/worktrees)(\/|$)/;

function walk(dir: string, acc: string[]): void {
  let ents: any[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    const rel = p.replace(/^\.\//, "");
    if (EXCLUDE.test("/" + rel)) continue;
    if (d.isDirectory()) walk(p, acc);
    else acc.push(rel);
  }
}

// All specifiers a source file references (CJS require + ESM import/export-from + dynamic import), plus a
// dynamic flag (a require/import whose argument is not a plain string literal — unresolvable statically).
function specifiersOf(file: string): { specs: string[]; dyn: boolean } {
  let src = "";
  try { src = fs.readFileSync(file, "utf8"); } catch { return { specs: [], dyn: false }; }
  const { literal, dyn: dynReq } = parseRequiresFromSource(src);
  const specs = [...literal];
  const importRe = /\b(?:import|export)\b[^;'"]*?\bfrom\s*("([^"]*)"|'([^']*)')/g;
  const dynImportRe = /\bimport\(\s*("([^"]*)"|'([^']*)')\s*\)/g;
  let m: any;
  while ((m = importRe.exec(src))) specs.push(m[2] !== undefined ? m[2] : m[3]);
  while ((m = dynImportRe.exec(src))) specs.push(m[2] !== undefined ? m[2] : m[3]);
  const dynImp = /\bimport\(\s*[^"')\s]/.test(src);
  return { specs, dyn: dynReq || dynImp };
}

const isTest = (f: string) => /\.test\.[jt]s$/.test(f) || /\.e2e\.test\.[jt]s$/.test(f);
const stripExt = (f: string) => f.replace(/\.[jt]s$/, "").replace(/\.d$/, "");
const baseNoExt = (f: string) => stripExt(path.basename(f));

// Resolve a relative specifier (from `fromFile`'s dir) to a repo-relative path without extension.
function resolveRel(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const abs = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
  return stripExt(path.relative(ROOT, abs));
}

function main(): any {
  const argv = process.argv.slice(2);
  let changed: string[];
  if (argv.includes("--git")) {
    const out = cp.execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" });
    changed = out.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
  } else {
    changed = argv.filter((a) => !a.startsWith("--"));
  }
  changed = changed.filter((f) => /\.[jt]s$/.test(f));
  if (changed.length === 0) return { changed: [], affected: [], universeCount: 0, recommendation: "NONE", reason: "no changed .js/.ts files", speedup: null };

  const all: string[] = [];
  walk(".", all);
  const tests = all.filter(isTest);
  const nonTests = all.filter((f) => !isTest(f) && /\.[jt]s$/.test(f));

  const changedSet = new Set(changed.map(stripExt));
  const changedBases = new Set(changed.map(baseNoExt));

  // FAIL-SAFE 1: a widely-shared changed module (referenced by many distinct non-test files) ⇒ full suite.
  for (const ch of changed) {
    const chNoExt = stripExt(ch), chBase = baseNoExt(ch);
    let refs = 0;
    for (const nf of nonTests) {
      if (stripExt(nf) === chNoExt) continue;
      const { specs } = specifiersOf(nf);
      if (specs.some((s) => { const r = resolveRel(nf, s); return (r && r === chNoExt) || baseNoExt(s) === chBase; })) refs++;
      if (refs > SHARED_THRESHOLD) break;
    }
    if (refs > SHARED_THRESHOLD) {
      return { changed, affected: tests, universeCount: tests.length, recommendation: "FULL_SUITE", reason: `changed file ${ch} is shared (referenced by > ${SHARED_THRESHOLD} non-test files) — full regression suite required`, speedup: null };
    }
  }

  // Distinctive changed-file basenames (word tokens) — dual-port parity tests reference ports via COMPUTED
  // paths (path.join(REPO,"runtime/bin","odg-X.js")), so the basename appears as a STRING, not in require().
  // A raw-source token match catches those; distinctive names (odg-*, specific module names) ⇒ low false-rate,
  // and a false positive only runs one extra test (safe) — never a missed regression.
  const changedTokens = [...changedBases].filter((b) => b.length >= 4);
  const tokenRe = changedTokens.length ? new RegExp("\\b(" + changedTokens.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b") : null;

  const affected = new Set<string>();
  let dynamicSeen = false;
  for (const t of tests) {
    const { specs, dyn } = specifiersOf(t);
    let hit = false;
    for (const s of specs) {
      const r = resolveRel(t, s);
      if ((r && changedSet.has(r)) || changedBases.has(baseNoExt(s))) { hit = true; break; }
    }
    // Raw-source token match (computed-path references in dual-port parity tests).
    if (!hit && tokenRe) {
      let src = "";
      try { src = fs.readFileSync(path.join(ROOT, t), "utf8"); } catch { /* */ }
      if (tokenRe.test(src)) hit = true;
    }
    // A changed file's co-located sibling test (same dir + same base + .test) always runs.
    if (!hit) {
      for (const ch of changed) {
        const sib = stripExt(ch) + ".test";
        if (stripExt(t) === sib || stripExt(t) === stripExt(ch).replace(/\.test$/, "") + ".test") { hit = true; break; }
      }
    }
    if (hit) { affected.add(t); if (dyn) dynamicSeen = true; }
  }

  // FAIL-SAFE 2: a dynamic require/import in an affected test means its true dependency set is not statically
  // knowable — keep it (already included) but flag so the caller knows coverage may extend beyond the static set.
  const affectedList = [...affected].sort();
  const speedup = tests.length > 0 ? Number((tests.length / Math.max(1, affectedList.length)).toFixed(1)) : null;
  return {
    changed,
    affected: affectedList,
    universeCount: tests.length,
    recommendation: affectedList.length === 0 ? "FULL_SUITE" : "TARGETED",
    reason: affectedList.length === 0
      ? "no test statically references the changed files — cannot prove targeted; run full suite"
      : `${affectedList.length}/${tests.length} tests reference the changed files${dynamicSeen ? " (NOTE: an affected test uses dynamic require/import — static set may be incomplete)" : ""}`,
    speedup,
  };
}

module.exports = { specifiersOf, resolveRel, main };

export {};

if (require.main === module) {
  const r = main();
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  // Exit 0 always (advisory tool); the recommendation field drives the caller.
  process.exit(0);
}

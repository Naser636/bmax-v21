#!/usr/bin/env node
/*
 * LOT change-impact-graph — deterministic unit test (§U Phase-1 #1).
 *
 * NEW read-only capability (not a JS→TS parity port — no .js twin). Proves: the graph reproduces the
 * full-closure/hazard/consumer/impacted-test survey hand-run every migration mission (V22/V24/V31–V36),
 * is deterministic, and performs ZERO writes. Offline, pure.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/change-impact-graph.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { buildGraph, impactOf } = require(path.join(REPO, "runtime", "core", "change-impact-graph.ts"));

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT change-impact-graph — deterministic unit test");

// ── NO-WRITE PROOF: fs mutators throw during the whole run; any write ⇒ the module FAILS loudly. ──
const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync, realMkdir = fs.mkdirSync, realRm = fs.rmSync;
let writeAttempts = 0;
const trap = (orig: any, n: string) => ((...a: any[]) => { writeAttempts++; throw new Error(`UNEXPECTED WRITE via fs.${n}`); });
(fs as any).writeFileSync = trap(realWrite, "writeFileSync");
(fs as any).appendFileSync = trap(realAppend, "appendFileSync");
(fs as any).mkdirSync = trap(realMkdir, "mkdirSync");
(fs as any).rmSync = trap(realRm, "rmSync");

// Snapshot runtime/core listing (name+size) before, to prove the tree is untouched.
function coreHash(): string {
  const dir = path.join(REPO, "runtime", "core");
  const h = crypto.createHash("sha256");
  for (const f of fs.readdirSync(dir).sort()) h.update(f + ":" + fs.statSync(path.join(dir, f)).size + ";");
  return h.digest("hex");
}
const before = coreHash();

let graph: any, oa: any, capfac: any, email: any, brec: any, astore: any, strans: any, ghost: any, oa2: any;
let ppa: any, capreg: any, locaut: any, epa: any, mcb: any;
try {
  graph = buildGraph(REPO);
  oa = impactOf(REPO, "objective-attribution");
  capfac = impactOf(REPO, "capability-factory");
  email = impactOf(REPO, "email-gateway");
  brec = impactOf(REPO, "build-recovery-engine");
  astore = impactOf(REPO, "autonomy-store");
  strans = impactOf(REPO, "state-transition");
  ghost = impactOf(REPO, "no-such-module-xyz");
  oa2 = impactOf(REPO, "objective-attribution");
  // V49 regression surface (real repo).
  ppa = impactOf(REPO, "patch-proposal-apply");
  capreg = impactOf(REPO, "capability-registry");
  locaut = impactOf(REPO, "local-autonomy");
  epa = impactOf(REPO, "expert-profile-assembler");
  mcb = impactOf(REPO, "mission-context-builder");
} finally {
  (fs as any).writeFileSync = realWrite; (fs as any).appendFileSync = realAppend; (fs as any).mkdirSync = realMkdir; (fs as any).rmSync = realRm;
}
check(writeAttempts === 0, "NO-WRITE: module performed zero fs mutations during buildGraph + 8 impactOf calls");
check(coreHash() === before, "NO-WRITE: runtime/core tree byte-listing unchanged (name+size hash identical)");

// 1. graph shape: nodes present, every dep/consumer edge is symmetric.
check(Array.isArray(graph.modules) && graph.modules.includes("state-transition") && graph.modules.includes("objective-attribution"), "graph: core module nodes present");
let symmetric = true;
for (const m of graph.modules) for (const d of graph.deps[m]) if (!graph.consumers[d].includes(m)) symmetric = false;
check(symmetric, "graph: deps/consumers edges are symmetric (reverse index consistent)");

// 2. objective-attribution — no dynamic/external-require hazard; it DOES now carry a TRANSITIVE pathHazard.
// UPDATED (post-V33): its closure reaches capability-executors, which at capability-executors.ts:102 uses
// `const dir = __dirname` to resolve the self-worker .js entry. That is a DELIBERATE, dist-SAFE pattern
// (lines 98-104 explicitly remap dist/core → runtime/core), but the analyzer is conservative and flags any
// executable __dirname+path-build. So the analyzer is CORRECT to report it; the V33 "hazard-free" snapshot
// is stale (capability-executors grew the __dirname since V33). Asserted to CURRENT reality, with the cause
// documented — NOT a functional bug, and not silently blessed.
check(oa.exists && oa.closureHazards.dynamicRequire === false && oa.closureHazards.externalRequire === false, "objective-attribution: no dynamic/external-require hazard");
check(oa.closureHazards.pathHazard === true && oa.closureHazards.modules.includes("capability-executors"), "objective-attribution: TRANSITIVE pathHazard via capability-executors' intentional dist-aware __dirname (capability-executors.ts:102; conservative analyzer flag, not a functional bug)");
check(oa.transitiveClosure.includes("objective-attribution") && oa.transitiveClosure.includes("capability-probes"), "objective-attribution: closure includes self + capability-probes dep");
check(oa.impactedTests.some((t: string) => /objective-attribution/.test(t)), "objective-attribution: impactedTests include its own test(s)");

// 3. capability-factory — the V22 dynamic-require hazard is now GONE (V71 refactor: the former require(abs)
// was removed; see capability-factory.ts:32 note — the file writes a module source but performs no dynamic
// require). Analyzer correct; V22 snapshot stale. Detection ability for this class stays guarded by B1 (synthetic).
check(capfac.exists && capfac.closureHazards.dynamicRequire === false, "capability-factory: V22 dynamic-require hazard REMOVED (V71) — analyzer no longer flags it");

// 4. email-gateway — the V24 external-require hazard is now GONE (V71 dependency inversion: `imapflow` is
// INJECTED by the edge caller, email-gateway.ts:75-79, so the closure is external-require-clean). Analyzer
// correct; V24 snapshot stale. A synthetic externalRequire detection guard (B1b, below) keeps coverage.
check(email.exists && email.closureHazards.externalRequire === false, "email-gateway: V24 external-require hazard REMOVED (V71 dependency inversion — imapflow injected)");

// 5. build-recovery-engine — NO path hazard (V49 fix A): it is process.cwd()-safe (η3-B42); its only
//    __dirname is in a COMMENT documenting the historical derivation. The former assertion here locked that
//    comment-only false positive; the corrected truth is pathHazard === false. (A genuine executable path
//    hazard is still detected — proven by patch-proposal-apply in the V49 regression block below.)
check(brec.exists && brec.closureHazards.pathHazard === false, "build-recovery-engine: comment-only __dirname ⇒ NO path hazard (V49 fix A — false positive corrected)");

// 6. consumers (reverse deps) match known dependents.
check(astore.exists && astore.consumers.includes("capability-metrics") && astore.consumers.includes("patch-memory") && astore.consumers.includes("capability-learning"), "autonomy-store: consumers include capability-metrics/patch-memory/capability-learning (known)");
check(strans.exists && strans.consumers.includes("artifact-state") && strans.consumers.includes("world-model") && strans.consumers.includes("git-branch-integration") && strans.consumers.includes("self-diagnostic"), "state-transition: consumers include artifact-state/world-model/git-branch-integration/self-diagnostic (known)");

// 7. nonexistent module ⇒ exists:false, empty report (fail-safe).
check(ghost.exists === false && ghost.transitiveClosure.length === 0 && ghost.consumers.length === 0, "unknown module ⇒ exists:false empty report (fail-safe)");

// 8. determinism: same query twice ⇒ byte-identical.
check(JSON.stringify(oa) === JSON.stringify(oa2), "determinism: impactOf twice ⇒ byte-identical");

// ──────────────────────────────────────────────────────────────────────────────────────────────────────
// V49 — detector refinement: comment-stripping (fix A) + .ts-port reference source (fix B).
// Controlled fixtures in a temp root (hermetic; exercises the REAL public API buildGraph/impactOf).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────
const os = require("node:os");
const roots: string[] = [];
function mkRoot(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cig-"));
  roots.push(root);
  const core = path.join(root, "runtime", "core");
  fs.mkdirSync(core, { recursive: true });
  for (const [name, src] of Object.entries(files)) fs.writeFileSync(path.join(core, name), src);
  return root;
}
const pHaz = (root: string, m: string) => impactOf(root, m).closureHazards;

try {
  // A1. path hazard ONLY in a comment ⇒ NO false hazard.
  {
    const r = mkRoot({
      "comment-haz.js": "/* historical: const x = path.resolve(__dirname, '..', '..'); */\n// also path.join(__dirname)\nmodule.exports = {};\n",
    });
    check(pHaz(r, "comment-haz").pathHazard === false, "A1 comment-only __dirname+path ⇒ NO path hazard (fix A)");
  }
  // A2. REAL executable path hazard ⇒ ALWAYS detected (recall preserved).
  {
    const r = mkRoot({ "exec-haz.js": "const path = require('path');\nconst r = path.resolve(__dirname, '..', '..');\nmodule.exports = { r };\n" });
    check(pHaz(r, "exec-haz").pathHazard === true, "A2 executable path.resolve(__dirname) ⇒ path hazard DETECTED");
  }
  // A3. a STRING containing comment characters ⇒ parsed correctly: the require AFTER it is still found,
  //     the fake `//`,`/*` inside the string do NOT swallow it (B141 string-preservation).
  {
    const r = mkRoot({
      "str-haz.js": "const label = \"see // and /* unclosed notes below\";\nconst dep = require('./realdep');\nmodule.exports = { dep };\n",
      "realdep.js": "module.exports = {};\n",
    });
    check(impactOf(r, "str-haz").directDeps.includes("realdep"), "A3 comment chars INSIDE a string ⇒ the following require('./realdep') is still detected (not swallowed)");
    check(pHaz(r, "str-haz").pathHazard === false, "A3 string with comment chars but no real __dirname ⇒ NO path hazard");
  }
  // A4. a path-hazard token INSIDE a string stays conservative (strings preserved verbatim — no recall loss,
  //     identical to the historical raw-source behaviour).
  {
    const r = mkRoot({ "str-token.js": "const s = 'path.resolve(__dirname)'; module.exports = { s };\n" });
    check(pHaz(r, "str-token").pathHazard === true, "A4 __dirname+path.resolve inside a STRING ⇒ still flagged (conservative; strings preserved, no recall loss)");
  }
  // B1. real dynamic require ⇒ ALWAYS detected.
  {
    const r = mkRoot({ "dyn-req.js": "const n = process.env.X || 'm';\nconst m = require(n);\nmodule.exports = { m };\n" });
    check(pHaz(r, "dyn-req").dynamicRequire === true, "B1 dynamic require(var) ⇒ DETECTED");
  }
  // B1b. real external-package require ⇒ ALWAYS detected (keeps detection coverage after email-gateway's
  //      real hazard was removed by V71 — the analyzer must still flag a genuine external require).
  {
    const r = mkRoot({ "ext-req.js": "const client = require('imapflow');\nmodule.exports = { client };\n" });
    check(pHaz(r, "ext-req").externalRequire === true, "B1b external-package require(\"imapflow\") ⇒ DETECTED");
  }
  // B2. TRANSITIVE hazard ⇒ ALWAYS detected (parent clean, child executable path hazard).
  {
    const r = mkRoot({
      "parent.js": "const c = require('./child-haz');\nmodule.exports = { c };\n",
      "child-haz.js": "const path = require('path');\nconst r = path.resolve(__dirname, '..');\nmodule.exports = { r };\n",
    });
    const h = pHaz(r, "parent");
    check(h.pathHazard === true && h.modules.includes("child-haz"), "B2 transitive path hazard in a dep ⇒ DETECTED, attributed to child-haz");
  }
  // B3. JS + TS port where the .ts is dist-SAFE (process.cwd()) ⇒ reference is the .ts ⇒ NO hazard (fix B).
  {
    const r = mkRoot({
      "ported.js": "const path = require('path');\nconst R = path.resolve(__dirname, '..', '..');\nmodule.exports = { R };\n",
      "ported.ts": "const path = require('path');\nconst ROOT = process.cwd();\nconst R = path.resolve(ROOT, 'runtime');\nmodule.exports = { R };\nexport {};\n",
    });
    check(pHaz(r, "ported").pathHazard === false, "B3 JS hazardous but TS port process.cwd()-safe ⇒ .ts chosen ⇒ NO hazard (fix B)");
  }
  // B4. NEGATIVE: a .ts port that itself carries a REAL hazard is NOT hidden (3C: ports never mask hazards).
  {
    const r = mkRoot({
      "unsafe.js": "const ROOT = process.cwd();\nmodule.exports = { ROOT };\n",
      "unsafe.ts": "const path = require('path');\nconst R = path.resolve(__dirname, '..', '..');\nmodule.exports = { R };\nexport {};\n",
    });
    check(pHaz(r, "unsafe").pathHazard === true, "B4 TS port with a real __dirname hazard ⇒ DETECTED (a port never hides a real hazard)");
  }
  // B5. module with NO .ts port ⇒ historical .js behaviour preserved (real hazard still flagged).
  {
    const r = mkRoot({ "legacy.js": "const path = require('path');\nconst R = path.resolve(__dirname, '..');\nmodule.exports = { R };\n" });
    check(pHaz(r, "legacy").pathHazard === true, "B5 no TS port ⇒ historical .js analysis preserved (hazard flagged)");
  }
  // ────────────────────────────────────────────────────────────────────────────────────────────────────
  // V51 — pathHazard understands the REPO_ROOT DERIVATION (third defect class). A root assigned from
  // process.cwd() is dist-safe; one derived from __dirname (or an unknown source) stays a hazard. Recall
  // is never lowered: __dirname is always caught, and an unproven REPO_ROOT stays conservatively flagged.
  // ────────────────────────────────────────────────────────────────────────────────────────────────────
  // C1. REPO_ROOT = process.cwd() + path.resolve(REPO_ROOT,…) ⇒ NO hazard (the V48 proven convention).
  {
    const r = mkRoot({ "cwd-root.js": "const path = require('path');\nconst REPO_ROOT = process.cwd();\nconst abs = path.resolve(REPO_ROOT, 'runtime');\nmodule.exports = { abs };\n" });
    check(pHaz(r, "cwd-root").pathHazard === false, "C1 REPO_ROOT = process.cwd() + path.resolve ⇒ NO path hazard (safe derivation)");
  }
  // C2. SAME but with a TS type annotation between the name and `=` (mirrors the real expert-profile-assembler.ts).
  {
    const r = mkRoot({
      "typed-root.js": "module.exports = {};\n", // node set needs the .js basename
      "typed-root.ts": "const path = require('path');\nconst REPO_ROOT: string = process.cwd();\nconst abs = path.resolve(REPO_ROOT, 'runtime');\nmodule.exports = { abs };\nexport {};\n",
    });
    check(pHaz(r, "typed-root").pathHazard === false, "C2 `REPO_ROOT: string = process.cwd()` (typed) ⇒ NO path hazard (annotation tolerated)");
  }
  // C3. REPO_ROOT derived from __dirname ⇒ hazard STILL detected (recall: the dangerous derivation).
  {
    const r = mkRoot({ "dirname-root.js": "const path = require('path');\nconst REPO_ROOT = path.resolve(__dirname, '..', '..');\nconst abs = path.join(REPO_ROOT, 'runtime');\nmodule.exports = { abs };\n" });
    check(pHaz(r, "dirname-root").pathHazard === true, "C3 REPO_ROOT = path.resolve(__dirname,…) ⇒ path hazard DETECTED (dangerous derivation)");
  }
  // C4. CONSERVATIVE: a bare REPO_ROOT token used in a path build with NO provable process.cwd() assignment
  //     (e.g. imported from elsewhere) stays FLAGGED — never clear what we cannot prove safe (no recall loss).
  {
    const r = mkRoot({ "imported-root.js": "const path = require('path');\nconst { REPO_ROOT } = require('./roots');\nconst abs = path.join(REPO_ROOT, 'x');\nmodule.exports = { abs };\n" });
    check(pHaz(r, "imported-root").pathHazard === true, "C4 bare REPO_ROOT (no provable process.cwd() assignment) + path build ⇒ STILL flagged (conservative)");
  }
  // C5. TRANSITIVE: a clean parent whose child derives REPO_ROOT from __dirname ⇒ hazard DETECTED + attributed.
  {
    const r = mkRoot({
      "p-clean.js": "const c = require('./c-dirname');\nmodule.exports = { c };\n",
      "c-dirname.js": "const path = require('path');\nconst REPO_ROOT = path.resolve(__dirname, '..');\nconst abs = path.join(REPO_ROOT, 'x');\nmodule.exports = { abs };\n",
    });
    const h = pHaz(r, "p-clean");
    check(h.pathHazard === true && h.modules.includes("c-dirname"), "C5 transitive REPO_ROOT-from-__dirname hazard ⇒ DETECTED, attributed to c-dirname");
  }
  // C6. COMMENT/STRING classification: REPO_ROOT only in a COMMENT ⇒ not a hazard; the SAME token in a STRING
  //     stays conservative (strings preserved verbatim — identical to __dirname string behaviour A4).
  {
    const r = mkRoot({
      "repo-comment.js": "// note: historical builds derived REPO_ROOT from path.resolve(__dirname)\nmodule.exports = {};\n",
      "repo-string.js": "const s = 'REPO_ROOT via path.join'; module.exports = { s };\n",
    });
    check(pHaz(r, "repo-comment").pathHazard === false, "C6 REPO_ROOT + path mention ONLY in a comment ⇒ NO hazard (comments stripped)");
    check(pHaz(r, "repo-string").pathHazard === true, "C6 REPO_ROOT + path.join inside a STRING ⇒ still flagged (conservative; strings preserved, no recall loss)");
  }
  // C7. no-.ts candidate with REPO_ROOT = process.cwd() ⇒ safe behaviour preserved (historical .js analysed directly).
  {
    const r = mkRoot({ "nots-cwd.js": "const path = require('path');\nconst REPO_ROOT = process.cwd();\nconst abs = path.resolve(REPO_ROOT, 'a');\nmodule.exports = { abs };\n" });
    check(pHaz(r, "nots-cwd").pathHazard === false, "C7 no TS port + REPO_ROOT = process.cwd() ⇒ NO hazard (safe .js derivation preserved)");
  }
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

// ── migrate-plan REGRESSION (real repo): legitimate blocks STAY; the two targeted false positives are GONE. ──
check(brec.closureHazards.pathHazard === false, "REGRESSION: build-recovery-engine FALSE POSITIVE removed (fix A — comment-only)");
check(capreg.closureHazards.pathHazard === false, "REGRESSION: capability-registry FALSE POSITIVE removed (fix B — .ts port is process.cwd()-safe)");
check(ppa.closureHazards.pathHazard === true, "REGRESSION: patch-proposal-apply genuine path hazard KEPT (executable path.join(__dirname,...))");
// UPDATED (post-V71): these three require-hazards were legitimately REMOVED by the V71 injection-seam /
// dependency-inversion migration (capability-factory dynamic require deleted; email-gateway's imapflow
// injected; local-autonomy's transitive hazard cleared with capability-factory). The analyzer correctly no
// longer reports them; the "hazard KEPT" regression guards are superseded. Detection of each class is still
// guarded synthetically (B1 dynamic-require, B1b external-require), so recall is not lowered.
check(locaut.closureHazards.dynamicRequire === false, "REGRESSION: local-autonomy transitive dynamic-require hazard REMOVED (V71) — analyzer clean");
check(capfac.closureHazards.dynamicRequire === false, "REGRESSION: capability-factory dynamic-require hazard REMOVED (V71) — analyzer clean");
check(email.closureHazards.externalRequire === false, "REGRESSION: email-gateway external-require hazard REMOVED (V71 dependency inversion) — analyzer clean");
// V51 FIX (third defect class, now CLOSED): expert-profile-assembler's .ts port assigns `REPO_ROOT =
// process.cwd()` (dist-safe, V48) and uses path.resolve(REPO_ROOT,…). The former predicate keyed on the bare
// REPO_ROOT TOKEN and mis-flagged it; the predicate now clears REPO_ROOT only when derived from process.cwd().
// This was previously asserted ===true to lock the known false positive (stale-test discipline); corrected to
// ===false now that the source is fixed. Recall is unchanged — proven by the C-block and B4/B5 negatives.
check(epa.closureHazards.pathHazard === false, "REGRESSION: expert-profile-assembler NO path hazard (V51 — REPO_ROOT derived from process.cwd() is dist-safe; false positive corrected)");
// V51 end-to-end: mission-context-builder was blocked ONLY transitively via expert-profile-assembler's false
// positive; with that cleared, its closure is now path-hazard-free (unless a genuine hazard remains elsewhere).
check(mcb.exists && mcb.closureHazards.pathHazard === false, "REGRESSION: mission-context-builder transitive path hazard CLEARED (V51 — was blocked only via expert-profile-assembler)");

console.log(failures === 0 ? "ALL PASS — LOT change-impact-graph" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

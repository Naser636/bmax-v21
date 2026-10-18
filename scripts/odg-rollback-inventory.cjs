#!/usr/bin/env node
// READ-ONLY static rollback inventory (§4). For each dual-rollback .js (has a .ts sibling), trace
// consumers by reproducible static scan; classify; emit per-file evidence. No file is modified.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const REPO = process.cwd();
const inv = JSON.parse(fs.readFileSync(path.join(process.cwd(),"runtime","generated","js-inventory.json"), "utf8"));
const list = (inv.buckets && inv.buckets["dual-rollback"]) || [];

// All candidate referrer files (source, scripts, tests) — exclude node_modules, dist, backup.
function allFiles() {
  const out = cp.execSync(
    "git ls-files 'runtime/**/*.js' 'runtime/**/*.ts' 'scripts/**/*.js' 'scripts/**/*.ts' 'src/**/*.ts' '*.js' '*.ts'",
    { cwd: REPO, encoding: "utf8" }
  ).split("\n").filter(Boolean).filter((f) => !f.includes("/dist/") && !f.includes("/backup/"));
  return out;
}
const FILES = allFiles();
const readCache = {};
const read = (f) => (readCache[f] !== undefined ? readCache[f] : (readCache[f] = (() => { try { return fs.readFileSync(path.join(REPO, f), "utf8"); } catch { return ""; } })()));

function classify(rel) {
  const base = path.basename(rel).replace(/\.js$/, "");       // e.g. "email-gateway"
  const tsSib = rel.replace(/\.js$/, ".ts");
  const refs = { staticReq: [], jsLiteral: [], dynamic: [], bench: [], test: [] };
  // basename-token regexes (reproducible): require/import of "./base" or ".../base(.js)"; literal "base.js"
  const reqRe = new RegExp('(require\\(|from\\s+|import\\()\\s*["\\\'`][^"\\\'`]*\\b' + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '(\\.js)?["\\\'`]');
  const litRe = new RegExp('["\\\'`][^"\\\'`]*\\b' + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\.js["\\\'`]');
  const dynRe = new RegExp('(legacyRequire|path\\.join|spawnSync|spawn|execFile)[^\\n]*\\b' + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '\\b');
  for (const f of FILES) {
    if (f === rel || f === tsSib) continue;               // skip self (.js and its .ts twin)
    const c = read(f);
    if (!c.includes(base)) continue;
    const isTest = /\.test\.ts$|\.e2e\.test\.ts$|\.test\.js$/.test(f);
    const isBench = f.includes("/__bench__/");
    if (reqRe.test(c)) { (isBench ? refs.bench : isTest ? refs.test : refs.staticReq).push(f); }
    else if (litRe.test(c)) { (isBench ? refs.bench : isTest ? refs.test : refs.jsLiteral).push(f); }
    else if (dynRe.test(c)) { refs.dynamic.push(f); }
  }
  const liveStatic = refs.staticReq.filter((f) => !/\.test\./.test(f));
  const liveLiteral = refs.jsLiteral.concat(refs.dynamic).filter((f) => !/\.test\./.test(f) && !f.includes("/__bench__/"));
  let klass;
  if (liveStatic.length) klass = "ACTIF";                 // a live (non-test) module statically requires it
  else if (liveLiteral.length) klass = "INDIRECT";        // live dynamic/literal reference (legacyRequire/spawn/path.join)
  else if (refs.bench.length) klass = "TEST/OUTIL";       // consumed by an equivalence bench (proves .js==.ts)
  else if (refs.test.length) klass = "TEST/OUTIL";
  else if (/^runtime\/bin\//.test(rel) && /^#!/.test(read(rel))) klass = "ACTIF_ENTRYPOINT"; // CLI bin, run directly (node odg-X.js)
  else if (/\/__bench__\//.test(rel) || /\.test\.js$/.test(rel)) klass = "TEST/OUTIL"; // test/bench entrypoint (run by runner)
  else klass = "NON_REFERENCE_A_CONFIRMER";
  // every dual twin is reachable via the ODG_RUNTIME=js rollback entry fallback ⇒ RECOVERY floor
  const recoveryFloor = true;
  return { rel, base, klass, recoveryFloor,
    staticLive: liveStatic, dynamicLive: liveLiteral, bench: refs.bench.length, test: refs.test.length };
}

const results = list.map(classify);
const byClass = {};
for (const r of results) byClass[r.klass] = (byClass[r.klass] || 0) + 1;
console.log("ROLLBACK STATIC INVENTORY — count:", results.length);
console.log("by class:", JSON.stringify(byClass));
console.log("\nNON_REFERENCE_A_CONFIRMER (no static/dynamic/bench/test referrer found):");
for (const r of results.filter((x) => x.klass === "NON_REFERENCE_A_CONFIRMER")) console.log("  -", r.rel);
console.log("\nACTIF (live non-test static require):");
for (const r of results.filter((x) => x.klass === "ACTIF")) console.log("  -", r.rel, "<=", r.staticLive.slice(0, 3).join(","));
fs.writeFileSync(path.join(process.cwd(),"runtime","generated","rollback-inventory-report.json"), JSON.stringify({ count: results.length, byClass, results }, null, 2));
console.log("\nfull per-file evidence → rollback-inventory-report.json");

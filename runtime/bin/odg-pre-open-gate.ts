#!/usr/bin/env node
"use strict";

/*
 * odg-pre-open-gate — ONE command a provider (or GO) runs BEFORE opening / pushing a PR (V17.6 RB-PRE-OPEN-SELF-INSPECTION,
 * ranked by docs/odg/evidence/V176_RADAR_BUILD_PROPOSALS.json: 84% of summed PR open→merge time is after-open rework; the
 * recurring causes were generated evidence not regenerated (DRIFT), tests freezing old state / hard-coded counts, merge-
 * behind-main, missing tsc). It REUSES the existing machinery — no second engine:
 *   - change-set:      git diff <base>...HEAD (+ staged / unstaged / untracked working-tree changes)
 *   - impact:          runtime/core/change-impact-graph (transitive consumers of changed core modules)
 *   - test execution:  runtime/bin/odg-test-report (the classified gate; ONLY the impacted suites, ODG_TEST_WORKERS bounded)
 *   - evidence drift:  every committed-generated-evidence CLI that declares `--check` (DISCOVERED from runtime/bin, never a
 *                      hard-coded list); its inputs = the paths its committed record cites + its source literals + its
 *                      runtime/core closure; a CLI that scans docs/odg/evidence is triggered by any evidence change.
 * Sections: (1) behind base (reported, never auto-merged) (2) generated-evidence DRIFT with the exact regenerate command
 * (3) impacted tests, NOT OK lines (4) tsc --noEmit root (+ tsconfig.runtime-dist.json when runtime/ code is touched)
 * (5) conflict markers / unmerged paths (6) node_modules accidentally staged/committed/untracked (7) verdict READY|NOT_READY.
 * It NEVER modifies tracked files; `--fix-regenerate` MAY rerun the regenerate command of a DRIFTED deterministic record
 * (reported). Running tests writes only gitignored artifacts (runtime/generated/test-report.json, runtime/dist via the
 * fingerprint-guarded build). A TARGETED run never certifies: the full CI gate stays the certification point.
 *
 * Usage: npx tsx runtime/bin/odg-pre-open-gate.ts [--base origin/main] [--json] [--workers N] [--no-tests] [--no-tsc]
 *          [--no-checks] [--no-build] [--fix-regenerate] [--max-tests N]
 * Exit: 0 READY, 1 NOT_READY, 2 usage/git error.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const CIG = require("../core/change-impact-graph");

type Change = { status: string; path: string };

function git(root: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || "").toString() };
}

/* ---------- change-set ---------- */

/** parse `git diff --name-status` output (R/C keep the destination path; the source path is reported as D). */
function parseNameStatus(out: string): Change[] {
  const res: Change[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const st = parts[0].charAt(0);
    if ((st === "R" || st === "C") && parts.length >= 3) { if (st === "R") res.push({ status: "D", path: parts[1] }); res.push({ status: "A", path: parts[2] }); }
    else if (parts.length >= 2) res.push({ status: st, path: parts[1] });
  }
  return res;
}

function mergeChanges(lists: Change[][]): Change[] {
  const m = new Map<string, string>();
  for (const l of lists) for (const c of l) { const prev = m.get(c.path); if (!prev || prev === "M") m.set(c.path, c.status); }
  return [...m.entries()].map(([p, s]) => ({ path: p, status: s })).sort((a, b) => a.path.localeCompare(b.path));
}

function collectChanges(root: string, base: string): { changes: Change[]; staged: string[]; untracked: string[]; committed: string[] } {
  const committed = parseNameStatus(git(root, ["diff", "--name-status", "-M", `${base}...HEAD`]).out);
  const staged = parseNameStatus(git(root, ["diff", "--name-status", "-M", "--cached"]).out);
  const unstaged = parseNameStatus(git(root, ["diff", "--name-status", "-M"]).out);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]).out.split("\n").map((s) => s.trim()).filter(Boolean);
  const changes = mergeChanges([committed, staged, unstaged, untracked.map((p) => ({ status: "A", path: p }))]);
  return { changes, staged: staged.map((c) => c.path), untracked, committed: committed.map((c) => c.path) };
}

/* ---------- (2) generated-evidence --check discovery ---------- */

const PATH_RE = /^[A-Za-z0-9_.@+\-]+(?:\/[A-Za-z0-9_.@+\-]+)+$/;

/** every string in a JSON value that names an existing repo file (strips `git:<ref>:` prefixes and `#fragment`s). */
function citedPaths(root: string, value: any, out: Set<string> = new Set(), seen = { n: 0 }): Set<string> {
  if (seen.n > 200000) return out;
  seen.n++;
  if (typeof value === "string") {
    let s = value.trim();
    const g = /^git:[^:]+:(.+)$/.exec(s); if (g) s = g[1];
    s = s.split("#")[0];
    if (s.length < 200 && PATH_RE.test(s) && !s.startsWith("/")) { try { if (fs.statSync(path.join(root, s)).isFile()) out.add(s); } catch { /* not a file */ } }
  } else if (Array.isArray(value)) { for (const v of value) citedPaths(root, v, out, seen); }
  else if (value && typeof value === "object") { for (const k of Object.keys(value)) citedPaths(root, value[k], out, seen); }
  return out;
}

/** output records declared by a CLI source: `const *OUT* = "…"`, `path.join(ROOT, "docs", …)` OUT forms and outPath("--x", "…"). */
/** resolve `${NAME}` in a template against the source's own `const NAME = "literal"` constants (null if unresolvable). */
function resolveTemplate(src: string, tpl: string): string | null {
  const consts: Record<string, string> = {};
  for (const m of src.matchAll(/\bconst\s+(\w+)\s*(?::\s*\w+)?\s*=\s*"([^"\n]+)"/g)) consts[m[1]] = m[2];
  let ok = true;
  const out = tpl.replace(/\$\{(\w+)\}/g, (_x: string, n: string) => { if (n in consts) return consts[n]; ok = false; return ""; });
  return ok ? out : null;
}

function declaredOutputs(src: string): string[] {
  const outs = new Set<string>();
  for (const m of src.matchAll(/\bconst\s+(\w*OUT\w*|EVIDENCE_REL)\s*(?::\s*\w+)?\s*=\s*"([^"]+\.jsonl?)"/g)) outs.add(m[2]);
  for (const m of src.matchAll(/\bconst\s+\w*OUT\w*\s*(?::\s*\w+)?\s*=\s*`([^`]+\.jsonl?)`/g)) { const r = resolveTemplate(src, m[1]); if (r) outs.add(r); }
  for (const m of src.matchAll(/\bconst\s+\w*OUT\w*\s*=\s*path\.join\(\s*ROOT\s*,\s*((?:"[^"]+"\s*,?\s*)+)\)/g)) outs.add([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).join("/"));
  for (const m of src.matchAll(/outPath\(\s*"--[\w-]+"\s*,\s*"([^"]+)"/g)) outs.add(m[1]);
  return [...outs].filter((p) => p.startsWith("docs/")).sort();
}

/** the header comment (first block comment) — where a CLI DECLARES its own --check semantics. */
function headerOf(src: string): string { const m = /\/\*[\s\S]*?\*\//.exec(src); return m ? m[0] : ""; }

/**
 * Classify a discovered CLI from its OWN declaration (no hard-coded list):
 *  FROZEN_AT_RUN_HEAD — supports --check-at-run-head: a closed experiment record reproduces only at its run head, so a
 *                       current-tree --check drifting is expected; checked (at run head) only when the record itself changes.
 *  HEAD_DEPENDENT     — header says the record drifts whenever HEAD moves ⇒ advisory, run only when the record changes.
 *  HOST_DEPENDENT     — header says host-dependent ⇒ advisory, run only when the record changes.
 *  DETERMINISTIC      — everything else: a drift is a real pre-open defect.
 */
function classifyCli(src: string): string {
  const h = headerOf(src);
  if (/--check-at-run-head/.test(src)) return "FROZEN_AT_RUN_HEAD";
  if (/whenever HEAD moves|HEAD-dependent/i.test(h)) return "HEAD_DEPENDENT";
  if (/host-dependent/i.test(h)) return "HOST_DEPENDENT";
  return "DETERMINISTIC";
}

function discoverChecks(root: string, graph?: any): any[] {
  const binDir = path.join(root, "runtime", "bin");
  let files: string[] = [];
  try { files = fs.readdirSync(binDir).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort(); } catch { return []; }
  const g = graph || CIG.buildGraph(root);
  const checks: any[] = [];
  for (const f of files) {
    const rel = `runtime/bin/${f}`;
    const src = fs.readFileSync(path.join(binDir, f), "utf8");
    if (rel === "runtime/bin/odg-pre-open-gate.ts") continue;
    // the CLI must PARSE --check itself (argv test) — a literal "--check" passed to a child (e.g. `git apply --check`) is not one
    const declares = /(?:includes|indexOf)\(\s*["']--check["']\s*\)|===\s*["']--check["']|["']--check["']\s*===|case\s+["']--check["']/.test(src) || /\[--check\]|\s--check\s{2,}|--check\s+\(/.test(headerOf(src));
    if (!declares) continue;
    const outputs = declaredOutputs(src);
    const kind = classifyCli(src);
    // runtime/core closure of the CLI (direct requires + transitive deps over the impact graph)
    const direct = [...src.matchAll(/require\(\s*["']\.\.\/core\/([\w.\-]+?)(?:\.js|\.ts)?["']\s*\)/g)].map((m) => m[1]);
    const closure = new Set<string>(); const stack = direct.filter((d) => g.modules.includes(d));
    while (stack.length) { const n = stack.pop() as string; if (closure.has(n)) continue; closure.add(n); for (const d of g.deps[n] || []) stack.push(d); }
    const inputs = new Set<string>([rel]);
    for (const m of closure) inputs.add(`runtime/core/${m}.ts`);
    for (const m of src.matchAll(/["'`]((?:docs|runtime|scripts)\/[A-Za-z0-9_.\/\-]+\.[a-z]+)["'`]/g)) inputs.add(m[1]);
    for (const m of src.matchAll(/`([^`\n]*\$\{\w+\}[^`\n]*\.(?:json|jsonl|ts|md))`/g)) { const r = resolveTemplate(src, m[1]); if (r && /^(docs|runtime|scripts)\//.test(r)) inputs.add(r); }
    for (const o of outputs) {
      inputs.add(o);
      try { for (const p of citedPaths(root, JSON.parse(fs.readFileSync(path.join(root, o), "utf8")))) inputs.add(p); } catch { /* jsonl / absent ⇒ literals only */ }
    }
    const scansEvidence = /readdirSync/.test(src) && /docs\/odg\/evidence|"evidence"/.test(src);
    const takesOutArg = /--check\s+<[^>]+>/.test(headerOf(src));
    const checkArgs = kind === "FROZEN_AT_RUN_HEAD"
      ? (takesOutArg && outputs[0] ? ["--check-at-run-head", outputs[0]] : ["--check-at-run-head"])
      : (kind === "HOST_DEPENDENT" ? ["--check", "--repo", "."] : (takesOutArg && outputs[0] ? ["--check", outputs[0]] : ["--check"]));
    const regenArgs = kind === "DETERMINISTIC" && !/never writes a file/i.test(headerOf(src)) ? (/["']--write["']|\[--write\]/.test(src) ? ["--write"] : []) : null;
    checks.push({ cli: rel, kind, outputs, inputs: [...inputs].sort(), scansEvidence, undeterminedOutputs: outputs.length === 0, checkArgs, regenArgs });
  }
  return checks;
}

/** which discovered checks a change-set triggers, with the reason (pure). */
function selectChecks(checks: any[], changes: Change[]): any[] {
  const changed = new Set(changes.map((c) => c.path));
  const evidenceTouched = changes.some((c) => c.path.startsWith("docs/odg/evidence/"));
  const res: any[] = [];
  for (const c of checks) {
    const outTouched = c.outputs.filter((o: string) => changed.has(o));
    const inTouched = c.inputs.filter((i: string) => changed.has(i) && !c.outputs.includes(i));
    let trigger: string | null = null;
    if (outTouched.length) trigger = `record changed: ${outTouched.join(", ")}`;
    else if (inTouched.length) trigger = `inputs changed: ${inTouched.slice(0, 4).join(", ")}${inTouched.length > 4 ? ` (+${inTouched.length - 4})` : ""}`;
    else if (c.scansEvidence && evidenceTouched) trigger = "scans docs/odg/evidence and evidence changed";
    else if (c.undeterminedOutputs && changes.length) trigger = "outputs undetermined ⇒ conservative run";
    if (!trigger) continue;
    if (c.kind !== "DETERMINISTIC" && !outTouched.length) { res.push({ ...c, trigger, run: false, skipReason: `${c.kind}: only checked when its own record changes (a current-tree drift is expected by the CLI's own declaration)` }); continue; }
    res.push({ ...c, trigger, run: true });
  }
  // dependency order: a check whose output feeds another runs (and regenerates) first
  const order = (x: any) => res.filter((y) => y !== x && y.outputs.some((o: string) => x.inputs.includes(o))).length;
  return res.sort((a, b) => order(a) - order(b) || a.cli.localeCompare(b.cli));
}

/* ---------- (3) impacted tests ---------- */

function listTests(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let ents: any[] = []; try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/^(node_modules|dist|generated|backup|\.next)$/.test(e.name)) walk(rel); }
      else if (e.name.endsWith(".test.ts")) out.push(rel);
    }
  };
  walk("runtime"); walk("scripts");
  return out.sort();
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * impacted tests (pure over its inputs): a changed test runs itself; the sibling <x>.test.ts; tests of the TRANSITIVE
 * consumers of a changed runtime/core module (change-impact-graph); any test whose source names the changed file
 * (basename, or stem for code); and, when a file is ADDED/DELETED in a directory, the scanner tests that readdirSync it
 * (hard-coded file-set counts — e.g. the V251 reconciliation scan in #978).
 */
function selectTests(root: string, changes: Change[], graph: any, testSources?: Record<string, string>): any[] {
  const tests = testSources ? Object.keys(testSources).sort() : listTests(root);
  const srcOf = (t: string) => (testSources ? testSources[t] : (() => { try { return fs.readFileSync(path.join(root, t), "utf8"); } catch { return ""; } })());
  const exists = (t: string) => tests.includes(t);
  const picked = new Map<string, string>();
  const add = (t: string, why: string) => { if (exists(t) && !picked.has(t)) picked.set(t, why); };
  const sources: Record<string, string> = {}; for (const t of tests) sources[t] = srcOf(t);
  for (const c of changes) {
    const p = c.path;
    if (p.startsWith("node_modules")) continue;
    if (p.endsWith(".test.ts")) { if (c.status !== "D") add(p, "changed test"); continue; }
    const sib = p.replace(/\.(ts|tsx|js)$/, ".test.ts"); if (sib !== p) add(sib, `sibling of ${p}`);
    const m = /^runtime\/core\/([^/]+)\.ts$/.exec(p);
    if (m && graph.modules.includes(m[1])) {
      const seen = new Set<string>(); const st = [m[1]];
      while (st.length) { const n = st.pop() as string; if (seen.has(n)) continue; seen.add(n); for (const k of graph.consumers[n] || []) st.push(k); }
      for (const n of seen) if (n !== m[1]) add(`runtime/core/${n}.test.ts`, `transitive consumer of ${m[1]}`);
    }
    const base = path.basename(p);
    const stem = /\.(ts|tsx|js)$/.test(base) ? base.replace(/\.(ts|tsx|js)$/, "") : base;
    const nameRe = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(stem)}([^A-Za-z0-9_-]|$)`);
    for (const t of tests) if (!picked.has(t) && nameRe.test(sources[t])) add(t, `names ${stem}`);
    if (c.status === "A" || c.status === "D") {
      const dir = path.dirname(p); const segs = dir.split("/");
      const dirRe = new RegExp(`${escapeRe(dir)}|${segs.map((s) => `"${escapeRe(s)}"`).join("\\s*,\\s*")}`);
      for (const t of tests) if (!picked.has(t) && /readdirSync/.test(sources[t]) && dirRe.test(sources[t])) add(t, `scans ${dir}/ (file ${c.status === "A" ? "added" : "deleted"})`);
    }
  }
  return [...picked.entries()].map(([test, reason]) => ({ test, reason })).sort((a, b) => a.test.localeCompare(b.test));
}

/* ---------- (5) conflict markers, (6) node_modules ---------- */

function conflictMarkers(text: string): number[] {
  const lines = text.split("\n"); const hits: number[] = []; let hasSide = false;
  lines.forEach((l, i) => { if (/^(<{7}|>{7})(\s|$)/.test(l)) { hits.push(i + 1); hasSide = true; } });
  if (hasSide) lines.forEach((l, i) => { if (/^={7}$/.test(l)) hits.push(i + 1); });
  return hits.sort((a, b) => a - b);
}

function nodeModulesFindings(committed: string[], staged: string[], untracked: string[], trackedNodeModules: string[]): any[] {
  const isNM = (p: string) => p === "node_modules" || p.startsWith("node_modules/") || /(^|\/)node_modules$/.test(p);
  const f: any[] = [];
  for (const p of committed.filter(isNM)) f.push({ severity: "NOT_READY", where: "committed", path: p });
  for (const p of staged.filter(isNM)) f.push({ severity: "NOT_READY", where: "staged", path: p });
  for (const p of trackedNodeModules) if (!committed.includes(p) && !staged.includes(p)) f.push({ severity: "NOT_READY", where: "tracked", path: p });
  for (const p of untracked.filter(isNM)) f.push({ severity: "WARN", where: "untracked (a `git add -A` would stage it — remove the worktree symlink before committing)", path: p });
  return f;
}

/* ---------- (7) verdict ---------- */

function verdict(report: any): { verdict: string; reasons: string[]; warnings: string[] } {
  const reasons: string[] = []; const warnings: string[] = [];
  if (report.behind && report.behind.count > 0) reasons.push(`BEHIND: ${report.behind.count} commit(s) on ${report.base} not in HEAD — run: git merge ${report.base} (then re-run this gate)`);
  for (const c of report.checks || []) {
    if (c.status === "DRIFT") reasons.push(`DRIFT ${c.outputs.join(", ") || c.cli} — regenerate: ${c.regenerate || "(frozen record: do not regenerate; re-check at its run head)"}`);
    if (c.status === "ERROR") reasons.push(`CHECK_ERROR ${c.cli}: ${c.detail}`);
    if (c.status === "SKIPPED") warnings.push(`check not run ${c.cli}: ${c.skipReason}`);
  }
  for (const t of report.tests?.results || []) if (t.cls !== "PASS" && t.cls !== "SKIPPED") reasons.push(`TEST ${t.cls} ${t.file}${t.reason ? ` — ${t.reason}` : ""}${t.notOk && t.notOk.length ? ` :: ${t.notOk.join(" | ")}` : ""}`);
  if (report.tests?.error) reasons.push(`TESTS_ERROR: ${report.tests.error}`);
  for (const t of report.tsc || []) if (t.status === "FAIL") reasons.push(`TSC FAIL ${t.project}: ${t.errors} error(s)${t.first ? ` — ${t.first}` : ""}`);
  for (const m of report.conflictMarkers || []) reasons.push(`CONFLICT_MARKERS ${m.path} lines ${m.lines.join(",")}`);
  for (const u of report.unmerged || []) reasons.push(`UNMERGED ${u}`);
  for (const n of report.nodeModules || []) (n.severity === "NOT_READY" ? reasons : warnings).push(`node_modules ${n.where}: ${n.path}`);
  if (report.tests && report.tests.selected === 0 && (report.changes || []).some((c: any) => /\.(ts|tsx|js)$/.test(c.path))) warnings.push("code changed but no impacted test was found — targeted coverage is NONE (the full CI gate remains the certification point)");
  return { verdict: reasons.length ? "NOT_READY" : "READY", reasons, warnings };
}

/* ---------- execution ---------- */

function runCheck(root: string, c: any): any {
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsx", c.cli, ...c.checkArgs], { cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  const tail = `${r.stdout || ""}\n${r.stderr || ""}`.trim().split("\n").slice(-3).join(" | ").slice(0, 400);
  const status = r.status === 0 ? "OK" : (r.status === 1 ? "DRIFT" : "ERROR");
  return { status, ms: Date.now() - t0, detail: tail, exit: r.status };
}

function runTsc(root: string, project: string): any {
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsc", "--noEmit", "-p", project], { cwd: root, encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const errs = out.split("\n").filter((l) => /error TS\d+/.test(l));
  return { project, status: r.status === 0 ? "PASS" : "FAIL", errors: errs.length, first: errs[0] ? errs[0].slice(0, 300) : (r.status === 0 ? null : out.trim().slice(0, 300)), ms: Date.now() - t0 };
}

/** the NOT OK evidence lines of a failed suite's tail (assertion / not ok / error lines; bounded). */
function notOkLines(tail: string): string[] {
  return String(tail).split("\n").map((l) => l.trim()).filter((l) => /\bnot ok\b|AssertionError|Error:|\bFAIL\b|expected|✗/i.test(l)).slice(0, 4).map((l) => l.slice(0, 240));
}

/** the CI classified gate's suite list (package.json scripts["test:report"]); null if unreadable. */
function ciSuites(root: string): Set<string> | null {
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); return new Set(String(pkg.scripts["test:report"]).split(/\s+/).filter((x: string) => x.endsWith(".test.ts"))); } catch { return null; }
}

function runTests(root: string, files: string[], workers: number, build: boolean): any {
  const t0 = Date.now();
  let built: any = null;
  if (build && files.length) {
    const b = spawnSync("npx", ["tsx", "scripts/build-runtime-guard.ts"], { cwd: root, encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
    built = { status: b.status === 0 ? "OK" : "FAIL", note: "fingerprint-guarded runtime/dist build (gitignored output) — same step as `npm run test:report`" };
    if (b.status !== 0) return { selected: files.length, error: `build:runtime failed: ${(b.stderr || b.stdout || "").toString().trim().split("\n").slice(-2).join(" | ")}`, built, results: [], ms: Date.now() - t0 };
  }
  const reportPath = path.join(root, "runtime", "generated", "test-report.json");
  const r = spawnSync("npx", ["tsx", "runtime/bin/odg-test-report.ts", ...files], { cwd: root, encoding: "utf8", timeout: 3600000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, ODG_TEST_WORKERS: String(workers) } });
  let results: any[] = [];
  try { const rep = JSON.parse(fs.readFileSync(reportPath, "utf8")); results = (rep.results || []).map((x: any) => ({ file: path.relative(root, path.resolve(root, x.file || x.suite || "")), cls: x.cls || x.class, reason: x.reason || "", notOk: notOkLines(x.tail || "") })); } catch { /* fall back to stdout */ }
  if (!results.length) {
    let cls = ""; for (const l of `${r.stdout || ""}`.split("\n")) { const h = /^(PASS|FAIL|SKIPPED|BLOCKED_BY_ISOLATION|NOT_RUN):/.exec(l); if (h) { cls = h[1]; continue; } const s = /^\s+-\s+(\S+)(?:\s+—?\s*(.*))?$/.exec(l); if (cls && s) results.push({ file: s[1], cls, reason: s[2] || "" }); }
  }
  return { selected: files.length, workers, exit: r.status, built, results, ms: Date.now() - t0, artifact: "runtime/generated/test-report.json (gitignored)" };
}

function parseArgs(argv: string[]): any {
  const o: any = { base: "origin/main", json: false, workers: 1, tests: true, tsc: true, checks: true, build: true, fix: false, maxTests: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") o.base = argv[++i];
    else if (a === "--json") o.json = true;
    else if (a === "--workers") o.workers = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === "--no-tests") o.tests = false;
    else if (a === "--no-tsc") o.tsc = false;
    else if (a === "--no-checks") o.checks = false;
    else if (a === "--no-build") o.build = false;
    else if (a === "--fix-regenerate") o.fix = true;
    else if (a === "--max-tests") o.maxTests = Math.max(0, parseInt(argv[++i], 10) || 0);
    else { o.error = `unknown argument ${a}`; }
  }
  return o;
}

function gate(root: string, o: any, log: (s: string) => void = () => {}): any {
  const baseSha = git(root, ["rev-parse", "--verify", `${o.base}^{commit}`]);
  if (!baseSha.ok) return { error: `cannot resolve base ${o.base}` };
  const head = git(root, ["rev-parse", "HEAD"]).out.trim();
  const report: any = { tool: "odg-pre-open-gate", base: o.base, baseSha: baseSha.out.trim(), head, mergeBase: git(root, ["merge-base", o.base, "HEAD"]).out.trim() };
  report.behind = { count: parseInt(git(root, ["rev-list", "--count", `HEAD..${o.base}`]).out.trim(), 10) || 0, note: "reported only — this gate never merges; checks/tests below run on the branch tree, not on the merge result" };
  const cs = collectChanges(root, o.base);
  report.changes = cs.changes;
  log(`changes: ${cs.changes.length} file(s); behind ${o.base}: ${report.behind.count}`);
  const graph = CIG.buildGraph(root);

  // (5) conflict markers + unmerged
  report.unmerged = git(root, ["diff", "--name-only", "--diff-filter=U"]).out.split("\n").filter(Boolean);
  report.conflictMarkers = [];
  for (const c of cs.changes) {
    if (c.status === "D" || c.path.startsWith("node_modules")) continue;
    let txt = ""; try { const st = fs.lstatSync(path.join(root, c.path)); if (!st.isFile() || st.size > 8 * 1024 * 1024) continue; txt = fs.readFileSync(path.join(root, c.path), "utf8"); } catch { continue; }
    const lines = conflictMarkers(txt); if (lines.length) report.conflictMarkers.push({ path: c.path, lines: lines.slice(0, 10) });
  }
  // (6) node_modules
  const trackedNM = git(root, ["ls-files", "--", "node_modules"]).out.split("\n").filter(Boolean).slice(0, 5);
  report.nodeModules = nodeModulesFindings(cs.committed, cs.staged, cs.untracked, trackedNM);

  // (2) generated evidence
  report.checks = [];
  if (o.checks) {
    const sel = selectChecks(discoverChecks(root, graph), cs.changes);
    for (const c of sel) {
      const regenerate = c.regenArgs ? `npx tsx ${c.cli}${c.regenArgs.length ? " " + c.regenArgs.join(" ") : ""}` : null;
      const entry: any = { cli: c.cli, kind: c.kind, outputs: c.outputs, trigger: c.trigger, command: `npx tsx ${c.cli} ${c.checkArgs.join(" ")}`, regenerate };
      if (!c.run) { entry.status = "SKIPPED"; entry.skipReason = c.skipReason; report.checks.push(entry); continue; }
      log(`check ${c.cli} (${c.trigger})`);
      Object.assign(entry, runCheck(root, c));
      if (entry.status === "DRIFT" && o.fix && c.regenArgs) {
        const g = spawnSync("npx", ["tsx", c.cli, ...c.regenArgs], { cwd: root, encoding: "utf8", timeout: 600000 });
        const after = runCheck(root, c);
        entry.regenerated = { exit: g.status, recheck: after.status, wrote: git(root, ["status", "--porcelain", "--", ...c.outputs]).out.split("\n").filter(Boolean) };
        if (after.status === "OK") entry.status = "REGENERATED";
      }
      report.checks.push(entry);
    }
  }

  // (3) tests — only suites of the CI classified gate (package.json test:report) run: a suite outside it is not what CI
  // judges, so it is LISTED (outsideGate) but never run nor counted PASS.
  const gateSuites = ciSuites(root);
  const all = selectTests(root, cs.changes, graph);
  const selected = gateSuites ? all.filter((s) => gateSuites.has(s.test)) : all;
  report.testSelection = selected;
  report.testsOutsideGate = gateSuites ? all.filter((s) => !gateSuites.has(s.test)).map((s) => s.test) : [];
  if (o.tests) {
    const files = selected.map((s) => s.test).slice(0, o.maxTests === Infinity ? undefined : o.maxTests);
    if (files.length < selected.length) report.testsTruncated = { ran: files.length, selected: selected.length, note: "--max-tests: the rest are NOT_RUN, never PASS" };
    log(`tests: ${files.length} impacted suite(s), workers=${o.workers}`);
    report.tests = files.length ? runTests(root, files, o.workers, o.build) : { selected: 0, results: [] };
  }

  // (4) tsc
  report.tsc = [];
  if (o.tsc) {
    const code = cs.changes.some((c) => /\.(ts|tsx|js|mjs|cjs)$/.test(c.path) || /^tsconfig.*\.json$|^package(-lock)?\.json$/.test(c.path));
    if (code) { log("tsc --noEmit -p tsconfig.json"); report.tsc.push(runTsc(root, "tsconfig.json")); }
    if (cs.changes.some((c) => /^runtime\/(core|bin)\/.*\.ts$/.test(c.path) || c.path === "tsconfig.runtime-dist.json")) { log("tsc --noEmit -p tsconfig.runtime-dist.json"); report.tsc.push(runTsc(root, "tsconfig.runtime-dist.json")); }
  }

  Object.assign(report, verdict(report));
  report.honesty = "READY = no defect found by THESE targeted checks; it is not a certification — CI's full classified gate is.";
  return report;
}

function renderText(r: any): string {
  const L: string[] = [];
  L.push(`== odg pre-open gate: ${r.verdict} == head ${String(r.head).slice(0, 8)} vs ${r.base} (${String(r.baseSha).slice(0, 8)}); ${r.changes.length} changed file(s); behind ${r.behind.count}`);
  for (const c of r.checks) L.push(`  check ${c.status.padEnd(11)} ${c.cli}${c.status === "SKIPPED" ? "" : ` [${c.trigger}]`}`);
  if (r.tests) L.push(`  tests ${r.tests.selected} selected: ${(r.tests.results || []).filter((t: any) => t.cls === "PASS").length} PASS, ${(r.tests.results || []).filter((t: any) => t.cls !== "PASS" && t.cls !== "SKIPPED").length} NOT OK`);
  for (const t of r.tsc) L.push(`  tsc ${t.project}: ${t.status}${t.errors ? ` (${t.errors})` : ""}`);
  for (const x of r.reasons) L.push(`  NOT OK  ${x}`);
  for (const w of r.warnings) L.push(`  warn    ${w}`);
  return L.join("\n");
}

function main(argv: string[]): number {
  const o = parseArgs(argv);
  if (o.error) { process.stderr.write(`${o.error}\n`); return 2; }
  const root = process.cwd();
  const r = gate(root, o, o.json ? () => {} : (s) => process.stderr.write(`· ${s}\n`));
  if (r.error) { process.stderr.write(`${r.error}\n`); return 2; }
  process.stdout.write(o.json ? JSON.stringify(r, null, 2) + "\n" : renderText(r) + "\n");
  return r.verdict === "READY" ? 0 : 1;
}

module.exports = { notOkLines, ciSuites, resolveTemplate, parseNameStatus, mergeChanges, citedPaths, declaredOutputs, classifyCli, discoverChecks, selectChecks, selectTests, conflictMarkers, nodeModulesFindings, verdict, parseArgs, gate, renderText };

if (require.main === module) process.exit(main(process.argv.slice(2)));

export {};

#!/usr/bin/env node
"use strict";
/*
 * V15.7 (CTO directive — performance engineering WITHOUT weakening controls) — VERIFICATION LEVEL SELECTOR.
 *
 * Given the list of changed files of a change (git diff --name-only base...head), choose HOW MUCH local verification the
 * change needs BEFORE it is handed to CI + inspection, and name the exact test files to run:
 *   DOCS_ONLY — only docs/evidence changed ⇒ no build/test; doc lint (JSON validity). Merge STILL requires CI.
 *   L1        — targeted: the changed modules' own *.test.ts + changed test files + typecheck.
 *   L2        — L1 + tests of the REVERSE-DEPENDENTS (transitive, via change-impact-graph) + regression suites.
 *   L3        — full: build:runtime, typecheck, trust-anchor check, full test:report, independent inspection, CI.
 *   REINFORCED (flag on L3) — the change touches a control surface (locks, leases, fleet-bridge, write-sets,
 *               permissions/authorization, sandbox, secrets, integrity/audit chain, ledger, recovery, schedule-tick,
 *               governance, protected paths) or impacts a module that does ⇒ L3 + MANDATORY independent inspection +
 *               adversarial checklist.
 *
 * FAIL-CLOSED RULES: an unresolvable impact (file outside the graph's resolvable domain, graph build failure, deleted
 * module, unreadable source) ESCALATES one level; an invalid path (escapes the repo via '..'/absolute/symlink, NUL,
 * backslash) or an empty change-set ⇒ L3 REINFORCED. The selector NEVER lowers the mandatory pre-merge CI gate
 * (mandatoryPreMergeCI is always true) — it only decides what to verify LOCALLY first, to fail fast and cheap.
 *
 * REUSE (no second graph / runner / parser): change-impact-graph.buildGraph (core→core reverse edges);
 * scripts/lib/js-require-scan.parseRequiresFromSource (the canonical require parser) for the bin→core / test→module edges
 * the core graph does not model; odg-agent-supervisor.PROTECTED_PREFIXES + canonPath (protected paths, path rules);
 * package.json "test:report" as the full gate list. Pure given its injected reader (fs by default); writes nothing.
 */
const fs = require("node:fs");
const path = require("node:path");
const graphMod = require("./change-impact-graph.js");
const supervisor = require("./odg-agent-supervisor.js");
const { parseRequiresFromSource } = require("../../scripts/lib/js-require-scan");

const LEVELS = Object.freeze(["DOCS_ONLY", "L1", "L2", "L3"]);
const rank = (l: string): number => LEVELS.indexOf(l);
const maxLevel = (a: string, b: string): string => (rank(a) >= rank(b) ? a : b);
function escalate(l: string): string { return LEVELS[Math.min(LEVELS.length - 1, Math.max(rank("L1"), rank(l)) + 1)]; }

// Control surfaces (matched on the lower-cased canonical path). Over-inclusive by design: a false positive costs a full
// run; a false negative would skip controls. 'auth' is matched as a token so "author" does not match.
const SENSITIVE_RULES = Object.freeze([
  ["locks/leases", /(^|[\/._-])(locks?|leases?|mutex|claims?)([\/._-]|$)/],
  ["fleet-bridge", /fleet-bridge/],
  ["write-sets", /write-?sets?|writeset/],
  ["permissions/authorization", /permission|authori[sz]|(^|[\/._-])(auth|authn|authz)([\/._-]|$)|mandate|identity|signature/],
  ["sandbox", /sandbox|bwrap|isolation|confine/],
  ["secrets", /secret|credential|(^|[\/._-])tokens?([\/._-]|$)|\.env(\.|$)/],
  ["integrity/audit chain", /integrity|audit|anchor|hmac/],
  ["ledger", /ledger/],
  ["recovery", /recover/],
  ["odg-schedule-tick", /schedule-tick/],
  ["governance", /governance|constitution|directive|^(claude|agents)\.md$|odg_autonomous_work_protocol/],
  ["agent-supervisor (assignment gate)", /agent-supervisor/],
  ["mission declarations (write_set / permissions)", /^runtime\/missions\//],
] as Array<[string, RegExp]>);

const DOC_RE = /^(docs\/.*|[^\/]+\.md|.*\/README\.md)$/i;
const BUILD_CONFIG_RE = /^(package\.json|package-lock\.json|tsconfig[^\/]*\.json|next\.config\.[a-z]+|eslint\.config\.[a-z]+|\.github\/.*|scripts\/.*|\.gitignore|\.nvmrc)$/i;
const CODE_DIRS = Object.freeze(["runtime/core", "runtime/bin"]);
// Trees OUTSIDE the runtime that may import runtime modules (Next app, src, scripts): scanned recursively for reverse deps.
const EXTRA_TREES = Object.freeze(["src", "app", "scripts"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".git", "generated"]);
// Regression suites added at L2: the V251 live catalog scan (any core source change can move it) and the graph's own
// suite (the selector's correctness rests on it).
const REGRESSION_SUITES = Object.freeze(["runtime/core/odg-v251-repair-reconciliation.test.ts", "runtime/core/change-impact-graph.test.ts"]);

const ADVERSARIAL_CHECKLIST = Object.freeze([
  "error / unreadable / truncated input paths fail CLOSED (never default-allow)",
  "NOT_MEASURED never becomes 0 / PASS / green",
  "path inputs normalised: absolute, '..', case variants, symlinks, NUL/backslash",
  "lock/lease/claim: holder re-verified before write, TTL overrun aborts, no release by staleness",
  "write-set: UNKNOWN conflicts with everything; protected paths refused",
  "no secrets / absolute home paths in evidence or logs",
  "exit codes unmasked (tsc / test runner / pipes) — no `|| true` on a gate",
  "replay / forgery / TOCTOU between check and use",
  "honest labels: REAL vs SIMULATED vs NOT_MEASURED",
]);

function freeze<T>(o: T): T { return Object.freeze(o) as T; }

/** Default reader over the real filesystem (repo root bound). Every method returns null on error — the caller fails closed. */
function fsReader(root: string): any {
  return {
    root,
    exists: (rel: string) => { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } },
    read: (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } },
    list: (relDir: string) => { try { return fs.readdirSync(path.join(root, relDir)).sort(); } catch { return null; } },
    realRel: (rel: string) => {
      // symlink-aware: the physical path relative to the physical root; null when it does not exist, "ESCAPE" when outside.
      let realRoot: string, real: string;
      try { realRoot = fs.realpathSync(root); } catch { return "ESCAPE"; }
      try { real = fs.realpathSync(path.join(root, rel)); } catch { return null; }
      const r = path.relative(realRoot, real);
      return r === "" || r.startsWith("..") || path.isAbsolute(r) ? "ESCAPE" : r.split(path.sep).join("/");
    },
    graph: () => graphMod.buildGraph(root),
    // recursive file list under relDir (repo-relative, '/'-joined); [] when the tree is absent; null on any other error.
    walk: (relDir: string) => {
      const out: string[] = [];
      const rec = (d: string): boolean => {
        let ents: any[];
        try { ents = fs.readdirSync(path.join(root, d), { withFileTypes: true }); } catch (e: any) { return !!e && e.code === "ENOENT" && d === relDir; }
        for (const e of ents) { if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !rec(d + "/" + e.name)) return false; } else if (e.isFile()) out.push(d + "/" + e.name); }
        return true;
      };
      return rec(relDir) ? out.sort() : null;
    },
  };
}

/** normalizeChangedPath(p, root, reader) → { ok, path, key, real? } | { ok:false, reason }.
 *  Absolute paths inside the root are relativised; '..' that escapes, NUL, backslash, empty, repo-root and symlinks whose
 *  physical target lies outside the root are REFUSED. A symlink inside the root yields `real` (its physical target), and
 *  both are classified. key = lower-cased (case variants of a control surface are still caught). */
function normalizeChangedPath(p: any, root: string, reader: any): any {
  if (typeof p !== "string") return { ok: false, reason: "NOT_A_STRING", input: String(p) };
  let s = p.replace(/\r?\n$/, "");
  if (s.trim() === "") return { ok: false, reason: "EMPTY", input: s };
  if (s.includes("\0") || s.includes("\\")) return { ok: false, reason: "BACKSLASH_OR_NUL", input: s };
  if (path.isAbsolute(s)) {
    const r = path.relative(path.resolve(root), path.resolve(s));
    if (r === "" || r.startsWith("..") || path.isAbsolute(r)) return { ok: false, reason: "ABSOLUTE_OUTSIDE_REPO", input: s };
    s = r.split(path.sep).join("/");
  }
  const lex = path.posix.normalize(s);
  if (lex === "." || lex === "" || lex === "/") return { ok: false, reason: "REPO_ROOT", input: s };
  if (lex === ".." || lex.startsWith("../")) return { ok: false, reason: "DOTDOT_ESCAPE", input: s };
  const c = supervisor.canonPath(lex);   // reuse the supervisor's canonicaliser (refuses '~', drive letters, residual '..')
  if (!c.ok) return { ok: false, reason: "CANON_" + c.reason, input: s };
  const real = reader && typeof reader.realRel === "function" ? reader.realRel(c.path) : null;
  if (real === "ESCAPE") return { ok: false, reason: "SYMLINK_ESCAPES_REPO", input: s };
  return { ok: true, path: c.path, key: c.key, real: real && real !== c.path ? real : null };
}

function sensitiveHits(key: string): string[] {
  const out: string[] = [];
  for (const [label, re] of SENSITIVE_RULES) if (re.test(key)) out.push(label);
  for (const pre of supervisor.PROTECTED_PREFIXES) { const k = String(pre).toLowerCase(); if (key === k || key.startsWith(k + "/")) out.push("protected path (" + pre + ")"); }
  return [...new Set(out)];
}

/** Parse the suite list of package.json "test:report" (the full gate). null when unreadable/unparseable (fail closed). */
function testReportList(pkgText: string | null): string[] | null {
  if (typeof pkgText !== "string") return null;
  let pkg: any; try { pkg = JSON.parse(pkgText); } catch { return null; }
  const s = pkg && pkg.scripts && pkg.scripts["test:report"];
  if (typeof s !== "string") return null;
  const parts = s.split(/\s+/).filter(Boolean);
  const i = parts.findIndex((x) => /odg-test-report\.ts$/.test(x));
  if (i < 0) return null;
  const files = parts.slice(i + 1).filter((x) => /\.test\.ts$/.test(x));
  return files.length ? files : null;
}

/** package.json change analysis: TEST_LIST_ADD_ONLY when the ONLY difference is suites ADDED to test:report (⇒ run them);
 *  anything else (other keys, removed suites, unparseable, missing base/head) ⇒ BUILD_CONFIG (L3). Removing a suite from
 *  the gate weakens controls ⇒ REINFORCED. */
function analyzePackageJson(baseText: string | null, headText: string | null): any {
  if (typeof baseText !== "string" || typeof headText !== "string") return { kind: "UNKNOWN", reason: "base or head package.json not provided/readable" };
  let b: any, h: any; try { b = JSON.parse(baseText); h = JSON.parse(headText); } catch { return { kind: "UNKNOWN", reason: "package.json unparseable" }; }
  const lb = testReportList(baseText), lh = testReportList(headText);
  if (!lb || !lh) return { kind: "UNKNOWN", reason: "test:report list unparseable" };
  const removed = lb.filter((x) => !lh.includes(x));
  const added = lh.filter((x) => !lb.includes(x));
  const strip = (o: any) => { const c = JSON.parse(JSON.stringify(o)); if (c.scripts) delete c.scripts["test:report"]; return JSON.stringify(c); };
  if (strip(b) !== strip(h)) return { kind: "OTHER_CHANGE", reason: "package.json changed beyond the test:report list", added, removed };
  if (removed.length) return { kind: "SUITES_REMOVED", reason: "suite(s) REMOVED from the test:report gate", added, removed };
  return { kind: "TEST_LIST_ADD_ONLY", added, removed };
}

/** Import edges NOT modelled by the core graph (bin→core, bin→bin, test→module), via the canonical require parser plus an
 *  ES `import … from` scan. Returns { files:{rel:[resolvedRel]}, unreadable:[rel] }. */
function scanEdges(reader: any): any {
  const files: any = {}; const unreadable: string[] = [];
  const targets: string[] = [];
  for (const dir of CODE_DIRS) {
    const names = reader.list(dir);
    if (!names) { unreadable.push(dir + "/"); continue; }
    for (const n of names) if (/\.ts$/.test(n)) targets.push(dir + "/" + n);
  }
  for (const tree of EXTRA_TREES) {
    const all = typeof reader.walk === "function" ? reader.walk(tree) : null;
    if (!all) { unreadable.push(tree + "/ (tree not scannable)"); continue; }
    for (const f of all) if (/\.(ts|tsx|js|mjs|cjs)$/.test(f)) targets.push(f);
  }
  {
    for (const rel of targets) {
      const dir = path.posix.dirname(rel);
      const src = reader.read(rel);
      if (src === null) { unreadable.push(rel); continue; }
      let specs: string[] = [];
      try { specs = parseRequiresFromSource(src).literal.slice(); } catch { unreadable.push(rel); continue; }
      const imp = /\bimport\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']/g; let m;
      while ((m = imp.exec(src))) specs.push(m[1]);
      const out = new Set<string>();
      for (const sp of specs) {
        if (!sp.startsWith(".")) continue;
        const r = path.posix.normalize(path.posix.join(dir, sp)).replace(/\.(js|ts|tsx|mjs|cjs)$/, "") + ".ts";
        out.add(r);
      }
      files[rel] = [...out].sort();
    }
  }
  return { files, unreadable };
}

function ownTestOf(rel: string, reader: any): string | null {
  const t = rel.replace(/\.ts$/, ".test.ts");
  return t !== rel && reader.exists(t) ? t : null;
}

/**
 * chooseLevel(changedFiles, opts) — the decision. opts: { root, reader?, packageJson?:{base,head}, fullList? }.
 * Returns a frozen plan: { level, reinforced, mandatoryPreMergeCI:true, reasons[], files[], tests:{L1,L2,L3}, steps[],
 * adversarialChecklist|null, unresolved[], graph:{ok, modules} }.
 */
function chooseLevel(changedFiles: any, opts: any = {}): any {
  const root = opts.root || process.cwd();
  const reader = opts.reader || fsReader(root);
  const reasons: string[] = [];
  const unresolved: any[] = [];
  let level = "DOCS_ONLY";
  let reinforced = false;
  const fullList = Array.isArray(opts.fullList) ? opts.fullList : testReportList(reader.read("package.json"));
  if (!fullList) { reasons.push("FULL_LIST_UNREADABLE: package.json test:report list unreadable ⇒ L3 (fail closed)"); level = "L3"; }

  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    reasons.push("EMPTY_OR_INVALID_CHANGESET: nothing to scope (diff failed or empty) ⇒ L3 REINFORCED (fail closed)");
    return finish("L3", true);
  }

  // graph (core→core) — failure ⇒ every code file is unresolved
  let graph: any = null;
  try { graph = reader.graph(); if (!graph || !Array.isArray(graph.modules) || !graph.consumers) graph = null; } catch { graph = null; }
  if (!graph) reasons.push("GRAPH_UNAVAILABLE: change-impact-graph could not be built ⇒ code impact unresolved");
  let edges: any = null;
  const needEdges = () => { if (!edges) edges = scanEdges(reader); return edges; };

  const files: any[] = [];
  const L1 = new Set<string>(); const impacted = new Set<string>();   // impacted = repo-relative .ts sources (reverse-dep closure seeds)
  const L2extra = new Set<string>();
  let coreSourceChanged = false;
  const changedSources = new Set<string>();
  // sources (any scanned tree) whose text NAMES a data file — best-effort readers of non-code inputs
  const readersOf = (base: string): string[] => { const e = needEdges(); return Object.keys(e.files).filter((f) => { const src = reader.read(f); return !!src && src.includes(base); }); };

  for (const raw of changedFiles) {
    const n = normalizeChangedPath(raw, root, reader);
    if (!n.ok) { reinforced = true; level = "L3"; files.push({ input: n.input, class: "INVALID_PATH", reason: n.reason }); reasons.push(`INVALID_PATH ${JSON.stringify(n.input)} (${n.reason}) ⇒ L3 REINFORCED`); continue; }
    const keys = [n.key, ...(n.real ? [String(n.real).toLowerCase()] : [])];
    const hits = [...new Set(keys.flatMap(sensitiveHits))];
    const rec: any = { path: n.path, real: n.real, sensitive: hits };
    if (hits.length) { reinforced = true; reasons.push(`SENSITIVE ${n.path}: ${hits.join(", ")} ⇒ REINFORCED`); }
    const p = n.real || n.path;
    if (DOC_RE.test(p) && /\.json$/i.test(p) && readersOf(path.posix.basename(p)).length) {
      // a doc/evidence JSON that code READS (grader/oracle/evidence data) is runtime input, not documentation
      rec.class = "DOC_READ_BY_CODE"; level = maxLevel(level, "L1");
      unresolved.push({ path: p, reason: "DOC_JSON_READ_BY_CODE (data consumed by code; impact not resolvable by the import graph)" });
      for (const f of readersOf(path.posix.basename(p))) { if (/\.test\.ts$/.test(f)) L2extra.add(f); else impacted.add(f); }
    } else if (DOC_RE.test(p)) {
      rec.class = "DOC";
    } else if (p === "package.json") {
      const a = analyzePackageJson(opts.packageJson ? opts.packageJson.base : null, opts.packageJson ? opts.packageJson.head : reader.read("package.json"));
      rec.class = "PACKAGE_JSON"; rec.analysis = a.kind;
      if (a.kind === "TEST_LIST_ADD_ONLY") { level = maxLevel(level, "L1"); for (const t of a.added) L1.add(t); reasons.push(`package.json: only suites ADDED to test:report (${a.added.length}) ⇒ run them at L1`); }
      else if (a.kind === "SUITES_REMOVED") { level = "L3"; reinforced = true; reasons.push(`package.json: ${a.reason} (${a.removed.join(", ")}) ⇒ L3 REINFORCED (a weaker gate)`); }
      else { level = "L3"; reasons.push(`package.json: ${a.reason} ⇒ L3`); }
    } else if (BUILD_CONFIG_RE.test(p)) {
      rec.class = "BUILD_CONFIG"; level = "L3"; reasons.push(`BUILD_CONFIG ${p} ⇒ L3 (affects build/CI for everything)`);
    } else if (/^runtime\/(core|bin)\/[^\/]+\.ts$/.test(p)) {
      const exists = reader.exists(p);
      if (/\.test\.ts$/.test(p)) {
        rec.class = "TEST"; level = maxLevel(level, "L1");
        if (exists) L1.add(p); else { rec.deleted = true; unresolved.push({ path: p, reason: "DELETED_TEST" }); }
        const subj = p.replace(/\.test\.ts$/, ".ts"); if (reader.exists(subj)) impacted.add(subj);
      } else {
        rec.class = "SOURCE"; level = maxLevel(level, "L1"); changedSources.add(p);
        if (p.startsWith("runtime/core/")) coreSourceChanged = true;
        if (!exists) { rec.deleted = true; unresolved.push({ path: p, reason: "DELETED_MODULE (consumers no longer resolvable from the head graph)" }); files.push(rec); continue; }
        const own = ownTestOf(p, reader); if (own) L1.add(own); else rec.noOwnTest = true;
        if (p.startsWith("runtime/core/") && (!graph || !graph.modules.includes(path.posix.basename(p, ".ts")))) unresolved.push({ path: p, reason: graph ? "NOT_IN_GRAPH" : "GRAPH_UNAVAILABLE" });
        impacted.add(p);
      }
    } else if (/^runtime\//.test(p)) {
      rec.class = "RUNTIME_DATA"; level = maxLevel(level, "L1");
      unresolved.push({ path: p, reason: "NON_TS_RUNTIME_FILE (consumers not resolvable by the import graph)" });
      // best-effort: sources that NAME this file get their tests at L2 (escalation still applies)
      for (const f of readersOf(path.posix.basename(p))) { if (/\.test\.ts$/.test(f)) L2extra.add(f); else impacted.add(f); }
    } else {
      rec.class = "OUT_OF_GRAPH_DOMAIN"; level = "L3"; reasons.push(`OUT_OF_GRAPH_DOMAIN ${p} (src/app/other — only the full gate covers it) ⇒ L3`);
    }
    files.push(rec);
  }

  // ---- L2: reverse-dependent closure (core graph + scanned bin/test edges) ----
  const closure = new Set<string>(impacted);
  const outside: string[] = [];
  if (changedSources.size) {
    // a change to a module that IMPORTS a control surface can alter how that surface is driven ⇒ REINFORCED
    const e = needEdges(); const imp: string[] = [];
    for (const s of changedSources) {
      const deps = new Set<string>(e.files[s] || []);
      if (graph && s.startsWith("runtime/core/")) for (const d of graph.deps[path.posix.basename(s, ".ts")] || []) deps.add("runtime/core/" + d + ".ts");
      for (const d of deps) if (sensitiveHits(d.toLowerCase()).length) imp.push(s + " → " + d);
    }
    if (imp.length) { reinforced = true; reasons.push(`IMPORTS_SENSITIVE_MODULE: ${imp.slice(0, 5).join(", ")}${imp.length > 5 ? " (+" + (imp.length - 5) + ")" : ""} ⇒ REINFORCED`); }
  }
  if (impacted.size) {
    const e = needEdges();
    if (e.unreadable.length) { for (const u of e.unreadable) unresolved.push({ path: u, reason: "UNREADABLE_SOURCE (edge scan incomplete)" }); }
    const importersOf: any = {};
    for (const [f, deps] of Object.entries(e.files) as any) for (const d of deps) (importersOf[d] = importersOf[d] || []).push(f);
    const stack = [...impacted];
    while (stack.length) {
      const cur = stack.pop() as string;
      const next: string[] = [];
      if (graph && cur.startsWith("runtime/core/")) for (const c of graph.consumers[path.posix.basename(cur, ".ts")] || []) next.push("runtime/core/" + c + ".ts");
      for (const imp of importersOf[cur] || []) next.push(imp);
      for (const x of next) {
        if (!/^runtime\/(core|bin)\//.test(x)) { if (!outside.includes(x)) outside.push(x); }
        else if (/\.test\.ts$/.test(x)) { L2extra.add(x); continue; }
        if (!closure.has(x)) { closure.add(x); stack.push(x); }
      }
    }
    for (const m of closure) { const t = ownTestOf(m, reader); if (t) L2extra.add(t); }
    const consumerHits = [...closure].filter((m) => !impacted.has(m)).map((m) => ({ m, h: sensitiveHits(m.toLowerCase()) })).filter((x) => x.h.length);
    if (consumerHits.length) {
      reinforced = true;
      reasons.push(`IMPACTS_SENSITIVE_CONSUMER: ${consumerHits.slice(0, 5).map((x) => x.m).join(", ")}${consumerHits.length > 5 ? " (+" + (consumerHits.length - 5) + ")" : ""} ⇒ REINFORCED`);
    }
    if (outside.length) { level = "L3"; reasons.push(`CONSUMED_OUTSIDE_RUNTIME: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? " (+" + (outside.length - 5) + ")" : ""} (src/app/scripts — only the full gate covers them) ⇒ L3`); }
    const reverseDeps = closure.size - impacted.size;
    if (reverseDeps > 0) { level = maxLevel(level, "L2"); reasons.push(`REVERSE_DEPENDENTS: ${reverseDeps} module(s) depend on the change ⇒ L2`); }
  }
  if (unresolved.length) {
    const before = level; level = escalate(level);
    reasons.push(`UNRESOLVED_IMPACT (${unresolved.length}: ${unresolved.slice(0, 3).map((u) => u.path + " " + u.reason.split(" ")[0]).join("; ")}) ⇒ escalate ${before} → ${level} (fail closed)`);
  }
  const l1 = [...L1].sort();
  const l2 = [...new Set([...l1, ...L2extra, ...(coreSourceChanged ? REGRESSION_SUITES : [])])].filter((t) => reader.exists(t)).sort();
  // a code-level plan that selects NO suite would pass on typecheck alone ⇒ escalate (fail closed)
  if (level === "L1" && l1.length === 0) { level = "L2"; reasons.push("NO_TESTS_SELECTED at L1 ⇒ escalate L1 → L2"); }
  if (level === "L2" && l2.length === 0) { level = "L3"; reasons.push("NO_TESTS_SELECTED at L2 ⇒ escalate L2 → L3"); }
  if (reinforced) level = "L3";
  if (level === "DOCS_ONLY") reasons.push("DOCS_ONLY: only docs/evidence changed ⇒ no build/test; doc lint only. Merge STILL requires CI (never lowered)");
  return finish(level, reinforced, { files, l1, l2, unresolved, closureSize: closure.size, graphOk: !!graph, graphModules: graph ? graph.modules.length : null });

  function finish(lv: string, reinf: boolean, x: any = {}): any {
    const lvl = reinf ? "L3" : lv;
    const docs = (x.files || []).filter((f: any) => f.class === "DOC" && /\.json$/i.test(f.path)).map((f: any) => f.path);
    const steps: any[] = [];
    if (lvl === "DOCS_ONLY") steps.push({ step: "doc-lint", detail: "JSON validity of changed .json docs (" + docs.length + "); markdown lint NOT_CONFIGURED in this repo", files: docs });
    if (lvl === "L1" || lvl === "L2") steps.push({ step: "typecheck", cmd: "npx tsc --noEmit -p tsconfig.json" });
    if (lvl === "L1") steps.push({ step: "tests-L1", files: x.l1 || [] });
    if (lvl === "L2") steps.push({ step: "tests-L2", files: x.l2 || [] });
    if (lvl === "L3") steps.push(
      { step: "build", cmd: "npm run build:runtime" }, { step: "typecheck", cmd: "npx tsc --noEmit -p tsconfig.json" },
      { step: "trust-anchor", cmd: "bash scripts/odg-anchor-ci-check.sh . HEAD" },
      { step: "full-test-report", cmd: "ODG_TEST_WORKERS=8 npm run test:report", suites: fullList ? fullList.length : "NOT_MEASURED" },
      { step: "parity", detail: "no standalone parity driver (retired, ZERO-JS); dist parity is exercised by build:runtime + the compiled-dist suites inside test:report" },
      { step: "independent-inspection", mandatory: true });
    steps.push({ step: "pre-merge-CI", mandatory: true, detail: "ci.yml (build:runtime + tsc + anchor + test:report) runs on every PR — this selector never lowers it" });
    return freeze({
      schema: "ODG_VERIFICATION_PLAN", version: 1, level: lvl, reinforced: reinf, mandatoryPreMergeCI: true,
      independentInspection: lvl === "L3" ? "MANDATORY" : "RECOMMENDED",
      reasons: freeze(reasons.slice()), files: freeze(x.files || []), unresolved: freeze(x.unresolved || []),
      tests: freeze({ L1: freeze(x.l1 || []), L2: freeze(x.l2 || []), L3: freeze(fullList || []) }),
      steps: freeze(steps), adversarialChecklist: reinf ? ADVERSARIAL_CHECKLIST : null,
      graph: freeze({ ok: x.graphOk === true, modules: x.graphModules ?? null, reverseClosure: x.closureSize ?? 0, source: "change-impact-graph.buildGraph (core→core) + js-require-scan edges (bin/test)" }),
    });
  }
}

const VERIFICATION_LEVEL_CONTRACT = freeze({
  id: "ODG-VERIFICATION-LEVEL", levels: LEVELS, regressionSuites: REGRESSION_SUITES,
  invariants: freeze([
    "mandatoryPreMergeCI is ALWAYS true — the selector scopes LOCAL verification only, never the CI gate",
    "unresolved impact escalates one level; invalid path / empty change-set ⇒ L3 REINFORCED; a code plan selecting 0 suites escalates",
    "a changed source that IMPORTS a control surface ⇒ REINFORCED; a doc JSON read by code is data (escalated), not DOCS_ONLY; consumers in src/app/scripts ⇒ L3",
    "any control-surface path, protected path, or sensitive reverse-dependent ⇒ REINFORCED (L3 + mandatory inspection + checklist)",
    "a suite REMOVED from test:report ⇒ REINFORCED; any other package.json/build-config change ⇒ L3",
    "reuses change-impact-graph + js-require-scan + supervisor canonPath/PROTECTED_PREFIXES — no second graph or parser",
  ]),
});

module.exports = { EXTRA_TREES, LEVELS, SENSITIVE_RULES, REGRESSION_SUITES, ADVERSARIAL_CHECKLIST, fsReader, normalizeChangedPath, sensitiveHits, testReportList, analyzePackageJson, scanEdges, chooseLevel, escalate, VERIFICATION_LEVEL_CONTRACT };
export {};

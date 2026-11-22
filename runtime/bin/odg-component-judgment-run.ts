#!/usr/bin/env node
"use strict";
/*
 * V15.0 — COMPONENT JUDGMENT RUN. Root cause addressed: odg-component-judgment (V361-D, #847) existed and was tested but had
 * NO runner on real data, so the census decision surface (modules exporting an API with no detected static consumer) never
 * received a persisted per-module disposition. This entry COMPOSES the existing census (runCensus) and the existing judge()
 * with GROUNDED, injected signals computed here from the real tree — no second graph, no fabricated consumer, no module
 * activated/retired/merged. ORPHANED_CONFIRMED is impossible (no confirmedOrphans input: only an owner can confirm one).
 *
 * Signals (each is evidence, not a verdict; see odg-component-judgment precedence):
 *   dynamicUse      — the module name appears in a spawn/exec/require/path.join/import(…) line of another non-test source
 *   indexMember     — the module name appears as a quoted string in another non-test source (registry / list / map)
 *   ownerGated      — its own source carries an OWNER_GATED / owner-decision marker (MEDIUM confidence by design)
 *   hasRequireMain, exportsApi, hasTest, binWired (named in runtime/bin or package.json)
 * Usage: npx tsx runtime/bin/odg-component-judgment-run.ts [--write docs/odg/evidence/V150_COMPONENT_JUDGMENT.json]
 */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const { runCensus } = require("./odg-component-census-run.ts");
const J = require(path.join(ROOT, "runtime", "core", "odg-component-judgment.js"));

function sources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  const walk = (dir: string, depth: number) => {
    let es: any[]; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (["node_modules", ".git", "dist", ".next"].includes(e.name) || depth > 7) continue; walk(full, depth + 1); continue; }
      if (!/\.(ts|tsx|js|jsx|sh|json)$/.test(e.name) || /\.test\.(ts|js)$/.test(e.name)) continue;
      try { out.push({ file: path.relative(ROOT, full), text: fs.readFileSync(full, "utf8") }); } catch {}
    }
  };
  for (const d of ["runtime/core", "runtime/bin", "scripts", "src", "deploy"]) walk(path.join(ROOT, d), 0);   // deploy/*.sh can load modules (review: qualification-plan)
  try { out.push({ file: "package.json", text: fs.readFileSync(path.join(ROOT, "package.json"), "utf8") }); } catch {}
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

function main(argv: string[]): void {
  const outPath = (() => { const i = argv.indexOf("--write"); return i >= 0 ? argv[i + 1] : null; })();
  const head = (cp.spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout || "").trim();
  const census = runCensus();
  const surface: string[] = (census.decisionSurface || []).map((d: any) => (typeof d === "string" ? d : d.module)).slice().sort();
  const srcs = sources();
  const signals: Record<string, any> = {}; const refs: Record<string, any> = {};
  for (const m of surface) {
    const own = (() => { try { return fs.readFileSync(path.join(ROOT, "runtime/core", m + ".ts"), "utf8"); } catch { return ""; } })();
    const dyn: string[] = [], named: string[] = [];
    const esc = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const quoted = new RegExp("[\"'`/]" + esc + "(\\.(js|ts))?[\"'`]");
    // (review fix) a LOAD context only: the name inside require(…)/import(…)/spawn|exec(…) — a list entry, an existsSync
    // presence check, a path.join without load, or a string in a report is NOT use (it was the main false-positive source).
    const dynLine = new RegExp("(require\\s*\\(|import\\s*\\(|(spawn|exec|execFile)(Sync)?\\s*\\()[^\\n]*" + esc + "|node\\s+[^\\n]*" + esc + "\\.js|tsx\\s+[^\\n]*" + esc + "\\.ts");
    // line-by-line; a reference to the module's TEST file (`<m>.test.ts`, e.g. package.json test lists) is NOT consumption,
    // and package.json only counts for binWired (scripts), never as a consumer.
    const testRef = new RegExp(esc + "\\.test\\.");
    for (const s of srcs) {
      if (s.file === "runtime/core/" + m + ".ts" || s.file === "package.json") continue;
      if (!s.text.includes(m)) continue;
      const lines = s.text.split("\n").filter((l: string) => l.includes(m) && !testRef.test(l) && !/^\s*(\/\/|\*|#)/.test(l));
      if (lines.some((l: string) => dynLine.test(l) && !/existsSync/.test(l))) dyn.push(s.file); else if (lines.some((l: string) => quoted.test(l))) named.push(s.file);
    }
    const exportsApi = /module\.exports\s*=\s*\{[^}]*[A-Za-z_]/.test(own);
    signals[m] = {
      dynamicUse: dyn.length > 0,
      indexMember: named.length > 0,
      ownerGated: /OWNER[_-]GATED|owner[- ]decision/i.test(own),
      hasRequireMain: /require\.main\s*===\s*module/.test(own),
      exportsApi,
      hasTest: fs.existsSync(path.join(ROOT, "runtime/core", m + ".test.ts")),
      binWired: srcs.some((s) => s.file.startsWith("runtime/bin/") && s.text.includes(m)) || srcs.some((s) => s.file === "package.json" && new RegExp(esc + "(?!\\.test)").test(s.text.replace(new RegExp(esc + "\\.test\\.ts", "g"), ""))),
    };
    refs[m] = { dynamicRefs: dyn.slice(0, 5), nameRefs: named.slice(0, 5) };
  }
  const r = J.judge({ modules: surface, signals });
  const dispositions = (r.dispositions || r.modules || []).map((d: any) => ({ ...d, signals: signals[d.module], refs: refs[d.module] }));
  const dist: Record<string, number> = {}; for (const d of dispositions) dist[d.status] = (dist[d.status] || 0) + 1;
  const report = {
    generator: "runtime/bin/odg-component-judgment-run.ts", head,
    composes: ["odg-component-census (runCensus)", "odg-component-judgment.judge (V361-D, #847)"],
    surfaceSize: surface.length, distribution: dist,
    actionable: dispositions.filter((d: any) => d.actionable).map((d: any) => d.module),
    dispositions,
    limits: [
      "comment lines and references to <module>.test.* are ignored; package.json counts only for binWired",
      "signals are static text evidence: dynamicUse/indexMember can be triggered by a comment or a list that never loads the module (false positive), and miss computed names (false negative)",
      "ORPHANED_CONFIRMED is unreachable here by design — only an owner confirmation can produce it",
      "no module is activated, wired, retired or merged by this run",
    ],
  };
  const text = JSON.stringify(report, null, 2) + "\n";
  if (outPath) fs.writeFileSync(path.join(ROOT, outPath), text); else process.stdout.write(text);
  process.stderr.write(`[component-judgment] HEAD ${head.slice(0, 8)} surface=${surface.length} ${JSON.stringify(dist)} actionable=${report.actionable.length}\n`);
}
main(process.argv.slice(2));
export {};

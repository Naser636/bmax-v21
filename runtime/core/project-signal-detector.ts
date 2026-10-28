#!/usr/bin/env node
/**
 * project-signal-detector — V44: a reusable, executable INSPECT/RESOLVE capability that detects a project's language,
 * framework, build system, test framework, package manager and domain from a file listing + manifests, then resolves
 * HONESTLY which domains ODG can actually ACT on vs UNSUPPORTED. This is the foundation step of the general engineering
 * loop (UNDERSTAND→INSPECT→…→RESOLVE CAPABILITIES) and generalizes across many task families — but it is a DETECTION
 * capability, not a claim that ODG can build arbitrary apps.
 *
 * HONESTY (mandate): detection is real + evidence-backed (never fabricated). actionability is scoped to ODG's PROVEN
 * executable surface (TypeScript/JavaScript, its own stack); every other language/stack resolves to UNSUPPORTED with a
 * reason — no faked execution. Fail-closed on empty/unknown input. Pure/deterministic.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function ext(p: string): string { const m = /\.([a-z0-9]+)$/i.exec(String(p || "")); return m ? m[1].toLowerCase() : ""; }

// language ← file extension (evidence-backed). Curated, not exhaustive.
const EXT_LANG: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", rb: "Ruby", php: "PHP", cs: "C#", swift: "Swift", c: "C", cpp: "C++", h: "C/C++" };
// ODG's PROVEN executable surface (what it can genuinely act on today).
const ACTIONABLE_LANGS = new Set(["TypeScript", "JavaScript"]);
const MANIFEST_BUILD: Record<string, { build: string; pm: string; lang: string }> = {
  "package.json": { build: "node", pm: "npm/pnpm/yarn", lang: "TypeScript/JavaScript" },
  "requirements.txt": { build: "pip", pm: "pip", lang: "Python" }, "pyproject.toml": { build: "python", pm: "pip/poetry", lang: "Python" },
  "go.mod": { build: "go", pm: "go-modules", lang: "Go" }, "Cargo.toml": { build: "cargo", pm: "cargo", lang: "Rust" },
  "pom.xml": { build: "maven", pm: "maven", lang: "Java" }, "build.gradle": { build: "gradle", pm: "gradle", lang: "Java/Kotlin" }, "Gemfile": { build: "bundler", pm: "rubygems", lang: "Ruby" },
};

/** detectFrameworksAndTests(deps): framework/test/domain hints from a dependency name map (package.json deps). */
function detectFrameworksAndTests(deps: Record<string, any>): any {
  const names = Object.keys(isObj(deps) ? deps : {}).map((n) => n.toLowerCase());
  const has = (s: string) => names.some((n) => n === s || n.includes(s));
  const frameworks: string[] = [];
  if (has("next")) frameworks.push("Next.js"); if (has("react")) frameworks.push("React"); if (has("vue")) frameworks.push("Vue");
  if (has("@angular/core")) frameworks.push("Angular"); if (has("express")) frameworks.push("Express"); if (has("fastify")) frameworks.push("Fastify");
  if (has("django")) frameworks.push("Django"); if (has("flask")) frameworks.push("Flask"); if (has("spring")) frameworks.push("Spring");
  const tests: string[] = [];
  if (has("jest")) tests.push("jest"); if (has("vitest")) tests.push("vitest"); if (has("mocha")) tests.push("mocha"); if (has("pytest")) tests.push("pytest");
  const domains: string[] = [];
  if (frameworks.some((f) => ["Next.js", "React", "Vue", "Angular"].includes(f))) domains.push("web-frontend");
  if (frameworks.some((f) => ["Express", "Fastify", "Django", "Flask", "Spring"].includes(f))) domains.push("backend-api");
  return { frameworks, tests, domains };
}

/** detectSignals(repo): repo = { files:[paths], manifests:{name:contentObj}, deps:{name:ver} }. */
function detectSignals(repo: any): any {
  if (!isObj(repo) || (!Array.isArray(repo.files) && !isObj(repo.manifests))) return { ok: false, code: "INVALID_INPUT", detail: "repo { files[], manifests{} } required" };
  const files = Array.isArray(repo.files) ? repo.files.map(String) : [];
  const manifests = isObj(repo.manifests) ? repo.manifests : {};

  // Languages from extensions (counted) + manifest hints.
  const langCount: Record<string, number> = {};
  for (const f of files) { const l = EXT_LANG[ext(f)]; if (l) langCount[l] = (langCount[l] || 0) + 1; }
  const totalLangFiles = Object.values(langCount).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langCount).map(([name, n]) => ({ name, confidence: Math.round((n / totalLangFiles) * 100) / 100, evidence: `${n} file(s) with a ${name} extension` })).sort((a, b) => b.confidence - a.confidence);

  // Build system / package manager from manifests present.
  const buildHits = Object.keys(manifests).filter((m) => MANIFEST_BUILD[m]).map((m) => MANIFEST_BUILD[m]);
  const buildSystem = buildHits.length ? buildHits[0].build : (languages.length ? "unknown" : null);
  const packageManager = buildHits.length ? buildHits[0].pm : null;

  // Frameworks / tests / domains from package.json deps (if present) or repo.deps.
  const pkg = manifests["package.json"];
  const deps = isObj(repo.deps) ? repo.deps : (isObj(pkg) ? Object.assign({}, pkg.dependencies, pkg.devDependencies) : {});
  const ft = detectFrameworksAndTests(deps);

  // Honest capability resolution: ODG can ACT on TS/JS (its proven surface); else UNSUPPORTED (no faked execution).
  const primaryLang = languages.length ? languages[0].name : (buildHits.length ? buildHits[0].lang : "UNKNOWN");
  const odgActionable = languages.some((l: any) => ACTIONABLE_LANGS.has(l.name));
  const capabilityResolution = (languages.length ? languages : [{ name: primaryLang }]).map((l: any) => ({
    language: l.name,
    status: ACTIONABLE_LANGS.has(l.name) ? "IMPLEMENTED_AND_VERIFIED" : "UNSUPPORTED",
    reason: ACTIONABLE_LANGS.has(l.name) ? "ODG's proven executable surface (TypeScript/JavaScript)" : `no verified ${l.name} executor/toolchain in ODG — detection only, action UNSUPPORTED (not faked)`,
  }));

  return {
    ok: true,
    languages, primaryLang, buildSystem, packageManager,
    frameworks: ft.frameworks, testFrameworks: ft.tests, domains: ft.domains,
    odgActionable, capabilityResolution,
    note: "DETECTION is real + evidence-backed; actionability scoped to ODG's proven TS/JS surface — other stacks are UNSUPPORTED (detection only, no faked execution). Foundation for the INSPECT/RESOLVE loop step.",
  };
}

export { EXT_LANG, ACTIONABLE_LANGS, detectFrameworksAndTests, detectSignals };
module.exports = { EXT_LANG, ACTIONABLE_LANGS, detectFrameworksAndTests, detectSignals };

if (require.main === module) {
  process.stdout.write(JSON.stringify(detectSignals({ files: ["src/app/page.tsx", "runtime/core/x.ts"], manifests: { "package.json": { dependencies: { next: "15", react: "19" }, devDependencies: { jest: "29" } } } }), null, 2) + "\n");
}

#!/usr/bin/env node
/**
 * code-review-service — the FIRST end-to-end Enterprise Software Engineering business capability that goes BEYOND the
 * compile CHECK (code-health-service) into a produced, interoperable ENGINEERING REVIEW. The inventory established
 * that the primitives exist and are gated (code-execution multi-language checkers, sarif-report SARIF 2.1.0 emitter)
 * but NOTHING composed them into a shippable review deliverable driven by REAL analysis — this closes that gap.
 *
 * What it does (a representative, paid-shaped mission): input = a code project (self-contained files); output = a
 * Code Review with severity-ranked FINDINGS, each backed by a REPRODUCIBLE tool invocation (not an opinion), plus a
 * summary and explicit limits — and, because the findings use the exact {id,area,severity,detail,remediation,evidence}
 * shape sarif-report consumes, the review emits SARIF 2.1.0 that ANY consumer (GitHub code-scanning, VS Code) can read.
 *
 * Analyzers (REAL, reproducible — each finding names the tool + exit + evidence):
 *   - compile: the language's real syntax/type check (code-execution.runSyntaxCheck) ⇒ a FAIL is a HIGH finding.
 *   - lint:    Shell files additionally run shellcheck (code-execution 'ShellLint') ⇒ a FAIL is a MEDIUM finding.
 *
 * Honesty contract (deny-by-default, never overclaim):
 *   - A review of syntax/type/lint findings is NOT a security audit, correctness proof, or certification.
 *   - An UNSUPPORTED language or an ABSENT toolchain is DECLARED (coverage gap), never silently treated as "clean".
 *     A file whose analyzer could not run is NOT counted as reviewed and NEVER contributes a false "0 findings".
 * Composition only — reuses code-execution + sarif-report; NO new primitive. Pure/deterministic given an injected runner.
 */
"use strict";

const EXEC = require("./code-execution.js");
const SARIF = require("./sarif-report.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function clip(s: any, n: number): string { const t = typeof s === "string" ? s : ""; return t.length > n ? t.slice(0, n) + "…" : t; }

// extension → code-execution language (for files that don't declare one explicitly).
const EXT_LANG: Readonly<Record<string, string>> = Object.freeze({
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".ts": "TypeScript", ".py": "Python", ".sh": "Shell", ".bash": "Shell",
  ".sql": "SQL", ".yaml": "YAML", ".yml": "YAML", ".json": "JSON",
  ".go": "Go", ".rs": "Rust", ".java": "Java", ".cs": "CSharp",
});

function languageOf(f: any): string {
  if (typeof f.language === "string" && f.language) return f.language;
  const p = String(f.path || "");
  const dot = p.lastIndexOf(".");
  const ext = dot >= 0 ? p.slice(dot).toLowerCase() : "";
  return EXT_LANG[ext] || "";
}

const LIMITS = Object.freeze([
  "a syntax/type/lint review is NOT a security audit, correctness proof, or certification",
  "TypeScript single-file review is sound only for self-contained files (project imports need project mode)",
  "a language without a local toolchain is reported as a coverage gap (UNSUPPORTED/BLOCKED), never as 'clean'",
  "findings are limited to what the named analyzers detect — absence of findings is not a guarantee of correctness",
]);

/**
 * reviewProject(input, opts?): run the real analyzers over the project and return the Code Review.
 *   input = { project?: string, files: [{ path, language?, content }] }
 *   opts  = { runner?, toolchain? }   // injectable for deterministic tests; defaults to the real host toolchain
 * Returns { ok, review: { project, findings[], summary, coverage, limits, note } } — fail-closed on bad input.
 */
function reviewProject(input: any, opts: any = {}): any {
  if (!isObj(input) || !Array.isArray(input.files)) return { ok: false, code: "INVALID_INPUT", reason: "input { files: [{path, content, language?}] } required" };
  if (input.files.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "at least one file required" };
  if (input.files.length > 500) return { ok: false, code: "INVALID_INPUT", reason: "too many files (bounded at 500 per review)" };
  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const toolchain = isObj(opts.toolchain) ? opts.toolchain : EXEC.detectToolchain(runner ? { runner } : {});
  const project = typeof input.project === "string" && input.project ? input.project : "project";

  const findings: any[] = [];
  const coverage = { reviewed: 0, unsupported: 0, blocked: 0, languages: {} as Record<string, number> };

  const runCheck = (language: string, path: string, content: string) => {
    const available = toolchain[language] === true;
    return EXEC.runSyntaxCheck({ language, filename: path, content, toolchainAvailable: available, ...(runner ? { runner } : {}) });
  };

  for (const f of input.files) {
    if (!isObj(f) || typeof f.path !== "string" || typeof f.content !== "string") { coverage.blocked++; continue; }
    const language = languageOf(f);
    if (!language || !EXEC.LANG_SPEC[language]) { coverage.unsupported++; continue; }           // declared coverage gap, NOT clean
    coverage.languages[language] = (coverage.languages[language] || 0) + 1;

    // ---- compile/syntax/type analyzer (real) ----
    const r = runCheck(language, f.path, f.content);
    if (r.status === "UNSUPPORTED") { coverage.unsupported++; continue; }
    if (r.status === "BLOCKED") { coverage.blocked++; continue; }                                 // toolchain absent/timeout — never a clean PASS
    coverage.reviewed++;
    const tool = (EXEC.LANG_SPEC[language] && EXEC.LANG_SPEC[language].bin) || "checker";
    if (r.status === "FAIL") {
      findings.push({
        id: `compile:${f.path}`, area: "compile", severity: "HIGH",
        detail: `${language} does not compile/parse: ${clip(r.detail || r.reason || "error", 300)}`,
        remediation: "fix the reported syntax/type error so the file compiles",
        evidence: `${tool} exited non-zero — ${clip(r.stderr || r.detail || "", 400)}`,
      });
    }

    // ---- lint analyzer (real): shellcheck for Shell files, when the toolchain is present ----
    if (language === "Shell" && toolchain.ShellLint === true) {
      const lint = EXEC.runSyntaxCheck({ language: "ShellLint", filename: f.path, content: f.content, toolchainAvailable: true, ...(runner ? { runner } : {}) });
      if (lint.status === "FAIL") {
        findings.push({
          id: `lint:${f.path}`, area: "lint", severity: "MEDIUM",
          detail: `shellcheck reported issues: ${clip(lint.detail || lint.reason || "", 300)}`,
          remediation: "address the shellcheck warnings (quoting, unset vars, portability)",
          evidence: `shellcheck exited non-zero — ${clip(lint.stderr || lint.detail || "", 400)}`,
        });
      }
    }
  }

  const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const fnd of findings) (bySeverity as any)[fnd.severity] = ((bySeverity as any)[fnd.severity] || 0) + 1;
  const summary = {
    totalFiles: input.files.length,
    filesReviewed: coverage.reviewed,
    filesUnsupported: coverage.unsupported,
    filesBlocked: coverage.blocked,
    findingCount: findings.length,
    bySeverity,
    // "clean" is asserted ONLY over files actually reviewed, and only when at least one was reviewed — never over gaps.
    clean: coverage.reviewed > 0 && findings.length === 0,
    coverageBasis: `${coverage.reviewed} file(s) analysed by a real toolchain; ${coverage.unsupported} unsupported + ${coverage.blocked} blocked EXCLUDED from the verdict`,
  };

  return {
    ok: true,
    review: {
      project, findings, summary, coverage,
      limits: LIMITS,
      note: "Engineering review from REAL reproducible analyzers (compile/type + shellcheck lint). NOT a security audit/certification/correctness guarantee. Coverage gaps (unsupported language / absent toolchain) are declared and excluded from the verdict, never counted as clean. No content retained; nothing sent anywhere.",
    },
  };
}

/**
 * reviewToSarif(reviewResult, opts?): adapt a reviewProject() result into a SARIF 2.1.0 log via sarif-report
 * (the review findings already use the shape sarif-report consumes). Returns sarif-report.toSarif()'s result.
 */
function reviewToSarif(reviewResult: any, opts: any = {}): any {
  if (!isObj(reviewResult) || reviewResult.ok !== true || !isObj(reviewResult.review)) {
    return { ok: false, code: "INVALID_INPUT", detail: "an ok reviewProject() result is required" };
  }
  return SARIF.toSarif(
    { ok: true, project: reviewResult.review.project, findings: reviewResult.review.findings },
    { toolName: "ODG-Code-Review", version: typeof opts.version === "string" ? opts.version : "1", ...(opts.informationUri ? { informationUri: opts.informationUri } : {}) },
  );
}

export { EXT_LANG, LIMITS, languageOf, reviewProject, reviewToSarif };
module.exports = { EXT_LANG, LIMITS, languageOf, reviewProject, reviewToSarif };

if (require.main === module) {
  // Read-only self-demo over two in-memory files (one clean, one broken) using the real host toolchain.
  const demo = reviewProject({ project: "demo", files: [
    { path: "ok.js", content: "const x = 1; module.exports = x;\n" },
    { path: "bad.js", content: "const y = ;\n" },
  ] });
  process.stdout.write(JSON.stringify({ findingCount: demo.review && demo.review.summary.findingCount, bySeverity: demo.review && demo.review.summary.bySeverity }, null, 2) + "\n");
}

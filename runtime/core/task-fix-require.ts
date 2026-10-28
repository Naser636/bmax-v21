#!/usr/bin/env node
/**
 * task-fix-require — V48 Lot C (register C-06): the FOURTH real coding task family — "repair a broken relative
 * require/import from a reproducible failure." A real, common bug (a moved file ⇒ `require("./util")` throws
 * MODULE_NOT_FOUND ⇒ the test fails) that is DETERMINISTICALLY fixable WHEN unambiguous — NOT synthesis.
 *
 * ODG rewrites a broken relative specifier to the correct path ONLY when EXACTLY ONE existing module in the provided
 * candidate set matches the specifier's basename. Zero candidates ⇒ UNSUPPORTED (nothing to point at); more than one
 * ⇒ BLOCKED (ambiguous — ODG does not guess). A specifier that already resolves ⇒ UNSUPPORTED (not a broken-require
 * defect). It produces a runRepairWorkflow task whose PRE-DECLARED acceptance is the caller's failing test; the harness
 * enforces baseline-FAIL → post-PASS with exact rollback. Reuses the V46 harness (no new primitive).
 */
"use strict";

const path = require("path");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** List relative specifiers used by require()/import-from in the source (only "./" and "../"). */
function relativeSpecifiers(source: string): string[] {
  const src = String(source || "");
  const out = new Set<string>();
  const re = /(?:require\(\s*|from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g;
  let m: any;
  while ((m = re.exec(src))) out.add(m[1]);
  return Array.from(out);
}

/** Candidate basenames: map a candidate repo-relative file to its basename sans extension. */
function basenameKey(p: string): string { return path.basename(String(p)).replace(/\.(js|ts|cjs|mjs|json)$/i, ""); }

/** specifierBase(spec): the basename (sans ext) the specifier points at, e.g. "./util" ⇒ "util". */
function specifierBase(spec: string): string { return basenameKey(spec); }

/**
 * findCorrectSpecifier(fromModulePath, badSpecifier, candidates): if EXACTLY ONE candidate matches the specifier's
 * basename, return the corrected relative specifier (from the importing module's dir). Else { count } with no fix.
 */
function findCorrectSpecifier(fromModulePath: string, badSpecifier: string, candidates: string[]): any {
  const want = specifierBase(badSpecifier);
  const matches = (Array.isArray(candidates) ? candidates : []).filter((c) => typeof c === "string" && basenameKey(c) === want);
  if (matches.length !== 1) return { count: matches.length, matches };
  const fromDir = path.posix.dirname(String(fromModulePath).replace(/\\/g, "/"));
  let rel = path.posix.relative(fromDir, matches[0].replace(/\\/g, "/")).replace(/\.(js|ts|cjs|mjs)$/i, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return { count: 1, corrected: rel, target: matches[0] };
}

/** Rewrite every require()/import-from occurrence of badSpecifier to corrected. Deterministic string replace. */
function rewriteSpecifier(source: string, badSpecifier: string, corrected: string): string {
  const esc = badSpecifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(source).replace(new RegExp(`(["'])${esc}(["'])`, "g"), `$1${corrected}$2`);
}

/**
 * buildFixRequireTask(spec): validate + assemble a runRepairWorkflow task.
 * spec = { workspaceDir, modulePath, source, badSpecifier, candidates[], acceptanceCommand, writeSet?, timeoutMs? }
 * Returns { ok:true, task, corrected, ... } | { ok:false, code, reason } (UNSUPPORTED/BLOCKED when not a safe fix).
 */
function buildFixRequireTask(spec: any): any {
  if (!isObj(spec)) return { ok: false, code: "INVALID_INPUT", reason: "spec object required" };
  if (typeof spec.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (typeof spec.modulePath !== "string" || !spec.modulePath) return { ok: false, code: "INVALID_INPUT", reason: "modulePath (repo-relative) required" };
  if (typeof spec.source !== "string") return { ok: false, code: "INVALID_INPUT", reason: "current module `source` (string) required" };
  if (typeof spec.badSpecifier !== "string" || !spec.badSpecifier.startsWith(".")) return { ok: false, code: "INVALID_INPUT", reason: "badSpecifier (a relative './…' string) required" };
  if (!Array.isArray(spec.acceptanceCommand) || spec.acceptanceCommand.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "acceptanceCommand (string[]) required" };

  if (!relativeSpecifiers(spec.source).includes(spec.badSpecifier)) {
    return { ok: false, code: "UNSUPPORTED", reason: `badSpecifier '${spec.badSpecifier}' is not required/imported in ${spec.modulePath} — nothing to repair` };
  }
  const found = findCorrectSpecifier(spec.modulePath, spec.badSpecifier, spec.candidates || []);
  if (found.count === 0) return { ok: false, code: "UNSUPPORTED", reason: `no existing module matches '${spec.badSpecifier}' basename — ODG will not invent a target` };
  if (found.count > 1) return { ok: false, code: "BLOCKED", reason: `ambiguous: ${found.count} candidates match '${spec.badSpecifier}' basename — ODG does not guess`, unblock: "disambiguate the intended target module" };
  if (found.corrected === spec.badSpecifier) return { ok: false, code: "UNSUPPORTED", reason: "specifier already points at the single candidate — not a broken-require defect" };

  const fixed = rewriteSpecifier(spec.source, spec.badSpecifier, found.corrected);
  if (fixed === spec.source) return { ok: false, code: "BLOCKED", reason: "rewrite produced no change (unexpected source shape)" };

  const writeSet = Array.isArray(spec.writeSet) && spec.writeSet.length ? spec.writeSet : [spec.modulePath];
  const task = {
    workspaceDir: spec.workspaceDir,
    acceptance: { command: spec.acceptanceCommand, timeoutMs: Number(spec.timeoutMs) || 30000 },
    writeSet,
    change: { source: "edits", edits: [{ path: path.normalize(spec.modulePath), content: fixed }] },
  };
  return { ok: true, task, corrected: found.corrected, target: found.target, note: "Deterministic repair of a broken relative require/import (reproducible MODULE_NOT_FOUND). Rewrites to the SINGLE matching candidate; UNSUPPORTED/BLOCKED when none/ambiguous. Accepted only if the failing test PASSES after the fix (else rolled back). Not synthesis." };
}

export { relativeSpecifiers, findCorrectSpecifier, rewriteSpecifier, buildFixRequireTask };
module.exports = { relativeSpecifiers, findCorrectSpecifier, rewriteSpecifier, buildFixRequireTask };

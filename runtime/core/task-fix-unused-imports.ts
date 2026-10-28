#!/usr/bin/env node
/**
 * task-fix-unused-imports — V58 §3 (register C-16): the SIXTH coding task family — remove an UNUSED named import
 * (a common lint/`noUnusedLocals` failure). Deterministic + conservative: ODG removes a symbol ONLY when it can
 * PROVE the symbol is imported via an ES `import { … } from …` line AND is referenced NOWHERE else in the file.
 * If the symbol is referenced anywhere outside its import, it is UNSUPPORTED (ODG never removes a used import).
 *
 * Reuses local-fixers.removeUnusedNamedImports for the edit and runRepairWorkflow for the bounded apply + real
 * acceptance (the caller's oracle, e.g. `tsc --noEmit -p tsconfig` with noUnusedLocals, which FAILs at baseline on
 * the unused import and PASSes after removal) + exact rollback. No new primitive; composes existing modules.
 */
"use strict";

const path = require("path");
const FIXERS = require("./local-fixers.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** isImportedNamed(source, symbol): is `symbol` a named import specifier in some `import { … } from …` line? */
function isImportedNamed(source: string, symbol: string): boolean {
  const S = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.split("\n").some((line) => {
    const m = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["'][^"']+["'];?\s*$/);
    return !!m && m[1].split(",").map((s) => s.trim()).includes(symbol);
  });
}

/** referencedOutsideImport(source, symbol): does `symbol` appear as a word ANYWHERE except in `import {...}` lines? */
function referencedOutsideImport(source: string, symbol: string): boolean {
  const S = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`\\b${S}\\b`);
  return source.split("\n").some((line) => {
    const isImportLine = /^\s*import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\s*$/.test(line);
    return !isImportLine && word.test(line);
  });
}

/** detectUnusedImport(source, symbol): { imported, referenced, unused }. unused ⇔ imported AND not referenced. */
function detectUnusedImport(source: string, symbol: string): any {
  const imported = isImportedNamed(source, symbol);
  const referenced = referencedOutsideImport(source, symbol);
  return { imported, referenced, unused: imported && !referenced };
}

/**
 * buildFixUnusedImportsTask(spec): validate + assemble a runRepairWorkflow task that removes proven-unused imports.
 * spec = { workspaceDir, modulePath, source, symbols[], acceptanceCommand, writeSet?, timeoutMs? }
 * Returns { ok:true, task, removed[] } | { ok:false, code, reason } (UNSUPPORTED when a symbol is used or not imported).
 */
function buildFixUnusedImportsTask(spec: any): any {
  if (!isObj(spec)) return { ok: false, code: "INVALID_INPUT", reason: "spec object required" };
  if (typeof spec.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (typeof spec.modulePath !== "string" || !spec.modulePath) return { ok: false, code: "INVALID_INPUT", reason: "modulePath (repo-relative) required" };
  if (typeof spec.source !== "string") return { ok: false, code: "INVALID_INPUT", reason: "current module `source` (string) required" };
  const symbols = Array.isArray(spec.symbols) ? spec.symbols : [];
  if (symbols.length === 0 || !symbols.every((s: any) => typeof s === "string" && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s))) return { ok: false, code: "INVALID_INPUT", reason: "symbols[] (valid identifiers) required" };
  if (!Array.isArray(spec.acceptanceCommand) || spec.acceptanceCommand.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "acceptanceCommand (string[]) required" };

  for (const sym of symbols) {
    const d = detectUnusedImport(spec.source, sym);
    if (!d.imported) return { ok: false, code: "UNSUPPORTED", reason: `symbol '${sym}' is not a named import in ${spec.modulePath}` };
    if (d.referenced) return { ok: false, code: "UNSUPPORTED", reason: `symbol '${sym}' IS referenced — ODG will not remove a used import` };
  }
  const fixed = FIXERS.removeUnusedNamedImports(spec.source, symbols);
  if (fixed === spec.source) return { ok: false, code: "BLOCKED", reason: "removal produced no change (unexpected import shape)" };

  const writeSet = Array.isArray(spec.writeSet) && spec.writeSet.length ? spec.writeSet : [spec.modulePath];
  const task = {
    workspaceDir: spec.workspaceDir,
    acceptance: { command: spec.acceptanceCommand, timeoutMs: Number(spec.timeoutMs) || 60000 },
    writeSet,
    change: { source: "edits", edits: [{ path: path.normalize(spec.modulePath), content: fixed }] },
  };
  return { ok: true, task, removed: symbols, note: "Deterministic removal of PROVEN-unused named imports (imported + referenced nowhere else). Accepted only if the acceptance oracle (e.g. tsc noUnusedLocals) PASSES after removal (else rolled back). UNSUPPORTED if a symbol is used or not imported. Not synthesis." };
}

export { detectUnusedImport, isImportedNamed, referencedOutsideImport, buildFixUnusedImportsTask };
module.exports = { detectUnusedImport, isImportedNamed, referencedOutsideImport, buildFixUnusedImportsTask };

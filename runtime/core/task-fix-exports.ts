#!/usr/bin/env node
/**
 * task-fix-exports — V47 Lot A: the THIRD real coding task family — "repair a reproducible failing test" for the
 * canonical, mechanically well-defined defect class **"symbol defined but not exported"** (CommonJS). This is a real,
 * common, reproducible bug (a test does `require(mod).fn(...)` and fails because `fn` is undefined), and it is
 * DETERMINISTICALLY detectable + fixable — NOT arbitrary synthesis. ODG repairs ONLY when it can prove the symbol is
 * actually defined in the module and genuinely absent from the exports; otherwise it returns UNSUPPORTED/BLOCKED and
 * invents nothing.
 *
 * It produces a `task` for runRepairWorkflow (change.source="edits") whose PRE-DECLARED acceptance is the caller's
 * failing test command. The harness enforces baseline-FAIL → post-PASS with exact rollback, so a fix that does not
 * actually make the test pass is ABSTAINED and rolled back. Reuses the V46 harness (no new primitive).
 */
"use strict";

const path = require("path");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * detectMissingExport(source, symbol): is `symbol` DEFINED in the module source and NOT already exported?
 * Returns { defined, exported, kind, reassignedNonObject }. Conservative: recognizes function/const/let/var/class
 * top-level declarations and common export forms. Ambiguous reassignment of module.exports to a non-object ⇒ flagged.
 */
function detectMissingExport(source: string, symbol: string): any {
  const src = String(source || "");
  const S = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const defRe = new RegExp(`(^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+${S}\\b|class\\s+${S}\\b|(?:const|let|var)\\s+${S}\\b)`);
  const defined = defRe.test(src);
  // Already exported? (module.exports = { … symbol … }  |  module.exports.symbol =  |  exports.symbol =  |  export … symbol)
  const inObjExport = new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${S}\\b[^}]*\\}`).test(src);
  const propExport = new RegExp(`(module\\.)?exports\\.${S}\\s*=`).test(src);
  const esExport = new RegExp(`export\\s+(?:\\{[^}]*\\b${S}\\b[^}]*\\}|(?:async\\s+)?(?:function|class|const|let|var)\\s+${S}\\b)`).test(src);
  const exported = inObjExport || propExport || esExport;
  // Is module.exports reassigned to a clearly non-object (primitive) value? Then appending a property is unsafe.
  const reassignedNonObject = /module\.exports\s*=\s*(null\b|\d|["'`])/.test(src);
  return { defined, exported, kind: defined ? "declaration" : null, reassignedNonObject };
}

/**
 * generateExportFix(source, symbol): deterministically add the missing export. If an object-literal
 * `module.exports = { … }` exists, insert the symbol into it; otherwise append `module.exports.<symbol> = <symbol>;`.
 */
function generateExportFix(source: string, symbol: string): string {
  const src = String(source || "");
  const objRe = /module\.exports\s*=\s*\{([\s\S]*?)\}/;
  const m = src.match(objRe);
  if (m) {
    const inner = m[1].trim();
    const insert = inner.length === 0 ? ` ${symbol} ` : `${m[1].replace(/\s*$/, "")}, ${symbol} `;
    return src.replace(objRe, `module.exports = {${insert}}`);
  }
  const sep = src.endsWith("\n") ? "" : "\n";
  return src + `${sep}module.exports.${symbol} = ${symbol};\n`;
}

/**
 * buildFixExportsTask(spec): validate + assemble a runRepairWorkflow task that repairs a missing export.
 * spec = { workspaceDir, modulePath (repo-rel), symbol, acceptanceCommand (string[]), writeSet (default [modulePath]),
 *          sourceOverride? (string, for pre-read content; else caller must pass the content via `source`) , source }
 * The caller supplies the CURRENT module source via `spec.source` (ODG does not read the live repo here).
 * Returns { ok:true, task, ... } | { ok:false, code, reason } (UNSUPPORTED when not a deterministic missing-export).
 */
function buildFixExportsTask(spec: any): any {
  if (!isObj(spec)) return { ok: false, code: "INVALID_INPUT", reason: "spec object required" };
  if (typeof spec.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (typeof spec.modulePath !== "string" || !spec.modulePath) return { ok: false, code: "INVALID_INPUT", reason: "modulePath (repo-relative) required" };
  if (typeof spec.symbol !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(spec.symbol)) return { ok: false, code: "INVALID_INPUT", reason: "a valid JS identifier `symbol` is required" };
  if (!Array.isArray(spec.acceptanceCommand) || spec.acceptanceCommand.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "acceptanceCommand (string[]) required" };
  if (typeof spec.source !== "string") return { ok: false, code: "INVALID_INPUT", reason: "current module `source` (string) required — ODG does not read the live repo here" };

  const det = detectMissingExport(spec.source, spec.symbol);
  if (!det.defined) return { ok: false, code: "UNSUPPORTED", reason: `symbol '${spec.symbol}' is not defined in ${spec.modulePath} — ODG will not invent an implementation (not a missing-export defect)` };
  if (det.exported) return { ok: false, code: "UNSUPPORTED", reason: `symbol '${spec.symbol}' is already exported — no missing-export defect to repair` };
  if (det.reassignedNonObject) return { ok: false, code: "BLOCKED", reason: `module.exports is reassigned to a non-object in ${spec.modulePath}; appending an export is unsafe — manual/subcontract`, unblock: "route to a change source that can restructure the module safely" };

  const fixed = generateExportFix(spec.source, spec.symbol);
  if (fixed === spec.source) return { ok: false, code: "BLOCKED", reason: "export-fix produced no change (unexpected source shape)" };

  const writeSet = Array.isArray(spec.writeSet) && spec.writeSet.length ? spec.writeSet : [spec.modulePath];
  const task = {
    workspaceDir: spec.workspaceDir,
    acceptance: { command: spec.acceptanceCommand, timeoutMs: Number(spec.timeoutMs) || 30000 },
    writeSet,
    change: { source: "edits", edits: [{ path: path.normalize(spec.modulePath), content: fixed }] },
  };
  return { ok: true, task, detection: det, note: "Deterministic repair of a DEFINED-BUT-NOT-EXPORTED symbol (a real reproducible failing-test defect). Accepted only if the failing test PASSES after the fix (else rolled back). Not synthesis; UNSUPPORTED when the symbol is undefined or already exported." };
}

export { detectMissingExport, generateExportFix, buildFixExportsTask };
module.exports = { detectMissingExport, generateExportFix, buildFixExportsTask };

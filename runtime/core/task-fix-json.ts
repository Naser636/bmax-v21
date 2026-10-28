#!/usr/bin/env node
/**
 * task-fix-json — V49 Lot E (register C-06/C-14): the FIFTH coding task family — deterministic repair of an invalid
 * JSON config whose ONLY defect is trailing commas (the most common, mechanically-safe JSON mistake). ODG repairs
 * ONLY when it can PROVE the fix is safe: the file fails `JSON.parse`, a string-aware trailing-comma strip makes it
 * parse, and nothing else changes. Any other parse defect ⇒ UNSUPPORTED (ODG does not guess/reformat). It produces a
 * runRepairWorkflow task whose acceptance is the caller's test; the harness enforces baseline-FAIL→post-PASS with
 * exact rollback. Reuses the V46 harness (no new primitive). NOT synthesis.
 */
"use strict";

const path = require("path");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * stripTrailingCommas(src): STRING-AWARE removal of a comma that (after whitespace) is immediately followed by `}` or
 * `]`. Commas inside string literals are never touched (so a value like "a,}" is preserved). Deterministic + idempotent.
 */
function stripTrailingCommas(src: string): string {
  const s = String(src);
  let out = "";
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") {
      // look ahead past whitespace for a closing bracket
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (j < s.length && (s[j] === "}" || s[j] === "]")) continue; // drop this trailing comma
    }
    out += c;
  }
  return out;
}

function parses(src: string): boolean { try { JSON.parse(src); return true; } catch { return false; } }

/**
 * detectJsonDefect(src): classify. { kind: "NOT_DEFECT" | "TRAILING_COMMA" | "UNSUPPORTED", fixed? }.
 * TRAILING_COMMA only when the ORIGINAL fails to parse AND the stripped version parses (a proven-safe fix).
 */
function detectJsonDefect(src: string): any {
  if (parses(src)) return { kind: "NOT_DEFECT" };
  const fixed = stripTrailingCommas(src);
  if (fixed !== src && parses(fixed)) return { kind: "TRAILING_COMMA", fixed };
  return { kind: "UNSUPPORTED" };
}

/**
 * buildFixJsonTask(spec): validate + assemble a runRepairWorkflow task.
 * spec = { workspaceDir, modulePath (the .json, repo-rel), source, acceptanceCommand (string[]), writeSet?, timeoutMs? }
 * Returns { ok:true, task, kind } | { ok:false, code, reason } (UNSUPPORTED when not a proven trailing-comma defect).
 */
function buildFixJsonTask(spec: any): any {
  if (!isObj(spec)) return { ok: false, code: "INVALID_INPUT", reason: "spec object required" };
  if (typeof spec.workspaceDir !== "string") return { ok: false, code: "INVALID_INPUT", reason: "workspaceDir required" };
  if (typeof spec.modulePath !== "string" || !/\.json$/i.test(spec.modulePath)) return { ok: false, code: "INVALID_INPUT", reason: "modulePath (a repo-relative .json) required" };
  if (typeof spec.source !== "string") return { ok: false, code: "INVALID_INPUT", reason: "current file `source` (string) required" };
  if (!Array.isArray(spec.acceptanceCommand) || spec.acceptanceCommand.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "acceptanceCommand (string[]) required" };

  const det = detectJsonDefect(spec.source);
  if (det.kind === "NOT_DEFECT") return { ok: false, code: "UNSUPPORTED", reason: "JSON already parses — no defect to repair" };
  if (det.kind === "UNSUPPORTED") return { ok: false, code: "UNSUPPORTED", reason: "JSON invalid for a reason other than trailing commas — ODG will not guess/reformat" };

  const writeSet = Array.isArray(spec.writeSet) && spec.writeSet.length ? spec.writeSet : [spec.modulePath];
  const task = {
    workspaceDir: spec.workspaceDir,
    acceptance: { command: spec.acceptanceCommand, timeoutMs: Number(spec.timeoutMs) || 30000 },
    writeSet,
    change: { source: "edits", edits: [{ path: path.normalize(spec.modulePath), content: det.fixed }] },
  };
  return { ok: true, task, kind: det.kind, note: "Deterministic repair of trailing-comma-only invalid JSON (string-aware; strings untouched). Accepted only if the failing acceptance PASSES after the fix (else rolled back). Other JSON defects ⇒ UNSUPPORTED. Not synthesis." };
}

export { stripTrailingCommas, detectJsonDefect, buildFixJsonTask };
module.exports = { stripTrailingCommas, detectJsonDefect, buildFixJsonTask };

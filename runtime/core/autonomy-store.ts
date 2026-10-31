#!/usr/bin/env node

/*
 * Autonomy Store (TypeScript port; parity with runtime/core/autonomy-store.js).
 *
 * One tiny shared JSON key/value store for the local-first capability stack (Patch Memory,
 * Capability Metrics, Capability Learning, ...). Pure port: the public exports (DIR, file, read,
 * write), the CWD-relative DIR (NOT __dirname — compilation-location-safe), the read fallback
 * semantics (fallback === undefined ? null : fallback on any parse/read error) and the write
 * behaviour (mkdir recursive + pretty JSON + return the object) are preserved EXACTLY. The
 * historical .js remains the behavioural reference; many live consumers depend on this API.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DIR = path.join("runtime", "generated", "autonomy");

function file(name: any): string {
  return path.join(DIR, `${name}.json`);
}

function read(name: any, fallback?: any): any {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback === undefined ? null : fallback;
  }
}

// readStrict(name): distinguish ABSENT from CORRUPT so a caller can REFUSE to overwrite a present-but-unparseable
// store (a torn write from a crash) instead of silently clobbering its contents. Plain read() collapses both to the
// fallback, which — combined with a subsequent write — silently discards the prior data (e.g. FROZEN loop-protection
// incidents). Returns { present, corrupt, value }: present=file exists; corrupt=exists but JSON.parse threw;
// value=parsed object (or null when absent/corrupt). Never throws.
function readStrict(name: any): any {
  let raw: any;
  try { raw = fs.readFileSync(file(name), "utf8"); }
  catch { return { present: false, corrupt: false, value: null }; }           // absent (or unreadable)
  try { return { present: true, corrupt: false, value: JSON.parse(raw) }; }
  catch { return { present: true, corrupt: true, value: null }; }             // present but torn/invalid JSON
}

// write(name, obj): CRASH-ATOMIC — write a temp file in the SAME dir then renameSync over the target (rename is
// atomic on the same filesystem), so an interrupted write can never leave a torn target behind. Mirrors the proven
// mission-ledger atomic-write. API unchanged (returns obj).
function write(name: any, obj: any): any {
  fs.mkdirSync(DIR, { recursive: true });
  const target = file(name);
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, target);
  return obj;
}

module.exports = { DIR, file, read, readStrict, write };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};

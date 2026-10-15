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

function write(name: any, obj: any): any {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(obj, null, 2));
  return obj;
}

module.exports = { DIR, file, read, write };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};

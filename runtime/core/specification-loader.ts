#!/usr/bin/env node

/*
 * Specification Loader (TypeScript port; parity with runtime/core/specification-loader.js).
 *
 * Reads a mission's specification markdown from the CWD-relative path
 * runtime/specifications/<mission>.md. Pure port: the single public export (loadSpecification),
 * its return shape ({ found, path, content }), the cwd-relative path (NOT __dirname — stays
 * compilation-location-safe), and the missing-file branch (content: null) are preserved EXACTLY.
 * The historical .js remains the behavioural reference.
 */

"use strict";

const fs = require("fs");
const path = require("path");

function loadSpecification(mission: any): { found: boolean; path: string; content: string | null } {
  const file = path.join("runtime", "specifications", `${mission}.md`);

  if (!fs.existsSync(file)) {
    return { found: false, path: file, content: null };
  }

  return { found: true, path: file, content: fs.readFileSync(file, "utf8") };
}

module.exports = { loadSpecification };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};

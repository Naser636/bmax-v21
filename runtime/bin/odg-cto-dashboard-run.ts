#!/usr/bin/env node
"use strict";
/*
 * V15.0 §9 (centre de pilotage) — runtime ENTRY for the canonical CTO dashboard (odg-cto-dashboard, V183 Livrable C).
 * Root cause addressed (V150 199-module reconciliation): odg-cto-dashboard loads ~40 canonical views — incl.
 * odg-metier-improvement-index and its downstream improvements — but had NO bin/route/caller, so that whole chain never
 * ran outside tests. READ-ONLY: build() is a pure projection over committed sources; this entry writes nothing unless
 * --write <path> is given. A section that cannot be computed renders NOT_MEASURED (dashboard contract).
 * Usage: npx tsx runtime/bin/odg-cto-dashboard-run.ts [--summary] [--write <file>]
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
process.chdir(ROOT);   // the dashboard reads repo-relative canonical sources
const D = require(path.join(ROOT, "runtime", "core", "odg-cto-dashboard.js"));

function main(argv: string[]): void {
  const r = D.build();
  const out = (() => { const i = argv.indexOf("--write"); return i >= 0 ? argv[i + 1] : null; })();
  if (argv.includes("--summary")) {
    const sections = Object.keys(r);
    const notMeasured = sections.filter((k) => JSON.stringify(r[k] === undefined ? null : r[k]).includes("NOT_MEASURED"));
    process.stdout.write(JSON.stringify({ sections: sections.length, sectionNames: sections, sectionsMentioningNotMeasured: notMeasured }, null, 2) + "\n");
  } else {
    const text = JSON.stringify(r, null, 2) + "\n";
    if (out) fs.writeFileSync(path.resolve(ROOT, out), text); else process.stdout.write(text);
  }
}
main(process.argv.slice(2));
export {};

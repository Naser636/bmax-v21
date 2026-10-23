// prefer-dist-bin — TypeScript canonical (dual-port: runtime/core/prefer-dist-bin.js is the ODG_RUNTIME=js
// twin; runtime/dist/core/prefer-dist-bin.js is the compiled default).
//
// The ONE pure selector for the L7 "compiled-dist-port-by-default" rule shared by the delegate/converge/
// autonomy spawn paths: on the TS runtime (default, ODG_RUNTIME !== "js") prefer the compiled dist executable
// when it exists; fall back to the source executable on an explicit ODG_RUNTIME=js rollback OR when the dist
// port is absent. `exists` is injected (defaults to fs.existsSync) so the selection is behaviorally verifiable
// without an import-time spawn; `env` is injected (defaults to process.env) so the js/ts switch is testable.
"use strict";
const fs = require("fs");

function preferDistBin(
  distRel: string,
  sourceRel: string,
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.ODG_RUNTIME !== "js" && exists(distRel) ? distRel : sourceRel;
}

module.exports = { preferDistBin };
export {};

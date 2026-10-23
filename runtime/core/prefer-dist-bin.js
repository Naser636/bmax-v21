// prefer-dist-bin — ODG_RUNTIME=js rollback twin of prefer-dist-bin.ts (behaviour byte-identical).
//
// The ONE pure selector for the L7 "compiled-dist-port-by-default" rule shared by the delegate/converge/
// autonomy spawn paths: on the TS runtime (default, ODG_RUNTIME !== "js") prefer the compiled dist executable
// when it exists; source fallback on ODG_RUNTIME=js or an absent dist. `exists` injected (defaults to
// fs.existsSync) for behavioral verification without an import-time spawn; `env` injected (defaults process.env).
"use strict";
const fs = require("fs");

function preferDistBin(distRel, sourceRel, exists = fs.existsSync, env = process.env) {
  return env.ODG_RUNTIME !== "js" && exists(distRel) ? distRel : sourceRel;
}

module.exports = { preferDistBin };

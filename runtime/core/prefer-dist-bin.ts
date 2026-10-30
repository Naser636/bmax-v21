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

// resolveRequiredPort — like preferDistBin, but FAIL-CLOSED. It returns whichever port actually EXISTS (preferring the
// dist port on the TS runtime), trying the other port before giving up, and THROWS a clear, actionable error if NEITHER
// exists — instead of returning a path to a provably-non-existent module. The ODG_RUNTIME=js source-.js rollback is
// RETIRED under zero-JS, so preferDistBin's bare fall back to `sourceRel` (when dist is absent or ODG_RUNTIME=js) yielded
// a non-existent `runtime/core/*.js` path that crashed the caller with a misleading downstream error (e.g. a spawn
// MODULE_NOT_FOUND surfaced as "mission not delegable"). `exists`/`env` are injected for deterministic testing.
function resolveRequiredPort(
  distRel: string,
  sourceRel: string,
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const preferred = preferDistBin(distRel, sourceRel, exists, env);
  if (exists(preferred)) return preferred;
  const other = preferred === distRel ? sourceRel : distRel;
  if (exists(other)) return other;
  throw new Error(
    `ODG runtime port missing: neither the compiled dist port '${distRel}' nor a source port '${sourceRel}' exists. ` +
      "The ODG_RUNTIME=js source-.js rollback is RETIRED (zero-JS); run `npm run build:runtime` to compile runtime/dist " +
      "and leave ODG_RUNTIME unset. (fail-closed: refusing to load/spawn a non-existent module.)",
  );
}

module.exports = { preferDistBin, resolveRequiredPort };
export {};

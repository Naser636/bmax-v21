#!/usr/bin/env node
"use strict";
// L3 GOVERNED-REPAIR FIXTURE (tracked). Not production code — a dedicated controlled target for the native
// engineering loop. Committed in its REPAIRED state; the live L3 demonstration introduces a controlled defect,
// the LOCAL model repairs it through the governed write-set guard, an independent test verifies, then it is restored.
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
module.exports = { clamp };
export {};

#!/usr/bin/env node
"use strict";
// L4 CAMPAIGN FIXTURE (tracked, not production). Committed repaired; the live campaign introduces a controlled defect.
function fact(n: number): number {
  return n <= 1 ? 1 : n * fact(n - 1);
}
module.exports = { fact };
export {};

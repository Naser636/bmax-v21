#!/usr/bin/env node
"use strict";
// L4 CAMPAIGN FIXTURE (tracked, not production). Committed repaired; the live campaign introduces a controlled defect.
function max3(a: number, b: number, c: number): number {
  return a > b ? (a > c ? a : c) : (b > c ? b : c);
}
module.exports = { max3 };
export {};

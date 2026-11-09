#!/usr/bin/env node
"use strict";
const { clamp } = require("./clamp-fixture");
let f = 0;
function ok(c: any, l: string) { if (!c) { f++; process.stderr.write("FAIL: " + l + "\n"); } }
ok(clamp(5, 0, 10) === 5, "within range");
ok(clamp(-3, 0, 10) === 0, "below lo clamps to lo");
ok(clamp(99, 0, 10) === 10, "above hi clamps to hi");
if (f === 0) process.stdout.write("ALL PASS — L3 clamp fixture\n");
process.exit(f === 0 ? 0 : 1);
export {};

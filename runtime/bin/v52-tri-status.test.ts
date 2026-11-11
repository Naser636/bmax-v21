#!/usr/bin/env node
"use strict";
// V52 C3 — tri-status scorecard test: the three axes are present and NEVER conflated (technical success ≠ commercial
// value ≠ financial result); commercial clients stay 0; the financial objective is recorded with its infeasibility.
const fs = require("fs");
const path = require("path");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const f = path.join(__dirname, "..", "..", "docs", "odg", "V52_TRI_STATUS_SCORECARD.json");
check(fs.existsSync(f), "tri-status scorecard artifact exists");
const d = JSON.parse(fs.readFileSync(f, "utf8"));
check(d.technical && d.commercial && d.financial, "three separate axes present");
check(d.commercial.paying_clients === 0 && d.commercial.observed_conversion === 0 && d.commercial.references === 0, "commercial: 0 clients / 0 conversion / 0 references (not inferred from technical)");
check(/14/.test(String(d.technical.e4_demonstrated)) || d.technical.e4_demonstrated === 14, "technical: 14 E4 demonstrated");
check(/INFEASIBLE/i.test(d.financial.feasibility) && /NOT lowered/i.test(d.financial.feasibility), "financial: objective recorded + INFEASIBLE, target not lowered");
check(/NEVER/i.test(d.invariant), "invariant: axes never conflated");
// the key anti-overclaim: technical STRONG must NOT imply commercial or financial success
check(!/sale|revenue achieved|client won/i.test(d.technical.status), "technical status does not claim commercial/financial success");
if (failures === 0) process.stdout.write("ALL PASS — V52 tri-status scorecard (technical≠commercial≠financial)\n");
process.exit(failures === 0 ? 0 : 1);
export {};

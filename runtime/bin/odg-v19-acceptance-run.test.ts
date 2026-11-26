#!/usr/bin/env node
"use strict";
/* ACC-1 generic acceptance runner — offline (fake test-file runs, fake tsc). */
const A = require("./odg-v19-acceptance-run.ts");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const root = require("path").resolve(__dirname, "..", "..");
const contract = (bm: any) => ({ scenario: "X", beforeMetric: bm, WORK_ITEM_CONTRACT: { acceptance_tests: [{ id: "X/AC1", file: "f.test.ts" }, { id: "X/AC2", file: "f.test.ts" }] } });
const bmOk = [{ source: "runtime/core/odg-model-router.ts#runTestGatedCascade", value: "ABSENT" }];
const fake = (out: string, exit = 0, tsc = true) => { let n = 0; return { root, runFile: () => { n++; return { exit, out, calls: n }; }, runTsc: () => ({ ok: tsc, exit: tsc ? 0 : 2 }), get n() { return n; } }; };
const good = "ok - X/AC1: a\nok - X/AC2: b\n";
check("PASS ⇔ every AC id reported ok + file exit 0 + tsc + metric IMPROVED", A.runAcceptance(contract(bmOk), fake(good)).outcome === "PASS");
check("a missing AC id ⇒ FAIL", A.runAcceptance(contract(bmOk), fake("ok - X/AC1: a\nNOT OK - X/AC2: b\n")).outcome === "FAIL");
check("a non-zero file exit ⇒ FAIL even with ok lines", A.runAcceptance(contract(bmOk), fake(good, 1)).outcome === "FAIL");
check("tsc failure ⇒ FAIL", A.runAcceptance(contract(bmOk), fake(good, 0, false)).outcome === "FAIL");
check("metric not improved (symbol absent) ⇒ FAIL", A.runAcceptance(contract([{ source: "runtime/core/odg-model-router.ts#noSuchSymbolZ", value: "ABSENT" }]), fake(good)).outcome === "FAIL");
check("metric not recomputable ⇒ NOT_MEASURED (never PASS)", A.runAcceptance(contract([{ source: "docs/x.json", value: "ABSENT (prose)" }]), fake(good)).outcome === "NOT_MEASURED" && A.runAcceptance(contract([]), fake(good)).outcome === "NOT_MEASURED");
check("each test file runs once", (() => { const f = fake(good); A.runAcceptance(contract(bmOk), f); return f.n === 1; })());
check("refuses flag args (GO-DT-1 positional) and an undeclared OUT", A.main(["--x", "y"]) === 3 && A.main(["V178-P5", "docs/odg/evidence/OTHER.json"]) === 3);
process.stdout.write(failures ? `${failures} FAILED\n` : "ALL PASS — odg-v19-acceptance-run\n");
process.exit(failures ? 1 : 0);
export {};

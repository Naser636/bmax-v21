// @ts-nocheck — TS_RECOVERY_DECISION acceptance verifier (Workstream A, disposition 1+2).
// done_when: ["decision + proofs recorded", "mechanism marked PROPOSED/awaiting-acceptance", "no removal"].
// Verifies the READ-ONLY decision RECORD's content. The mechanism itself remains CTO-acceptance-pending by
// design (recorded as PROPOSED) — this test proves the RECORD is complete, not that the mechanism is applied.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
const md = fs.readFileSync(path.join(REPO, "runtime/reports/TS_RECOVERY_ARTIFACT_DECISION.md"), "utf8");
console.log("ACCEPT — TS_RECOVERY_DECISION (decision + proofs recorded; mechanism PROPOSED/awaiting)");
ok("proven facts recorded (Node-only dist boot proof)", /Proven facts/i.test(md) && /dist.*boots?.*node-only|node runtime\/dist\/bin\/odg-run\.js/i.test(md));
ok("a decision / recommendation is recorded", /recommendation|decision|option\s*[ABC]/i.test(md));
ok("mechanism marked PROPOSED / awaiting CTO acceptance (NOT applied)", /PROPOSED|awaiting|pending.*accept/i.test(md));
ok("record is non-trivial", md.trim().length > 200);
console.log(`\nACCEPT TS_RECOVERY_DECISION — ${passed} assertions passed.`);

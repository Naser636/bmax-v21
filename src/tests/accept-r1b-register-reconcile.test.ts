// @ts-nocheck — R1B_REGISTER_RECONCILE_DEF_GAMMA acceptance verifier (Workstream A, disposition 2).
// done_when: ["status_open RESOLVED w/ scope caveat + opt-in limitation; JSON valid"].
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
const P = path.join(REPO, "docs/odg-operational/ODG_OPERATIONAL_CAPABILITY_REGISTER.json");
console.log("ACCEPT — R1B_REGISTER_RECONCILE_DEF_GAMMA (DEF-GAMMA entry reconciled, JSON valid)");
const raw = fs.readFileSync(P, "utf8");
let reg;
ok("register JSON is valid (parses)", (() => { try { reg = JSON.parse(raw); return true; } catch { return false; } })());
const defects = Array.isArray(reg.crossCuttingDefects) ? reg.crossCuttingDefects : [];
const gamma = defects.find((d) => d && typeof d.id === "string" && /DEF-GAMMA/i.test(d.id));
ok("DEF-GAMMA defect entry present", !!gamma);
ok("status_open marks RESOLVED", gamma && typeof gamma.status_open === "string" && /RESOLVED/i.test(gamma.status_open));
ok("resolution records the opt-in requiresExecution limitation (scope caveat)", gamma && /requiresExecution|opt-in/i.test(JSON.stringify(gamma)));
ok("verdict is PROVEN/PROUVE (reconciled with the R1 result)", gamma && /prouve|proven/i.test(String(gamma.verdict || "")));
console.log(`\nACCEPT R1B_REGISTER_RECONCILE_DEF_GAMMA — ${passed} assertions passed.`);

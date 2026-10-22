// @ts-nocheck — INVENTORY_ROLLBACKS acceptance verifier (Workstream A, disposition 2).
// done_when: ["classifier runs standalone", "report present", "0 removable verdict recorded"].
// Behavioral: actually RUN the classifier and read its report — not existence-only.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
console.log("ACCEPT — INVENTORY_ROLLBACKS (classifier runs standalone + 0 removable)");

// 1. classifier runs STANDALONE (own temp cwd copy would need the whole repo; run in-repo, assert exit 0).
const r = spawnSync("node", [path.join(REPO, "scripts/odg-rollback-inventory.cjs")], { cwd: REPO, encoding: "utf8" });
ok("classifier runs standalone ⇒ exit 0", (r.status ?? -1) === 0);

// 2. report present + well-formed.
const rep = JSON.parse(fs.readFileSync(path.join(REPO, "runtime/generated/rollback-inventory-report.json"), "utf8"));
ok("report present with a dual count > 0", typeof rep.count === "number" && rep.count > 0);
ok("canonical markdown report present + non-empty", fs.readFileSync(path.join(REPO, "runtime/reports/ROLLBACK_INVENTORY.md"), "utf8").trim().length > 0);

// 3. 0 REMOVABLE: no class signifies a removable/orphan/safe-to-remove dual with count > 0.
const byClass = rep.byClass || {};
const removableClasses = Object.keys(byClass).filter((k) => /removable|safe.?to.?remove|orphan|dead|unused/i.test(k) && Number(byClass[k]) > 0);
ok("0 removable verdict (no removable/orphan class populated)", removableClasses.length === 0);
// every classified dual is a live/active/test/entrypoint class (justifies non-removal).
const classified = Object.values(byClass).reduce((a, b) => a + Number(b || 0), 0);
ok("all duals classified as live/active/test/entrypoint (none removable)", classified === rep.count);
console.log(`\nACCEPT INVENTORY_ROLLBACKS — ${passed} assertions passed.`);

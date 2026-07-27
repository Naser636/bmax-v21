#!/usr/bin/env node

/* P10 — Autonomous Capability Factory: behavioural test. Runs in a throwaway cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./capability-factory", "./autonomy-store"]) delete require.cache[require.resolve(m)];
        fn(require("./capability-factory"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log("Case 1 — manufacture a real, loadable, contract-compliant capability");
inTempCwd((factory) => {
    const d = factory.create("Invoice Reconciler", { goal: "reconcile invoices" });
    ok("reports registered + contractOk", d.registered === true && d.contractOk === true);
    ok("module file exists on disk", fs.existsSync(d.file));
    const mod = require(path.resolve(d.file));
    ok("generated module honours the contract", typeof mod.run === "function" && mod.describe().name === "Invoice Reconciler");
    ok("run() executes deterministically", mod.run({ x: 1 }).handled === true);
    ok("registered in the catalog", factory.exists("Invoice Reconciler") === true);
});

console.log("Case 2 — idempotent: same name ⇒ one catalog entry");
inTempCwd((factory) => {
    factory.create("Thing One");
    factory.create("Thing One");
    ok("no duplicate catalog entry", factory.list().length === 1);
    ok("create requires a name", (() => { try { factory.create(""); return false; } catch { return true; } })());
});

console.log(`\nCAPABILITY FACTORY — ${passed} assertions passed.`);

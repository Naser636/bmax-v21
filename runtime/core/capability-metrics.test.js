#!/usr/bin/env node

/* P7 — Capability Metrics Engine: behavioural test. Runs in a throwaway cwd. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function inTempCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-test-"));
    process.chdir(dir);
    try {
        for (const m of ["./capability-metrics", "./capability-learning", "./patch-memory", "./autonomy-store", "./decision-rules"]) {
            delete require.cache[require.resolve(m)];
        }
        fn(require("./capability-metrics"), require("./capability-learning"));
    } finally {
        process.chdir(prev);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log("Case 1 — success rate from direct records");
inTempCwd((metrics) => {
    metrics.record("local-fixers", true);
    metrics.record("local-fixers", true);
    metrics.record("local-fixers", false);
    ok("uses counted", metrics.stats()["local-fixers"].uses === 3);
    ok("success rate 2/3", Math.abs(metrics.successRate("local-fixers") - 2 / 3) < 1e-9);
    ok("unseen capability rate 0", metrics.successRate("nope") === 0);
});

console.log("Case 2 — best() picks the highest local success rate (drives DON'T ASK AI FIRST)");
inTempCwd((metrics) => {
    metrics.record("local-fixers", true);
    metrics.record("local-fixers", true);   // 100%
    metrics.record("local-llm", true);
    metrics.record("local-llm", false);      // 50%
    ok("best of the two is local-fixers", metrics.best(["local-fixers", "local-llm"]) === "local-fixers");
    ok("empty candidates ⇒ null", metrics.best([]) === null);
});

console.log("Case 3 — metrics aggregate P6 learning outcomes too");
inTempCwd((metrics, learning) => {
    learning.learn({ mission: "M1", validated: true,
        objectives: [{ objectiveId: "O1", goal: "remove unused import", edits: [{ target: "runtime/x.js", content: "y" }] }] });
    ok("learned outcome shows up in metrics", metrics.stats()["local-fixers"].uses === 1);
});

console.log(`\nCAPABILITY METRICS — ${passed} assertions passed.`);

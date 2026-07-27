#!/usr/bin/env node

/*
 * P3 — Local Test Gate.
 *
 * Runs the repo's own tests locally and returns a pass/fail verdict, so a mission can prove itself
 * WITHOUT any AI-assisted validation. This is the "Tests locaux" tier of the permanent architecture
 * and a drop-in evidence probe for the Validation Engine (same {ok, detail} contract as its existing
 * build-green / typescript-green probes).
 *
 * Reuses the repo convention: a test file is a plain Node script that exits non-zero on failure
 * (see checkpoint-engine.test.js, build-recovery-engine.test.js). No new test framework is added.
 */

"use strict";

const { spawnSync } = require("child_process");

// Run each test file in its own `node` process. ok === every file exited 0.
function runTests(files) {
    const list = Array.isArray(files) ? files : [files];
    const results = list.map((f) => {
        const r = spawnSync(process.execPath, [f], { encoding: "utf8" });
        return { file: f, code: r.status, ok: r.status === 0, error: r.status === 0 ? null : (r.stderr || "").trim().split("\n").pop() };
    });
    const failed = results.filter((r) => !r.ok);
    return { ok: failed.length === 0, total: results.length, failed: failed.length, results };
}

// Validation-Engine-style probe. Returns { ok, detail }.
function gate(files) {
    const r = runTests(files);
    return {
        ok: r.ok,
        detail: r.ok ? `${r.total} local test file(s) green` : `${r.failed}/${r.total} local test file(s) failed`,
    };
}

module.exports = { runTests, gate };

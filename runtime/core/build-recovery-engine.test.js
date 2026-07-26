#!/usr/bin/env node

/*
 * Build Recovery Engine — self-contained behavioural test (BUILD_GATE_AUTONOMY).
 *
 * Each case builds a throwaway TypeScript project in a temp dir, points the engine at it, and
 * asserts the CONTRACT — not the implementation:
 *   1. green-recovery   — an authorized, in-scope error is fixed; loop converges; Provider NOT
 *                         authorized.
 *   2. provider-escalation — an error with no authorized fixer yields no improvement; the tree is
 *                         left untouched (rollback) and the Provider IS authorized.
 *   3. scope-guard      — a fixable error OUTSIDE the mission's authorized paths is left alone and
 *                         escalates (fixers never wander outside scope).
 *
 * Uses runBuild:false so no case needs a real `next build`; the TypeScript gate is the loop signal.
 * Deterministic: no wall-clock in any assertion.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const bre = require("./build-recovery-engine");

let passed = 0;
function ok(name, cond) {
    assert.ok(cond, name);
    console.log("  ok -", name);
    passed += 1;
}

const TSCONFIG = JSON.stringify({
    compilerOptions: {
        noEmit: true,
        strict: true,
        noUnusedLocals: true,
        module: "commonjs",
        target: "es2019",
        skipLibCheck: true,
    },
    include: ["src"],
});

function makeProject(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bre-test-"));
    fs.writeFileSync(path.join(dir, "tsconfig.json"), TSCONFIG);
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return dir;
}

// The repo's tsc, driven against the temp project's tsconfig. The temp dir lives outside the repo,
// so `npx tsc` (the production default) can't resolve there — we invoke the real compiler directly.
const REPO_TSC = path.resolve(__dirname, "..", "..", "node_modules", "typescript", "bin", "tsc");

function run(dir, authorizedPaths) {
    return bre.recover({
        cwd: dir,
        authorizedPaths,
        runBuild: false,
        mission: "BUILD_GATE_AUTONOMY_TEST",
        typecheckCommand: [process.execPath, REPO_TSC, "--noEmit", "--pretty", "false", "-p", path.join(dir, "tsconfig.json")],
    });
}

// --- Case 1: green recovery -------------------------------------------------
(function greenRecovery() {
    console.log("Case 1 — green recovery (authorized fix, loop converges)");
    const dir = makeProject({
        "src/dep.ts": "export const used = 1;\nexport const spare = 2;\n",
        // `spare` is imported but never used → TS6133 (authorized: removeUnusedImport).
        "src/a.ts": [
            'import { used, spare } from "./dep";',
            "export const v = used;",
            "",
        ].join("\n"),
    });
    const r = run(dir, ["src"]);
    ok("typescript gate is green", r.typescript === true);
    ok("build gate green (runBuild:false ⇒ derives from tsc)", r.build === true);
    ok("improvement was demonstrated", r.improved === true);
    ok("at least one iteration ran", r.iterations >= 1);
    ok("Provider NOT authorized on success", r.providerAuthorized === false);
    ok("the file was recorded as modified", r.modifiedFiles.includes("src/a.ts"));
    ok("root cause classified as unused-import", r.rootCauses.includes("unused-import"));
    const after = fs.readFileSync(path.join(dir, "src/a.ts"), "utf8");
    ok("unused specifier removed from source", !/spare/.test(after));
    ok("used specifier preserved", /used/.test(after));
    fs.rmSync(dir, { recursive: true, force: true });
})();

// --- Case 2: provider escalation -------------------------------------------
(function providerEscalation() {
    console.log("Case 2 — provider escalation (no authorized fixer ⇒ no improvement)");
    const dir = makeProject({
        // TS2322 (type mismatch) has no authorized local fixer.
        "src/b.ts": "export const n: number = \"not a number\";\n",
    });
    const before = fs.readFileSync(path.join(dir, "src/b.ts"), "utf8");
    const r = run(dir, ["src"]);
    ok("typescript gate stays red", r.typescript === false);
    ok("build gate stays red", r.build === false);
    ok("no improvement demonstrated", r.improved === false);
    ok("Provider IS authorized", r.providerAuthorized === true);
    ok("no files modified", r.modifiedFiles.length === 0);
    const after = fs.readFileSync(path.join(dir, "src/b.ts"), "utf8");
    ok("source left byte-for-byte unchanged (rollback)", after === before);
    fs.rmSync(dir, { recursive: true, force: true });
})();

// --- Case 3: scope guard ----------------------------------------------------
(function scopeGuard() {
    console.log("Case 3 — scope guard (fixable error OUTSIDE authorized paths is not touched)");
    const dir = makeProject({
        "src/in/ok.ts": "export const y = 1;\n",
        "src/out/dep.ts": "export const used = 1;\nexport const spare = 2;\n",
        // Same fixable TS6133 as case 1, but we authorize only src/in — src/out is out of scope.
        "src/out/c.ts": [
            'import { used, spare } from "./dep";',
            "export const v = used;",
            "",
        ].join("\n"),
    });
    const before = fs.readFileSync(path.join(dir, "src/out/c.ts"), "utf8");
    const r = run(dir, ["src/in"]);
    ok("gate stays red (out-of-scope error unfixed)", r.typescript === false);
    ok("Provider authorized (nothing in scope to fix)", r.providerAuthorized === true);
    ok("out-of-scope file untouched", fs.readFileSync(path.join(dir, "src/out/c.ts"), "utf8") === before);
    fs.rmSync(dir, { recursive: true, force: true });
})();

console.log(`\nBUILD RECOVERY ENGINE — ${passed} assertions passed.`);

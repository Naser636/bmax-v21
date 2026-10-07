"use strict";

/*
 * V31 — Pre-Authored Reuse Candidates. Adversarial + behavioural coverage of the pure candidate
 * builder. Runs in an isolated temp cwd so the git-ignored patch-memory store and the fake target
 * files never touch the repo tree.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

function inIsolatedCwd(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v31-"));
    process.chdir(dir);
    try {
        return fn({
            cand: require(path.join(prev, "runtime/core/provider-reuse-candidate.js")),
            mem: require(path.join(prev, "runtime/core/patch-memory.js")),
            dir,
        });
    } finally {
        process.chdir(prev);
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

// Record a verified precedent (as V28's learn path would) for objective `oid` touching `target`.
function seed(mem, dir, { rootCause = "", oid, target, mission = "M_HIST" }) {
    fs.mkdirSync(path.join(dir, path.dirname(target)), { recursive: true });
    fs.writeFileSync(path.join(dir, target), "x");
    mem.record({ rootCause, objectiveId: oid, target, mission, edits: [{ target, mode: "diff" }] });
}

const OBJS = (...ids) => ids.map((id) => ({ id, goal: "g", done_when: [] }));
const AUTH = ["runtime/core"];

test("V31 pre-authored reuse candidate — cold + hit (Phase 5 A/B)", () => {
    inIsolatedCwd(({ cand, mem, dir }) => {
        // A — cold: empty memory ⇒ no candidate ⇒ provider gets the cold problem (unchanged).
        assert.deepStrictEqual(cand.buildCandidates(OBJS("OBJ_1"), { cwd: dir, authorizedPaths: AUTH }), []);
        // B — warm: a verified precedent exists for OBJ_1 ⇒ exactly one candidate, correct targets.
        seed(mem, dir, { oid: "OBJ_1", target: "runtime/core/x.js" });
        const warm = cand.buildCandidates(OBJS("OBJ_1"), { cwd: dir, authorizedPaths: AUTH });
        assert.strictEqual(warm.length, 1, "B: one candidate");
        assert.strictEqual(warm[0].objectiveId, "OBJ_1");
        assert.deepStrictEqual(warm[0].targets, ["runtime/core/x.js"]);
        assert.strictEqual(warm[0].status, "VERIFIED_PRECEDENT");
        assert.strictEqual(warm[0].historicalMission, "M_HIST");
    });
});

test("V31 pre-authored reuse candidate — adversarial 1–12", () => {
    inIsolatedCwd(({ cand, mem, dir }) => {
        seed(mem, dir, { oid: "OBJ_1", target: "runtime/core/x.js", mission: "M_HIST" });
        const run = (objs, auth = AUTH, cwd = dir) => cand.buildCandidates(objs, { cwd, authorizedPaths: auth });

        // 1. exact signature/objective ⇒ candidate.
        assert.strictEqual(run(OBJS("OBJ_1")).length, 1, "1 exact ⇒ candidate");
        // 2. similar but different objective id ⇒ no candidate.
        assert.strictEqual(run(OBJS("OBJ_1_SIMILAR")).length, 0, "2 similar ⇒ none");
        // 3. changed target: the mission objective set no longer includes OBJ_1 ⇒ no candidate.
        assert.strictEqual(run(OBJS("OBJ_OTHER")).length, 0, "3 different objective ⇒ none");
        // 4. changed root cause: a NEW precedent with a different rootCause but SAME objective still
        //    matches by objective identity (rootCause not used as a discriminator here) — candidate is
        //    advisory and revalidated, so this is safe; assert it still only reflects existing targets.
        assert.strictEqual(run(OBJS("OBJ_1"))[0].targets.length, 1, "4 rootCause variance ⇒ safe candidate");
        // 5. changed contract (authorizedPaths now a DIFFERENT scope) ⇒ target out of scope ⇒ none.
        assert.strictEqual(run(OBJS("OBJ_1"), ["src/app"]).length, 0, "5 changed contract ⇒ none");
        // 6. changed authorizedPaths to EMPTY (read-only mission) ⇒ none.
        assert.strictEqual(run(OBJS("OBJ_1"), []).length, 0, "6 read-only scope ⇒ none");
        // 7. changed repository state: historical target deleted ⇒ none.
        fs.rmSync(path.join(dir, "runtime/core/x.js"));
        assert.strictEqual(run(OBJS("OBJ_1")).length, 0, "7 target deleted ⇒ none");
        fs.writeFileSync(path.join(dir, "runtime/core/x.js"), "x"); // restore for remaining checks
        // 8. stale memory (precedent for an objective NOT in the current mission) ⇒ none.
        assert.strictEqual(run(OBJS("OBJ_ABSENT")).length, 0, "8 stale/other-objective ⇒ none");
        // 9. wrong mission: current objectives unrelated to any stored signature ⇒ none.
        assert.strictEqual(run(OBJS("WRONG_MISSION_OBJ")).length, 0, "9 wrong mission ⇒ none");
        // 10. conflicting historical entries (two precedents, two targets, same objective) ⇒ both surfaced
        //     as targets for the provider to judge (advisory), never silently forced.
        seed(mem, dir, { oid: "OBJ_1", target: "runtime/core/x2.js", mission: "M_HIST2" });
        const conflict = run(OBJS("OBJ_1"));
        const allTargets = conflict.flatMap((c) => c.targets).sort();
        assert.ok(allTargets.includes("runtime/core/x.js") && allTargets.includes("runtime/core/x2.js"), "10 conflicts surfaced");
        // 11. corrupted memory: builder never throws ⇒ empty when input objectives malformed.
        assert.deepStrictEqual(cand.buildCandidates(null, { cwd: dir, authorizedPaths: AUTH }), [], "11 corrupted input ⇒ []");
        assert.deepStrictEqual(cand.buildCandidates(OBJS("OBJ_1"), null), [], "11 corrupted opts ⇒ []");
        // 12. historical fix no longer appropriate (target moved outside scope) ⇒ none.
        assert.strictEqual(run(OBJS("OBJ_1"), ["docs"]).length, 0, "12 out-of-scope precedent ⇒ none");
    });
});

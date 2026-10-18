#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * odg-objective DUAL-PORT PARITY (CTO Wave 3) — JS rollback (runtime/bin/odg-objective.js) vs compiled-TS
 * default (runtime/dist/bin/odg-objective.js). The semantic NL mission entrypoint.
 *
 * The dist-depth hazard was `ROOT = path.resolve(__dirname,"..","..")` (→ <repo>/runtime from dist/bin);
 * both ports now anchor ROOT = process.cwd() (the wrapper cwd = repo root), so MISSIONS_DIR / GENERATED_DIR
 * and the pipeline spawn cwd resolve identically from any port depth. The sibling core requires stay
 * __dirname-relative (CORRECT: dist/bin → dist/core — all three deps are dual-ported).
 *
 * The ONLY heavy/mutating step is route() → spawns `tsx src/runtime/mission-cli.ts` (the full governed
 * pipeline) and writes contracts/evidence. Every such effect is io-INJECTABLE (spawnSync / writeFileSync /
 * mkdirSync / existsSync), so parity is proven WITHOUT running the pipeline or writing real state:
 *   - the pure verdict/identity/grant logic (boundedMissionId, toBoundedContract, contractHasEvidenceBinding,
 *     classifyOutcome, normalizeGrants, parseAuthorize) compared directly on fixtures — that IS the honest-
 *     verdict + bounded-identity decision logic;
 *   - route() + materializeContract() driven through injected io (fake spawn / capture writes) — same
 *     forwarded exit + same materialization result + same captured bytes, no real pipeline, no real write;
 *   - a LIVE dry-run subprocess (`odg-objective "<obj>"`, which executes nothing / writes nothing / calls no
 *     provider) — identical exit + identical stdout, proving the gateway + core-module resolution from dist.
 */
const assert = require("assert");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const JS = path.join(REPO, "runtime", "bin", "odg-objective.js");
const TS = path.join(REPO, "runtime", "dist", "bin", "odg-objective.js");
const js = require(JS), ts = require(TS);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- API ----
ok("objective: identical export API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));

// ---- boundedMissionId: deterministic NL_<MODE>_<sha8> from governed intent (never the raw sentence) ----
{
  const fixtures = [
    { intent: { mode: "ENGINEERING" }, normalizedObjective: "convert csv to json" },
    { intent: { mode: "ANALYSIS" }, normalizedObjective: "audit the runtime state" },
    { normalizedObjective: "" }, // UNKNOWN mode, empty
  ];
  for (const f of fixtures) ok(`boundedMissionId parity — ${f.normalizedObjective || "(empty)"}`, js.boundedMissionId(f) === ts.boundedMissionId(f) && /^NL_[A-Z]+_[0-9A-F]{8}$/.test(js.boundedMissionId(f)));
}

// ---- toBoundedContract: re-key onto bounded id, preserve governed shape ----
{
  const result = { contract: { mission: "RAW_SENTENCE_ID", objectives: [{ id: "x", goal: "g1", done_when: ["d"] }, { id: "y", goal: "g2" }], authorized_paths: ["runtime/x.ts"], verify: [{ evidence: "p" }] }, normalizedObjective: "obj text" };
  const jb = js.toBoundedContract(result, "NL_X_AABBCCDD"), tb = ts.toBoundedContract(result, "NL_X_AABBCCDD");
  ok("toBoundedContract parity", eq(jb, tb));
  ok("toBoundedContract non-vacuous (id re-based, synthesizedFrom kept, goals verbatim)",
    jb.mission === "NL_X_AABBCCDD" && jb.objectives[0].id === "NL_X_AABBCCDD_1" && jb.synthesizedFrom === "RAW_SENTENCE_ID" && jb.objectives[0].goal === "g1");
}

// ---- contractHasEvidenceBinding: the SUCCESS guard (self-named-scope discount) ----
{
  const cases = [
    [{ authorized_paths: ["runtime/core/x.ts"] }, undefined],
    [{ authorized_paths: ["runtime/foo.ts"] }, ["runtime/foo.ts"]],          // all self-named ⇒ falls through ⇒ false
    [{ authorized_paths: ["runtime/foo.ts", "governed/grant.ts"] }, ["runtime/foo.ts"]], // one governed ⇒ true
    [{ verify: [{ evidence: "probe-cmd" }] }, undefined],
    [{ objectives: [{ proof: "probe" }] }, undefined],
    [{}, undefined],
    [null, undefined],
  ];
  for (const [c, sdp] of cases) ok(`contractHasEvidenceBinding parity — ${JSON.stringify(c)}`, js.contractHasEvidenceBinding(c, sdp) === ts.contractHasEvidenceBinding(c, sdp));
  ok("contractHasEvidenceBinding non-vacuous (governed binds true, pure self-named binds false)",
    js.contractHasEvidenceBinding({ authorized_paths: ["a", "b"] }, ["a"]) === true &&
    js.contractHasEvidenceBinding({ authorized_paths: ["a"] }, ["a"]) === false);
}

// ---- classifyOutcome: honest verdict from real pipeline exit + evidence binding ----
{
  const bound = { contract: { authorized_paths: ["runtime/x.ts"] } };
  const unbound = { contract: {} };
  const cases = [
    [bound, 0, [], "SUCCESS", 0],
    [bound, 20, [], "VALIDATED_PENDING_COMMIT", 10],
    [bound, 1, [], "BLOCKED", 3],
    [unbound, 0, [], "PARTIAL", 3],
    [unbound, 7, [], "BLOCKED", 3],
  ];
  for (const [d, ex, sdp, verdict, code] of cases) {
    const jo = js.classifyOutcome(d, ex, sdp), to = ts.classifyOutcome(d, ex, sdp);
    ok(`classifyOutcome parity — exit=${ex} ${JSON.stringify(d.contract)}`, eq(jo, to) && jo.verdict === verdict && jo.code === code);
  }
}

// ---- normalizeGrants + parseAuthorize: the out-of-band human-grant channel ----
{
  ok("normalizeGrants parity (single/array/null/non-object)",
    eq(js.normalizeGrants({ capability: "c" }), ts.normalizeGrants({ capability: "c" })) &&
    eq(js.normalizeGrants([{ a: 1 }, 5, null, { b: 2 }]), ts.normalizeGrants([{ a: 1 }, 5, null, { b: 2 }])) &&
    eq(js.normalizeGrants(null), ts.normalizeGrants(null)));
  const argFixtures = [
    ["--authorize", '{"capability":"git","mission":"M"}'],
    ["--authorize", '[{"capability":"a"},{"capability":"b"}]'],
    ["some", "objective", "words", "--authorize", "{ not json ]", "--execute"],
    ["no", "grant", "here"],
  ];
  for (const a of argFixtures) {
    const ja = js.parseAuthorize(a), ta = ts.parseAuthorize(a);
    ok(`parseAuthorize parity — ${a.join(" ")}`, eq(ja.authorize, ta.authorize) && eq([...ja.consumed].sort(), [...ta.consumed].sort()));
  }
  ok("parseAuthorize non-vacuous (malformed skipped but its indexes consumed so it never leaks into the sentence)",
    js.parseAuthorize(["x", "--authorize", "{bad", "y"]).authorize === null && [...js.parseAuthorize(["x", "--authorize", "{bad", "y"]).consumed].includes(1) && [...js.parseAuthorize(["x", "--authorize", "{bad", "y"]).consumed].includes(2));
}

// ---- route(): forwards the pipeline exit via INJECTED spawnSync (no real pipeline) ----
{
  for (const status of [0, 7, 20, null]) {
    const io = { spawnSync: () => ({ status }) };
    ok(`route parity — injected spawn status=${status}`, js.route("M", io) === ts.route("M", io) && js.route("M", io) === (typeof status === "number" ? status : 1));
  }
}

// ---- materializeContract(): via INJECTED io (no real write) — same result + same captured bytes ----
{
  function drive(mod, exists, force) {
    let written = null;
    const io = { existsSync: () => exists, mkdirSync: () => {}, writeFileSync: (_f, data) => { written = data; } };
    const res = mod.materializeContract({ mission: "NL_X_AABBCCDD", contract: { mission: "NL_X_AABBCCDD", k: 1 } }, io, force);
    return { res, written };
  }
  for (const [exists, force] of [[false, false], [true, false], [true, true]]) {
    const j = drive(js, exists, force), t = drive(ts, exists, force);
    ok(`materializeContract parity — exists=${exists} force=${force}`, eq(j.res, t.res) && j.written === t.written);
  }
  // non-vacuous: fresh write emits the contract JSON; reuse writes nothing; grant-rotation re-writes.
  ok("materializeContract non-vacuous (fresh=write+!reused, exists+!force=reused+nowrite, exists+force=rewritten)",
    drive(js, false, false).res.reused === false && /"k": 1/.test(drive(js, false, false).written) &&
    drive(js, true, false).res.reused === true && drive(js, true, false).written === null &&
    drive(js, true, true).res.rewritten === true);
}

// ---- LIVE dry-run subprocess: executes nothing, writes nothing, calls no provider — identical ----
{
  const run = (script, obj) => cp.spawnSync(process.execPath, [script, obj], { cwd: REPO, encoding: "utf8", timeout: 60000 });
  const norm = (s) => String(s || "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>");
  for (const obj of ["audit the runtime state and report findings", "convert the CSV files in data/ to JSON"]) {
    const rj = run(JS, obj), rt = run(TS, obj);
    ok(`dry-run parity — "${obj.slice(0, 32)}…": same exit + identical stdout (read-only, deterministic)`, rj.status === rt.status && norm(rj.stdout) === norm(rt.stdout));
  }
}

console.log(`\nodg-objective dual-port parity — ${passed} assertions passed.`);

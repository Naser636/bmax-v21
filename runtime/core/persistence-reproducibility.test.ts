// @ts-nocheck — CTO V8 persistence/reproducibility regression. ISOLATED: mkdtemp sandboxes only; NEVER writes
// to the user worktree, the real ledger, or real contracts. Cleans only its own temp dirs.
/*
 * Locks the reproducibility invariants the V6/V7 incident closures depend on:
 *   (a) a NORMAL roadmap-driven regeneration (factory.generateMissing over the REAL ROADMAP) does NOT resurrect
 *       BUILD_RUNTIME (a dev/CI build id, not a roadmap mission) as an executable mission;
 *   (b) the factory never emits a stale `.test.js` presentStateAcceptance probe path (it emits no probe);
 *   (c) the durable proof mechanisms are committed/versioned + fail-closed (NOT_PROVEN ⇒ never resolved).
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const factory = require("./mission-contract-factory");
const sd = require("./self-diagnostic");

console.log("PERSISTENCE & REPRODUCIBILITY GUARD (V8)");

// (a) Normal roadmap regen in an ISOLATED sandbox (copy of the REAL roadmap) ⇒ BUILD_RUNTIME not generated.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repro-regen-"));
  try {
    fs.mkdirSync(path.join(dir, "runtime", "governance"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
    // copy the REAL roadmap (read-only source) into the sandbox
    fs.copyFileSync(path.join(REPO, "runtime", "governance", "ROADMAP.json"), path.join(dir, "runtime", "governance", "ROADMAP.json"));
    const report = factory.generateMissing(dir, { write: true });
    const generated = (report.generated || []).map((g) => g.mission);
    ok("normal roadmap regen does NOT generate BUILD_RUNTIME (dev/CI id, not a roadmap mission)", !generated.includes("BUILD_RUNTIME") && !fs.existsSync(path.join(dir, "runtime", "missions", "BUILD_RUNTIME.json")));
    // none of the V6/V7 closed/obsoleted non-roadmap missions are resurrected by normal regen
    for (const m of ["BUILD_RUNTIME", "M_ML", "M", "__none__", "NL_IMPLEMENT_E4DDB6BA"]) {
      ok(`normal regen does not resurrect ${m}`, !generated.includes(m) && !fs.existsSync(path.join(dir, "runtime", "missions", `${m}.json`)));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// (b) The factory never emits a stale `.test.js` presentStateAcceptance probe path (it emits no probe at all).
{
  const samples = [
    factory.buildContract({ id: "BUILD_RUNTIME", title: factory.humanizeId("BUILD_RUNTIME") }),
    factory.buildContract({ id: "SOME_ENG_MISSION", title: "Some Eng Mission", requiresEngineering: true }),
    factory.buildContract({ id: "SOME_AUDIT", title: "Some audit", mode: "AUDIT" }),
  ];
  for (const c of samples) {
    const s = JSON.stringify(c);
    ok(`factory contract (${c.mission}) emits no '.test.js' probe path`, !/\.test\.js/.test(s));
    ok(`factory contract (${c.mission}) emits no presentStateAcceptance (probes are hand-authored, not generated)`, !("presentStateAcceptance" in c));
  }
}

// (c) Durable proof mechanisms are present (committed/versioned) and fail-closed.
{
  ok("self-diagnostic exports resolveByReconciliation + resolveObsoleteIncidents (durable, committed)", typeof sd.resolveByReconciliation === "function" && typeof sd.resolveObsoleteIncidents === "function");
  // validation-engine cross-mission guard is present in the committed source (af3f698).
  const ve = fs.readFileSync(path.join(REPO, "runtime", "dist", "core", "validation-engine.js"), "utf8");
  ok("validation-engine cross-mission ownership guard present (af3f698)", /crossMission/.test(ve) && /crossMissionOk/.test(ve));
  // FAIL-CLOSED: resolveByReconciliation with an injected NOT_PROVEN reconciler resolves nothing (isolated temp cwd).
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repro-failclosed-"));
  process.chdir(dir);
  try {
    delete require.cache[require.resolve("./self-diagnostic")];
    delete require.cache[require.resolve("./autonomy-store")];
    const sdIso = require("./self-diagnostic");
    const store = require("./autonomy-store");
    fs.mkdirSync("runtime/generated/autonomy", { recursive: true });
    const l = store.read("self-diagnostic-incidents", { incidents: {} });
    l.incidents["INC-X"] = { id: "INC-X", mission: "ANY", status: "OPEN", attempts: 1, maxAttempts: 3, divergences: [{ category: "x", firstDifferenceAt: "y" }] };
    store.write("self-diagnostic-incidents", l);
    const ids = sdIso.resolveByReconciliation({ now: "T", reconciler: { reconcile: () => ({ proven: false, verdict: "NOT_PROVEN" }) } });
    ok("fail-closed: NOT_PROVEN reconciler resolves ZERO incidents", ids.length === 0 && store.read("self-diagnostic-incidents", {}).incidents["INC-X"].status === "OPEN");
  } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\nPERSISTENCE & REPRODUCIBILITY GUARD — ${passed} assertions passed.`);

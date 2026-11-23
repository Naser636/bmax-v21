#!/usr/bin/env node
// @ts-nocheck — runs under tsx. OFFLINE (no model, no network): injected deterministic generators stand in for the two
// local providers; the parts still execute ONLY inside the real odg-native-build-sandbox (bwrap). Supervisor uses the
// TEST-ONLY heartbeatOnly mode in a tmp dir.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const F = require("./odg-v161-scenario-f-run.ts");
const NBS = require("../core/odg-native-build-sandbox.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const GOOD = {
  "src/parse-line.js": "module.exports = function parseLine(line) { const [s, q, p] = String(line).split(',').map((x) => x.trim()); return { sku: s, qty: parseInt(q, 10), unitCents: Math.round(parseFloat(p) * 100) }; };",
  "src/invoice-total.js": "module.exports = function invoiceTotal(items) { return { count: items.length, totalCents: items.reduce((a, i) => a + i.qty * i.unitCents, 0) }; };",
  "src/format-cents.js": "module.exports = function formatCents(c) { const e = Math.floor(c / 100), r = c % 100; return e + '.' + (r < 10 ? '0' + r : String(r)); };",
};
// incompatible part A: returns euros (price) — passes a contract that asks for price, violates the shared interface
const BAD_A = "module.exports = function parseLine(line) { const [s, q, p] = String(line).split(',').map((x) => x.trim()); return { sku: s, qty: parseInt(q, 10), price: parseFloat(p) }; };";
// natural-style defect: truncation instead of rounding (passes own cases 3.50/4, fails 0.29 / 19.99 in the interface)
const TRUNC_A = GOOD["src/parse-line.js"].replace("Math.round(parseFloat(p) * 100)", "Math.floor(parseFloat(p) * 100)");

function provider(model, script, calls) {
  return async (fileSpec) => { calls.push({ model, path: fileSpec.path, repair: !!fileSpec.verifyError }); const c = script(fileSpec); return c ? { ok: true, content: c, provenance: { model, evalCount: 1 } } : { ok: false, reason: "scripted failure" }; };
}
function supCtx() { const d = fs.mkdtempSync(path.join(os.tmpdir(), "odg-v161-f-test-")); return { heartbeatDir: path.join(d, "hb"), locksDir: path.join(d, "locks"), heartbeatOnly: true }; }

(async () => {
  const probe = NBS.probeSandbox();
  ok("bwrap native-build sandbox available for the offline tests: " + String(probe.reason), probe.ok === true);

  // (1) compatible pair ⇒ accepted first pass; two different providers assigned; supervisor heartbeats with write-sets
  {
    const calls = [];
    const providers = { "qwen2.5-coder:3b": provider("3b", (f) => GOOD[f.path], calls), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], calls) };
    const r = await F.runScenarioF({ providers, natural: 1, controlled: false, supervisorCtx: supCtx(), supervisorMode: "TEST_HEARTBEAT_ONLY", supervisorCloseDelayMs: 0 });
    const t = r.trials[0];
    ok("planner DECOMPOSED the 4-file project", t.decomposition.strategy === "DECOMPOSED");
    ok("part write-sets are disjoint (layer parallel-safe)", t.decomposition.contention.layer0ParallelSafe === true);
    const models = new Set(t.assignments.map((a) => a.model));
    ok("two different providers assigned (3b + 7b)", models.has("qwen2.5-coder:3b") && models.has("qwen2.5-coder:7b"));
    ok("part B routed to 7b, A/C to 3b", t.assignments.find((a) => a.part === "B").model === "qwen2.5-coder:7b" && t.assignments.find((a) => a.part === "A").model === "qwen2.5-coder:3b");
    ok("supervisor ASSIGNED every part with its write-set", t.assignments.every((a) => a.supervisor.outcome === "ASSIGNED" && a.supervisor.writeSet && a.supervisor.writeSet.length === 1));
    ok("every part executed in the SANDBOX", Object.values(t.receipt).every((x) => x.executionMode === "SANDBOX" && x.executionStatus === "EXECUTED"));
    ok("compatible ⇒ COMPATIBLE, ACCEPTED_FIRST_PASS, held-out passes", t.initialDetection.classification === "COMPATIBLE" && t.verdict === "ACCEPTED_FIRST_PASS" && t.heldOut.pass === true && t.accepted === true);
    ok("generation provenance recorded per part", t.generations.length === 3 && t.generations.every((g) => g.sha256 && g.model));
  }

  // (2) incompatible pair (controlled perturbation) ⇒ detected + only the offending part regenerated + accepted after repair
  {
    const calls = [];
    const a = (f) => (f.verifyError && /SHARED INTERFACE/.test(f.verifyError) ? GOOD[f.path] : (/price: <parseFloat/.test(f.contract) ? BAD_A : GOOD[f.path]));
    const providers = { "qwen2.5-coder:3b": provider("3b", (f) => f.path === "src/parse-line.js" ? a(f) : GOOD[f.path], calls), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], calls) };
    const r = await F.runScenarioF({ providers, natural: 0, controlled: true, supervisorCtx: supCtx(), supervisorCloseDelayMs: 0 });
    const t = r.trials[0];
    ok("controlled trial labelled CONTROLLED", t.kind === "CONTROLLED" && t.classification === "CONTROLLED");
    ok("A passes its own (delivered) contract", t.initialDetection.perPart.A.ownPass === true);
    ok("incompatibility DETECTED as interface violation, offending = [A]", t.initialDetection.classification === "INCOMPATIBLE_INTERFACE_VIOLATION" && JSON.stringify(t.initialDetection.offending) === '["A"]');
    ok("integration fails before repair", t.initialDetection.integration.pass === false);
    ok("detected by the ODG sandbox oracle", /odg-native-build-sandbox/.test(t.initialDetection.detectedBy));
    ok("repair regenerated ONLY part A", t.repairRounds.length === 1 && t.repairRounds[0].regenerated.map((x) => x.part).join() === "A");
    ok("accepted after repair, held-out passes", t.verdict === "ACCEPTED_AFTER_REPAIR" && t.heldOut.pass === true);
    ok("no regeneration call for B or C after receipt", calls.filter((c) => c.repair && c.path !== "src/parse-line.js").length === 0);
  }

  // (2b) natural-style: parts each pass their own cases, A truncates; repair keeps failing identically ⇒ anti-loop, REJECTED
  {
    const providers = { "qwen2.5-coder:3b": provider("3b", (f) => f.path === "src/parse-line.js" ? TRUNC_A : GOOD[f.path], []), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], []) };
    const r = await F.runScenarioF({ providers, natural: 1, controlled: false, supervisorCtx: supCtx(), supervisorCloseDelayMs: 0 });
    const t = r.trials[0];
    ok("truncating A passes own contract but violates the interface", t.initialDetection.perPart.A.ownPass === true && t.initialDetection.classification === "INCOMPATIBLE_INTERFACE_VIOLATION");
    ok("identical regeneration ⇒ NO_PROGRESS stop, REJECTED (never accepted)", t.repairStopReason === "NO_PROGRESS_IDENTICAL_REGENERATION" && t.verdict === "REJECTED" && t.accepted === false);
  }

  // (3) part violating its write-set ⇒ refused (no content received); overlapping write-sets ⇒ refused before generation
  {
    const calls = [];
    const providers = { "qwen2.5-coder:3b": provider("3b", (f) => GOOD[f.path], calls), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], calls) };
    const parts = F.baseParts().map((p) => p.id === "C" ? { ...p, writeSet: ["src/other.js"] } : p);
    const r = await F.runScenarioF({ providers, natural: 1, controlled: false, parts, supervisor: false });
    ok("part outside its write-set ⇒ REFUSED_WRITESET_VIOLATION", r.trials[0].verdict === "REFUSED_WRITESET_VIOLATION" && r.trials[0].violating.join() === "C");
    ok("the violating part was never generated", !calls.some((c) => c.path === "src/format-cents.js"));
    const calls2 = [];
    const p2 = F.baseParts().map((p) => p.id === "C" ? { ...p, writeSet: ["src/parse-line.js", "src/format-cents.js"] } : p);
    const r2 = await F.runScenarioF({ providers: { "qwen2.5-coder:3b": provider("3b", (f) => GOOD[f.path], calls2), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], calls2) }, natural: 1, controlled: false, parts: p2, supervisor: false });
    ok("overlapping part write-sets ⇒ REFUSED_WRITESET_CONFLICT, zero generations", r2.trials[0].verdict === "REFUSED_WRITESET_CONFLICT" && calls2.length === 0);
  }

  // (4) sandbox unavailable ⇒ NOT_RUN, classified NOT_MEASURABLE, never executed in-process
  {
    const providers = { "qwen2.5-coder:3b": provider("3b", (f) => GOOD[f.path], []), "qwen2.5-coder:7b": provider("7b", (f) => GOOD[f.path], []) };
    const r = await F.runScenarioF({ providers, natural: 1, controlled: false, supervisor: false, sandboxRunner: () => ({ ran: false, reason: "bwrap missing (test)" }) });
    const t = r.trials[0];
    ok("no sandbox ⇒ trial NOT_RUN / NOT_MEASURABLE", t.verdict === "NOT_RUN" && t.classification === "NOT_MEASURABLE");
    ok("parts report executionStatus NOT_RUN (no in-process fallback)", Object.values(t.receipt).every((x) => x.executionStatus === "NOT_RUN" && x.ownAccepted === false));
  }

  // (5) the live fetch adapter is loopback-only
  {
    let refused = false; try { await F.loopbackFetch("http://example.com/api/generate", { method: "POST" }); } catch (e) { refused = /127\.0\.0\.1/.test(String(e.message)); }
    ok("loopbackFetch refuses a non-loopback host", refused);
  }

  console.log(`\n${pass} passed`);
})().catch((e) => { console.error(e); process.exit(1); });

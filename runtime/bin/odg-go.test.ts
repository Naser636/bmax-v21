#!/usr/bin/env node
"use strict";
/* V16.4 ODG GO CLI — OFFLINE tests (no network, no model, no provider, no git write): out-dir refusal for the main
 * checkout / runtime/generated / runtime/dist / governance; a real CLI cycle against a NON-git directory is refused at
 * Truth-Lock with a trace confined to --out; allowlist source precedence; pre-registration shape; and, when the committed
 * evidence exists, that its grades follow the pre-registered rules. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const B = require("./odg-go.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

(async () => {
  const main = B.mainCheckoutOf(ROOT);
  check("main checkout resolvable from this tree", typeof main === "string" && main.length > 0);
  check("out dir in main checkout runtime/generated ⇒ refused", B.validateOutDir(path.join(main, "runtime", "generated", "go"), ROOT).ok === false);
  check("out dir in main checkout runtime/dist ⇒ refused", B.validateOutDir(path.join(main, "runtime", "dist", "go"), ROOT).ok === false);
  check("out dir anywhere in the main checkout ⇒ refused", B.validateOutDir(path.join(main, "tmp-go"), ROOT).ok === false);
  check("out dir in runtime/governance ⇒ refused", B.validateOutDir(path.join(ROOT, "runtime", "governance", "x"), ROOT).ok === false);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-test-"));
  check("out dir in a temp dir ⇒ allowed", B.validateOutDir(path.join(tmp, "out"), ROOT).ok === true);

  // a refused out dir exits 2 and writes nothing
  const bad = path.join(main, "runtime", "generated", "odg-go-should-not-exist");
  const rb = await B.runOnce(["--repo", ROOT, "--out", bad]);
  check("refused out dir ⇒ exit 2, nothing created", rb.code === 2 && !fs.existsSync(bad));

  // a real CLI cycle on a NON-git state dir ⇒ Truth-Lock refuses (fail-closed), trace confined to --out
  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), "odg-go-norepo-"));
  const out = path.join(tmp, "out");
  const r = await B.runOnce(["--repo", notRepo, "--out", out, "--execute"]);
  check("non-git state repo ⇒ STARTUP_REFUSED, exit 2", r.code === 2 && r.result.status === "STARTUP_REFUSED");
  check("refused cycle traced (CYCLE_START, TRUTH_LOCK REFUSED, CYCLE_END)", (() => { const t = fs.readFileSync(path.join(out, "go-trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); return t[0].kind === "CYCLE_START" && t[1].step === "TRUTH_LOCK" && t[1].status === "REFUSED" && t[t.length - 1].status === "STARTUP_REFUSED"; })());
  check("every write is inside --out", r.writes.length > 0 && r.writes.every((w: string) => w.startsWith(path.resolve(out) + path.sep)));
  check("no dispatch on refusal", r.result.dispatchCalls === 0 && r.result.providerLaunched === 0);

  // STOP file present before the run ⇒ STOPPED before TRUTH_LOCK, exit 3
  const out2 = path.join(tmp, "out2"); fs.mkdirSync(out2, { recursive: true }); fs.writeFileSync(path.join(out2, "STOP"), "x");
  const r2 = await B.runOnce(["--repo", notRepo, "--out", out2]);
  check("STOP file ⇒ STOPPED (STOP_FILE), exit 3, no step run", r2.code === 3 && r2.result.status === "STOPPED" && r2.result.stop.reason === "STOP_FILE" && r2.result.steps.length === 0);

  // allowlist precedence: env first (even empty = deny-all)
  const saved = process.env.ODG_CANARY_ALLOWLIST;
  process.env.ODG_CANARY_ALLOWLIST = "";
  const al = B.readAllowlist();
  check("ODG_CANARY_ALLOWLIST='' ⇒ empty allowlist from env (deny-by-default)", al.ids.length === 0 && /env/.test(al.source));
  process.env.ODG_CANARY_ALLOWLIST = "M1, M2";
  check("ODG_CANARY_ALLOWLIST parsed", B.readAllowlist().ids.join(",") === "M1,M2");
  if (saved === undefined) delete process.env.ODG_CANARY_ALLOWLIST; else process.env.ODG_CANARY_ALLOWLIST = saved;

  // pre-registration
  check("pre-registered I1..I4", B.PRE_REGISTERED.I.criteria.map((c: any) => c.id).join(",") === "I1,I2,I3,I4");
  check("pre-registered J1..J8", B.PRE_REGISTERED.J.criteria.map((c: any) => c.id).join(",") === "J1,J2,J3,J4,J5,J6,J7,J8");

  // committed evidence (host-independent structural checks)
  const evp = path.join(ROOT, B.EVIDENCE_REL);
  if (fs.existsSync(evp)) {
    const ev = JSON.parse(fs.readFileSync(evp, "utf8"));
    check("evidence pre-registration recorded verbatim", JSON.stringify(ev.preRegistration) === JSON.stringify(B.PRE_REGISTERED));
    const jr = ev.scenarioJ.results;
    const jFail = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"].some((k) => jr[k] === "FAIL");
    check("J grade follows the declared rule", ev.scenarioJ.grade === (jFail ? "FAIL" : jr.J8 === "PASS" ? "PASS" : "PARTIAL"));
    const ir = ev.scenarioI.results;
    check("I grade follows the declared rule", ev.scenarioI.grade === (ir.I1 === "FAIL" ? "FAIL" : ["I2", "I3", "I4"].every((k) => ir[k] === "PASS") ? "PASS" : "PARTIAL"));
    check("real dry trace has the 10 steps in order", ev.realDryCycleTrace.filter((e: any) => e.kind === "STEP").map((e: any) => e.step).join(",") === require("../core/odg-go-cycle.js").STEPS.join(","));
    check("no provider/model/network call, no commit", ev.providerCalls === 0 && ev.modelCalls === 0 && ev.networkCalls === 0 && ev.commits === 0);
    check("re-derived I grade from the committed trace equals the recorded one", B.gradeI(ev.realDryCycleTrace, null).grade === ev.scenarioI.grade);
  } else process.stdout.write("# evidence not yet written — evidence checks skipped\n");

  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall odg-go CLI tests passed\n");
})().catch((e) => { process.stdout.write(`NOT OK - threw ${e && e.stack}\n`); process.exit(1); });
export {};

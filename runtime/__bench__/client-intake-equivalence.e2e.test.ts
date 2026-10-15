#!/usr/bin/env node
/*
 * LOT client-intake — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/client-intake.ts →
 * runtime/dist/core/client-intake.js; build-dist-closure co-locates its dep (pilot-delivery-packager.js,
 * which pulls artifact-state.js + state-transition.js — all TS ports) in dist/core. All store ops use an
 * explicit opts.cwd (temp dir) so they NEVER touch the repo and are deterministic. The only non-det field
 * is createdAt (real ISO timestamp); records are compared with createdAt normalised. emailReadiness is
 * driven by an INJECTED env (presence by name only). No network, no secret values.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/client-intake-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "client-intake.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "client-intake.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT client-intake — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/client-intake.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/client-intake.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "pilot-delivery-packager.js")), "prerequisite: dep pilot-delivery-packager.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["STATUS", "CODE", "REQUIRED", "intake", "get", "list", "transition", "emailReadiness", "prepareEmailDraft", "sendEmail", "attachDelivery", "readiness", "storeState"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
for (const c of ["STATUS", "CODE"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);
// REQUIRED is a PLAIN (non-frozen) array in the historical .js — parity means NOT frozen on either side.
check(EQ(js.REQUIRED, ts.REQUIRED) && !Object.isFrozen(js.REQUIRED) && !Object.isFrozen(ts.REQUIRED), "REQUIRED byte-identical + plain array (non-frozen, matching historical)");

const temps: string[] = [];
const cwd = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "cintake-")); temps.push(d); return d; };
const normRec = (r: any) => (r ? JSON.parse(JSON.stringify(r).replace(/"createdAt":"[^"]*"/g, '"createdAt":"<ts>"').replace(/"packagedAt":"[^"]*"/g, '"packagedAt":"<ts>"')) : r);
const COMPLETE = { client: "Acme", problem: "convert csv", scope: "one script", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true };

try {
  // storeState READY in a temp cwd (both).
  check(js.storeState(cwd()).state === "READY" && ts.storeState(cwd()).state === "READY", "storeState(temp cwd) ⇒ READY (both)");

  // intake complete ⇒ NEW + whitelisted record (secret NOT persisted), createdAt normalised.
  const inWithSecret = { ...COMPLETE, password: "hunter2", apiKey: "sk-xxx", source: "site-form" };
  const rJ = js.intake(inWithSecret, { cwd: cwd() });
  const rT = ts.intake(inWithSecret, { cwd: cwd() });
  check(EQ(normRec(rJ), normRec(rT)) && rJ.ok === true && rJ.status === "NEW" && rJ.requestId === "CLIENT-001", "intake(complete) ⇒ NEW CLIENT-001 BYTE-IDENTICAL");
  check(!("password" in rJ.record) && !("apiKey" in rJ.record) && !("password" in rT.record), "intake whitelist: secret/credential NEVER persisted (both)");

  // intake incomplete ⇒ HELD + missing; bad consent ⇒ HELD.
  const incJ = js.intake({ client: "x", problem: "y", consent: true }, { cwd: cwd() });
  const incT = ts.intake({ client: "x", problem: "y", consent: true }, { cwd: cwd() });
  check(EQ(incJ, incT) && incJ.status === "HELD" && incJ.missing.includes("scope"), "intake(incomplete) ⇒ HELD + missing BYTE-IDENTICAL");
  const bcJ = js.intake({ ...COMPLETE, consent: "yes" }, { cwd: cwd() });
  const bcT = ts.intake({ ...COMPLETE, consent: "yes" }, { cwd: cwd() });
  check(EQ(bcJ, bcT) && bcJ.status === "HELD" && bcJ.badConsent === true, "intake(consent!=true) ⇒ HELD badConsent BYTE-IDENTICAL");
  // non-object input.
  check(EQ(js.intake(5, {}), ts.intake(5, {})) && js.intake(5, {}).status === "HELD", "intake(non-object) ⇒ HELD (no store touch) BYTE-IDENTICAL");

  // get / list over one seeded cwd (shared between the two libs reading the same files).
  const shared = cwd();
  const created = js.intake(COMPLETE, { cwd: shared });
  check(EQ(normRec(js.get(created.requestId, { cwd: shared })), normRec(ts.get(created.requestId, { cwd: shared }))), "get(existing) identical (both read same store)");
  check(js.get("CLIENT-999", { cwd: shared }) === null && ts.get("CLIENT-999", { cwd: shared }) === null, "get(absent) ⇒ null (both)");
  check(js.list({ cwd: shared }).length === ts.list({ cwd: shared }).length && js.list({ cwd: shared }).length === 1, "list() length identical (1)");

  // transition: human-gated deny-by-default, invalid edge, not found.
  const tc = cwd(); const made = js.intake(COMPLETE, { cwd: tc });
  check(EQ(js.transition(made.requestId, "QUALIFYING", { cwd: tc }), ts.transition(made.requestId, "QUALIFYING", { cwd: tc })) && js.transition(made.requestId, "QUALIFYING", { cwd: tc }).code === "HUMAN_AUTHORIZATION_REQUIRED", "transition(human-gated, no human) ⇒ HUMAN_AUTHORIZATION_REQUIRED");
  const tc2 = cwd(); const made2 = js.intake(COMPLETE, { cwd: tc2 });
  const okTrJ = js.transition(made2.requestId, "QUALIFYING", { by: "human", owner: "boss", cwd: tc2 });
  const tc3 = cwd(); const made3 = ts.intake(COMPLETE, { cwd: tc3 });
  const okTrT = ts.transition(made3.requestId, "QUALIFYING", { by: "human", owner: "boss", cwd: tc3 });
  check(EQ(okTrJ, okTrT) && okTrJ.ok === true && okTrJ.status === "QUALIFYING", "transition(human+owner) ⇒ ok QUALIFYING BYTE-IDENTICAL");
  check(EQ(js.transition(made2.requestId, "ACCEPTED", { by: "human", owner: "b", cwd: tc2 }), ts.transition(made3.requestId, "ACCEPTED", { by: "human", owner: "b", cwd: tc3 })) && js.transition(made2.requestId, "DELIVERED", { cwd: tc2 }).code === "INVALID_TRANSITION", "transition(invalid edge) ⇒ INVALID_TRANSITION");
  check(EQ(js.transition("CLIENT-999", "QUALIFYING", { cwd: cwd() }), ts.transition("CLIENT-999", "QUALIFYING", { cwd: cwd() })), "transition(not found) ⇒ NOT_FOUND BYTE-IDENTICAL");

  // emailReadiness — injected env, presence-by-name only, sendEnabled false.
  check(EQ(js.emailReadiness({ env: {} }), ts.emailReadiness({ env: {} })) && js.emailReadiness({ env: {} }).state === "NOT_CONFIGURED", "emailReadiness(empty env) ⇒ NOT_CONFIGURED");
  const smtpEnv = { env: { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p" } };
  check(EQ(js.emailReadiness(smtpEnv), ts.emailReadiness(smtpEnv)) && js.emailReadiness(smtpEnv).state === "CONFIGURED_PRESENT" && js.emailReadiness(smtpEnv).sendEnabled === false, "emailReadiness(smtp present) ⇒ CONFIGURED_PRESENT, sendEnabled false");

  // prepareEmailDraft + sendEmail (always fail-closed) + readiness.
  const dc = cwd(); const dreq = js.intake(COMPLETE, { cwd: dc });
  check(EQ(js.prepareEmailDraft(dreq.requestId, "first", { cwd: dc }), ts.prepareEmailDraft(dreq.requestId, "first", { cwd: dc })), "prepareEmailDraft(existing) BYTE-IDENTICAL");
  check(EQ(js.sendEmail(), ts.sendEmail()) && js.sendEmail().code === "EMAIL_NOT_CONFIGURED" && js.sendEmail().sent === false, "sendEmail ⇒ ALWAYS fail-closed (both)");
  check(EQ(js.readiness({ env: {} }), ts.readiness({ env: {} })) && js.readiness({ env: {} }).state === "READY" && js.readiness({ env: {} }).intake === "READY", "readiness BYTE-IDENTICAL (READY core, prerequisites)");

  // attachDelivery not-ready (NEW) ⇒ NOT_READY_FOR_DELIVERY (delegates to packager only when scoped).
  const ac = cwd(); const areq = js.intake(COMPLETE, { cwd: ac });
  check(EQ(js.attachDelivery(areq.requestId, "M", { cwd: ac }), ts.attachDelivery(areq.requestId, "M", { cwd: ac })) && js.attachDelivery(areq.requestId, "M", { cwd: ac }).code === "NOT_READY_FOR_DELIVERY", "attachDelivery(NEW) ⇒ NOT_READY_FOR_DELIVERY BYTE-IDENTICAL");
} finally {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT client-intake EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

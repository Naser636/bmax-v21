#!/usr/bin/env node
"use strict";
/* V161 §2 P0 — ODG real closure-register ops battery. Proves ODG READS + RECONCILES the REAL canonical register
 * (docs/odg/closure-register.json, 427 items) via campaign-controller, and that the V160 crash-atomic persistence is
 * LOSSLESS on its real schema (round-trip to a snapshot) — the PRODUCTION register is NEVER mutated. Honest: no real
 * mission is marked ACCEPTED here (that would fabricate closure); closing open missions stays governance-gated. */
const O = require("./odg-closure-register-ops.js");
const crypto = require("crypto"); const fs = require("fs"); const os = require("os"); const path = require("path");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const REAL = "docs/odg/closure-register.json";
const hash = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function main() {
  const before = hash(REAL);   // production register hash BEFORE — must be identical AFTER (read-only guarantee)

  // ---- READ-ONLY audit of the REAL register ----
  const a = O.auditClosureRegister(REAL);
  check("loads the REAL canonical register (427 items, not the 28 historical total)", a.ok === true && a.total === 427 && a.total > 100);
  check("summarizes real statuses (mostly ACCEPTED, a handful open)", (a.counts.ACCEPTED || 0) >= 400 && a.openCount >= 1 && a.openCount < 50);
  check("every ACCEPTED mission carries evidence (acceptance is evidence-backed)", a.acceptedWithEvidence === a.acceptedTotal && a.acceptedTotal >= 400);
  check("staleAcceptances is clean (0) — the register is coherent", a.staleAcceptances === 0);
  check("selectNextLot returns a REAL eligible lot (ODG can pick the next mission)", typeof a.nextEligibleLot === "object" && a.nextEligibleLot !== null && typeof a.nextEligibleLot.id === "string");
  check("audit is READ-ONLY (note: no status changed; provider cannot close a real mission)", /no status changed/.test(a.note) && /provider cannot close/.test(a.note));

  // ---- reconcile open missions by classification ----
  const rec = O.reconcileRemaining(REAL);
  check("open missions classified (owner-gated / dependency / active / deferred)", rec.ok === true && rec.classified.length === a.openCount && rec.classified.every((c: any) => ["OWNER_GATED_OR_EXTERNAL", "DEPENDENCY_BLOCKED", "ACTIVE", "DEFERRED", "OPEN"].includes(c.classification)));
  check("BLOCKED missions classify as owner-gated/external (not silently runnable)", rec.classified.filter((c: any) => c.status === "BLOCKED").every((c: any) => c.classification === "OWNER_GATED_OR_EXTERNAL"));

  // ---- V160 persistence is LOSSLESS on the REAL schema (round-trip to a snapshot; production untouched) ----
  const snap = path.join(os.tmpdir(), `odg-cr-rt-${process.pid}-${Math.round(process.hrtime()[1])}.json`);
  const rt = O.verifyRegisterRoundTrip(REAL, snap);
  check("V160 atomic persistence round-trips the REAL 427-item register LOSSLESSLY (ids + evidence + stale preserved)", rt.ok === true && rt.lossless === true && rt.itemCount === 427 && rt.idsPreserved === true && rt.evidencePreserved === true && rt.stalePreserved === true);
  check("round-trip wrote ONLY the snapshot; production register reported untouched", rt.productionUntouched === true && fs.existsSync(snap));
  try { fs.unlinkSync(snap); } catch (e) { /* ignore */ }

  // ---- THE production register was NEVER mutated (hash identical) ----
  const after = hash(REAL);
  check("PRODUCTION closure-register.json is byte-identical after all ops (read-only, history preserved)", before === after);

  // ---- honest contract ----
  check("contract: read-only on production; closing real missions is governance-gated; no parallel file", /NEVER written/.test(O.CLOSURE_REGISTER_OPS_CONTRACT.invariants[0]) && /governance-gated/.test(O.CLOSURE_REGISTER_OPS_CONTRACT.invariants[4]) && /needs real work \+ ODG\/owner authorization/.test(O.CLOSURE_REGISTER_OPS_CONTRACT.invariants[1]));

  // ---- fail-closed ----
  check("fail-closed: missing path / unreadable register ⇒ error, no throw", O.auditClosureRegister(null).code === "NO_PATH" && O.auditClosureRegister("does-not-exist-" + process.pid + ".json").code === "NO_REGISTER");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-closure-register-ops (ODG reads+reconciles the REAL 427-item closure register via campaign-controller; V160 atomic persistence proven LOSSLESS on the real schema; production register byte-identical/untouched; real-mission closure governance-gated, never fabricated)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

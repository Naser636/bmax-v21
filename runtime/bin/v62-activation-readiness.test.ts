#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§10/§11) — activation-readiness test. Verifies operational areas are tagged with an honest status
 * (PREPARED/PLACEHOLDER/NOT_BUILT) backed by a named mechanism, and that EVERY human-info slot is left explicitly EMPTY
 * (value null, PENDING_HUMAN) — no fabricated identity/number/document/certification/insurance/legal validation.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V62_ACTIVATION_READINESS.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("activation artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const valid = ["PREPARED", "PLACEHOLDER", "NOT_BUILT"];
  check("operational areas enumerated (>=15)", m.capabilityAreaCount >= 15 && m.capabilityAreas.length === m.capabilityAreaCount);
  check("each area has a valid status + named backing mechanism", m.capabilityAreas.every((a: any) => valid.includes(a.status) && typeof a.backing === "string" && a.backing.length > 0));
  check("some areas PREPARED (built/tested locally)", m.prepared >= 1);
  check("human-info slots enumerated (>=10)", Array.isArray(m.humanInfoSlots) && m.humanInfoSlots.length >= 10);
  check("EVERY human-info slot is EMPTY (value null, PENDING_HUMAN)", m.allHumanSlotsEmpty === true && m.humanInfoSlots.every((s: any) => s.value === null && s.status === "PENDING_HUMAN"));
  check("invariant: no fabricated identity/number/document/certification", /never filled with a fabricated value/i.test(m.invariant) && /certification/i.test(m.invariant));
  check("conclusion: activation config-only after human inputs; nothing fabricated", /config-only/i.test(m.honestConclusion) && /Nothing fabricated/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V62 activation-readiness (areas backed, human slots empty, nothing fabricated)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

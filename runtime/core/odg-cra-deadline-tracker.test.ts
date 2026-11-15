#!/usr/bin/env node
"use strict";
/* IMP-M1-CRA-TRACKER — CRA deadlines/penalties sourced not invented; role-based applicability; nothing certified. */
const T = require("./odg-cra-deadline-tracker.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const now = Date.UTC(2026, 10, 15); // 2026-11-15: after the 24h-reporting milestone, before the SBOM milestone
  const m = T.track({ role: "manufacturer", nowEpochMs: now });
  check("manufacturer ⇒ both obligations applicable, dates sourced from EUR-Lex", m.applicable.length === 2 && m.applicable.every((o: any) => /EUR-Lex 2024\/2847/.test(o.source)));
  check("time status: 24h-reporting IN_EFFECT (past 2026-09-11), SBOM UPCOMING (before 2027-12-11)", m.applicable.find((o: any) => o.id === "24h-early-warning").timeStatus === "IN_EFFECT" && m.applicable.find((o: any) => o.id === "sbom-and-essential-reqs").timeStatus === "UPCOMING");
  check("penalties sourced (€15M/2.5%); nothing certified/compliant", /€15,000,000 or 2.5%/.test(m.penalties.maxEssentialReqBreach) && m.certified === false && m.compliant === "NOT_DECLARED");

  // role-based applicability (not assumed)
  check("unknown role ⇒ UNDETERMINED applicability (not assumed)", T.track({ nowEpochMs: now }).applicable.length === 0 && /UNDETERMINED/.test(T.track({ nowEpochMs: now }).note));
  check("not_in_scope ⇒ no obligations tracked (owner's legal qualification)", T.track({ role: "not_in_scope", nowEpochMs: now }).applicable.length === 0);
  check("distributor ⇒ fewer/zero manufacturer-only obligations (role-scoped)", T.track({ role: "distributor", nowEpochMs: now }).applicable.length === 0);

  check("contract + honesty (sourced not invented; nothing certified)", T.CRA_DEADLINE_TRACKER_CONTRACT.invariants.some((i: string) => /not invented/.test(i)) && /declares nothing certified\/compliant/.test(m.honesty));
  check("deterministic", JSON.stringify(T.track({ role: "manufacturer", nowEpochMs: now }).applicable) === JSON.stringify(m.applicable));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cra-deadline-tracker (IMP-M1: CRA obligations+dates+penalties SOURCED from EUR-Lex; role-based applicability; nothing certified/compliant)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

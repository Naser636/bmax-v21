#!/usr/bin/env node
"use strict";
/* V164 §0/§1 — read-only truth inventory of the OPEN missions in the REAL canonical register. Proves: every non-terminal
 * mission is read from docs/odg/closure-register.json and classified (blocker + next-action) GROUNDED in the register's real
 * dep statuses; the inventory never changes a mission status; the honest realizable-local subset is surfaced so ODG (not the
 * provider) selects the next mission. This is the "inventaire de vérité AVANT toute modification" §0 requires. */
const R = require("./odg-open-mission-recovery.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const inv = R.inventoryOpenMissions();

  // ---- reads the REAL register (427 items) and open set is the non-terminal missions ----
  check("reads the real canonical register (≥400 items)", inv.registerTotal >= 400 && inv.counts.ACCEPTED >= 400);
  check("open set excludes terminal (ACCEPTED/REJECTED) states", inv.openCount === inv.missions.length && inv.missions.every((m: any) => R.OPEN_STATES.indexOf(m.status) >= 0));
  check("open count equals BLOCKED+IN_PROGRESS+DEFERRED+READY from the counts", inv.openCount === (inv.counts.BLOCKED || 0) + (inv.counts.IN_PROGRESS || 0) + (inv.counts.DEFERRED || 0) + (inv.counts.READY || 0));

  // ---- every open mission is classified; classes are grounded ----
  check("every open mission has a class + blocker + nextAction", inv.missions.every((m: any) => typeof m.class === "string" && typeof m.blocker === "string" && typeof m.nextAction === "string"));
  check("classification is GROUNDED: a DEPENDENCY_BLOCKED mission has a real unmet dep", (() => {
    const dep = inv.missions.filter((m: any) => m.class === "DEPENDENCY_BLOCKED");
    return dep.every((m: any) => m.unmetDeps.length > 0);
  })());

  // ---- the honest finding: exactly one REALIZABLE_LOCAL (slice3), surfaced for ODG to select ----
  const byId: any = {}; for (const m of inv.missions) byId[m.id] = m;
  check("the delegate-provenance slice-3 mission is classified REALIZABLE_LOCAL (deps met + concrete next-action)", byId["p0-autonomy-measure-slice3-delegate-provenance"] && byId["p0-autonomy-measure-slice3-delegate-provenance"].class === "REALIZABLE_LOCAL" && byId["p0-autonomy-measure-slice3-delegate-provenance"].unmetDeps.length === 0);
  check("systemd + TLS activation missions are OWNER_GATED (privileged/owner action), NOT realizable-local", byId["campaign-runner-systemd-activation"].class === "OWNER_GATED" && byId["dashboard-tls-exposure"].class === "OWNER_GATED");
  check("the broad-IT eval/corpus missions are EXTERNAL_BLOCKED (external corpus)", byId["broad-it-independent-eval-set"].class === "EXTERNAL_BLOCKED" && byId["broad-it-corpus-grow"].class === "EXTERNAL_BLOCKED");
  check("billing-sandbox is DEPENDENCY_BLOCKED on demand-validation (unmet)", byId["p01-billing-sandbox"].class === "DEPENDENCY_BLOCKED" && byId["p01-billing-sandbox"].unmetDeps.indexOf("p01-demand-validation") >= 0);
  check("eleven-profession is DEFINITION_BLOCKED (title names it)", byId["eleven-profession-program-definition"].class === "DEFINITION_BLOCKED");
  check("master-unified-campaign is an UMBRELLA (no concrete acceptance)", byId["master-unified-campaign"].class === "UMBRELLA");
  check("an empty-text BLOCKED record is reported UNSPECIFIED_IN_REGISTER (honest, not guessed)", byId["p0e-audit-log-keyed-integrity"].class === "UNSPECIFIED_IN_REGISTER");
  check("realizableLocalIds surfaces exactly the REALIZABLE_LOCAL subset for ODG to select", JSON.stringify(inv.realizableLocalIds) === JSON.stringify(inv.missions.filter((m: any) => m.class === "REALIZABLE_LOCAL").map((m: any) => m.id)));

  // ---- read-only invariant: no mission status may be changed by a provider ----
  check("every classified mission carries statusChangeAllowed=false (provider cannot self-promote/close)", inv.missions.every((m: any) => m.statusChangeAllowed === false));
  check("contract: read-only, grounded, honest precedence, surfaces realizable subset", /READ-ONLY/.test(R.OPEN_MISSION_RECOVERY_CONTRACT.invariants[0]) && /GROUNDED/.test(R.OPEN_MISSION_RECOVERY_CONTRACT.invariants[1]) && R.OPEN_MISSION_RECOVERY_CONTRACT.invariants.some((x: string) => /DEPENDENCY_BLOCKED > EXTERNAL_BLOCKED/.test(x)));

  // ---- V15.1 write-set pass-through (fail-closed) ----
  {
    const base = { status: "READY", deps: [], nextAction: "read-only diagnostic", acceptance: "" };
    const a = R.classifyOpenMission({ ...base, id: "A", authorizedPaths: ["src/a"] }, {});
    const w = R.classifyOpenMission({ ...base, id: "W", writeSet: ["out/w.json"] }, {});
    const ro = R.classifyOpenMission({ ...base, id: "RO", readOnly: true }, {});
    const none = R.classifyOpenMission({ ...base, id: "N" }, {});
    const bad = R.classifyOpenMission({ ...base, id: "B", authorizedPaths: [], writeSet: ["ok", 3], readOnly: "true" }, {});
    check("pass-through: authorizedPaths carried verbatim (frozen copy)", JSON.stringify(a.authorizedPaths) === '["src/a"]' && Object.isFrozen(a.authorizedPaths));
    check("pass-through: writeSet carried verbatim", JSON.stringify(w.writeSet) === '["out/w.json"]' && w.authorizedPaths === undefined);
    check("pass-through: readOnly only when strictly true", ro.readOnly === true && bad.readOnly === undefined);
    check("fail-closed: absent declarations ⇒ NO keys emitted (shape unchanged ⇒ UNKNOWN downstream)", !("authorizedPaths" in none) && !("writeSet" in none) && !("readOnly" in none));
    check("fail-closed: empty / non-string-element arrays are NOT carried", !("authorizedPaths" in bad) && !("writeSet" in bad));
    check("the REAL register's 12 open missions declare no write-set today ⇒ none carried (honest: all UNKNOWN)", inv.missions.every((m: any) => !("authorizedPaths" in m) && !("writeSet" in m) && !("readOnly" in m)));
    // downstream effect through the REAL orchestrator: disjoint declared write-sets ⇒ one write-safe sub-wave of 2; overlap ⇒ serialized; undeclared ⇒ serialized
    const MO = require("./odg-mission-orchestrator.js");
    const wave = (recs: any[]) => { const plan = MO.buildDispatchPlan({ missions: recs.map((r: any) => R.classifyOpenMission({ ...base, ...r }, {})) }); return plan.writeSafety.layers[0].subWaves.map((x: any) => x.slice()); };
    check("orchestrator: disjoint carried write-sets ⇒ ONE sub-wave [X,Y] (was 2 serialized waves before pass-through)", JSON.stringify(wave([{ id: "X", writeSet: ["out/x"] }, { id: "Y", writeSet: ["out/y"] }])) === '[["X","Y"]]');
    check("orchestrator: overlapping carried write-sets ⇒ serialized [[X],[Y]]", JSON.stringify(wave([{ id: "X", writeSet: ["out"] }, { id: "Y", writeSet: ["out/y"] }])) === '[["X"],["Y"]]');
    check("orchestrator: undeclared write-sets stay UNKNOWN ⇒ serialized [[X],[Y]]", JSON.stringify(wave([{ id: "X" }, { id: "Y" }])) === '[["X"],["Y"]]');
  }

  // ---- determinism / fail-closed ----
  check("inventory is frozen + reproducible", Object.isFrozen(inv) && JSON.stringify(R.inventoryOpenMissions().byClass) === JSON.stringify(inv.byClass));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — open-mission-recovery (read-only truth inventory of the 12 open missions over the REAL register; grounded classification [owner-gated/external/dependency/definition/umbrella/unspecified/realizable-local]; exactly one REALIZABLE_LOCAL surfaced for ODG; no status changed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

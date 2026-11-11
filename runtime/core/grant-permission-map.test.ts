#!/usr/bin/env node
"use strict";
/* V135 seed D — grant/permission/owner-gate map battery. Proves the map is validated against the REAL owner authority
 * (local-work-mandate): a backed grant passes; a self-asserted grant the mandate does NOT back is REJECTED; a Level-C action
 * marked granted is REJECTED (critical leak); an incomplete owner-gate is REJECTED; fail-closed without an authority source;
 * and the REAL V135_GRANT_OWNERGATE_MAP.json dossier validates (10 granted, 17 Level-C denied, owner-gates + risk-gates). */
const GM = require("./grant-permission-map.js");
const mandate = require("./local-work-mandate.js");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const GRANTED = mandate.PERMISSIONS, LEVELC = mandate.LEVEL_C;
  const okGate = { id: "OG-X", unblocks: ["D01"], requiredOwnerAction: "do the thing", provenance: "register §B" };
  const okRisk = { mode: "m", residualRisk: "MEDIUM", acceptance: "REQUIRED" };
  const GOOD = { granted: GRANTED, levelCDenied: LEVELC, ownerGated: [okGate], riskGates: [okRisk] };

  // 1 — a fully backed map validates
  check("backed map ⇒ ok (every grant permitted by the mandate, no Level-C leak, complete owner-gate)", GM.buildGrantMap(GOOD, mandate).ok === true);

  // 2 — a grant the owner's mandate does NOT back is REJECTED (no self-authorization)
  const notBacked: any = { ...GOOD, granted: [...GRANTED, "DEPLOY_TO_PRODUCTION"] };
  const r2 = GM.buildGrantMap(notBacked, mandate);
  check("self-asserted grant NOT backed by the mandate ⇒ REJECTED (GRANT_NOT_BACKED)", r2.ok === false && r2.violations.some((v: any) => v.code === "GRANT_NOT_BACKED" && v.item === "DEPLOY_TO_PRODUCTION"));

  // 3 — CRITICAL: a Level-C action placed in granted ⇒ GRANT_NOT_BACKED AND (if also mislisted) LEVELC_LEAK caught
  const leak: any = { ...GOOD, granted: [...GRANTED, "push"] };
  const r3 = GM.buildGrantMap(leak, mandate);
  check("Level-C action ('push') marked granted ⇒ REJECTED (owner authority never granted)", r3.ok === false && r3.violations.some((v: any) => v.item === "push"));
  // and a Level-C action wrongly recorded as permitted would be a LEVELC_LEAK — simulate with a widened mandate stub
  const widened = { permits: (c: string) => ({ permitted: true }), classifyAction: mandate.classifyAction };
  const r3b = GM.buildGrantMap({ granted: [], levelCDenied: ["push"], ownerGated: [], riskGates: [] }, widened);
  check("if an authority stub permits a Level-C action ⇒ LEVELC_LEAK (critical bypass caught)", r3b.ok === false && r3b.violations.some((v: any) => v.code === "LEVELC_LEAK" && v.item === "push"));

  // 4 — a Level-C-denied entry that is NOT actually Level-C ⇒ misclassification caught
  const mis: any = { ...GOOD, levelCDenied: [...LEVELC, "read"] };
  check("non-Level-C action listed as Level-C-denied ⇒ REJECTED (LEVELC_MISCLASSIFIED)", GM.buildGrantMap(mis, mandate).violations.some((v: any) => v.code === "LEVELC_MISCLASSIFIED" && v.item === "read"));

  // 5 — an incomplete owner-gate (missing provenance / action / unblocks) ⇒ REJECTED
  const bareGate: any = { ...GOOD, ownerGated: [{ id: "OG-Y" }] };
  check("owner-gate missing provenance/action/unblocks ⇒ REJECTED (OWNERGATE_INCOMPLETE)", GM.buildGrantMap(bareGate, mandate).violations.some((v: any) => v.code === "OWNERGATE_INCOMPLETE" && v.item === "OG-Y"));

  // 6 — a malformed risk-gate (not MEDIUM+ or acceptance!=REQUIRED) ⇒ REJECTED
  const badRisk: any = { ...GOOD, riskGates: [{ mode: "m", residualRisk: "LOW", acceptance: "REQUIRED" }] };
  check("risk-gate below MEDIUM or not REQUIRED ⇒ REJECTED (RISKGATE_MALFORMED)", GM.buildGrantMap(badRisk, mandate).violations.some((v: any) => v.code === "RISKGATE_MALFORMED"));

  // 7 — fail-closed: no authority source ⇒ not ok; garbage input ⇒ not ok (never throws)
  check("no mandate (authority source) ⇒ not ok (fail-closed, cannot verify grants)", GM.buildGrantMap(GOOD, null).ok === false && GM.buildGrantMap(GOOD, {}).ok === false);
  check("garbage map ⇒ not ok, no throw (fail-closed)", GM.buildGrantMap(null, mandate).ok === false && GM.buildGrantMap(undefined, mandate).ok === false);
  // 7b — a present-but-WRONG-TYPE field is malformed input, not an empty section ⇒ REJECTED (matches the module invariant)
  const wrongType: any = { granted: 5, ownerGated: "x", levelCDenied: {}, riskGates: null };
  check("wrong-typed fields (granted:5, ownerGated:'x', …) ⇒ REJECTED (MAP_MALFORMED, not vacuous ok)", GM.buildGrantMap(wrongType, mandate).ok === false && GM.buildGrantMap(wrongType, mandate).violations.some((v: any) => v.code === "MAP_MALFORMED"));

  // 8 — output frozen + deterministic
  const a = GM.buildGrantMap(GOOD, mandate);
  check("output frozen + deterministic", Object.isFrozen(a) && Object.isFrozen(a.violations) && JSON.stringify(a) === JSON.stringify(GM.buildGrantMap(GOOD, mandate)));

  // 9 — the REAL dossier validates against the real mandate (re-built here, not trusting the stored ok flag)
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "odg", "V135_GRANT_OWNERGATE_MAP.json"), "utf8"));
  const re = GM.buildGrantMap({ granted: d.granted, levelCDenied: d.levelCDenied, ownerGated: d.ownerGated, riskGates: d.riskGates }, mandate);
  check("REAL grant map RE-VALIDATES against the mandate (ok, 0 violations) — stored ok flag not trusted", re.ok === true && re.violations.length === 0 && d.ok === true);
  // SET-equality (not just count): a count-preserving dup/swap tamper of d.granted or d.levelCDenied must be caught.
  const sameSet = (a: string[], b: string[]) => { const A = [...new Set(a)].sort(), B = [...new Set(b)].sort(); return a.length === b.length && A.length === B.length && A.every((x, i) => x === B[i]); };
  check("REAL map: granted SET === mandate.PERMISSIONS (10) and levelCDenied SET === mandate.LEVEL_C (17) — no dup/swap tamper", sameSet(d.granted, mandate.PERMISSIONS) && sameSet(d.levelCDenied, mandate.LEVEL_C));
  check("REAL map: owner-gates (OG-01..08 + Level-B) carry provenance; FMEA MEDIUM+ residuals surfaced as risk-gates", re.counts.ownerGated >= 8 && re.counts.riskGates >= 1 && d.ownerGated.every((g: any) => typeof g.provenance === "string" && g.provenance.length > 0));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — grant/permission/owner-gate map (authority-backed; self-authorization + Level-C leak REJECTED; owner-gates & risk-gates surfaced; fail-closed; real map re-validates)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

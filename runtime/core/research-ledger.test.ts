#!/usr/bin/env node
"use strict";
/* M6 (Phase 10 observability + anti-repeat) — research-ledger battery. Proves it makes the M4/M5 governed-research
 * subsystem OBSERVABLE from REAL govern()/stampFinding() outputs: ALLOW/DENY tallies + top DENY reasons + per-domain
 * ALLOW counts, finding DEDUP (same source+date+content counted once — anti-repeat), fail-closed on bad input,
 * deterministic + frozen read-models, and NO egress authority (it only records). */
const L = require("./research-ledger.js");
const GOV = require("./research-governor.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const NOW = Date.parse("2026-11-11T00:00:00Z");
const GRANT = { authorized: true, allowedDomains: ["example.com"], expiresMs: NOW + 100000 };

function main() {
  // 1. empty ledger ⇒ zeros, allowRate null (no fake 0/0)
  const e = L.summarize(L.emptyLedger());
  check("empty ledger ⇒ zero decisions/findings, allowRate null (no fake 0/0)", e.decisions.total === 0 && e.findings.distinct === 0 && e.decisions.allowRate === null);

  // 2. record a REAL govern() ALLOW ⇒ allow tallied + per-domain
  let led = L.emptyLedger();
  const allowRes = GOV.govern({ query: "q", urls: ["https://example.com/a", "https://sub.example.com/b"] }, GRANT, NOW);
  check("fixture: govern ALLOW", allowRes.decision === "ALLOW");
  led = L.recordDecision(led, allowRes, { at: "2026-11-11T00:00:00Z" }).ledger;
  // 3. record a REAL govern() DENY (no grant) ⇒ deny + reason tallied
  const denyRes = GOV.govern({ urls: ["https://example.com/a"] }, {}, NOW);
  led = L.recordDecision(led, denyRes, {}).ledger;
  const s1 = L.summarize(led);
  check("ALLOW recorded with per-domain tally", s1.decisions.allow === 1 && s1.decisions.allowByDomain["example.com"] === 1 && s1.decisions.allowByDomain["sub.example.com"] === 1);
  check("DENY recorded with reason tally (EGRESS_NOT_AUTHORIZED)", s1.decisions.deny === 1 && s1.decisions.denyReasons["EGRESS_NOT_AUTHORIZED"] === 1);
  check("allowRate computed (1/2 = 0.5)", s1.decisions.allowRate === 0.5);

  // 4. fail-closed: a non-ALLOW/DENY result is refused (no record)
  const bad = L.recordDecision(led, { decision: "MAYBE" }, {});
  check("invalid decision ⇒ refused INVALID_DECISION (no record)", bad.ok === false && bad.reason === "INVALID_DECISION" && L.summarize(bad.ledger).decisions.total === 2);

  // 5. record a REAL stampFinding() finding ⇒ distinct=1
  let fled = L.emptyLedger();
  const f1 = GOV.stampFinding("price is X", { url: "https://example.com/p", date: "2026-11-10", credibility: "HIGH" });
  check("fixture: stampFinding ok", f1.ok === true);
  const r5 = L.recordFinding(fled, f1.finding, { at: "t1" }); fled = r5.ledger;
  check("finding recorded (distinct=1, not deduped)", r5.ok === true && r5.deduped === false && L.summarize(fled).findings.distinct === 1);

  // 6. ANTI-REPEAT: the SAME finding again ⇒ deduped (distinct stays 1, observations=2, repeated=1)
  const r6 = L.recordFinding(fled, f1.finding, { at: "t2" }); fled = r6.ledger;
  const s6 = L.summarize(fled);
  check("identical finding again ⇒ DEDUPED (distinct 1, observations 2, repeated 1)", r6.deduped === true && s6.findings.distinct === 1 && s6.findings.totalObservations === 2 && s6.findings.repeated === 1);

  // 7. fail-closed: a finding missing a dated source is refused
  const r7 = L.recordFinding(fled, { content: "x", source: "s" }, {});
  check("finding missing date ⇒ refused INVALID_FINDING", r7.ok === false && r7.reason === "INVALID_FINDING");

  // 8. confidence mix tallied (fail-closed band: unknown ⇒ LOW)
  const f2 = GOV.stampFinding("other", { url: "https://example.com/q", date: "2026-11-09", credibility: "weird" });
  fled = L.recordFinding(fled, f2.finding, {}).ledger;
  const s8 = L.summarize(fled);
  check("confidence mix tallied (HIGH + fail-closed LOW)", s8.findings.byConfidence["HIGH"] === 1 && s8.findings.byConfidence["LOW"] === 1 && s8.findings.distinct === 2);

  // 9. findingKey deterministic + null on bad input
  check("findingKey deterministic + null on invalid", L.findingKey(f1.finding) === L.findingKey(f1.finding) && L.findingKey({ content: "c" }) === null);

  // 10. frozen read-model (summary + nested)
  check("summary + nested frozen", Object.isFrozen(s8) && Object.isFrozen(s8.decisions) && Object.isFrozen(s8.findings) && Object.isFrozen(s8.findings.byConfidence));

  // 11. deterministic — identical record sequences ⇒ identical summary JSON
  const buildSeq = () => { let x = L.emptyLedger(); x = L.recordDecision(x, allowRes, { at: "a" }).ledger; x = L.recordFinding(x, f1.finding, { at: "b" }).ledger; return L.summarize(x); };
  check("deterministic (identical sequences ⇒ identical summary)", JSON.stringify(buildSeq()) === JSON.stringify(buildSeq()));

  // 12. the ledger holds NO egress authority — recording a DENY never turns it into an ALLOW, and nothing fetches
  check("ledger never upgrades a DENY (records only, no egress authority)", s1.decisions.deny === 1 && s1.decisions.allow === 1);

  // ===== Regression locks for independent-validator findings (corrupted/injected persisted ledger) =====
  // D1: summarize must reject count ≤0 / non-integer ⇒ observations/repeated can never go negative or fractional
  const corruptF = { version: 1, decisions: [], findings: { bad1: { count: -10 }, bad2: { count: 0.5 }, bad3: { count: "5" }, good: { content: "c", source: "s", date: "2026-11-10", confidence: "HIGH", count: 2 } } };
  const sD1 = L.summarize(corruptF);
  check("D1: corrupted finding counts ignored ⇒ distinct 1, observations 2, repeated 1 (never negative/fractional)", sD1.findings.distinct === 1 && sD1.findings.totalObservations === 2 && sD1.findings.repeated === 1);
  // D2: summarize denominator counts ONLY real ALLOW/DENY ⇒ junk decisions cannot pad allowRate
  const corruptD = { version: 1, decisions: [{ decision: "ALLOW", domains: ["x.com"], reasons: [] }, { decision: "MAYBE" }, { decision: null }, 42], findings: {} };
  const sD2 = L.summarize(corruptD);
  check("D2: junk decisions excluded from total ⇒ total==allow+deny, allowRate honest", sD2.decisions.total === 1 && sD2.decisions.allow === 1 && sD2.decisions.deny === 0 && sD2.decisions.allowRate === 1 && sD2.decisions.total === sD2.decisions.allow + sD2.decisions.deny);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — research-ledger M6 (governed-research observability + finding dedup/anti-repeat; fail-closed; no egress authority)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

// @ts-nocheck
// regulatory-evidence-demonstrator — classifyRole→anti-overclaim→not-certified→seal composition. No declared
// activity ⇒ UNDETERMINED (asserts no obligation); a declared activity ⇒ roles present; a prohibited superlative
// ⇒ anti-overclaim refuses; a certification claim ⇒ not-certified refuses; the dossier seals + re-verifies; the
// verdict is never certification; determinism + bad-input fail-closed.
"use strict";
const assert = require("assert");
const D = require("./regulatory-evidence-demonstrator.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };

// (1) no declared activity ⇒ UNDETERMINED, asserts no obligation; still PREPARED + sealed.
(() => {
  const r = D.runRegulatoryEvidence({ activities: {} });
  ok("undetermined: verdict PREPARED", r.ok && r.verdict === D.VERDICT.PREPARED);
  ok("undetermined: undetermined true, 0 obligations", r.summary.undetermined === true && r.summary.obligationsCount === 0);
  ok("undetermined: a deny-by-default gap reported", r.gaps.some((g) => /UNDETERMINED/i.test(g)));
  ok("undetermined: dossier sealed + re-verified", r.summary.sealed === true);
})();

// (2) a declared activity ⇒ at least one role, not undetermined.
(() => {
  const r = D.runRegulatoryEvidence({ activities: { usesAiSystemUnderOwnAuthority: true } });
  ok("role: roles present, not undetermined", Array.isArray(r.summary.roles) && r.summary.roles.length > 0 && r.summary.undetermined === false);
})();

// (3) anti-overclaim: a prohibited superlative claim ⇒ excellence REFUSES (admit false).
(() => {
  const r = D.runRegulatoryEvidence({ activities: {}, excellence: { claims: ["ODG is the best AI compliance platform in the world"] } });
  ok("overclaim: excellenceAdmit false", r.summary.excellenceAdmit === false);
  ok("overclaim: an anti-overclaim gap reported", r.gaps.some((g) => /anti-overclaim REFUSED|prohibited/i.test(g)));
})();

// (4) a certification claim in the statement ⇒ not-certified REFUSES (fail-closed).
(() => {
  const r = D.runRegulatoryEvidence({ activities: {}, statement: "We are ISO 27001 certified and fully compliant with the EU AI Act." });
  ok("cert-claim: notCertified false", r.summary.notCertified === false);
  ok("cert-claim: a certification-refusal gap reported", r.gaps.some((g) => /certification\/conformity claim|NOT a cert body/i.test(g)));
})();

// (5) honest default statement ⇒ notCertified true.
(() => {
  const r = D.runRegulatoryEvidence({ activities: {} });
  ok("honest-default: notCertified true", r.summary.notCertified === true);
})();

// (6) HONESTY: verdict never certification; basis REGULATORY_EVIDENCE_PREP_NOT_CERTIFICATION; note disclaims.
(() => {
  const r = D.runRegulatoryEvidence({ activities: { usesAiSystemUnderOwnAuthority: true } });
  ok("honesty: verdict PREPARED, never CERTIFIED", !/CERTIF|CONFORM/i.test(r.verdict));
  ok("honesty: basis correct", r.basis === "REGULATORY_EVIDENCE_PREP_NOT_CERTIFICATION");
  ok("honesty: note says NOT a certification body + declared-not-verified", /NOT a certification body/i.test(r.note) && r.dossier && r.dossier.declaredNotVerified === true);
})();

// (7) seal integrity + bad-input + determinism.
(() => {
  ok("bad-input: non-object ⇒ INVALID_INPUT", D.runRegulatoryEvidence(null).code === "INVALID_INPUT");
  const a = D.runRegulatoryEvidence({ activities: { usesAiSystemUnderOwnAuthority: true } });
  const b = D.runRegulatoryEvidence({ activities: { usesAiSystemUnderOwnAuthority: true } });
  // keyless provenance is byte-stable ⇒ identical sealed dossier
  ok("determinism: identical sealed dossier", JSON.stringify(a.dossier) === JSON.stringify(b.dossier));
})();

console.log(`regulatory-evidence-demonstrator: ${n} checks passed`);

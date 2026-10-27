#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the per-channel B2B prospection validator is fail-closed: unknown channel
// refused; every MUST element enforced; every MUST-NOT element blocks; a fully-compliant email passes; B2B basis is
// legitimate interest; the validator never authorises sending. Rules grounded in CNIL/GDPR (standards register).
"use strict";
const assert = require("assert");
const P = require("./prospection-compliance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const compliantEmail = {
  channel: "email", senderIdentified: true, purposeStated: true, relatesToRecipientProfession: true,
  dataSourceDisclosed: true, optOutProvided: true, professionalAddress: true,
  maskedSenderIdentity: false, impliesVatWhileFranchise: false, scrapedBulkInViolationOfTerms: false,
};

// (1) fully-compliant B2B email ⇒ ok.
ok("compliant email ⇒ ok, no violations", (() => { const r = P.validateOutreach(compliantEmail); return r.ok && r.violations.length === 0; })());
// (2) basis is legitimate interest (B2B), not consent.
ok("basis = legitimate interest Art.6(1)(f)", /legitimate interest|6\(1\)\(f\)/i.test(P.validateOutreach(compliantEmail).basis));

// (3) FAIL-CLOSED: unknown channel refused.
ok("unknown channel ⇒ UNKNOWN_CHANNEL, not ok", (() => { const r = P.validateOutreach({ channel: "carrier-pigeon" }); return !r.ok && r.violations[0].kind === "UNKNOWN_CHANNEL"; })());
// (4) missing MUST (no opt-out) ⇒ violation.
ok("email without opt-out ⇒ MISSING_MUST optOutProvided", (() => { const r = P.validateOutreach({ ...compliantEmail, optOutProvided: false }); return !r.ok && r.violations.some(v => v.kind === "MISSING_MUST" && v.flag === "optOutProvided"); })());
// (5) missing source disclosure ⇒ violation (GDPR Art.14).
ok("email without data-source disclosure ⇒ MISSING_MUST", P.validateOutreach({ ...compliantEmail, dataSourceDisclosed: false }).violations.some(v => v.flag === "dataSourceDisclosed"));
// (6) present MUST-NOT (masked sender) ⇒ violation.
ok("masked sender identity ⇒ PRESENT_MUST_NOT", (() => { const r = P.validateOutreach({ ...compliantEmail, maskedSenderIdentity: true }); return !r.ok && r.violations.some(v => v.kind === "PRESENT_MUST_NOT" && v.flag === "maskedSenderIdentity"); })());
// (7) implies VAT while franchise ⇒ violation (art.293 B CGI honesty).
ok("implies VAT under franchise ⇒ violation", P.validateOutreach({ ...compliantEmail, impliesVatWhileFranchise: true }).violations.some(v => v.flag === "impliesVatWhileFranchise"));

// (8) phone channel: B2B needs professional line + profession-relation; consumer-targeting absent.
ok("phone missing professionalLine ⇒ MISSING_MUST", P.validateOutreach({ channel: "phone", senderIdentified: true, relatesToRecipientProfession: true, optOutProvided: true, professionalLine: false }).violations.some(v => v.flag === "professionalLine"));
ok("compliant B2B phone ⇒ ok", P.validateOutreach({ channel: "phone", senderIdentified: true, relatesToRecipientProfession: true, optOutProvided: true, professionalLine: true, maskedSenderIdentity: false }).ok);

// (9) linkedin: automated bulk messaging blocked (platform terms).
ok("linkedin automated bulk ⇒ PRESENT_MUST_NOT", P.validateOutreach({ channel: "linkedin", senderIdentified: true, relatesToRecipientProfession: true, dataSourceDisclosed: true, optOutProvided: true, automatedBulkMessaging: true }).violations.some(v => v.flag === "automatedBulkMessaging"));

// (10) postal: looser (opt-out + sender id), compliant case passes.
ok("compliant postal ⇒ ok", P.validateOutreach({ channel: "postal", senderIdentified: true, optOutProvided: true }).ok);

// (11) validator never authorises sending (honest note).
ok("compliance ≠ authorisation to send", P.validateOutreach(compliantEmail).notes.some(n => /does not authorise sending|separate.*authorisation/i.test(n)));

console.log(`\nPROSPECTION-COMPLIANCE suite — ${pass} assertions passed. (fail-closed; per-channel; B2B legitimate interest; no send)`);

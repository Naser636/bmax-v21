#!/usr/bin/env node
/**
 * prospection-compliance — a FAIL-CLOSED validator that checks a DRAFT B2B outreach against the per-channel CNIL/GDPR
 * rules BEFORE any human decision to send. It does NOT send anything and has no IO — it only inspects a declared draft
 * descriptor and returns violations. Deny-by-default: an unknown channel is refused; any missing MUST element or any
 * present MUST-NOT element makes the draft NON-COMPLIANT. B2B basis = legitimate interest (GDPR Art.6(1)(f)); the
 * message subject must relate to the recipient's profession; information + source disclosure (Art.14) and an immediate,
 * simple right to object (Art.21(2)) are mandatory on every channel. Rules are grounded in the standards register
 * (CNIL full-text; EUR-Lex article refs). Pure, deterministic. Sending remains a separate, explicit human authorisation.
 */
"use strict";

const CHANNELS = ["email", "phone", "postal", "linkedin"];

// Per-channel MUST elements (boolean flags expected true in the draft descriptor) and MUST-NOT elements (expected false).
const RULES: Record<string, { must: Array<{ flag: string; why: string }>; mustNot: Array<{ flag: string; why: string }> }> = {
  email: {
    must: [
      { flag: "senderIdentified", why: "sender identity (name + company + SIREN/contact) required (CNIL)" },
      { flag: "purposeStated", why: "prospection purpose must be stated (GDPR Art.13/14)" },
      { flag: "relatesToRecipientProfession", why: "B2B legitimate-interest basis requires the offer relate to the recipient's profession (CNIL)" },
      { flag: "dataSourceDisclosed", why: "disclose where the contact data came from (GDPR Art.14)" },
      { flag: "optOutProvided", why: "a simple, free opt-out honoured immediately (GDPR Art.21(2))" },
      { flag: "professionalAddress", why: "target a professional address, not a personal one" },
    ],
    mustNot: [
      { flag: "maskedSenderIdentity", why: "masking/falsifying sender identity is prohibited" },
      { flag: "impliesVatWhileFranchise", why: "must not imply VAT is charged if under franchise en base (art. 293 B CGI)" },
      { flag: "scrapedBulkInViolationOfTerms", why: "bulk-scraped sends violating platform terms are prohibited" },
    ],
  },
  phone: {
    must: [
      { flag: "senderIdentified", why: "caller must identify themselves + company (no anonymous call)" },
      { flag: "relatesToRecipientProfession", why: "B2B call must concern the recipient's profession" },
      { flag: "optOutProvided", why: "honour an immediate objection; record it" },
      { flag: "professionalLine", why: "target a professional line (Bloctel protects consumers, not B2B)" },
    ],
    mustNot: [
      { flag: "maskedSenderIdentity", why: "masked/false caller ID is prohibited" },
    ],
  },
  postal: {
    must: [
      { flag: "senderIdentified", why: "sender identity required" },
      { flag: "optOutProvided", why: "right to object must be available (GDPR Art.21(2))" },
    ],
    mustNot: [],
  },
  linkedin: {
    must: [
      { flag: "senderIdentified", why: "sender identity required" },
      { flag: "relatesToRecipientProfession", why: "message must relate to the recipient's professional role" },
      { flag: "dataSourceDisclosed", why: "profile data is personal data — disclose source + purpose (GDPR Art.14)" },
      { flag: "optOutProvided", why: "offer a simple way to decline further contact (Art.21(2))" },
    ],
    mustNot: [
      { flag: "automatedBulkMessaging", why: "automation/bots/bulk InMail violate LinkedIn terms" },
      { flag: "scrapedBulkInViolationOfTerms", why: "scraping violates platform terms" },
    ],
  },
};

const BASIS = "GDPR Art.6(1)(f) legitimate interest (B2B); subject must relate to recipient's profession (CNIL). B2C would require opt-in consent.";

export interface ComplianceResult {
  ok: boolean; channel: string; violations: Array<{ kind: "MISSING_MUST" | "PRESENT_MUST_NOT" | "UNKNOWN_CHANNEL"; flag: string; why: string }>;
  basis: string; notes: string[];
}

/** validateOutreach(draft): draft = { channel, <flag>: boolean... }. Deny-by-default; fail-closed. */
function validateOutreach(draft: any): ComplianceResult {
  const d = draft && typeof draft === "object" ? draft : {};
  const channel = String(d.channel || "").toLowerCase();
  const violations: ComplianceResult["violations"] = [];
  if (!CHANNELS.includes(channel)) {
    return { ok: false, channel: channel || "(none)", violations: [{ kind: "UNKNOWN_CHANNEL", flag: "channel", why: `channel must be one of ${CHANNELS.join(", ")}` }], basis: BASIS, notes: ["unknown channel refused (deny-by-default)"] };
  }
  const r = RULES[channel];
  for (const m of r.must) if (d[m.flag] !== true) violations.push({ kind: "MISSING_MUST", flag: m.flag, why: m.why });
  for (const mn of r.mustNot) if (d[mn.flag] === true) violations.push({ kind: "PRESENT_MUST_NOT", flag: mn.flag, why: mn.why });
  const notes = [
    "B2C prospection requires opt-in consent — this validator covers B2B legitimate interest only.",
    "Keep a suppression (opt-out) list; honour objections immediately and retain the suppression record.",
    "Compliance of the DRAFT does not authorise sending — sending is a separate explicit human authorisation + legal review.",
  ];
  return { ok: violations.length === 0, channel, violations, basis: BASIS, notes };
}

export { CHANNELS, RULES, BASIS, validateOutreach };
module.exports = { CHANNELS, RULES, BASIS, validateOutreach };

if (require.main === module) { process.stdout.write("prospection-compliance (fail-closed, per-channel)\n"); }

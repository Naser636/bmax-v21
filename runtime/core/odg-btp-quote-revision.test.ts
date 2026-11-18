#!/usr/bin/env node
"use strict";
/* V319 §7 — tests for odg-btp-quote-revision (quote + justified revisions, explicit approval, owner-gated send). PURE. */
const Q = require("./odg-btp-quote-revision.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // open
  const o = Q.openQuote({ chantierId: "C1", currency: "EUR", initialSellingMinor: 100000 });
  check("openQuote valid ⇒ DRAFT, no versions, initial 100000", o.ok && o.quote.status === "DRAFT" && o.quote.versions.length === 0 && o.quote.initialSellingMinor === 100000);
  check("openQuote fail-closed: no chantierId", Q.openQuote({ initialSellingMinor: 1 }).code === "NO_CHANTIER_ID");
  check("openQuote fail-closed: bad initial (negative)", Q.openQuote({ chantierId: "C1", initialSellingMinor: -5 }).code === "BAD_INITIAL_SELLING");

  // revisions must be justified
  const unj = Q.proposeRevision(o.quote, { deltaMinor: 5000 /* no reason/source */ });
  check("unjustified revision ⇒ REJECTED (no reason/source)", unj.code === "UNJUSTIFIED_REVISION");
  const badDelta = Q.proposeRevision(o.quote, { deltaMinor: 1.5, reason: "x", source: "y" });
  check("non-integer delta ⇒ BAD_DELTA", badDelta.code === "BAD_DELTA");
  const neg = Q.proposeRevision(o.quote, { deltaMinor: -200000, reason: "remise", source: "négo-client" });
  check("revision driving selling negative ⇒ REVISION_OUT_OF_RANGE", neg.code === "REVISION_OUT_OF_RANGE");

  // valid revision is appended UNAPPROVED (never auto-approved)
  const p = Q.proposeRevision(o.quote, { deltaMinor: 25000, reason: "avenant: fondations supplémentaires", source: "visite-chantier-2026-11" });
  check("valid revision appended UNAPPROVED", p.ok && p.quote.versions.length === 1 && p.quote.versions[0].approved === false && p.quote.versions[0].id === "v1");
  check("unapproved revision does NOT change revised selling", Q.revisedSellingMinor(p.quote) === 100000);

  // decide requires explicit decision + approver
  check("decide without approver ⇒ NO_APPROVER", Q.decide(p.quote, "v1", { approved: true }).code === "NO_APPROVER");
  check("decide without boolean ⇒ NO_DECISION", Q.decide(p.quote, "v1", { approver: "owner" }).code === "NO_DECISION");
  check("decide on missing version ⇒ NO_SUCH_VERSION", Q.decide(p.quote, "v9", { approved: true, approver: "owner" }).code === "NO_SUCH_VERSION");

  // approve ⇒ revised selling updates (only approved counts)
  const ap = Q.decide(p.quote, "v1", { approved: true, approver: "owner:akabi" });
  check("approved revision ⇒ revised selling 100000+25000 = 125000", ap.ok && Q.revisedSellingMinor(ap.quote) === 125000 && ap.quote.versions[0].approved === true);

  // finance via the real engine: budgetReviseMinor === revisedSellingMinor; SELLING≠COST≠NET distinct fields
  const f = Q.finance(ap.quote);
  check("finance.budgetReviseMinor (SELLING) === revisedSellingMinor (engine-composed)", !!f && f.budgetReviseMinor === 125000);
  check("SELLING≠COST≠NET: cost + margin are separate real fields, not the selling number", !!f && typeof f.coutTotalConstateMinor === "number" && typeof f.margeBruteConstateeMinor === "number" && f.coutTotalConstateMinor !== f.budgetReviseMinor);

  // client send is ALWAYS owner-gated
  check("send default ⇒ OWNER_GATED (not allowed)", Q.sendReadiness(ap.quote, {}).allowed === false && Q.sendReadiness(ap.quote, {}).reason === "OWNER_GATED");
  check("send with explicit owner auth + no pending ⇒ allowed", Q.sendReadiness(ap.quote, { ownerAuthorized: true, owner: "akabi" }).allowed === true);
  check("send blocked while a revision is pending (even with owner auth)", Q.sendReadiness(p.quote, { ownerAuthorized: true, owner: "akabi" }).reason === "PENDING_REVISIONS");

  // determinism + frozen
  const ap2 = Q.decide(Q.proposeRevision(Q.openQuote({ chantierId: "C1", initialSellingMinor: 100000 }).quote, { deltaMinor: 25000, reason: "avenant: fondations supplémentaires", source: "visite-chantier-2026-11" }).quote, "v1", { approved: true, approver: "owner:akabi" });
  check("deterministic (same path ⇒ same revised selling)", Q.revisedSellingMinor(ap2.quote) === 125000);
  check("frozen outputs", Object.isFrozen(ap.quote) && Object.isFrozen(ap.quote.versions) && Object.isFrozen(ap.quote.versions[0]));

  // contract
  check("contract: justified revisions, explicit approval, owner-gated send, SELLING≠COST≠NET, reuses engine", Q.BTP_QUOTE_REVISION_CONTRACT.invariants.some((s: string) => /NEVER auto-approved/.test(s)) && Q.BTP_QUOTE_REVISION_CONTRACT.invariants.some((s: string) => /OWNER_GATED/.test(s)) && Q.BTP_QUOTE_REVISION_CONTRACT.reuses.length === 2);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-quote-revision (§7: justified revisions only, explicit approval [never auto], revised SELLING via chantier-profitability budgetReviseMinor, SELLING≠COST≠NET, client-send ALWAYS owner-gated, deterministic)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

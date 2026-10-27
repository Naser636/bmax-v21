# ODG — Per-channel B2B prospection compliance checklist (V1, 2026-10-27)

Grounded in CNIL (full-text) + GDPR Reg. (EU) 2016/679 + Légifrance. Operationalised by the fail-closed validator
`runtime/core/prospection-compliance.ts` (suite 12/12). **B2B basis = legitimate interest GDPR Art 6(1)(f)** (subject
must relate to the recipient's profession). **B2C requires opt-in consent — out of scope here.** **A compliant draft is
NOT authorisation to send — sending is a separate explicit human authorisation + legal review.**

## Cross-cutting GDPR duties (every channel)
- Document lawful basis (6(1)(f)) + balancing test.
- Art 13/14 information at first contact; **disclose the data SOURCE** when not collected from the person (Art 14(2)(f)).
- Art 21(2) **absolute** right to object for direct marketing — honour immediately, no justification demandable.
- Retention limited (~3 yrs from last contact, CNIL); keep a suppression/opt-out list (Art 30 record; Art 32 security).

## EMAIL — opt-out regime (CNIL)
MUST: sender identified (name+company+SIREN); purpose stated; **offer relates to recipient's profession**; data source
disclosed; simple free opt-out every message; professional address. MUST-NOT: personal address without consent; masked
sender; off-topic offer; imply VAT if under franchise. *(contact@/info@ generic addresses fall outside personal-data rules.)*

## TELEPHONE — B2B opt-out (Bloctel = consumers only)
MUST: identify caller+company; offer relates to profession; honour immediate objection; **target a professional line**.
MUST-NOT: masked/withheld number; rely on Bloctel for B2B (ceases 2026-08-11, only ever covered consumers); call a
**consumer** without prior opt-in consent after 2026-08-11 (Loi 2025-594).

## POSTAL — looser (information + objection)
MUST: inform at data collection; simple free way to object with each mailing; honour access/rectification/objection
within 1 month. MUST-NOT: continue mailing after an objection.

## LINKEDIN / social — GDPR + platform terms
MUST: treat profile data as personal data (lawful basis + Art 14 info); relevant one-to-one outreach tied to the role;
honour opt-out. MUST-NOT: scrape profiles; automated mass-messaging/connection bots; export to a prospection DB without
the Art 14 information + objection right.

## Using the validator
`validateOutreach({ channel, ...flags })` → `{ ok, violations[], basis, notes }`. Deny-by-default: unknown channel
refused; any missing MUST ⇒ `MISSING_MUST`; any present MUST-NOT ⇒ `PRESENT_MUST_NOT`. Run it over every draft in
`PROSPECTION_LETTERS_DRAFT_V1.md` before proposing a send to the CTO.

## Sources
CNIL prospection email / téléphone / courrier postal (full-text, 2026-10-27); Légifrance Loi 2025-594 + Art L223-1 ss
C. consommation (full-text); GDPR CELEX 32016R0679 Art 6/13/14/21/5/30 (EUR-Lex metadata-only + consolidated text).

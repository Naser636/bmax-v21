#!/usr/bin/env node
"use strict";
/*
 * FRENCH COMMERCIAL IDENTIFIER VALIDATION — SIREN/SIRET (Luhn) + IBAN (ISO 13616 mod-97). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): the einvoice stack handles VAT AMOUNTS but validates no identifier CHECKSUMS; no Luhn/mod-97
 * exists anywhere. Useful for the BTP commercial stack — e.g. validate a payee IBAN before the supplier-commitment
 * payout (#709), or a client/supplier SIRET at intake.
 *
 * THE HARD HONESTY BOUNDARY (do not over-claim): these validate FORMAT + CHECK DIGITS ONLY. A pass means the identifier
 * is WELL-FORMED — NOT that the bank account or company actually EXISTS, is ACTIVE, or belongs to anyone. Confirming
 * existence requires an external registry (INSEE / bank directory), which is NOT done here (no network). A valid
 * checksum is necessary, never sufficient. Known limitation: La Poste SIRET establishments use a documented Luhn
 * EXCEPTION (digit-sum multiple of 5) that is NOT handled here — a false-negative is possible for those (flagged).
 * No network/clock/randomness.
 */

function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function freeze(o: any): any { return Object.freeze(o); }
function digits(s: string): boolean { return /^[0-9]+$/.test(s); }

/** Luhn checksum over a digit string (used by SIREN/SIRET/cards). Returns true if the Luhn sum % 10 === 0. */
function luhnValid(numStr: string): boolean {
  if (!digits(numStr)) return false;
  let sum = 0, dbl = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let d = numStr.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** validateSiren(siren) -> { ok, valid, reason }. 9 digits, Luhn-valid. FORMAT+CHECKSUM only (not existence). */
function validateSiren(siren: any): any {
  if (!isStr(siren)) return freeze({ ok: false, code: "NOT_STRING" });
  const s = siren.replace(/\s/g, "");
  if (!digits(s)) return freeze({ ok: true, valid: false, reason: "non-digit characters" });
  if (s.length !== 9) return freeze({ ok: true, valid: false, reason: `SIREN must be 9 digits (got ${s.length})` });
  const valid = luhnValid(s);
  return freeze({ ok: true, valid, reason: valid ? "well-formed (Luhn OK) — NOT a confirmation the company exists/is active" : "Luhn check failed" });
}

/** validateSiret(siret) -> { ok, valid, siren, nic, reason }. 14 digits = SIREN(9)+NIC(5), Luhn over all 14. */
function validateSiret(siret: any): any {
  if (!isStr(siret)) return freeze({ ok: false, code: "NOT_STRING" });
  const s = siret.replace(/\s/g, "");
  if (!digits(s)) return freeze({ ok: true, valid: false, reason: "non-digit characters" });
  if (s.length !== 14) return freeze({ ok: true, valid: false, reason: `SIRET must be 14 digits (got ${s.length})` });
  const valid = luhnValid(s);
  return freeze({ ok: true, valid, siren: s.slice(0, 9), nic: s.slice(9),
    reason: valid ? "well-formed (Luhn OK) — NOT a confirmation the establishment exists/is active; La Poste SIRET Luhn-exception not handled (possible false-negative)" : "Luhn check failed (note: La Poste SIRET use a documented exception not handled here)" });
}

// IBAN length per country (ISO 13616). Unknown country ⇒ length not enforced, mod-97 still applied.
const IBAN_LEN: Record<string, number> = Object.freeze({ FR: 27, GB: 22, DE: 22, ES: 24, IT: 27, BE: 16, NL: 18, CH: 21, LU: 20, PT: 25, IE: 22, AT: 20, MC: 27 } as any);

function mod97(numStr: string): number { let rem = 0; for (let i = 0; i < numStr.length; i++) rem = (rem * 10 + (numStr.charCodeAt(i) - 48)) % 97; return rem; }

/** validateIban(iban) -> { ok, valid, country, reason }. ISO 13616: rearrange, letters→numbers, mod 97 === 1. FORMAT+CHECKSUM only. */
function validateIban(iban: any): any {
  if (!isStr(iban)) return freeze({ ok: false, code: "NOT_STRING" });
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(s) || s.length < 15 || s.length > 34) return freeze({ ok: true, valid: false, reason: "bad IBAN structure (expect 2 letters + 2 digits + up to 30 alphanumerics, length 15–34)" });
  const country = s.slice(0, 2);
  const expectLen = IBAN_LEN[country];
  if (expectLen !== undefined && s.length !== expectLen) return freeze({ ok: true, valid: false, country, reason: `length ${s.length} ≠ expected ${expectLen} for ${country}` });
  const rearranged = s.slice(4) + s.slice(0, 4);
  let numeric = "";
  for (let i = 0; i < rearranged.length; i++) { const c = rearranged.charCodeAt(i); numeric += (c >= 65 && c <= 90) ? String(c - 55) : rearranged[i]; } // A→10 … Z→35
  const valid = mod97(numeric) === 1;
  return freeze({ ok: true, valid, country, lengthChecked: expectLen !== undefined,
    reason: valid ? "well-formed (mod-97 check digits OK) — NOT a confirmation the account exists/is active/belongs to anyone" : "mod-97 check digits invalid" });
}

const FR_IDENTIFIER_VALIDATION_CONTRACT = Object.freeze({
  id: "FR-IDENTIFIER-VALIDATION",
  purpose: "SIREN/SIRET (Luhn) + IBAN (ISO 13616 mod-97) FORMAT+CHECKSUM validation for the commercial stack — the gap next to the einvoice VAT-amount handling",
  reuses: Object.freeze(["standard algorithms (Luhn, ISO 13616 mod-97); no external registry — composes with odg-btp-supplier-commitment payout / client intake"]),
  invariants: Object.freeze([
    "validates FORMAT + CHECK DIGITS ONLY — a pass is WELL-FORMED, NOT a confirmation the account/company EXISTS, is ACTIVE, or belongs to anyone (needs an external registry; NO network here)",
    "a valid checksum is NECESSARY, never SUFFICIENT — never report an identifier as 'verified'/'real' on the checksum alone",
    "La Poste SIRET use a documented Luhn EXCEPTION not handled here — a false-negative is possible (flagged, not hidden)",
    "fail-closed: wrong length / non-digit / bad structure ⇒ valid:false with a reason (malformed input ⇒ ok:false)",
    "PURE + deterministic; no network/clock/randomness",
  ]),
});

module.exports = { luhnValid, validateSiren, validateSiret, validateIban, FR_IDENTIFIER_VALIDATION_CONTRACT };
export {};

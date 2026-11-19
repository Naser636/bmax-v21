#!/usr/bin/env node
"use strict";
/* Tests for odg-fr-identifier-validation (SIREN/SIRET Luhn + IBAN mod-97). PURE. Values are known-valid identifiers. */
const V = require("./odg-fr-identifier-validation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // Luhn: classic test number 79927398713 is Luhn-valid; flip a digit ⇒ invalid
  check("luhn 79927398713 valid; 79927398714 invalid", V.luhnValid("79927398713") === true && V.luhnValid("79927398714") === false);
  check("luhn rejects non-digits", V.luhnValid("7992739871X") === false);

  // SIREN (9 digits, Luhn): 404833048 valid; flip check digit ⇒ invalid
  check("SIREN 404833048 valid", V.validateSiren("404833048").valid === true);
  check("SIREN 404833049 invalid (Luhn fails)", V.validateSiren("404833049").valid === false);
  check("SIREN accepts spaces (404 833 048)", V.validateSiren("404 833 048").valid === true);
  check("SIREN wrong length ⇒ invalid with reason", (() => { const r = V.validateSiren("40483304"); return r.valid === false && /9 digits/.test(r.reason); })());
  check("SIREN non-digit ⇒ invalid", V.validateSiren("40483304X").valid === false);
  check("SIREN reason disclaims existence", /NOT a confirmation the company exists/.test(V.validateSiren("404833048").reason));

  // SIRET (14 = SIREN+NIC, Luhn-14): 73282932000074 valid; splits siren/nic
  const st = V.validateSiret("73282932000074");
  check("SIRET 73282932000074 valid, siren 732829320, nic 00074", st.valid === true && st.siren === "732829320" && st.nic === "00074");
  check("SIRET 73282932000075 invalid", V.validateSiret("73282932000075").valid === false);
  check("SIRET wrong length ⇒ invalid", /14 digits/.test(V.validateSiret("7328293200007").reason));
  check("SIRET reason flags La Poste exception not handled", /La Poste/.test(st.reason));

  // IBAN (ISO 13616 mod-97): known-valid GB + FR; corrupted ⇒ invalid
  check("IBAN GB82WEST12345698765432 valid, country GB", (() => { const r = V.validateIban("GB82WEST12345698765432"); return r.valid === true && r.country === "GB" && r.lengthChecked === true; })());
  check("IBAN FR1420041010050500013M02606 valid", V.validateIban("FR1420041010050500013M02606").valid === true);
  check("IBAN FR7630006000011234567890189 valid", V.validateIban("FR7630006000011234567890189").valid === true);
  check("IBAN accepts spaces/lowercase", V.validateIban("gb82 west 1234 5698 7654 32").valid === true);
  check("IBAN corrupted check digits ⇒ invalid", V.validateIban("GB82WEST12345698765433").valid === false);
  check("IBAN wrong length for country ⇒ invalid", (() => { const r = V.validateIban("FR142004101005050001"); return r.valid === false && /expected 27 for FR/.test(r.reason); })());
  check("IBAN bad structure ⇒ invalid with reason", /bad IBAN structure/.test(V.validateIban("12AB").reason));
  check("IBAN reason disclaims account existence", /NOT a confirmation the account exists/.test(V.validateIban("GB82WEST12345698765432").reason));

  // malformed input ⇒ ok:false
  check("non-string SIREN ⇒ NOT_STRING", V.validateSiren(123).code === "NOT_STRING");
  check("non-string IBAN ⇒ NOT_STRING", V.validateIban(null).code === "NOT_STRING");

  // honesty + determinism + frozen + contract
  check("contract: format+checksum ONLY not existence, checksum necessary not sufficient, La Poste flagged, fail-closed",
    V.FR_IDENTIFIER_VALIDATION_CONTRACT.invariants.some((s: string) => /FORMAT \+ CHECK DIGITS ONLY/.test(s)) &&
    V.FR_IDENTIFIER_VALIDATION_CONTRACT.invariants.some((s: string) => /NECESSARY, never SUFFICIENT/.test(s)) &&
    V.FR_IDENTIFIER_VALIDATION_CONTRACT.invariants.some((s: string) => /La Poste/.test(s)) &&
    V.FR_IDENTIFIER_VALIDATION_CONTRACT.invariants.some((s: string) => /fail-closed/.test(s)));
  check("deterministic", JSON.stringify(V.validateIban("GB82WEST12345698765432")) === JSON.stringify(V.validateIban("GB82WEST12345698765432")));
  check("frozen", Object.isFrozen(st) && Object.isFrozen(V.validateIban("GB82WEST12345698765432")));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-fr-identifier-validation (Luhn 79927398713; SIREN 404833048 valid/049 invalid; SIRET 73282932000074 valid [siren/nic split]; IBAN GB82…+FR… mod-97 valid, corrupted/wrong-length invalid; spaces/case tolerant; HONEST: format+checksum ONLY not existence, La Poste exception flagged; fail-closed; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

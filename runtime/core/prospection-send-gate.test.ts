#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the pre-send gate is fail-closed: default ⇒ BLOCKED (channel+address+auth
// missing); all controls + a configured+enabled channel ⇒ ADMIT; any single missing control ⇒ BLOCKED; opt-out blocks;
// dryRun reports config without sending and sendEnabled stays false in the real (unconfigured) env. Never sends.
"use strict";
const assert = require("assert");
const G = require("./prospection-send-gate.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const human = { by: "human", owner: "CTO" };
// A fully-configured + send-enabled channel (mock env; NO real secret, NO send).
const sendEnv = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "x@gmail.com", SMTP_PASS: "app-pw", EMAIL_SEND_ENABLED: "1" };
const readyEntry = { addressVerified: true, messageFinal: true, compliance: { ok: true } };

// (1) default (nothing configured) ⇒ BLOCKED with multiple blockers incl. channel + address + auth.
const d = G.preflight({ entry: {}, env: {}, authorization: {} });
ok("default ⇒ BLOCKED, channel+address+auth among blockers", d.admit === false && d.verdict === "BLOCKED" && d.blockers.length >= 3 && d.blockers.some(b => /channel/.test(b)));
// (2) all controls + configured+enabled channel ⇒ ADMIT.
const adm = G.preflight({ entry: readyEntry, env: sendEnv, authorization: human, optedOut: false });
ok("all controls + enabled channel ⇒ ADMIT", adm.admit === true && adm.verdict === "ADMIT" && adm.blockers.length === 0);
// (3) missing address ⇒ BLOCKED (never invent).
ok("unverified address ⇒ BLOCKED", G.preflight({ entry: { ...readyEntry, addressVerified: false }, env: sendEnv, authorization: human }).admit === false);
// (4) missing CTO auth ⇒ BLOCKED (config ≠ authorisation).
ok("no CTO auth ⇒ BLOCKED (config≠authorisation)", G.preflight({ entry: readyEntry, env: sendEnv, authorization: {} }).admit === false);
// (5) channel configured but EMAIL_SEND_ENABLED unset ⇒ BLOCKED (default-disabled).
ok("SMTP set but send not enabled ⇒ BLOCKED", G.preflight({ entry: readyEntry, env: { ...sendEnv, EMAIL_SEND_ENABLED: "0" }, authorization: human }).admit === false);
// (6) opt-out ⇒ BLOCKED.
ok("opted-out ⇒ BLOCKED", G.preflight({ entry: readyEntry, env: sendEnv, authorization: human, optedOut: true }).admit === false);
// (7) compliance not passed ⇒ BLOCKED.
ok("compliance not ok ⇒ BLOCKED", G.preflight({ entry: { ...readyEntry, compliance: { ok: false } }, env: sendEnv, authorization: human }).admit === false);

// (8) dryRun on the REAL env (unconfigured) ⇒ sendEnabled false, willSend false (fail-closed, no send).
const dr = G.dryRun({ env: {} });
ok("dryRun unconfigured ⇒ sendEnabled false + willSend false", dr.sendEnabled === false && dr.willSend === false);
// (9) dryRun on a configured env ⇒ reports enabled but still willSend false (gate still required).
ok("dryRun configured ⇒ enabled true but willSend stays false", G.dryRun({ env: sendEnv }).sendEnabled === true && G.dryRun({ env: sendEnv }).willSend === false);
// (10) note states config ≠ authorisation.
ok("note: config ≠ authorisation", /NOT a legal\/commercial authorisation/.test(d.note));

console.log(`\nPROSPECTION-SEND-GATE suite — ${pass} assertions passed. (fail-closed pre-send; never sends; config≠auth)`);

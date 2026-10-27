#!/usr/bin/env node
/**
 * prospection-send-gate — the single FAIL-CLOSED pre-send decision (mandate V13 §4/§5). Before any outreach is sent it
 * aggregates ALL required controls into one ADMIT/BLOCKED verdict: verified recipient address, finalised message,
 * passing compliance, an authenticated+enabled send channel (reuses email-gateway.outboundReadiness), no known opt-out,
 * and an explicit human CTO authorisation. ANY missing control ⇒ BLOCKED with the exact blocker. It NEVER sends and has
 * no secrets: it only reads the channel-readiness flags and the caller-asserted control states. dryRun() reports channel
 * configuration WITHOUT sending and asserts sendEnabled stays false until fully configured. A technical configuration is
 * NOT a legal/commercial authorisation — both are required. Pure/deterministic.
 */
"use strict";

const GATEWAY = require("./email-gateway.js");

/**
 * preflight({ entry, env, authorization, optedOut }): entry = { addressVerified, messageFinal, compliance:{ok} };
 * authorization = { by:"human", owner }. Returns { admit, verdict, checks, blockers }.
 */
function preflight(opts: any): any {
  const o = opts || {};
  const e = o.entry || {};
  const auth = o.authorization || {};
  const outbound = GATEWAY.outboundReadiness({ env: o.env });    // reuse: no secret read here, only flags
  const checks = {
    addressVerified: e.addressVerified === true,
    messageFinal: e.messageFinal === true,
    complianceOk: !!(e.compliance && e.compliance.ok === true),
    channelReady: outbound.state === GATEWAY.STATE.READY && outbound.sendEnabled === true,
    notOptedOut: o.optedOut !== true,
    ctoAuthorized: auth.by === "human" && typeof auth.owner === "string" && auth.owner.trim().length > 0,
  };
  const blockers: string[] = [];
  if (!checks.addressVerified) blockers.push("recipient professional address NOT verified (never invent one)");
  if (!checks.messageFinal) blockers.push("message not finalised");
  if (!checks.complianceOk) blockers.push("compliance check not passed");
  if (!checks.channelReady) blockers.push(`send channel not ready (${outbound.state}, sendEnabled=${outbound.sendEnabled}) — configure SMTP + EMAIL_SEND_ENABLED=1`);
  if (!checks.notOptedOut) blockers.push("prospect has opted out");
  if (!checks.ctoAuthorized) blockers.push("no explicit human CTO send authorisation");
  const admit = blockers.length === 0;
  return { admit, verdict: admit ? "ADMIT" : "BLOCKED", checks, blockers, note: "a technical channel config is NOT a legal/commercial authorisation — both are required; this gate never sends." };
}

/** dryRun({ env }): report channel configuration WITHOUT sending; sendEnabled must stay false until fully configured. */
function dryRun(opts: any): any {
  const outbound = GATEWAY.outboundReadiness({ env: (opts || {}).env });
  return {
    channelState: outbound.state, sendEnabled: outbound.sendEnabled, tls: outbound.tls,
    willSend: false,
    note: outbound.sendEnabled ? "channel configured + send-enabled; actual send still requires preflight ADMIT (address/message/compliance/auth/no-opt-out)" : "channel NOT send-enabled — fail-closed; no message can be sent",
  };
}

export { preflight, dryRun };
module.exports = { preflight, dryRun };

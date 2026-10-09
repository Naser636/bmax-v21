#!/usr/bin/env node
"use strict";

/*
 * LAUNCH READINESS — one centralized check across the commercial chain, distinguishing
 * READY / NOT_CONFIGURED / BLOCKED / TEST_MODE per capability, from REAL controls (not mere env presence).
 * Read-only; composes the existing modules. No new governance.
 */

const fs = require("fs");
const path = require("path");
const email = require("./email-gateway");
const invoicing = require("./invoicing");
const payments = require("./payments");

const S = Object.freeze({ READY: "READY", NOT_CONFIGURED: "NOT_CONFIGURED", BLOCKED: "BLOCKED", TEST_MODE: "TEST_MODE" });

function moduleLoads(rel) { try { require.resolve(path.resolve(__dirname, rel)); return true; } catch { return false; } }

// Persistence control: can we actually write+read+remove under the client store? (not just "dir exists").
function persistenceCheck(cwd) {
  try {
    const d = path.resolve(cwd || process.cwd(), "runtime/generated/clients");
    fs.mkdirSync(d, { recursive: true });
    const probe = path.join(d, ".readiness-probe");
    fs.writeFileSync(probe, "ok"); const back = fs.readFileSync(probe, "utf8"); fs.rmSync(probe, { force: true });
    return back === "ok" ? S.READY : S.BLOCKED;
  } catch { return S.BLOCKED; }
}

function assess(opts = {}) {
  const env = opts && opts.env ? opts.env : process.env;
  const cwd = opts && opts.cwd;
  const inbound = email.inboundReadiness({ env });
  const outbound = email.outboundReadiness({ env });
  const fiscal = invoicing.fiscalReadiness({ env });
  const pay = payments.readiness({ env });

  const caps = {
    intake: { state: moduleLoads("./client-intake.js") ? S.READY : S.BLOCKED },
    persistence: { state: persistenceCheck(cwd) },
    siteBackend: { state: S.NOT_CONFIGURED, note: "static site + mailto; no hosted form backend — intake-endpoint handler ready to mount (see LAUNCH_READINESS.md)" },
    emailInbound: { state: inbound.state === "READY" ? S.READY : S.NOT_CONFIGURED },
    emailOutbound: { state: outbound.state === "READY" ? (outbound.sendEnabled ? S.READY : S.TEST_MODE) : S.NOT_CONFIGURED, sendEnabled: outbound.sendEnabled },
    quote: { state: moduleLoads("./quote.js") ? S.READY : S.BLOCKED },
    invoicingEngine: { state: moduleLoads("./invoicing.js") ? S.READY : S.BLOCKED },
    fiscalParams: { state: fiscal.state === "READY" ? S.READY : S.NOT_CONFIGURED, missing: fiscal.missing },
    payments: { state: pay.state }, // NOT_CONFIGURED | TEST_MODE | READY
    evidenceStore: { state: persistenceCheck(cwd) },
    delivery: { state: moduleLoads("./pilot-delivery-packager.js") ? S.READY : S.BLOCKED },
  };

  // Mandatory-to-operate-locally: code capabilities + persistence. Mandatory-to-LAUNCH-externally add
  // email inbound + fiscal params + a payment mode (TEST_MODE acceptable for a controlled launch).
  const codeReady = [caps.intake, caps.persistence, caps.quote, caps.invoicingEngine, caps.delivery, caps.evidenceStore].every((c) => c.state === S.READY);
  const launchConfigured = caps.emailInbound.state === S.READY && caps.fiscalParams.state === S.READY && (caps.payments.state === S.TEST_MODE || caps.payments.state === S.READY);

  const blockers = [];
  for (const [k, c] of Object.entries(caps)) if (c.state === S.BLOCKED) blockers.push(k);
  const notConfigured = Object.entries(caps).filter(([, c]) => c.state === S.NOT_CONFIGURED).map(([k]) => k);

  let overall;
  if (blockers.length) overall = S.BLOCKED;
  else if (codeReady && launchConfigured) overall = caps.payments.state === S.TEST_MODE ? S.TEST_MODE : S.READY;
  else overall = S.NOT_CONFIGURED;

  return Object.freeze({
    overall, codeReady, launchConfigured,
    capabilities: caps, blockers, notConfigured,
    humanPrerequisites: Object.freeze([
      "a real qualified client + bounded written scope",
      "human authorization grant per consequential mission capability",
      "approved price/quote (human) — never invented",
      "IMAP (+SMTP) credentials for email; fiscal seller/tax params for invoicing; payment provider+webhook secret",
      "French e-invoicing / mentions légales verification (human/legal) before real external issuance",
    ]),
  });
}

module.exports = { S, assess };

if (require.main === module) { process.stdout.write(JSON.stringify(assess({}), null, 2) + "\n"); }

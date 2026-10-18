/* TypeScript port (faithful transliteration) — parity with runtime/core/email-gateway.js.
 * all-any (explicit) facade: parity proven by the hermetic equivalence bench. Type-suppression pragma
 * REMOVED (TS_NOCHECK_EMAIL_GATEWAY): former TS2451 + the crypto.createHash error were a script-vs-module
 * scope collision (`const crypto=require('crypto')` shadowed by the Web Crypto global) fixed by the
 * `export {}` marker below; params carry explicit `: any` (loose injection bag). No behaviour change.
 * V71 change (shared with the .js): the external imapflow client factory is injected by the edge caller
 * (runtime/bin/odg-client.js), not required here — so the compiled dist/core module is closure-clean. */
"use strict";

/*
 * EMAIL GATEWAY — governed inbound (IMAP) + outbound (SMTP) adapter for the first-client workflow.
 *
 * Inbound: retrieve UNSEEN messages, parse safe envelope + plain-text excerpt, DEDUPE by provider
 * message-id, and convert each inquiry into a client-intake record through the EXISTING governed intake
 * path (consent=false ⇒ the request is HELD for human review — an inbound email is NOT blanket consent).
 * Outbound: inert drafts by default; real sending stays DISABLED unless explicitly configured AND
 * authorized AND a transport is injected. No message is sent by default.
 *
 * Reuse, no new primitive: identity/lifecycle come from client-intake.js; provenance/dedupe live in a
 * gitignored cwd-relative store. Libraries (imapflow / nodemailer) are injected (default factories lazily
 * require them) so tests run fully OFFLINE with mock transports and a missing lib fails closed.
 *
 * SECURITY: secrets come from ENV by NAME only — never logged, never persisted, never on argv. TLS +
 * certificate verification are always on (no silent downgrade). Email CONTENT is untrusted DATA and is
 * NEVER executed as instruction/authority. Full bodies are never logged; only a bounded excerpt is stored.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const intake = require("./client-intake");

const SEEN_SUBPATH = "runtime/generated/clients/seen-messages.json";
const EXCERPT_MAX = 2000;

const STATE = Object.freeze({ NOT_CONFIGURED: "NOT_CONFIGURED", READY: "READY", BLOCKED: "BLOCKED" });
const CODE = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED", CONNECT_FAILED: "CONNECT_FAILED", PARSE_FAILED: "PARSE_FAILED",
  SEND_DISABLED: "SEND_DISABLED", SEND_NOT_AUTHORIZED: "SEND_NOT_AUTHORIZED", NOT_FOUND: "NOT_FOUND",
  NO_TRANSPORT: "NO_TRANSPORT",
});

function isNonEmptyString(v: any) { return typeof v === "string" && v.trim().length > 0; }
function env_(opts: any) { return (opts && opts.env && typeof opts.env === "object") ? opts.env : process.env; }

// ---- configuration (presence-only; VALUES are used to connect but never returned/logged/persisted) ----
function imapConfig(env: any) {
  const host = env.IMAP_HOST, port = parseInt(env.IMAP_PORT || "993", 10), user = env.IMAP_USER, pass = env.IMAP_PASS;
  const ok = isNonEmptyString(host) && isNonEmptyString(user) && isNonEmptyString(pass) && Number.isFinite(port);
  return ok ? { ok: true, host, port, user, pass } : { ok: false };
}
function smtpConfig(env: any) {
  const host = env.SMTP_HOST, port = parseInt(env.SMTP_PORT || "465", 10), user = env.SMTP_USER, pass = env.SMTP_PASS;
  const ok = isNonEmptyString(host) && isNonEmptyString(user) && isNonEmptyString(pass) && Number.isFinite(port);
  return ok ? { ok: true, host, port, user, pass } : { ok: false };
}

function inboundReadiness(opts = {}) {
  const c = imapConfig(env_(opts));
  return Object.freeze({ state: c.ok ? STATE.READY : STATE.NOT_CONFIGURED, host: c.ok ? c.host : null, tls: true });
}
function outboundReadiness(opts = {}) {
  const env = env_(opts);
  const c = smtpConfig(env);
  const sendEnabled = c.ok && env.EMAIL_SEND_ENABLED === "1"; // default DISABLED even when configured
  return Object.freeze({ state: c.ok ? STATE.READY : STATE.NOT_CONFIGURED, host: c.ok ? c.host : null, tls: true, sendEnabled });
}

// ---- dedupe / provenance store (no credentials, no full body) ----
function seenPath(cwd: any) { return path.resolve(cwd || process.cwd(), SEEN_SUBPATH); }
function readSeen(cwd: any) { try { return JSON.parse(fs.readFileSync(seenPath(cwd), "utf8")); } catch { return {}; } }
function writeSeen(cwd: any, obj: any) { const p = seenPath(cwd); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function msgKey(messageId: any) { return crypto.createHash("sha256").update(String(messageId)).digest("hex").slice(0, 24); }

// DEPENDENCY INVERSION (V71, closure-clean): the real IMAP client factory lazily required "imapflow", an
// EXTERNAL npm package. A dist/core module may require only builtins + co-located relative siblings
// (build-dist-closure rejects any external require so the compiled runtime stays self-contained), so the
// imapflow construction — a pure edge I/O concern — now lives at the CALLER (runtime/bin/odg-client.js),
// which injects it as `imapFactory`. fetchInbound keeps its existing injection seam; with NO factory it
// fails closed (NO_TRANSPORT), exactly as before when the lib was missing. Tests inject a mock factory.

function safeExcerpt(text: any) {
  const s = typeof text === "string" ? text : "";
  return s.length > EXCERPT_MAX ? s.slice(0, EXCERPT_MAX) : s;
}

/**
 * fetchInbound({env, cwd, imapFactory, now}) — connect, read UNSEEN, dedupe, convert to HELD intake records.
 * Email content is treated strictly as DATA. Returns a frozen summary; fails closed (never throws to caller).
 */
async function fetchInbound(opts: any = {}) {
  const env = env_(opts), cwd = opts.cwd;
  const cfg = imapConfig(env);
  if (!cfg.ok) return Object.freeze({ ok: false, code: CODE.NOT_CONFIGURED });
  // The IMAP client factory is INJECTED (edge I/O; see the dependency-inversion note above). No factory ⇒
  // fail closed (NO_TRANSPORT) — identical to the historical "imapflow missing ⇒ fail closed" behaviour.
  const factory = typeof opts.imapFactory === "function" ? opts.imapFactory : null;
  if (!factory) return Object.freeze({ ok: false, code: CODE.NO_TRANSPORT });

  let client;
  try { client = factory(cfg); } catch { return Object.freeze({ ok: false, code: CODE.NO_TRANSPORT }); }
  const seen = readSeen(cwd);
  const created = [], skipped = [];
  try {
    await client.connect();
    const messages = await client.fetchAllUnseen(); // mock-friendly seam; default wrapper below adapts imapflow
    for (const m of Array.isArray(messages) ? messages : []) {
      const messageId = isNonEmptyString(m && m.messageId) ? m.messageId : null;
      if (!messageId) { skipped.push({ reason: CODE.PARSE_FAILED }); continue; }
      const key = msgKey(messageId);
      if (seen[key]) { skipped.push({ messageId, reason: "DUPLICATE" }); continue; }
      const from = isNonEmptyString(m.from) ? m.from : "unknown";
      const subject = isNonEmptyString(m.subject) ? m.subject : "(no subject)";
      // consent=false ⇒ intake marks HELD (human qualification required). Content stored as DATA only.
      const res = intake.intake({
        client: from,
        problem: `${subject}\n\n${safeExcerpt(m.text)}`,
        scope: "", acceptance: "", humanOwner: "", consent: false,
        source: "email-inbound",
      }, { cwd });
      seen[key] = { requestId: res.requestId, from, subject, date: isNonEmptyString(m.date) ? m.date : null, status: res.status };
      created.push({ messageId, requestId: res.requestId, status: res.status });
    }
    writeSeen(cwd, seen);
    try { await client.logout(); } catch { /* best-effort */ }
    return Object.freeze({ ok: true, fetched: created.length + skipped.length, created, duplicates: skipped.filter((s) => s.reason === "DUPLICATE").length, skipped });
  } catch {
    try { await client.logout(); } catch { /* ignore */ }
    return Object.freeze({ ok: false, code: CODE.CONNECT_FAILED });
  }
}

/** prepareResponseDraft — inert draft tied to a client-intake record; never sends. */
function prepareResponseDraft(requestId: any, opts: any = {}) {
  const rec = intake.get(requestId, { cwd: opts.cwd });
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  return Object.freeze({ ok: true, requestId, draft: Object.freeze({ to: rec.humanOwner || rec.client || null, subjectFr: "Votre demande — prochaines étapes", bodyRef: "FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET.md §6", sendEnabled: false, sentBy: "HUMAN_ONLY" }) });
}

/**
 * sendResponse({env, requestId, transportFactory, authorization, cwd}) — fail-closed. Sending requires:
 * (1) SMTP configured AND EMAIL_SEND_ENABLED=1, (2) a human authorization grant, (3) an injected transport.
 * By default none holds ⇒ SEND_DISABLED. No real transport is constructed here.
 */
async function sendResponse(opts: any = {}) {
  const ob = outboundReadiness(opts);
  if (!ob.sendEnabled) return Object.freeze({ ok: false, sent: false, code: CODE.SEND_DISABLED });
  const auth = opts.authorization;
  if (!(auth && auth.human === true && isNonEmptyString(auth.owner))) return Object.freeze({ ok: false, sent: false, code: CODE.SEND_NOT_AUTHORIZED });
  if (typeof opts.transportFactory !== "function") return Object.freeze({ ok: false, sent: false, code: CODE.NO_TRANSPORT });
  const rec = intake.get(opts.requestId, { cwd: opts.cwd });
  if (!rec) return Object.freeze({ ok: false, sent: false, code: CODE.NOT_FOUND });
  const transport = opts.transportFactory(smtpConfig(env_(opts)));
  const info = await transport.sendMail({ to: rec.humanOwner || rec.client, subject: opts.subject || "Re: your request", text: opts.text || "" });
  return Object.freeze({ ok: true, sent: true, messageId: info && info.messageId ? info.messageId : null, authorizedBy: auth.owner });
}

module.exports = { STATE, CODE, inboundReadiness, outboundReadiness, fetchInbound, prepareResponseDraft, sendResponse };

if (require.main === module) {
  // Safe summary only — never prints secrets or message bodies.
  process.stdout.write(JSON.stringify({ inbound: inboundReadiness({}), outbound: outboundReadiness({}) }, null, 2) + "\n");
}

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope so top-level consts
// (fs/path/crypto/intake/CODE) do not collide with sibling script files / Web globals (TS2451/TS2339 crypto).
export {};

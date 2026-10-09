#!/usr/bin/env node
"use strict";

/*
 * odg client — operational entry point for the first supervised client request.
 *
 * Reuses the EXISTING CLI architecture (one runtime/bin/odg-*.js per `odg <cmd>`) and delegates ALL logic
 * to runtime/core/client-intake.js (no logic duplicated, no new primitive). It is the supported, local,
 * email-independent way to submit/retrieve/track a client request and gate delivery.
 *
 * Safety: the request payload is read from a FILE (never from argv ⇒ no secrets in the process table). Only
 * the whitelisted record is ever printed (client-intake persists no secrets). Email sending stays disabled.
 * `--cwd <dir>` isolates storage (used by tests) ; default is the repo cwd.
 */

const fs = require("fs");
const intake = require("../core/client-intake");
const email = require("../core/email-gateway");

function parseFlags(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--human") flags.human = true;
    else if (a === "--cwd") flags.cwd = argv[++i];
    else if (a === "--owner") flags.owner = argv[++i];
    else if (a === "--reason") flags.reason = argv[++i];
    else pos.push(a);
  }
  return { flags, pos };
}

function out(obj, code) { process.stdout.write(JSON.stringify(obj, null, 2) + "\n"); process.exit(code); }
function readJsonFile(file) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, "utf8")) }; }
  catch (e) { return { ok: false, error: String(e && e.code || e.message || e) }; }
}

function main() {
  const [sub, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseFlags(rest);
  const opts = { cwd: flags.cwd };

  switch (sub) {
    case "readiness":
    case undefined:
      return out(intake.readiness(opts), 0);

    case "intake": {
      const file = pos[0];
      if (!file) return out({ ok: false, error: "usage: odg client intake <request.json> [--cwd <dir>]" }, 2);
      const r = readJsonFile(file);
      if (!r.ok) return out({ ok: false, code: "MALFORMED_REQUEST_FILE", detail: r.error }, 3);
      const res = intake.intake(r.value, opts);
      // Print only id/status/missing — never echo the input payload.
      return out({ ok: res.ok, requestId: res.requestId || null, status: res.status, code: res.code || null, missing: res.missing || [] }, res.ok ? 0 : 3);
    }

    case "get": {
      const rec = intake.get(pos[0], opts);
      return rec ? out(rec, 0) : out({ ok: false, code: "NOT_FOUND", requestId: pos[0] || null }, 3);
    }

    case "list":
      return out(intake.list(opts).map((r) => ({ requestId: r.requestId, status: r.status, client: r.client, humanOwner: r.humanOwner })), 0);

    case "transition": {
      const [id, to] = pos;
      if (!id || !to) return out({ ok: false, error: "usage: odg client transition <id> <STATUS> [--human --owner <o> --reason <r>]" }, 2);
      const res = intake.transition(id, to, { cwd: flags.cwd, by: flags.human ? "human" : "odg", owner: flags.owner, reason: flags.reason });
      return out(res, res.ok ? 0 : 3);
    }

    case "draft": {
      const res = intake.prepareEmailDraft(pos[0], pos[1] || "first", opts);
      return out(res, res.ok ? 0 : 3);
    }

    case "deliver": {
      const [id, mission] = pos;
      if (!id || !mission) return out({ ok: false, error: "usage: odg client deliver <id> <MISSION> [--cwd <dir>]" }, 2);
      const res = intake.attachDelivery(id, mission, opts);
      return out(res, res.ok ? 0 : 3);
    }

    // ---- email (inbound IMAP / outbound SMTP). Secrets via ENV only; never on argv. ----
    case "mailbox":
      // Safe readiness summary; prints no secret values.
      return out({ inbound: email.inboundReadiness({}), outbound: email.outboundReadiness({}) }, 0);

    case "fetch":
      // Real inbound retrieval via the default IMAP adapter; fail-closed NOT_CONFIGURED without credentials.
      return email.fetchInbound({ cwd: flags.cwd }).then((r) => out(r, r.ok ? 0 : 3), (e) => out({ ok: false, code: "FETCH_ERROR", detail: String(e && e.message || e) }, 3));

    case "respond-draft": {
      const res = email.prepareResponseDraft(pos[0], opts);
      return out(res, res.ok ? 0 : 3);
    }

    case "launch": {
      // Centralized launch readiness across the commercial chain (READY/NOT_CONFIGURED/BLOCKED/TEST_MODE).
      const r = require("../core/launch-readiness").assess({ cwd: flags.cwd });
      return out(r, r.overall === "BLOCKED" ? 3 : 0);
    }

    default:
      return out({ ok: false, error: `unknown subcommand "${sub}"`, usage: "odg client <readiness|intake <file>|get <id>|list|transition <id> <STATUS>|draft <id> <kind>|deliver <id> <MISSION>|mailbox|fetch|respond-draft <id>|launch>" }, 2);
  }
}

main();

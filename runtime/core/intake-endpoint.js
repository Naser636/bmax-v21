#!/usr/bin/env node
"use strict";

/*
 * INTAKE ENDPOINT — a PURE HTTP-style handler that turns a website form POST into a governed client-intake
 * record. It binds NO server/port here (offline-testable); a host mounts handleIntakeRequest on its own
 * HTTP layer. It validates method/content-type/size (basic abuse limits), parses JSON as UNTRUSTED data,
 * persists via client-intake, and CONFIRMS receipt ONLY when persistence succeeded (returns the requestId).
 * Incomplete requests persist as HELD and are reported as such (never silently "received"). No secrets echoed.
 *
 * NOTE: the commercial site is static HTML with a mailto: contact link — there is no hosted form backend.
 * This handler is the compatible entry point; see LAUNCH_READINESS.md for the hosting configuration needed.
 */

const intake = require("./client-intake");

const MAX_BODY_BYTES = 16 * 1024; // basic abuse cap; network-level rate limiting is the host's responsibility

function resp(status, obj) { return Object.freeze({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) }); }
function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * handleIntakeRequest(req, {cwd}) — req = {method, headers, body(string)}. Returns {status, headers, body}.
 */
function handleIntakeRequest(req, opts = {}) {
  if (!isObj(req)) return resp(400, { ok: false, error: "bad request" });
  if (String(req.method || "").toUpperCase() !== "POST") return resp(405, { ok: false, error: "method not allowed; use POST" });
  const ctype = String((req.headers && (req.headers["content-type"] || req.headers["Content-Type"])) || "");
  if (!/application\/json/i.test(ctype)) return resp(415, { ok: false, error: "content-type must be application/json" });
  const body = typeof req.body === "string" ? req.body : "";
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return resp(413, { ok: false, error: "payload too large" });
  let data; try { data = JSON.parse(body); } catch { return resp(400, { ok: false, error: "malformed JSON" }); }
  if (!isObj(data)) return resp(400, { ok: false, error: "JSON object required" });

  // Deployment safety: if the persistent store is not configured/writable, BLOCK cleanly (503) BEFORE any
  // processing — never a silent temporary store, never a misleading success.
  const store = intake.storeState(opts.cwd);
  if (store.state !== "READY") return resp(503, { ok: false, code: "STORE_NOT_CONFIGURED", store: store.state, message: "intake storage not configured" });

  // Map untrusted form fields to the governed intake whitelist. consent must be an explicit boolean true.
  const res = intake.intake({
    client: data.client, problem: data.problem, scope: data.scope, acceptance: data.acceptance,
    humanOwner: data.humanOwner, consent: data.consent === true, source: "site-form",
  }, { cwd: opts.cwd });

  // Persistence succeeded ⇒ a requestId exists (HELD or NEW). Confirm honestly with the real status.
  if (res.requestId) {
    const accepted = res.ok; // ok ⇒ NEW (complete) ; otherwise HELD (incomplete) but PERSISTED
    return resp(accepted ? 201 : 202, { ok: accepted, requestId: res.requestId, status: res.status, missing: res.missing || [], message: accepted ? "request received" : "received; held for human review (incomplete)" });
  }
  return resp(422, { ok: false, status: res.status, code: res.code, missing: res.missing || [], message: "not persisted" });
}

module.exports = { handleIntakeRequest, MAX_BODY_BYTES };

if (require.main === module) { process.stdout.write("intake-endpoint handler (mount on a host HTTP layer)\n"); }

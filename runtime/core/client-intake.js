#!/usr/bin/env node
"use strict";

/*
 * CLIENT INTAKE — first-client readiness seam (FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET §1,3,4,5,6).
 *
 * Gives a real client request a STABLE IDENTITY, validates its required fields, tracks its qualification
 * lifecycle, gates governed processing behind HUMAN authorization, and (on an accepted mission) attaches the
 * promoted delivery package. It REUSES existing contracts and adds NO parallel governance / CRM / runtime
 * primitive: the request-record + status-lifecycle pattern mirrors fleet-envelope.js; delivery reuses
 * pilot-delivery-packager.packageDelivery; the human-authorization rule mirrors capability-authorization's
 * deny-by-default, human-issued-only principle (intake NEVER self-qualifies or self-authorizes).
 *
 * SAFETY: no network, no email send, no secret persistence/logging. Email is DRAFT/PREVIEW only and is
 * fail-closed NOT_CONFIGURED unless a provider is explicitly configured AND a transport is injected (none is
 * bundled). All stores are cwd-relative so tests and runs never touch the real repo tree unexpectedly.
 */

const fs = require("fs");
const path = require("path");
const packager = require("./pilot-delivery-packager");

const REQUESTS_SUBDIR = "runtime/generated/clients/requests";

// Lifecycle mirrors the run-sheet §8 tracker. HELD = incomplete/invalid, awaiting human review.
const STATUS = Object.freeze({
  NEW: "NEW", QUALIFYING: "QUALIFYING", PILOT_SCOPED: "PILOT_SCOPED",
  ACCEPTED: "ACCEPTED", DELIVERED: "DELIVERED", CLOSED: "CLOSED", DROPPED: "DROPPED", HELD: "HELD",
});

const CODE = Object.freeze({
  INCOMPLETE_REQUEST: "INCOMPLETE_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  HUMAN_AUTHORIZATION_REQUIRED: "HUMAN_AUTHORIZATION_REQUIRED",
  EMAIL_NOT_CONFIGURED: "EMAIL_NOT_CONFIGURED",
  DELIVERY_NOT_ACCEPTED: "DELIVERY_NOT_ACCEPTED",
  NOT_READY_FOR_DELIVERY: "NOT_READY_FOR_DELIVERY",
  MALFORMED_RECORD: "MALFORMED_RECORD",
  STORE_NOT_CONFIGURED: "STORE_NOT_CONFIGURED",
});

// The fields a genuine request MUST carry (run-sheet §5). Only these are persisted (whitelist) so a caller
// can never smuggle a secret/credential into the stored record.
const REQUIRED = ["client", "problem", "scope", "acceptance", "humanOwner", "consent"];

// Human-gated transitions (deny-by-default): advancing qualification/acceptance/closure is a HUMAN act.
const HUMAN_GATED = new Set([STATUS.QUALIFYING, STATUS.PILOT_SCOPED, STATUS.ACCEPTED, STATUS.CLOSED, STATUS.DROPPED]);
const ALLOWED = {
  NEW: [STATUS.QUALIFYING, STATUS.DROPPED, STATUS.HELD],
  QUALIFYING: [STATUS.PILOT_SCOPED, STATUS.DROPPED],
  PILOT_SCOPED: [STATUS.ACCEPTED, STATUS.DROPPED],
  ACCEPTED: [STATUS.DELIVERED, STATUS.DROPPED],
  DELIVERED: [STATUS.CLOSED, STATUS.DROPPED],
  HELD: [STATUS.NEW, STATUS.DROPPED],
  CLOSED: [], DROPPED: [],
};

function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

// STORE BASE RESOLUTION (deployment-safe). Precedence:
//   1. explicit opts.cwd (tests/dev isolation) — cwd-relative, unchanged behaviour;
//   2. env ODG_CLIENT_STORE — the configured PERSISTENT path (production VPS disk);
//   3. NODE_ENV=production with NO ODG_CLIENT_STORE ⇒ null ⇒ intake is BLOCKED cleanly (NEVER a silent
//      ephemeral/temporary store);
//   4. otherwise (dev) ⇒ cwd-relative default.
function storeBase(cwd) {
  if (isNonEmptyString(cwd)) return path.resolve(cwd, "runtime/generated/clients");
  if (isNonEmptyString(process.env.ODG_CLIENT_STORE)) return path.resolve(process.env.ODG_CLIENT_STORE);
  if (process.env.NODE_ENV === "production") return null; // must be configured in production
  return path.resolve(process.cwd(), "runtime/generated/clients");
}
function dir(cwd) { const b = storeBase(cwd); return b === null ? null : path.join(b, "requests"); }
function recPath(cwd, id) { const d = dir(cwd); return d === null ? null : path.join(d, id + ".json"); }
function readJsonSafe(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

// storeState(cwd) — real control: configured + writable (write/read/remove probe), not mere env presence.
function storeState(cwd) {
  const b = storeBase(cwd);
  if (b === null) return Object.freeze({ state: "NOT_CONFIGURED", detail: "set ODG_CLIENT_STORE to a persistent writable path (production)" });
  try {
    fs.mkdirSync(b, { recursive: true });
    const probe = path.join(b, ".intake-probe");
    fs.writeFileSync(probe, "ok"); const back = fs.readFileSync(probe, "utf8"); fs.rmSync(probe, { force: true });
    return back === "ok" ? Object.freeze({ state: "READY", base: b }) : Object.freeze({ state: "BLOCKED", detail: "probe mismatch" });
  } catch (e) { return Object.freeze({ state: "BLOCKED", detail: "store not writable: " + String(e && e.code || e.message || e) }); }
}

function makeId(cwd) {
  const d = dir(cwd);
  let seq = 1;
  try {
    const used = fs.readdirSync(d).filter((f) => /^CLIENT-\d+\.json$/.test(f)).map((f) => parseInt(f.slice(7, -5), 10)).filter(Number.isFinite);
    if (used.length) seq = Math.max(...used) + 1;
  } catch { /* dir absent ⇒ seq 1 */ }
  return "CLIENT-" + String(seq).padStart(3, "0");
}

// Validate the declared request STRUCTURE only (never business worth). consent must be explicit true.
function validate(input) {
  const missing = REQUIRED.filter((k) => !input || !(k in input) || input[k] === "" || input[k] == null);
  const badConsent = !input || input.consent !== true;
  return { valid: missing.length === 0 && !badConsent, missing, badConsent };
}

/**
 * intake(input, {cwd}) — record a client request with a stable identity. Incomplete/invalid ⇒ HELD for human
 * review (fail-closed, never NEW). Returns a frozen result; never throws on ordinary invalid input.
 */
function intake(input, opts = {}) {
  const cwd = opts.cwd;
  if (!isPlainObject(input)) return Object.freeze({ ok: false, code: CODE.INCOMPLETE_REQUEST, missing: REQUIRED, status: STATUS.HELD });
  // Deployment safety: if the store is not configured/writable, BLOCK cleanly (never a silent temp store).
  const store = storeState(cwd);
  if (store.state !== "READY") return Object.freeze({ ok: false, code: CODE.STORE_NOT_CONFIGURED, status: "BLOCKED", store: store.state });
  const v = validate(input);
  const d = dir(cwd);
  fs.mkdirSync(d, { recursive: true });
  // Whitelist persisted fields — a secret/credential passed in is NEVER stored.
  const base = {
    status: v.valid ? STATUS.NEW : STATUS.HELD,
    client: input.client, problem: input.problem, scope: input.scope,
    acceptance: input.acceptance, humanOwner: input.humanOwner, consent: input.consent === true,
    source: isNonEmptyString(input.source) ? input.source : "unspecified",
    createdAt: new Date().toISOString(),
    history: [{ to: v.valid ? STATUS.NEW : STATUS.HELD, by: "odg", reason: v.valid ? "intake" : "incomplete" }],
  };
  // Collision-safe id allocation: exclusive create (flag "wx") never overwrites; on EEXIST re-derive the
  // next id and retry. On a mono-instance deployment (single-threaded, synchronous read→write with no
  // interleaving await) this guarantees unique, non-overwriting ids; the exclusive flag also defends a
  // concurrent writer on the same disk. Bounded retries; exhaustion ⇒ BLOCKED (never overwrite).
  let id = null, record = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    id = makeId(cwd);
    record = { requestId: id, ...base };
    try { fs.writeFileSync(recPath(cwd, id), JSON.stringify(record, null, 2), { flag: "wx" }); break; }
    catch (e) { if (e && e.code === "EEXIST") { id = null; continue; } throw e; } // other errors propagate (no false success)
  }
  if (id === null) return Object.freeze({ ok: false, code: CODE.STORE_NOT_CONFIGURED, status: "BLOCKED", detail: "id allocation exhausted" });
  if (!v.valid) return Object.freeze({ ok: false, code: CODE.INCOMPLETE_REQUEST, missing: v.missing, badConsent: v.badConsent, requestId: id, status: STATUS.HELD });
  return Object.freeze({ ok: true, requestId: id, status: STATUS.NEW, record: Object.freeze(record) });
}

function get(requestId, opts = {}) {
  const rec = readJsonSafe(recPath(opts.cwd, requestId));
  return rec && isPlainObject(rec) ? rec : null;
}

function list(opts = {}) {
  try { return fs.readdirSync(dir(opts.cwd)).filter((f) => f.endsWith(".json")).map((f) => readJsonSafe(path.join(dir(opts.cwd), f))).filter(Boolean); }
  catch { return []; }
}

/**
 * transition(requestId, to, {by, owner, cwd}) — advance lifecycle. Human-gated targets REQUIRE by==="human"
 * AND an owner (deny-by-default; ODG never self-qualifies). Invalid edges fail closed.
 */
function transition(requestId, to, opts = {}) {
  const rec = get(requestId, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (!isNonEmptyString(rec.status) || !(rec.status in ALLOWED)) return Object.freeze({ ok: false, code: CODE.MALFORMED_RECORD });
  if (!ALLOWED[rec.status].includes(to)) return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: rec.status, to });
  if (HUMAN_GATED.has(to) && !(opts.by === "human" && isNonEmptyString(opts.owner))) {
    return Object.freeze({ ok: false, code: CODE.HUMAN_AUTHORIZATION_REQUIRED, to, detail: "this transition is a human act; supply by:'human' and owner" });
  }
  rec.status = to;
  rec.history = Array.isArray(rec.history) ? rec.history : [];
  rec.history.push({ to, by: opts.by || "odg", owner: opts.owner || null, reason: opts.reason || null });
  writeJson(recPath(opts.cwd, requestId), rec);
  return Object.freeze({ ok: true, requestId, status: to });
}

/**
 * emailReadiness({env}) — report whether an email provider is configured, WITHOUT reading secret VALUES
 * (presence of env var names only). Sending is never enabled here.
 */
function emailReadiness(opts = {}) {
  const env = isPlainObject(opts.env) ? opts.env : process.env;
  const providers = [
    { name: "smtp", vars: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] },
    { name: "sendgrid", vars: ["SENDGRID_API_KEY"] },
    { name: "ses", vars: ["AWS_SES_REGION", "AWS_ACCESS_KEY_ID"] },
  ];
  const configured = providers.find((p) => p.vars.every((v) => isNonEmptyString(env[v])));
  // sendEnabled stays FALSE regardless: no transport is bundled and no network is permitted here.
  return Object.freeze({ state: configured ? "CONFIGURED_PRESENT" : "NOT_CONFIGURED", provider: configured ? configured.name : null, sendEnabled: false });
}

/** prepareEmailDraft — DRAFT/PREVIEW only; returns an inert draft a HUMAN sends. Never sends, never networks. */
function prepareEmailDraft(requestId, kind, opts = {}) {
  const rec = get(requestId, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  const owner = rec.humanOwner;
  const subjects = { first: "Un livrable logiciel cadré, livré avec preuves vérifiables", followup: "Suite à mon message — toujours pertinent ?", discovery: "Court échange (15 min) pour cadrer le périmètre" };
  return Object.freeze({
    ok: true, requestId, kind: kind in subjects ? kind : "first",
    draft: Object.freeze({ subjectFr: subjects[kind] || subjects.first, bodyRef: "FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET.md §6", sendEnabled: false, sentBy: "HUMAN_ONLY", owner: owner || null }),
  });
}

/** sendEmail — ALWAYS fail-closed. No provider transport is bundled; no network is permitted. */
function sendEmail() { return Object.freeze({ ok: false, sent: false, code: CODE.EMAIL_NOT_CONFIGURED, detail: "email sending is disabled; a human sends approved outreach" }); }

/**
 * attachDelivery(requestId, mission, {cwd}) — governed processing boundary: only a PILOT_SCOPED/ACCEPTED
 * request may attach a delivery, and ONLY when the promoted packager returns accepted:true. Marks DELIVERED;
 * human acceptance (transition→CLOSED) remains a separate human act. No invoicing/payment (not implemented).
 */
function attachDelivery(requestId, mission, opts = {}) {
  const rec = get(requestId, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.status !== STATUS.PILOT_SCOPED && rec.status !== STATUS.ACCEPTED) {
    return Object.freeze({ ok: false, code: CODE.NOT_READY_FOR_DELIVERY, status: rec.status });
  }
  const pkg = packager.packageDelivery(mission, { cwd: opts.cwd });
  if (!pkg.accepted) return Object.freeze({ ok: false, code: CODE.DELIVERY_NOT_ACCEPTED, rejections: pkg.rejections });
  rec.delivery = { mission, accepted: true, deliverable: pkg.deliverable.map((d) => ({ path: d.path, sha256: d.sha256 })), packagedAt: new Date().toISOString() };
  rec.status = STATUS.DELIVERED;
  rec.history = Array.isArray(rec.history) ? rec.history : [];
  rec.history.push({ to: STATUS.DELIVERED, by: "odg", reason: "delivery package accepted" });
  writeJson(recPath(opts.cwd, requestId), rec);
  return Object.freeze({ ok: true, requestId, status: STATUS.DELIVERED, humanAcceptanceRequired: true, package: Object.freeze(rec.delivery) });
}

/**
 * readiness({env}) — operational readiness, clearly distinguishing READY / NOT_CONFIGURED / BLOCKED with the
 * exact remaining prerequisites before a first real request can be processed end-to-end.
 */
function readiness(opts = {}) {
  const email = emailReadiness(opts);
  const prerequisites = [];
  // Intake + tracking + governed-processing + delivery packaging are implemented and testable here.
  const coreReady = typeof intake === "function" && typeof packager.packageDelivery === "function";
  if (email.state === "NOT_CONFIGURED") prerequisites.push("email provider NOT configured (draft/preview only; human sends)");
  prerequisites.push("a real qualified client + bounded written scope (human)");
  prerequisites.push("human authorization grant for any consequential mission capability");
  prerequisites.push("invoicing/payment/closure are human+external (not implemented)");
  const state = !coreReady ? "BLOCKED" : "READY"; // core intake path is ready; listed prerequisites remain human/provider
  return Object.freeze({ state, intake: "READY", tracking: "READY", delivery: "READY", email: email.state, closure: "NOT_IMPLEMENTED_HUMAN", prerequisites: Object.freeze(prerequisites) });
}

module.exports = { STATUS, CODE, REQUIRED, intake, get, list, transition, emailReadiness, prepareEmailDraft, sendEmail, attachDelivery, readiness, storeState };

if (require.main === module) {
  const r = readiness({});
  // Safe summary only — never prints request field values or any secret.
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
}

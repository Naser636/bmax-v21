#!/usr/bin/env node
"use strict";

/*
 * CLIENT INTAKE (TypeScript port; parity with runtime/core/client-intake.js).
 *
 * First-client readiness seam: stable identity + required-field validation + qualification lifecycle +
 * human-gated transitions + (on acceptance) attached delivery package. SAFETY (preserved): no network,
 * no email send (sendEmail ALWAYS fail-closed; emailReadiness reads env var PRESENCE by name only, never
 * VALUES), no secret persistence (whitelist), all stores cwd-relative. Strict port: all 13 exports
 * (STATUS, CODE, REQUIRED, intake, get, list, transition, emailReadiness, prepareEmailDraft, sendEmail,
 * attachDelivery, readiness, storeState), the store-base precedence (opts.cwd > ODG_CLIENT_STORE > prod-
 * null > dev-default), the collision-safe wx id allocation, the HELD fail-closed path, the human-gated
 * deny-by-default transitions and every CODE are preserved EXACTLY. Depends on ./pilot-delivery-packager
 * (already TS, co-located in dist). createdAt/packagedAt keep real timestamps. Historical .js = reference.
 */

const fs = require("fs");
const path = require("path");
const packager = require("./pilot-delivery-packager");

const REQUESTS_SUBDIR = "runtime/generated/clients/requests";

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

// The fields a genuine request MUST carry. Only these are persisted (whitelist) so a caller can never
// smuggle a secret/credential into the stored record.
const REQUIRED = ["client", "problem", "scope", "acceptance", "humanOwner", "consent"];

const HUMAN_GATED = new Set([STATUS.QUALIFYING, STATUS.PILOT_SCOPED, STATUS.ACCEPTED, STATUS.CLOSED, STATUS.DROPPED]);
const ALLOWED: any = {
  NEW: [STATUS.QUALIFYING, STATUS.DROPPED, STATUS.HELD],
  QUALIFYING: [STATUS.PILOT_SCOPED, STATUS.DROPPED],
  PILOT_SCOPED: [STATUS.ACCEPTED, STATUS.DROPPED],
  ACCEPTED: [STATUS.DELIVERED, STATUS.DROPPED],
  DELIVERED: [STATUS.CLOSED, STATUS.DROPPED],
  HELD: [STATUS.NEW, STATUS.DROPPED],
  CLOSED: [], DROPPED: [],
};

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// STORE BASE RESOLUTION (deployment-safe). Precedence: opts.cwd > ODG_CLIENT_STORE > prod-null > dev-default.
function storeBase(cwd: any): any {
  if (isNonEmptyString(cwd)) return path.resolve(cwd, "runtime/generated/clients");
  if (isNonEmptyString(process.env.ODG_CLIENT_STORE)) return path.resolve(process.env.ODG_CLIENT_STORE);
  if (process.env.NODE_ENV === "production") return null; // must be configured in production
  return path.resolve(process.cwd(), "runtime/generated/clients");
}
function dir(cwd: any): any { const b = storeBase(cwd); return b === null ? null : path.join(b, "requests"); }
function recPath(cwd: any, id: any): any { const d = dir(cwd); return d === null ? null : path.join(d, id + ".json"); }
function readJsonSafe(f: any): any { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJson(f: any, o: any): void { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

// storeState(cwd) — real control: configured + writable (write/read/remove probe), not mere env presence.
function storeState(cwd: any): any {
  const b = storeBase(cwd);
  if (b === null) return Object.freeze({ state: "NOT_CONFIGURED", detail: "set ODG_CLIENT_STORE to a persistent writable path (production)" });
  try {
    fs.mkdirSync(b, { recursive: true });
    const probe = path.join(b, ".intake-probe");
    fs.writeFileSync(probe, "ok"); const back = fs.readFileSync(probe, "utf8"); fs.rmSync(probe, { force: true });
    return back === "ok" ? Object.freeze({ state: "READY", base: b }) : Object.freeze({ state: "BLOCKED", detail: "probe mismatch" });
  } catch (e: any) { return Object.freeze({ state: "BLOCKED", detail: "store not writable: " + String(e && e.code || e.message || e) }); }
}

function makeId(cwd: any): string {
  const d = dir(cwd);
  let seq = 1;
  try {
    const used = fs.readdirSync(d).filter((f: any) => /^CLIENT-\d+\.json$/.test(f)).map((f: any) => parseInt(f.slice(7, -5), 10)).filter(Number.isFinite);
    if (used.length) seq = Math.max(...used) + 1;
  } catch { /* dir absent ⇒ seq 1 */ }
  return "CLIENT-" + String(seq).padStart(3, "0");
}

// Validate the declared request STRUCTURE only (never business worth). consent must be explicit true.
function validate(input: any): any {
  const missing = REQUIRED.filter((k) => !input || !(k in input) || input[k] === "" || input[k] == null);
  const badConsent = !input || input.consent !== true;
  return { valid: missing.length === 0 && !badConsent, missing, badConsent };
}

/**
 * intake(input, {cwd}) — record a client request with a stable identity. Incomplete/invalid ⇒ HELD.
 */
function intake(input: any, opts: any = {}): any {
  const cwd = opts.cwd;
  if (!isPlainObject(input)) return Object.freeze({ ok: false, code: CODE.INCOMPLETE_REQUEST, missing: REQUIRED, status: STATUS.HELD });
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
  // Collision-safe id allocation: exclusive create (flag "wx") never overwrites; on EEXIST re-derive + retry.
  let id = null, record = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    id = makeId(cwd);
    record = { requestId: id, ...base };
    try { fs.writeFileSync(recPath(cwd, id), JSON.stringify(record, null, 2), { flag: "wx" }); break; }
    catch (e: any) { if (e && e.code === "EEXIST") { id = null; continue; } throw e; } // other errors propagate
  }
  if (id === null) return Object.freeze({ ok: false, code: CODE.STORE_NOT_CONFIGURED, status: "BLOCKED", detail: "id allocation exhausted" });
  if (!v.valid) return Object.freeze({ ok: false, code: CODE.INCOMPLETE_REQUEST, missing: v.missing, badConsent: v.badConsent, requestId: id, status: STATUS.HELD });
  return Object.freeze({ ok: true, requestId: id, status: STATUS.NEW, record: Object.freeze(record) });
}

function get(requestId: any, opts: any = {}): any {
  const rec = readJsonSafe(recPath(opts.cwd, requestId));
  return rec && isPlainObject(rec) ? rec : null;
}

function list(opts: any = {}): any {
  try { return fs.readdirSync(dir(opts.cwd)).filter((f: any) => f.endsWith(".json")).map((f: any) => readJsonSafe(path.join(dir(opts.cwd), f))).filter(Boolean); }
  catch { return []; }
}

/**
 * transition(requestId, to, {by, owner, cwd}) — advance lifecycle. Human-gated targets REQUIRE by==="human"
 * AND an owner (deny-by-default). Invalid edges fail closed.
 */
function transition(requestId: any, to: any, opts: any = {}): any {
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
 * emailReadiness({env}) — report whether an email provider is configured, WITHOUT reading secret VALUES.
 */
function emailReadiness(opts: any = {}): any {
  const env = isPlainObject(opts.env) ? opts.env : process.env;
  const providers = [
    { name: "smtp", vars: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] },
    { name: "sendgrid", vars: ["SENDGRID_API_KEY"] },
    { name: "ses", vars: ["AWS_SES_REGION", "AWS_ACCESS_KEY_ID"] },
  ];
  const configured = providers.find((p) => p.vars.every((v) => isNonEmptyString(env[v])));
  return Object.freeze({ state: configured ? "CONFIGURED_PRESENT" : "NOT_CONFIGURED", provider: configured ? configured.name : null, sendEnabled: false });
}

/** prepareEmailDraft — DRAFT/PREVIEW only; returns an inert draft a HUMAN sends. Never sends, never networks. */
function prepareEmailDraft(requestId: any, kind: any, opts: any = {}): any {
  const rec = get(requestId, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  const owner = rec.humanOwner;
  const subjects: any = { first: "Un livrable logiciel cadré, livré avec preuves vérifiables", followup: "Suite à mon message — toujours pertinent ?", discovery: "Court échange (15 min) pour cadrer le périmètre" };
  return Object.freeze({
    ok: true, requestId, kind: kind in subjects ? kind : "first",
    draft: Object.freeze({ subjectFr: subjects[kind] || subjects.first, bodyRef: "FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET.md §6", sendEnabled: false, sentBy: "HUMAN_ONLY", owner: owner || null }),
  });
}

/** sendEmail — ALWAYS fail-closed. No provider transport is bundled; no network is permitted. */
function sendEmail(): any { return Object.freeze({ ok: false, sent: false, code: CODE.EMAIL_NOT_CONFIGURED, detail: "email sending is disabled; a human sends approved outreach" }); }

/**
 * attachDelivery(requestId, mission, {cwd}) — governed processing boundary: only a PILOT_SCOPED/ACCEPTED
 * request may attach a delivery, and ONLY when the promoted packager returns accepted:true.
 */
function attachDelivery(requestId: any, mission: any, opts: any = {}): any {
  const rec = get(requestId, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.status !== STATUS.PILOT_SCOPED && rec.status !== STATUS.ACCEPTED) {
    return Object.freeze({ ok: false, code: CODE.NOT_READY_FOR_DELIVERY, status: rec.status });
  }
  const pkg = packager.packageDelivery(mission, { cwd: opts.cwd });
  if (!pkg.accepted) return Object.freeze({ ok: false, code: CODE.DELIVERY_NOT_ACCEPTED, rejections: pkg.rejections });
  rec.delivery = { mission, accepted: true, deliverable: pkg.deliverable.map((d: any) => ({ path: d.path, sha256: d.sha256 })), packagedAt: new Date().toISOString() };
  rec.status = STATUS.DELIVERED;
  rec.history = Array.isArray(rec.history) ? rec.history : [];
  rec.history.push({ to: STATUS.DELIVERED, by: "odg", reason: "delivery package accepted" });
  writeJson(recPath(opts.cwd, requestId), rec);
  return Object.freeze({ ok: true, requestId, status: STATUS.DELIVERED, humanAcceptanceRequired: true, package: Object.freeze(rec.delivery) });
}

/**
 * readiness({env}) — operational readiness, distinguishing READY / NOT_CONFIGURED / BLOCKED.
 */
function readiness(opts: any = {}): any {
  const email = emailReadiness(opts);
  const prerequisites = [];
  const coreReady = typeof intake === "function" && typeof packager.packageDelivery === "function";
  if (email.state === "NOT_CONFIGURED") prerequisites.push("email provider NOT configured (draft/preview only; human sends)");
  prerequisites.push("a real qualified client + bounded written scope (human)");
  prerequisites.push("human authorization grant for any consequential mission capability");
  prerequisites.push("invoicing/payment/closure are human+external (not implemented)");
  const state = !coreReady ? "BLOCKED" : "READY";
  return Object.freeze({ state, intake: "READY", tracking: "READY", delivery: "READY", email: email.state, closure: "NOT_IMPLEMENTED_HUMAN", prerequisites: Object.freeze(prerequisites) });
}

module.exports = { STATUS, CODE, REQUIRED, intake, get, list, transition, emailReadiness, prepareEmailDraft, sendEmail, attachDelivery, readiness, storeState };

if (require.main === module) {
  const r = readiness({});
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (isPlainObject,
// storeBase, makeId, validate, ...) are module-scoped, not global script scope (TS2393 guard).
export {};

#!/usr/bin/env node
"use strict";

/* CLIENT INTAKE — behavioural contract test. Pure, cwd-isolated, fail-closed, no network. */

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const M = require(path.resolve(__dirname, "client-intake.js"));
const { STATUS, CODE } = M;

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "intake-")); }

const VALID = { client: "Acme (jane@acme.example)", problem: "convert a CSV export to JSON", scope: "one script, runtime/**", acceptance: "tests green + sample converted", humanOwner: "sales@odg.example", consent: true, source: "referral" };

// 1 — valid intake ⇒ stable id, NEW, persisted.
{
  const cwd = tmp();
  const r = M.intake(VALID, { cwd });
  ok("1 valid intake ⇒ ok, NEW, CLIENT-001", r.ok && r.status === STATUS.NEW && r.requestId === "CLIENT-001");
  ok("1 record persisted + retrievable", M.get("CLIENT-001", { cwd }).problem === VALID.problem);
  const r2 = M.intake(VALID, { cwd });
  ok("1 deterministic incrementing id", r2.requestId === "CLIENT-002" && M.list({ cwd }).length === 2);
}

// 2 — incomplete request ⇒ HELD, fail-closed, missing listed (never NEW).
{
  const cwd = tmp();
  const r = M.intake({ client: "x", problem: "y" }, { cwd });
  ok("2 incomplete ⇒ not ok, HELD, INCOMPLETE_REQUEST", !r.ok && r.status === STATUS.HELD && r.code === CODE.INCOMPLETE_REQUEST);
  ok("2 missing fields reported", r.missing.includes("scope") && r.missing.includes("acceptance") && r.missing.includes("humanOwner"));
  ok("2 HELD record stored (awaiting human)", M.get(r.requestId, { cwd }).status === STATUS.HELD);
  const noConsent = M.intake({ ...VALID, consent: false }, { cwd });
  ok("2 consent!=true ⇒ HELD (explicit consent required)", !noConsent.ok && noConsent.status === STATUS.HELD);
  let threw = false; try { M.intake("not an object", { cwd }); M.intake(null, { cwd }); } catch { threw = true; }
  ok("2 malformed input ⇒ no throw", !threw);
}

// 3 — secret never persisted (whitelist) and never in the stored file bytes.
{
  const cwd = tmp();
  const SECRET = "SECRET_TOKEN_sk-DEADBEEF";
  const r = M.intake({ ...VALID, apiKey: SECRET, password: SECRET }, { cwd });
  const raw = fs.readFileSync(path.join(cwd, "runtime/generated/clients/requests", r.requestId + ".json"), "utf8");
  ok("3 secret-looking fields not persisted", !raw.includes(SECRET) && M.get(r.requestId, { cwd }).apiKey === undefined);
}

// 4 — human-gated transitions (deny-by-default); invalid edges fail closed.
{
  const cwd = tmp();
  const id = M.intake(VALID, { cwd }).requestId;
  ok("4 NEW→QUALIFYING without human ⇒ HUMAN_AUTHORIZATION_REQUIRED", M.transition(id, STATUS.QUALIFYING, { cwd }).code === CODE.HUMAN_AUTHORIZATION_REQUIRED);
  ok("4 NEW→QUALIFYING with human+owner ⇒ ok", M.transition(id, STATUS.QUALIFYING, { cwd, by: "human", owner: "sales@odg.example" }).ok === true);
  ok("4 invalid edge QUALIFYING→DELIVERED ⇒ INVALID_TRANSITION", M.transition(id, STATUS.DELIVERED, { cwd, by: "human", owner: "o" }).code === CODE.INVALID_TRANSITION);
  ok("4 unknown request ⇒ NOT_FOUND", M.transition("CLIENT-999", STATUS.DROPPED, { cwd, by: "human", owner: "o" }).code === CODE.NOT_FOUND);
}

// 5 — email: NOT_CONFIGURED fail-closed, no secret value leaked, send always refused, draft inert.
{
  const cwd = tmp();
  const er = M.emailReadiness({ env: {} });
  ok("5 no provider ⇒ NOT_CONFIGURED, sendEnabled:false", er.state === "NOT_CONFIGURED" && er.sendEnabled === false && er.provider === null);
  const erC = M.emailReadiness({ env: { SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "topsecret" } });
  ok("5 configured-present detected WITHOUT leaking secret value", erC.state === "CONFIGURED_PRESENT" && erC.provider === "smtp" && erC.sendEnabled === false && JSON.stringify(erC).indexOf("topsecret") === -1);
  ok("5 sendEmail ALWAYS fail-closed", M.sendEmail().sent === false && M.sendEmail().code === CODE.EMAIL_NOT_CONFIGURED);
  const id = M.intake(VALID, { cwd }).requestId;
  const d = M.prepareEmailDraft(id, "first", { cwd });
  ok("5 draft is inert (sendEnabled:false, human-only)", d.ok && d.draft.sendEnabled === false && d.draft.sentBy === "HUMAN_ONLY");
}

// 6 — governed delivery: not-ready status rejected; unaccepted package rejected; accepted path ⇒ DELIVERED.
{
  const cwd = tmp();
  const id = M.intake(VALID, { cwd }).requestId;
  ok("6 attachDelivery on NEW ⇒ NOT_READY_FOR_DELIVERY", M.attachDelivery(id, "PILOT_MISSION", { cwd }).code === CODE.NOT_READY_FOR_DELIVERY);
  // advance to PILOT_SCOPED (human)
  M.transition(id, STATUS.QUALIFYING, { cwd, by: "human", owner: "o" });
  M.transition(id, STATUS.PILOT_SCOPED, { cwd, by: "human", owner: "o" });
  // no proven mission fixtures yet ⇒ packager rejects ⇒ DELIVERY_NOT_ACCEPTED
  ok("6 scoped but unproven mission ⇒ DELIVERY_NOT_ACCEPTED", M.attachDelivery(id, "PILOT_MISSION", { cwd }).code === CODE.DELIVERY_NOT_ACCEPTED);
  // build a VALID proven mission (packager contract) in the SAME cwd
  const w = (rel, o) => { const a = path.join(cwd, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, JSON.stringify(o)); };
  w("runtime/missions/PILOT_MISSION.json", { mission: "PILOT_MISSION", requires_engineering: true, authorized_paths: ["runtime/**"], objectives: [{ id: "EXTERNAL_RESEARCH_1" }] });
  w("runtime/generated/mission-report.json", { mission: "PILOT_MISSION", status: "SUCCESS", validated: true });
  w("runtime/generated/mission-ledger.json", [{ mission: "PILOT_MISSION", proven: true, validated: true, state: "RELEASED" }]);
  w("runtime/generated/patch-execution.json", { mission: "PILOT_MISSION", executed: [{ objectiveId: "EXTERNAL_RESEARCH_1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "runtime/generated/external-research-acquisition.json" }] });
  w("runtime/generated/external-research-acquisition.json", { capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200, content_hash: "a".repeat(64) }], ranked: [{ provenance_ref: "u" }] });
  const d = M.attachDelivery(id, "PILOT_MISSION", { cwd });
  ok("6 proven mission ⇒ DELIVERED, human acceptance still required", d.ok && d.status === STATUS.DELIVERED && d.humanAcceptanceRequired === true && d.package.deliverable.length === 1);
  ok("6 CLOSED requires human", M.transition(id, STATUS.CLOSED, { cwd }).code === CODE.HUMAN_AUTHORIZATION_REQUIRED && M.transition(id, STATUS.CLOSED, { cwd, by: "human", owner: "o" }).ok === true);
}

// 7 — readiness distinguishes states + names prerequisites; no closure/invoicing claimed.
{
  const r = M.readiness({ env: {} });
  ok("7 readiness READY with email NOT_CONFIGURED + human prerequisites", r.state === "READY" && r.email === "NOT_CONFIGURED" && r.closure === "NOT_IMPLEMENTED_HUMAN" && r.prerequisites.some((p) => /qualified client/.test(p)));
}

console.log(`\nCLIENT INTAKE — ${passed} assertions passed.`);

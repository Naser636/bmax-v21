#!/usr/bin/env node
"use strict";

/*
 * odg client — END-TO-END test through the REAL operational entry point (the `odg` wrapper → odg-client.js).
 * Each invocation is a FRESH process, so a later `get` proves persistence across restart. Storage is
 * isolated via --cwd <temp>; live generated state is never touched. No network.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Drive the REAL wrapper: `odg client <args>` (bash → exec node odg-client.js). cwd=REPO so relative paths
// resolve; --cwd=<store> isolates request storage.
function odg(args) {
  const r = spawnSync("bash", ["runtime/bin/odg", "client", ...args], { cwd: REPO, encoding: "utf8" });
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* non-JSON */ }
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

const store = fs.mkdtempSync(path.join(os.tmpdir(), "odgclient-"));
const C = ["--cwd", store];

// 0 — entry point reachable + readiness reports email NOT_CONFIGURED.
{
  const r = odg(["readiness", ...C]);
  ok("0 `odg client readiness` reachable (exit 0)", r.code === 0 && !!r.json);
  ok("0 email NOT_CONFIGURED + closure not implemented", r.json.email === "NOT_CONFIGURED" && r.json.closure === "NOT_IMPLEMENTED_HUMAN");
}

// 1 — valid intake via FILE (carrying a secret) ⇒ CLIENT-001; secret never persisted.
const SECRET = "sk-LIVE-DEADBEEF-DO-NOT-STORE";
const reqFile = path.join(store, "req.json");
fs.writeFileSync(reqFile, JSON.stringify({ client: "Acme (jane@acme.example)", problem: "convert CSV to JSON", scope: "one script runtime/**", acceptance: "tests green + sample", humanOwner: "sales@odg.example", consent: true, source: "referral", apiKey: SECRET }));
{
  const r = odg(["intake", reqFile, ...C]);
  ok("1 intake ok ⇒ CLIENT-001, NEW, exit 0", r.code === 0 && r.json.requestId === "CLIENT-001" && r.json.status === "NEW");
  const raw = fs.readFileSync(path.join(store, "runtime/generated/clients/requests/CLIENT-001.json"), "utf8");
  ok("1 secret NOT persisted + CLI did not echo payload", !raw.includes(SECRET) && !r.stdout.includes(SECRET));
}

// 2 — RESTART PERSISTENCE: a fresh process retrieves the persisted record.
{
  const r = odg(["get", "CLIENT-001", ...C]);
  ok("2 restart/persistence: fresh process returns stored record", r.code === 0 && r.json.requestId === "CLIENT-001" && r.json.problem === "convert CSV to JSON");
  ok("2 stored record carries no secret", JSON.stringify(r.json).indexOf(SECRET) === -1);
}

// 3 — incomplete request ⇒ HELD, non-zero.
{
  const f = path.join(store, "bad.json"); fs.writeFileSync(f, JSON.stringify({ client: "x", problem: "y", consent: true }));
  const r = odg(["intake", f, ...C]);
  ok("3 incomplete ⇒ HELD, exit 3, missing listed", r.code === 3 && r.json.status === "HELD" && r.json.code === "INCOMPLETE_REQUEST" && r.json.missing.includes("scope"));
}

// 4 — malformed request file ⇒ fail closed, non-zero.
{
  const f = path.join(store, "mal.json"); fs.writeFileSync(f, "{ not json ]");
  const r = odg(["intake", f, ...C]);
  ok("4 malformed file ⇒ MALFORMED_REQUEST_FILE, exit 3", r.code === 3 && r.json.code === "MALFORMED_REQUEST_FILE");
}

// 5 — human-gated transition: denied without --human, allowed with.
{
  const denied = odg(["transition", "CLIENT-001", "QUALIFYING", ...C]);
  ok("5 transition without --human ⇒ HUMAN_AUTHORIZATION_REQUIRED, exit 3", denied.code === 3 && denied.json.code === "HUMAN_AUTHORIZATION_REQUIRED");
  const okr = odg(["transition", "CLIENT-001", "QUALIFYING", "--human", "--owner", "sales@odg.example", ...C]);
  ok("5 transition with --human --owner ⇒ ok, exit 0", okr.code === 0 && okr.json.status === "QUALIFYING");
}

// 6 — delivery gated: not-ready status ⇒ refused (unauthorized execution prevented).
{
  const r = odg(["deliver", "CLIENT-001", "SOME_MISSION", ...C]);
  ok("6 deliver on QUALIFYING ⇒ NOT_READY_FOR_DELIVERY, exit 3", r.code === 3 && r.json.code === "NOT_READY_FOR_DELIVERY");
}

// 7 — unknown subcommand ⇒ usage, exit 2.
{
  const r = odg(["frobnicate", ...C]);
  ok("7 unknown subcommand ⇒ exit 2 with usage", r.code === 2 && /unknown subcommand/.test(r.json.error));
}

// 8 — email draft is inert (sendEnabled:false).
{
  const r = odg(["draft", "CLIENT-001", "first", ...C]);
  ok("8 draft inert (sendEnabled:false, human sends)", r.code === 0 && r.json.draft.sendEnabled === false && r.json.draft.sentBy === "HUMAN_ONLY");
}

console.log(`\nODG CLIENT CLI (end-to-end) — ${passed} assertions passed.`);

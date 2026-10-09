#!/usr/bin/env node
"use strict";
/* DEPLOYMENT READINESS — configurable persistent store, production block, collision-safe ids, restart
 * persistence, no false success on store failure, no secret leak. Isolated temp dirs + env. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const M = require(path.resolve(__dirname, "client-intake.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "deploy-")); }
const VALID = { client: "Acme", problem: "p", scope: "s", acceptance: "a", humanOwner: "o", consent: true };
const saveEnv = { NODE_ENV: process.env.NODE_ENV, ODG_CLIENT_STORE: process.env.ODG_CLIENT_STORE };
function restore() { process.env.NODE_ENV = saveEnv.NODE_ENV; if (saveEnv.ODG_CLIENT_STORE === undefined) delete process.env.ODG_CLIENT_STORE; else process.env.ODG_CLIENT_STORE = saveEnv.ODG_CLIENT_STORE; }

try {
  // 1 — explicit cwd (dev/tests) ⇒ READY (unchanged behaviour).
  ok("1 cwd store ⇒ READY", M.storeState(tmp()).state === "READY");
  // 2 — production + NO ODG_CLIENT_STORE ⇒ NOT_CONFIGURED (never a silent temp store).
  delete process.env.ODG_CLIENT_STORE; process.env.NODE_ENV = "production";
  ok("2 production + unconfigured ⇒ NOT_CONFIGURED", M.storeState(undefined).state === "NOT_CONFIGURED");
  // 3 — intake BLOCKS cleanly when store unconfigured (no false success, no record).
  const blocked = M.intake(VALID, {});
  ok("3 intake unconfigured ⇒ BLOCKED, STORE_NOT_CONFIGURED, not ok", blocked.ok === false && blocked.code === M.CODE.STORE_NOT_CONFIGURED && blocked.status === "BLOCKED" && !blocked.requestId);
  // 4 — configured persistent path ⇒ READY + intake works.
  const store = tmp(); process.env.ODG_CLIENT_STORE = store;
  ok("4 ODG_CLIENT_STORE set ⇒ READY", M.storeState(undefined).state === "READY");
  const r = M.intake(VALID, {});
  ok("4 intake persists under configured store", r.ok && fs.existsSync(path.join(store, "requests", r.requestId + ".json")));
  // 5 — restart persistence: a fresh read (new module instance) sees the record.
  delete require.cache[require.resolve(path.resolve(__dirname, "client-intake.js"))];
  const M2 = require(path.resolve(__dirname, "client-intake.js"));
  ok("5 restart: fresh instance reads persisted record", M2.get(r.requestId, {}).problem === "p");
  // 6 — collision-safe create: a pre-existing id is never overwritten (exclusive create).
  const store2 = tmp(); process.env.ODG_CLIENT_STORE = store2;
  fs.mkdirSync(path.join(store2, "requests"), { recursive: true });
  fs.writeFileSync(path.join(store2, "requests", "CLIENT-001.json"), JSON.stringify({ requestId: "CLIENT-001", status: "NEW", problem: "PRE-EXISTING" }));
  const r2 = M2.intake(VALID, {});
  ok("6 pre-existing id not overwritten ⇒ new id, original intact", r2.requestId === "CLIENT-002" && JSON.parse(fs.readFileSync(path.join(store2, "requests", "CLIENT-001.json"), "utf8")).problem === "PRE-EXISTING");
  // 7 — store set but UNWRITABLE ⇒ BLOCKED (not READY, not silent fallback). Force ENOTDIR by pointing the
  // store at a path UNDER a regular file (deterministic, fast — no special filesystem).
  const fileAsDir = path.join(tmp(), "a-file"); fs.writeFileSync(fileAsDir, "x");
  process.env.ODG_CLIENT_STORE = path.join(fileAsDir, "store");
  ok("7 unwritable store (ENOTDIR) ⇒ BLOCKED", M2.storeState(undefined).state === "BLOCKED");
  // 8 — no secret persisted under the configured store.
  process.env.ODG_CLIENT_STORE = store;
  M2.intake({ ...VALID, apiKey: "sk-SECRET-XYZ" }, {});
  const dump = fs.readdirSync(path.join(store, "requests")).map((f) => fs.readFileSync(path.join(store, "requests", f), "utf8")).join("");
  ok("8 no secret in persisted records", !dump.includes("sk-SECRET-XYZ"));
} finally { restore(); }
console.log(`\nDEPLOYMENT READINESS — ${passed} assertions passed.`);

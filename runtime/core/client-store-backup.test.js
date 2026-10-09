#!/usr/bin/env node
"use strict";
/* CLIENT STORE BACKUP (RWL-B4) — read-only backup + integrity-verified restore. cwd-isolated, no network. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto"); const assert = require("assert");
const B = require(path.resolve(__dirname, "client-store-backup.js"));
const intake = require(path.resolve(__dirname, "client-intake.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "backup-")); }
function hashTree(dir) { const o = {}; const w = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else o[path.relative(dir, p)] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } }; w(dir); return o; }
const REQ = { client: "Acme", problem: "p", scope: "s", acceptance: "a", humanOwner: "o", consent: true };

// Seed a store with a couple of intake records (governed path), in an isolated cwd.
function seed() { const cwd = tmp(); intake.intake(REQ, { cwd }); intake.intake({ ...REQ, problem: "p2" }, { cwd }); return cwd; }

// 1 — store not ready ⇒ fail-closed.
{
  const prev = process.env.NODE_ENV, prevS = process.env.ODG_CLIENT_STORE;
  process.env.NODE_ENV = "production"; delete process.env.ODG_CLIENT_STORE;
  ok("1 store NOT_CONFIGURED ⇒ STORE_NOT_READY", B.backup({}).code === B.CODE.STORE_NOT_READY);
  process.env.NODE_ENV = prev; if (prevS === undefined) delete process.env.ODG_CLIENT_STORE; else process.env.ODG_CLIENT_STORE = prevS;
}
// 2 — backup is READ-ONLY (source byte-identical) + captures all files + manifest hash.
{
  const cwd = seed(); const base = path.join(cwd, "runtime/generated/clients");
  const before = hashTree(base);
  const r = B.backup({ cwd, nowMs: 1 });
  ok("2 backup ok, ≥2 request files captured", r.ok && r.count >= 2 && r.manifest.files.some(f => /requests\/CLIENT-001\.json$/.test(f.path)));
  ok("2 manifest hash present + per-file sha256", /^[0-9a-f]{64}$/.test(r.manifest.manifestHash) && r.manifest.files.every(f => /^[0-9a-f]{64}$/.test(f.sha256)));
  ok("2 source NOT mutated by backup (byte-identical)", JSON.stringify(hashTree(base)) === JSON.stringify(before));
}
// 3 — verify detects tampering.
{
  const cwd = seed(); const m = B.backup({ cwd, nowMs: 1 }).manifest;
  ok("3 clean manifest verifies", B.verify(m).ok === true);
  const tampered = JSON.parse(JSON.stringify(m)); tampered.files[0].content = tampered.files[0].content + " X"; // content changed, sha256 stale
  ok("3 tampered content ⇒ INTEGRITY_MISMATCH", B.verify(tampered).ok === false && B.verify(tampered).code === B.CODE.INTEGRITY_MISMATCH);
}
// 4 — restore to empty target reproduces the store byte-identically (round-trip).
{
  const cwd = seed(); const base = path.join(cwd, "runtime/generated/clients");
  const m = B.backup({ cwd, nowMs: 1 }).manifest;
  const target = path.join(tmp(), "restored");
  const r = B.restore({ manifest: m, target });
  ok("4 restore ok, all files restored", r.ok && r.restored === m.files.length);
  // compare restored tree to original store tree
  const orig = hashTree(base), restored = hashTree(target);
  ok("4 round-trip byte-identical", JSON.stringify(orig) === JSON.stringify(restored));
}
// 5 — restore refuses a non-empty target unless force.
{
  const cwd = seed(); const m = B.backup({ cwd, nowMs: 1 }).manifest;
  const target = path.join(tmp(), "t"); fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, "pre.txt"), "x");
  ok("5 non-empty target ⇒ TARGET_NOT_EMPTY", B.restore({ manifest: m, target }).code === B.CODE.TARGET_NOT_EMPTY);
  ok("5 force ⇒ restores", B.restore({ manifest: m, target, force: true }).ok === true);
}
// 6 — restore fails closed on a corrupt manifest (never writes wrong bytes claimed as restored).
{
  const cwd = seed(); const m = JSON.parse(JSON.stringify(B.backup({ cwd, nowMs: 1 }).manifest));
  m.files[0].sha256 = "0".repeat(64); // declared hash no longer matches content
  const target = path.join(tmp(), "c");
  ok("6 corrupt manifest ⇒ INTEGRITY_MISMATCH, restore refused", B.restore({ manifest: m, target }).code === B.CODE.INTEGRITY_MISMATCH && (() => { try { return fs.readdirSync(target).length === 0; } catch { return true; } })());
}
// 7 — no secret in backup (store holds none; an injected secret field was never persisted ⇒ absent from backup).
{
  const cwd = tmp(); intake.intake({ ...REQ, apiKey: "sk-SECRET-XYZ" }, { cwd });
  const m = B.backup({ cwd, nowMs: 1 }).manifest;
  ok("7 no secret in backup content", !JSON.stringify(m).includes("sk-SECRET-XYZ"));
}
console.log(`\nCLIENT STORE BACKUP (RWL-B4) — ${passed} assertions passed.`);

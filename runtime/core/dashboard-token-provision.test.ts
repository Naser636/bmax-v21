#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the token-provisioning mechanism: strong unique tokens, safe fingerprint,
// fail-closed on weak tokens, idempotent decision, 0600 file write in a TEMP dir (no live host), and — critically —
// the plan()/evidence output NEVER contains the secret value.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./dashboard-token-provision.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) mintToken: strong, URL-safe, unique.
const t1 = P.mintToken(); const t2 = P.mintToken();
ok("mintToken ⇒ strong URL-safe token (>=32 chars, [A-Za-z0-9_-])", t1.length >= 32 && /^[A-Za-z0-9_-]+$/.test(t1));
ok("two mints differ (random)", t1 !== t2);

// (2) fingerprint: deterministic, short hex, NOT the token.
ok("fingerprint deterministic 12-hex, never equals the token", P.fingerprint(t1) === P.fingerprint(t1) && /^[0-9a-f]{12}$/.test(P.fingerprint(t1)) && P.fingerprint(t1) !== t1);

// (3) renderEnvFile: has the key + newline; fail-closed on weak token.
ok("renderEnvFile has ODG_DASHBOARD_TOKEN=… + newline", P.renderEnvFile(t1) === `ODG_DASHBOARD_TOKEN=${t1}\n`);
let threw = false; try { P.renderEnvFile("short"); } catch { threw = true; }
ok("renderEnvFile refuses a weak (<16) token (fail-closed)", threw === true);

// (4) idempotent decision.
ok("absent ⇒ CREATE", P.provisionDecision({ exists: false }).action === "CREATE");
ok("present + no rotate ⇒ KEEP (no clobber)", P.provisionDecision({ exists: true }).action === "KEEP");
ok("present + rotate ⇒ ROTATE", P.provisionDecision({ exists: true, rotate: true }).action === "ROTATE");

// (5) writeEnvFile writes 0600 in a temp dir (no live host, no /etc).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-token-"));
  const p = path.join(dir, "svc.env");
  try {
    const r = P.writeEnvFile(p, t1);
    const mode = fs.statSync(p).mode & 0o777;
    ok("writeEnvFile ⇒ file mode 0600 (owner-only)", mode === 0o600 && r.mode === "0600");
    ok("written file contains the key", /^ODG_DASHBOARD_TOKEN=/.test(fs.readFileSync(p, "utf8")));
    ok("writeEnvFile return carries fingerprint, NOT the token", r.fingerprint === P.fingerprint(t1) && JSON.stringify(r).indexOf(t1) === -1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// (6) SECRET HYGIENE: plan() output never contains a real token value.
{
  const pl = P.plan({ existsImpl: () => false, path: "/tmp/x.env" });
  const s = JSON.stringify(pl);
  ok("plan ⇒ CREATE action + 0600 + safe fields only", pl.action === "CREATE" && pl.mode === "0600" && pl.key === "ODG_DASHBOARD_TOKEN");
  // sampleFingerprint is a 12-hex fingerprint, never a 32+ char token.
  ok("plan output contains only a fingerprint, never a token value", /^[0-9a-f]{12}$/.test(pl.sampleFingerprint) && !/[A-Za-z0-9_-]{32,}/.test(s.replace(pl.sampleFingerprint, "")));
  ok("plan KEEP when file exists (idempotent)", P.plan({ existsImpl: () => true, path: "/tmp/x.env" }).action === "KEEP");
}

console.log(`\nDASHBOARD-TOKEN-PROVISION suite — ${pass} assertions passed. (strong unique tokens; fail-closed weak; idempotent; 0600 write in temp; NO secret in output)`);

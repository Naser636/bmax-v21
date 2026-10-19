// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// exposure-audit (P3) — parse `ss -ltnp`, classify ODG-owned vs foreign, loopback vs public; honest verdict.
// Fixtures mirror the REAL VPS shape: ODG next-server loopback + foreign public :8080/:22 (no pid under our user).
const assert = require("assert");
const TS = require("./exposure-audit.ts");
const JS = require("./exposure-audit.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// Real-shaped sample (what this VPS actually emits): ODG on 127.0.0.1:3000 with our pid; foreign 8080/22 pidless.
const REAL = [
  'LISTEN 0      511        127.0.0.1:3000       0.0.0.0:*    users:(("next-server (v1",pid=3970445,fd=21))',
  'LISTEN 0      4096         0.0.0.0:8080       0.0.0.0:*',
  'LISTEN 0      4096            [::]:8080          [::]:*',
  'LISTEN 0      128          0.0.0.0:22          0.0.0.0:*',
  'LISTEN 0      128             [::]:22             [::]:*',
].join("\n");

// 1. loopback detection (IPv4/IPv6/mapped, public negatives).
t("isLoopbackHost — 127.x / ::1 / ::ffff:127.x loopback; 0.0.0.0 / :: / public IP not", () => {
  for (const h of ["127.0.0.1", "127.1.2.3", "::1", "[::1]", "::ffff:127.0.0.1"]) assert.ok(TS.isLoopbackHost(h), h);
  for (const h of ["0.0.0.0", "::", "[::]", "10.0.0.5", "192.168.1.9", ""]) assert.ok(!TS.isLoopbackHost(h), h);
});

// 2. parse — IPv6-aware host:port split, ownership = visible pid.
t("parseListeners — IPv6-aware split + ownership via visible pid", () => {
  const recs = TS.parseListeners(REAL);
  assert.strictEqual(recs.length, 5, "5 LISTEN rows");
  const odg = recs.find((r) => r.port === "3000");
  assert.strictEqual(odg.host, "127.0.0.1"); assert.strictEqual(odg.owned, true); assert.strictEqual(odg.pid, 3970445);
  const v6 = recs.find((r) => r.localAddr === "[::]:8080");
  assert.strictEqual(v6.host, "[::]"); assert.strictEqual(v6.port, "8080"); assert.strictEqual(v6.owned, false);
});

// 3. REAL VPS shape ⇒ LOOPBACK_OK is WRONG here: foreign public listeners exist but are not ours ⇒ UNKNOWN,
//    NOT DRIFT (we must never raise an ODG drift on a co-tenant service, and never falsely claim all-clear).
t("classifyExposure — ODG loopback + foreign public ⇒ UNKNOWN (no ODG drift, no false OK)", () => {
  const r = TS.classifyExposure(REAL);
  assert.strictEqual(r.verdict, "UNKNOWN", "foreign public listeners ⇒ ownership-unprovable ⇒ UNKNOWN");
  assert.strictEqual(r.drift.length, 0, "no ODG-owned public listener ⇒ no DRIFT");
  assert.strictEqual(r.odgLoopback.length, 1, "the ODG next-server loopback socket");
  assert.strictEqual(r.foreign.length, 4, "the 4 foreign public listeners (8080/22 ×2)");
  assert.deepStrictEqual(TS.classifyExposure(REAL), JS.classifyExposure(REAL)); // parity
});

// 4. DRIFT — an ODG-owned (pid-visible) listener on a PUBLIC address is the forbidden exposure.
t("classifyExposure — ODG-owned public listener ⇒ DRIFT", () => {
  const drifted = 'LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("next-server (v1",pid=4242,fd=21))';
  const r = TS.classifyExposure(drifted);
  assert.strictEqual(r.verdict, "DRIFT");
  assert.strictEqual(r.drift.length, 1);
  assert.strictEqual(r.drift[0].pid, 4242);
});

// 5. Pure loopback-only (ODG-owned) ⇒ LOOPBACK_OK; empty/garbage ⇒ LOOPBACK_OK (no listeners, nothing public).
t("classifyExposure — ODG loopback-only ⇒ LOOPBACK_OK; empty ⇒ LOOPBACK_OK", () => {
  const ok = 'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("next-server (v1",pid=1,fd=21))\nLISTEN 0 128 [::1]:9229 [::]:* users:(("node",pid=2,fd=3))';
  const r = TS.classifyExposure(ok);
  assert.strictEqual(r.verdict, "LOOPBACK_OK");
  assert.strictEqual(r.odgLoopback.length, 2);
  assert.strictEqual(TS.classifyExposure("").verdict, "LOOPBACK_OK");
  assert.strictEqual(TS.classifyExposure("garbage\nno listeners here").verdict, "LOOPBACK_OK");
  assert.deepStrictEqual(TS.classifyExposure(ok), JS.classifyExposure(ok)); // parity
});

console.log(`\nALL PASS — exposure-audit (${n} tests)`);

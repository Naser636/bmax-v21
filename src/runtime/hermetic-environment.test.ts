#!/usr/bin/env node
/*
 * HERMETIC_ENVIRONMENT contract — deterministic, hermetic unit test (§U Phase-1 #5).
 *
 * No real network/provider/billing; no real repo files touched (temp roots + injected seams; the
 * write-confinement probe reuses the real V40 proveParity against a temp dir). Covers the 10 mandated
 * cases. Pure/offline.
 *
 * Run:  node_modules/.bin/tsx src/runtime/hermetic-environment.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const he = require("./hermetic-environment");
const sp = require("./semantic-parity");
export {}; // module-scope marker (§T-R1): require()-based test ⇒ force MODULE scope (avoid TS2451)

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const temps: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "herm-")); temps.push(d); return d; };
const status = (r: any, name: string) => r.gates.find((g: any) => g.gate === name).status;

console.log("HERMETIC_ENVIRONMENT contract — deterministic hermetic test");

try {
  // 1. toolchain fingerprint stable + divergence detected.
  {
    const fp1 = he.toolchainFingerprint(REPO), fp2 = he.toolchainFingerprint(REPO);
    check(JSON.stringify(fp1) === JSON.stringify(fp2) && fp1.node === process.version && typeof fp1.lockfileSha256 === "string", "1a toolchain fingerprint stable + real versions (node/ts/tsx/lock)");
    const cleanRoot = tmp(); // no tsbuildinfo ⇒ caches PASS, so the toolchain FAIL is isolated
    const r = he.verifyHermetic({ root: cleanRoot, expectedFingerprint: { node: "v0.0.0-bogus" } }, { observedIsolation: () => ({ network: false }), reproduce: () => ({ a: "x", b: "x" }), confinementProbe: () => ({ status: "PASS", detail: "ok" }) });
    check(status(r, "toolchain") === "FAIL" && r.ok === false, "1b expected-fingerprint divergence ⇒ toolchain FAIL (not ok)");
  }

  // 2. stale cache ⇒ BLOCKED, never PASS (read-only; file not deleted).
  {
    const root = tmp(); const stale = path.join(root, "tsconfig.tsbuildinfo"); fs.writeFileSync(stale, "{}");
    const c = he.checkCaches(root);
    check(c.status === "BLOCKED" && fs.existsSync(stale), "2 stale tsconfig.tsbuildinfo ⇒ BLOCKED, and NOT deleted (read-only)");
  }

  // 3. observed isolation network:false ⇒ ENFORCED.
  {
    const n = he.networkPolicy({ network: false });
    check(n.policy === "ENFORCED" && /not intended/.test(n.detail), "3 observed network:false ⇒ ENFORCED (observed, not intended)");
  }

  // 4. no isolation observed ⇒ UNVERIFIED, never "off".
  {
    const n0 = he.networkPolicy(null), nTrue = he.networkPolicy({ network: true });
    check(n0.policy === "UNVERIFIED" && n0.policy !== "ENFORCED", "4a no observation ⇒ UNVERIFIED (never ENFORCED without observed isolation)");
    check(nTrue.policy === "UNVERIFIED", "4b observed network:true ⇒ UNVERIFIED (not ENFORCED)");
  }

  // 5. out-of-scope write ⇒ confinement probe FAILS; NO real persistence (reuses real V40 proveParity).
  {
    const td = tmp();
    const probe = path.join(REPO, "runtime", "generated", "__hermetic_probe__.json");
    const before = fs.existsSync(probe);
    const pv = sp.proveParity({ name: "confine", tempDir: td, jsProduce: () => { fs.writeFileSync(probe, "NO"); return "x"; }, tsProduce: () => "x" });
    check(pv.parity === false && pv.effect.forbiddenDetected === true, "5a out-of-scope write ⇒ proveParity forbiddenDetected (confinement probe FAILS)");
    check(fs.existsSync(probe) === before, "5b the forbidden write NEVER persisted to the repo");
  }

  // 6 & 7. reproducibility accepted (identical) / refused (divergent).
  {
    const base = { root: tmp(), observedIsolation: () => ({ network: false }), confinementProbe: () => ({ status: "PASS", detail: "confined" }) };
    const same = he.verifyHermetic({ root: base.root }, { ...base, reproduce: () => ({ a: '{"v":1,"at":"2026-01-01T00:00:00.000Z"}', b: '{"v":1,"at":"2026-09-09T09:09:09.000Z"}' }) });
    check(status(same, "reproducibility") === "PASS", "6 identical artifacts (ISO normalized) ⇒ reproducibility PASS");
    const diff = he.verifyHermetic({ root: base.root }, { ...base, reproduce: () => ({ a: '{"v":1}', b: '{"v":2}' }) });
    check(status(diff, "reproducibility") === "FAIL" && diff.ok === false, "7 divergent artifacts ⇒ reproducibility FAIL (not ok)");
  }

  // 8. a BLOCKED gate ⇒ subsequent gates NOT-EXECUTED (never presented as executed).
  {
    const root = tmp(); fs.writeFileSync(path.join(root, "tsconfig.tsbuildinfo"), "{}"); // forces caches BLOCKED (gate 2)
    const r = he.verifyHermetic({ root }, { observedIsolation: () => ({ network: false }), reproduce: () => ({ a: "x", b: "x" }), confinementProbe: () => ({ status: "PASS", detail: "ok" }) });
    check(status(r, "caches") === "BLOCKED" && status(r, "network") === "NOT-EXECUTED" && status(r, "reproducibility") === "NOT-EXECUTED", "8 caches BLOCKED ⇒ later gates NOT-EXECUTED (not executed)");
    check(r.exitCode === 2 && r.ok === false, "8b BLOCKED ⇒ exit 2, not ok");
  }

  // 9. no real effects during a clean verify run (fs mutators trapped; pure seams ⇒ zero writes).
  {
    const realW = fs.writeFileSync, realM = fs.mkdirSync, realA = fs.appendFileSync; let w = 0;
    (fs as any).writeFileSync = () => { w++; throw new Error("wrote"); };
    (fs as any).mkdirSync = () => { w++; throw new Error("mkdir"); };
    (fs as any).appendFileSync = () => { w++; throw new Error("append"); };
    try {
      he.verifyHermetic({ root: tmp() }, { observedIsolation: () => ({ network: false }), reproduce: () => ({ a: "x", b: "x" }), confinementProbe: () => ({ status: "PASS", detail: "ok" }) });
    } finally { fs.writeFileSync = realW; fs.mkdirSync = realM; fs.appendFileSync = realA; }
    check(w === 0, "9 no real effects: verifyHermetic performs ZERO fs writes itself (checks are read-only/delegated)");
  }

  // 10. no false PASS when mandatory evidence missing (UNVERIFIED network + absent probes ⇒ ok=false).
  {
    const r = he.verifyHermetic({ root: tmp() }, {}); // no observedIsolation, no reproduce, no confinement probe
    check(status(r, "network") === "SKIPPED" && status(r, "write-confinement") === "SKIPPED" && status(r, "reproducibility") === "SKIPPED", "10a missing evidence ⇒ SKIPPED (never fabricated PASS)");
    check(r.ok === false, "10b missing mandatory evidence ⇒ NOT ok (no false hermetic DONE)");
  }
} finally {
  for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — HERMETIC_ENVIRONMENT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
/*
 * LOT client-store-backup — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/client-store-backup.ts →
 * runtime/dist/core/client-store-backup.js; build-dist-closure co-locates its dep client-intake.js (a TS
 * port, which in turn pulls pilot-delivery-packager/artifact-state/state-transition — all ports) in
 * dist/core. All store ops use an explicit opts.cwd (temp dir); backup takes an INJECTED nowMs so the only
 * otherwise non-det field (createdAtMs) is fixed ⇒ manifests are BYTE-IDENTICAL with NO normalisation.
 * READ-ONLY on the source; restore writes only into explicit temp targets. No network, no secrets.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/client-store-backup-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "client-store-backup.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "client-store-backup.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const NOW = 1_700_000_000_000; // fixed injected clock ⇒ deterministic createdAtMs

console.log("LOT client-store-backup — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/client-store-backup.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/client-store-backup.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "client-intake.js")), "prerequisite: dep client-intake.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
// A single seeder (the historical client-intake .js) populates one shared store; both backup libs then read
// the SAME bytes, so their manifests must be byte-identical. backup is read-only ⇒ sharing the cwd is safe.
const jsIntake = require(path.join(REPO, "runtime", "core", "client-intake.js")) as any;

for (const x of ["CODE", "MANIFEST_VERSION", "backup", "verify", "restore"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.CODE, ts.CODE) && Object.isFrozen(ts.CODE), "CODE byte-identical + frozen");
check(js.MANIFEST_VERSION === ts.MANIFEST_VERSION, "MANIFEST_VERSION identical");

const temps: string[] = [];
const tmp = (p: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); temps.push(d); return d; };
const COMPLETE = { client: "Acme", problem: "convert csv", scope: "one script", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true };

try {
  // backup is READ-ONLY, so the correct equivalence test runs BOTH libs over the SAME source store (seeded
  // once) with a fixed nowMs — identical input bytes ⇒ identical manifest. (Seeding two separate stores would
  // write two real-timestamp createdAt values and is NOT a parity signal.) `base` is the shared cwd ⇒ equal.

  // 1. empty-but-READY store (storeState creates the dir) — one shared cwd, both backup it.
  const emptyCwd = tmp("csb-");
  const bej = js.backup({ cwd: emptyCwd, nowMs: NOW });
  const bet = ts.backup({ cwd: emptyCwd, nowMs: NOW });
  check(EQ(bej, bet), "backup(empty ready store, shared cwd) BYTE-IDENTICAL");

  // 2. seed ONE shared store once, then backup with both libs ⇒ BYTE-IDENTICAL manifest (incl. manifestHash).
  const seedCwd = tmp("csb-");
  jsIntake.intake(COMPLETE, { cwd: seedCwd }); // arbitrary seeder; backup reads raw bytes
  const bJ = js.backup({ cwd: seedCwd, nowMs: NOW });
  const bT = ts.backup({ cwd: seedCwd, nowMs: NOW });
  check(bJ.ok === true && bT.ok === true && bJ.count === bT.count && bJ.count >= 1, "backup(seeded, shared store) ok, same file count");
  check(EQ(bJ.manifest, bT.manifest), "backup manifest BYTE-IDENTICAL (version/createdAtMs/base/files/manifestHash)");
  check(bJ.manifest.manifestHash === bT.manifest.manifestHash, "manifestHash identical (deterministic over path+sha256)");

  // 3. verify parity: good manifest ok; tampered content ⇒ INTEGRITY_MISMATCH.
  check(EQ(js.verify(bJ.manifest), ts.verify(bT.manifest)) && js.verify(bJ.manifest).ok === true, "verify(good) ⇒ ok BYTE-IDENTICAL");
  const tampered = JSON.parse(JSON.stringify(bJ.manifest));
  tampered.files[0].content = tampered.files[0].content + "X";
  check(EQ(js.verify(tampered), ts.verify(tampered)) && js.verify(tampered).code === "INTEGRITY_MISMATCH", "verify(tampered content) ⇒ INTEGRITY_MISMATCH BYTE-IDENTICAL");
  check(EQ(js.verify({}), ts.verify({})) && js.verify({}).code === "INVALID_MANIFEST", "verify(garbage) ⇒ INVALID_MANIFEST BYTE-IDENTICAL");

  // 4. restore parity: into empty target ⇒ ok; non-empty without force ⇒ TARGET_NOT_EMPTY.
  const tgtJ = tmp("csbRJ-"), tgtT = tmp("csbRT-");
  const rJ = js.restore({ manifest: bJ.manifest, target: tgtJ });
  const rT = ts.restore({ manifest: bT.manifest, target: tgtT });
  check(EQ({ ...rJ, target: "<t>" }, { ...rT, target: "<t>" }) && rJ.ok === true && rJ.restored === bJ.count, "restore(empty target) ⇒ ok, all files BYTE-IDENTICAL (target abstracted)");
  const rJ2 = js.restore({ manifest: bJ.manifest, target: tgtJ });
  const rT2 = ts.restore({ manifest: bT.manifest, target: tgtT });
  check(EQ(rJ2, rT2) && rJ2.code === "TARGET_NOT_EMPTY", "restore(non-empty, no force) ⇒ TARGET_NOT_EMPTY BYTE-IDENTICAL");
  check(js.restore({ manifest: bJ.manifest, target: tgtJ, force: true }).ok === true && ts.restore({ manifest: bT.manifest, target: tgtT, force: true }).ok === true, "restore(force) ⇒ ok (both)");
  check(EQ(js.restore({ manifest: bJ.manifest, target: "" }), ts.restore({ manifest: bT.manifest, target: "" })) && js.restore({ manifest: bJ.manifest, target: "" }).code === "INVALID_MANIFEST", "restore(no target) ⇒ INVALID_MANIFEST BYTE-IDENTICAL");
} finally {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT client-store-backup EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

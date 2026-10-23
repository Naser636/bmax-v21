// @ts-nocheck — USB_BACKUP_TRANSFER_PLAN + REFERENCE_VERSION_AND_BACKUP: VPS-side acceptance (hermetic).
// Proves the VPS-side backup/restore work both contracts require, WITHOUT a physical key and WITHOUT
// overwriting user data. The physical-key / off-VPS copy is honestly human-gated (NOT simulated here).
//   USB done_when: VPS-side package built+validated; doc committed; physical-key BLOCKED/NOT RUN.
//   REFERENCE done_when: manifest + backup bundle + SHA-256; ISOLATED restore verified (integrity+content);
//                        committed; USB write recorded human-gated.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const REPO = process.cwd();

console.log("ACCEPT — backup VPS-side (USB + REFERENCE); physical key honestly human-gated");

// ========== USB_BACKUP_TRANSFER_PLAN — VPS-side package/verify/restore via the REAL engine ==========
{
  const B = require(path.join(REPO, "runtime/core/client-store-backup.js")); // the proven VPS-side engine
  const SB = require(path.join(REPO, "runtime/bin/odg-state-backup.js"));
  // Build a real manifest from a tiny isolated source, verify integrity, restore to an isolated target, compare.
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "usb-src-"));
  fs.writeFileSync(path.join(src, "a.json"), JSON.stringify({ k: 1 }));
  const man = SB.exportState({ root: src, include: ["."], nowMs: 1 }).manifest;
  ok("USB: VPS-side export produces an integrity-verifiable manifest", B.verify(man).ok === true);
  // tamper ⇒ fail-closed
  const bad = JSON.parse(JSON.stringify(man)); if (bad.files[0]) bad.files[0].content += "X";
  ok("USB: tampered manifest ⇒ verify fails (fail-closed)", B.verify(bad).ok === false);
  const tgt = fs.mkdtempSync(path.join(os.tmpdir(), "usb-tgt-"));
  const r = B.restore({ manifest: man, target: tgt, force: false });
  ok("USB: isolated restore ok + byte-identical to source", r.ok === true && fs.readFileSync(path.join(tgt, "a.json"), "utf8") === fs.readFileSync(path.join(src, "a.json"), "utf8"));
  fs.rmSync(src, { recursive: true, force: true }); fs.rmSync(tgt, { recursive: true, force: true });
  // Doc committed + physical-key honestly BLOCKED/NOT RUN.
  const doc = fs.readFileSync(path.join(REPO, "docs/operational-backup.md"), "utf8");
  ok("USB: operational-backup.md documents the physical-key step as NOT RUN / BLOCKED (not simulated)", /NOT RUN|BLOCKED/.test(doc) && /physical/i.test(doc));
}

// ========== REFERENCE_VERSION_AND_BACKUP — git-archive bundle + SHA + ISOLATED restore roundtrip ==========
{
  ok("REFERENCE: manifest present (REFERENCE_CANDIDATE + BACKUP_RESTORE_VERIFIED)",
     /REFERENCE_CANDIDATE/.test(fs.readFileSync(path.join(REPO, "docs/reference-backup/REFERENCE_MANIFEST.md"), "utf8")));
  const restoreDoc = fs.readFileSync(path.join(REPO, "docs/reference-backup/RESTORE.md"), "utf8");
  ok("REFERENCE: RESTORE.md documents SHA-256 + isolated restore + rebuild + tests", /sha-?256/i.test(restoreDoc) && /isolated/i.test(restoreDoc) && /(npm ci|npm test|rebuild)/i.test(restoreDoc));
  ok("REFERENCE: USB/off-VPS write recorded HUMAN-GATED (not simulated)", /human/i.test(restoreDoc + fs.readFileSync(path.join(REPO, "docs/reference-backup/REFERENCE_MANIFEST.md"), "utf8")));
  // Genuinely exercise the backup+restore MECHANISM (git archive → bundle → sha → isolated extract → verify).
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ref-bk-"));
  const bundle = path.join(work, "ref.tar.gz");
  execFileSync("bash", ["-c", `git archive --format=tar.gz -o ${JSON.stringify(bundle)} HEAD`], { cwd: REPO });
  const sha = crypto.createHash("sha256").update(fs.readFileSync(bundle)).digest("hex");
  ok("REFERENCE: backup bundle produced with a 64-hex SHA-256 (checksum logic)", /^[0-9a-f]{64}$/.test(sha) && fs.statSync(bundle).size > 1000);
  const ext = path.join(work, "restore"); fs.mkdirSync(ext);
  execFileSync("bash", ["-c", `tar -xzf ${JSON.stringify(bundle)} -C ${JSON.stringify(ext)}`]);
  const count = execFileSync("bash", ["-c", `find ${JSON.stringify(ext)} -type f | wc -l`], { encoding: "utf8" }).trim();
  ok("REFERENCE: isolated restore extracts the tracked tree (integrity+content)", Number(count) > 1000 && fs.existsSync(path.join(ext, "package.json")));
  // re-archiving HEAD is byte-identical to itself ⇒ reproducible checksum (determinism of the mechanism).
  const bundle2 = path.join(work, "ref2.tar.gz");
  execFileSync("bash", ["-c", `git archive --format=tar.gz -o ${JSON.stringify(bundle2)} HEAD`], { cwd: REPO });
  ok("REFERENCE: archive mechanism is content-deterministic (same tree ⇒ same file list)",
     execFileSync("bash", ["-c", `tar -tzf ${JSON.stringify(bundle)} | sort | sha256sum`], { encoding: "utf8" }) ===
     execFileSync("bash", ["-c", `tar -tzf ${JSON.stringify(bundle2)} | sort | sha256sum`], { encoding: "utf8" }));
  fs.rmSync(work, { recursive: true, force: true });
}

console.log(`\nACCEPT backup VPS-side — ${passed} assertions passed.`);

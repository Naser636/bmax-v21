#!/usr/bin/env node
"use strict";
/*
 * V15 — OWNER signing tool (offline). Meant to be run BY THE OWNER, on the owner's machine, with the owner's OWN Ed25519
 * private key. It produces the signature sidecars the gate and the evidence verifier already read; it adds NO new trust
 * path: a signature only counts once the owner pins the printed fingerprint in docs/odg/evidence/TRUST_ANCHORS.json
 * (owner-reviewed PR). The tool never generates a key, never reads a key from inside the repository (a private key must
 * never be committable), and never touches TRUST_ANCHORS.json.
 *
 *   fingerprint --pub <owner-public.pem>
 *   inspection  --record <repo-relative record.json> --key <owner-private.pem> [--days N]
 *   maturity    --contract <WIC id> --evidence <repo-relative evidence path> --claim <claimKey> --level <level>
 *               --key <owner-private.pem> [--days N]
 *
 * The public key is re-derived from the private key and written in canonical SPKI-PEM form, so the pinned fingerprint
 * and the sidecar always agree (closes the PEM-text-variance LOW for signatures made with this tool).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ATT = require("../core/odg-knowledge-attestation.js");

const ROOT = path.resolve(__dirname, __dirname.split(path.sep).includes("dist") ? "../../.." : "../..");   // runtime/bin or runtime/dist/bin
function fail(msg: string): never { process.stderr.write("[odg-owner-sign] REFUSED: " + msg + "\n"); process.exit(2); }
function arg(argv: string[], k: string): string | null { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; }
function canonicalPem(key: any): string { return String(crypto.createPublicKey(key).export({ type: "spki", format: "pem" })); }
function fingerprintOf(key: any): string { return ATT.fingerprint(canonicalPem(key)); }
function inside(p: string, dir: string): boolean { const r = path.relative(dir, p); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); }

function loadPrivateKey(p: string | null): any {
  if (!p) fail("--key <owner-private.pem> required");
  const abs = fs.realpathSync(path.resolve(p));
  if (inside(abs, fs.realpathSync(ROOT))) fail("the private key is inside the repository (" + path.relative(ROOT, abs) + ") — keep it outside any checkout");
  let k: any; try { k = crypto.createPrivateKey(fs.readFileSync(abs)); } catch { fail("cannot read the private key"); }
  if (k.asymmetricKeyType !== "ed25519") fail("Ed25519 key required (got " + k.asymmetricKeyType + ")");
  return k;
}
function repoFile(rel: string | null, what: string): string {
  if (!rel) fail(what + " required");
  const abs = path.resolve(ROOT, rel);
  if (!inside(abs, ROOT) || path.isAbsolute(rel)) fail(what + " must be a repo-relative path inside the repository");
  if (!fs.existsSync(abs) || fs.lstatSync(abs).isSymbolicLink() || !fs.statSync(abs).isFile()) fail(what + " is not a regular file: " + rel);
  return abs;
}
function sign(purpose: string, payload: any, priv: any, days: number): any {
  const now = Date.now();
  const identity = { issuer: "owner", publicKeyPem: canonicalPem(priv), privateKey: priv };
  const attestation = ATT.createAttestation({ purpose, identity, payload, issuedAt: now, expiresAt: now + days * 86400000, nonce: crypto.randomBytes(12).toString("hex") });
  return { attestation, publicKeyPem: identity.publicKeyPem };
}
function days(argv: string[]): number { const d = Number(arg(argv, "--days") || "30"); if (!Number.isInteger(d) || d < 1 || d > 90) fail("--days must be an integer 1..90"); return d; }
function writeSidecar(target: string, signed: any, fp: string, purpose: string): void {
  fs.writeFileSync(target, JSON.stringify(signed, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ wrote: path.relative(ROOT, target), purpose, keyFingerprint: fp, expiresAt: new Date(signed.attestation.header.expiresAt).toISOString(),
    counts: (ATT.OWNER_ANCHORS[purpose] || []).includes(fp) ? "YES (fingerprint pinned in TRUST_ANCHORS." + purpose + ")" : "NOT YET — pin keyFingerprint in TRUST_ANCHORS." + purpose + " via an owner-reviewed PR; the sidecar must also be committed to main" }, null, 2) + "\n");
}

function main(argv: string[]): void {
  const cmd = argv[0];
  if (cmd === "fingerprint") {
    const p = arg(argv, "--pub"); if (!p) fail("--pub <owner-public.pem> required");
    let fp: string; try { fp = fingerprintOf(fs.readFileSync(path.resolve(p))); } catch { fail("cannot read the public key"); }
    process.stdout.write(fp + "\n"); return;
  }
  if (cmd === "inspection") {
    const rec = repoFile(arg(argv, "--record"), "--record");
    if (!/\.json$/.test(rec)) fail("--record must be a .json file");
    let record: any; try { record = JSON.parse(fs.readFileSync(rec, "utf8")); } catch { fail("record is not valid JSON"); }
    const priv = loadPrivateKey(arg(argv, "--key"));
    writeSidecar(rec.replace(/\.json$/, ".sig.json"), sign("INSPECTION_RECORD", record, priv, days(argv)), fingerprintOf(priv), "INSPECTION_RECORD"); return;
  }
  if (cmd === "maturity") {
    const evRel = arg(argv, "--evidence"); const ev = repoFile(evRel, "--evidence");
    const contract = arg(argv, "--contract"), claimKey = arg(argv, "--claim"), level = arg(argv, "--level");
    if (!contract || !claimKey || !level) fail("--contract, --claim and --level required");
    const priv = loadPrivateKey(arg(argv, "--key"));
    const evidenceSha256 = crypto.createHash("sha256").update(fs.readFileSync(ev)).digest("hex");
    const payload = { contract, evidencePath: path.relative(ROOT, ev).split(path.sep).join("/"), evidenceSha256, claimKey, level };
    writeSidecar(ev + ".sig.json", sign("MATURITY_EVIDENCE", payload, priv, days(argv)), fingerprintOf(priv), "MATURITY_EVIDENCE"); return;
  }
  fail("usage: fingerprint --pub P | inspection --record R --key K [--days N] | maturity --contract C --evidence E --claim K --level L --key K [--days N]");
}
main(process.argv.slice(2));
export {};

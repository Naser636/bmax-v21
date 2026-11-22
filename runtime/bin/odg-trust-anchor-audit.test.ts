#!/usr/bin/env node
"use strict";
/* V15 closure — trust-anchor audit in a THROW-AWAY git repository. Proves: first-parent detection of every change that
 * landed (incl. an owner revoke followed by an UNSIGNED merge re-pinning the key — inspection HIGH-1); string-valued
 * purposes ⇒ MALFORMED (HIGH-2); PR attribution from the merge itself, direct pushes ⇒ DIRECT (MED-2); a G signature
 * counts as OWNER-signed only with the key listed in --signer-keys, and --require-signed without that list is refused
 * (MED-1). */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-anchor-audit-")));
const R = path.join(T, "repo"); fs.mkdirSync(path.join(R, "docs/odg/evidence"), { recursive: true });
const key = path.join(T, "owner_ed25519"); cp.spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "owner"]);
const sshOk = fs.existsSync(key + ".pub");
const CFG = path.join(T, "gitcfg");
fs.writeFileSync(path.join(T, "allowed"), sshOk ? "owner@example.invalid " + fs.readFileSync(key + ".pub", "utf8") : "");
fs.writeFileSync(CFG, `[user]\n\tname = Provider\n\temail = p@example.invalid\n[commit]\n\tgpgsign = false\n[gpg]\n\tformat = ssh\n[gpg "ssh"]\n\tallowedSignersFile = ${path.join(T, "allowed")}\n`);
const ENV = Object.assign({}, process.env, { GIT_CONFIG_GLOBAL: CFG, GIT_CONFIG_NOSYSTEM: "1" });
const g = (...args: string[]) => cp.spawnSync("git", ["-C", R, ...args], { encoding: "utf8", env: ENV });
const FILE = path.join(R, "docs/odg/evidence/TRUST_ANCHORS.json");
const put = (o: any) => fs.writeFileSync(FILE, JSON.stringify(Object.assign({ "//": "test", COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [], MATURITY_EVIDENCE: [] }, o)));
const SIGN = ["-c", "commit.gpgsign=true", "-c", "user.signingkey=" + key, "-c", "user.email=owner@example.invalid"];
const commit = (msg: string, signed = false) => { g("add", "-A"); return cp.spawnSync("git", ["-C", R, ...(signed ? SIGN : []), "commit", "-q", "-m", msg], { encoding: "utf8", env: ENV }); };
const run = (extra: string[]) => cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", R, "--ref", "main", "--json", ...extra], { encoding: "utf8", env: ENV });
const j = (r: any) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
const keyId = sshOk ? (g("log", "-1", "--format=%GK").stdout || "").trim() : "";
const SK = path.join(T, "signer-keys");
g("init", "-q", "-b", "main"); put({}); commit("init");
let a = j(run([]));
check("empty anchors ⇒ NO_ANCHORS_PINNED, the creation is recorded as DIRECT", a.verdict === "NO_ANCHORS_PINNED" && a.changes.length === 1 && a.changes[0].pr === "DIRECT");
check("--require-signed WITHOUT --signer-keys is REFUSED (a bare G proves nothing about the owner)", run(["--require-signed"]).status === 2);
// provider-style unsigned pin through a PR merge
g("checkout", "-q", "-b", "feat/pin"); put({ INSPECTION_RECORD: ["a".repeat(64)] }); commit("pin a key (unsigned)");
g("checkout", "-q", "main"); g("merge", "-q", "--no-ff", "-m", "Merge pull request #42 from x/feat/pin", "feat/pin");
a = j(run([]));
const p = (a.pinned || [])[0] || {};
check("unsigned pin DETECTED and ATTRIBUTED to PR #42 (from the merge itself), not owner-signed", p.purpose === "INSPECTION_RECORD" && p.introducedAt && p.introducedAt.pr === "#42" && p.introducedAt.authoredBy.length === 1 && p.introducedAt.authoredBy[0].signature !== "G" && p.ownerSigned === false && a.verdict === "PINS_PRESENT_SIGNERS_UNVERIFIED");
if (sshOk) {
  put({}); commit("revoke the unsigned pin");
  put({ MATURITY_EVIDENCE: ["b".repeat(64)] }); commit("owner pins X (signed)", true);
  const sigKey = (g("log", "-1", "--format=%GK").stdout || "").trim(); fs.writeFileSync(SK, "# owner keys\n" + sigKey + "\n");
  a = j(run(["--signer-keys", SK]));
  check("owner-signed pin (G + key listed) ⇒ ALL_PINS_OWNER_SIGNED; --require-signed passes", a.verdict === "ALL_PINS_OWNER_SIGNED" && run(["--signer-keys", SK, "--require-signed"]).status === 0);
  fs.writeFileSync(path.join(T, "other-keys"), "SHA256:not-the-owner\n");
  check("same G signature but key NOT in --signer-keys ⇒ not owner-signed, --require-signed fails", j(run(["--signer-keys", path.join(T, "other-keys")])).verdict === "PINS_NOT_OWNER_SIGNED" && run(["--signer-keys", path.join(T, "other-keys"), "--require-signed"]).status === 1);
  // HIGH-1 scenario: side branch from the signed pin; owner revokes on main; an UNSIGNED merge restores the side's file
  g("branch", "side"); g("checkout", "-q", "side"); fs.writeFileSync(path.join(R, "unrelated.txt"), "x"); commit("unrelated");
  g("checkout", "-q", "main"); put({}); commit("owner revokes X (signed)", true);
  g("merge", "-q", "--no-ff", "--no-commit", "side"); g("checkout", "side", "--", "docs/odg/evidence/TRUST_ANCHORS.json"); g("add", "-A");
  cp.spawnSync("git", ["-C", R, "commit", "-q", "-m", "Merge pull request #78 from x/side"], { encoding: "utf8", env: ENV });
  a = j(run(["--signer-keys", SK]));
  const reb = (a.changes || []).filter((c: any) => c.pr === "#78");
  check("HIGH-1: revoke then UNSIGNED re-pin via merge is VISIBLE (revoke + re-add both in changes) and NOT owner-signed", (a.changes || []).some((c: any) => c.removed.some((r: any) => r.fingerprint === "b".repeat(64))) && reb.length === 1 && reb[0].added.some((x: any) => x.fingerprint === "b".repeat(64)) && a.verdict === "PINS_NOT_OWNER_SIGNED" && run(["--signer-keys", SK, "--require-signed"]).status === 1);
} else process.stdout.write("skip - ssh-keygen unavailable (signed paths not exercised)\n");
// HIGH-2: string-valued purpose (substring-matchable by a naive consumer) ⇒ MALFORMED
fs.writeFileSync(FILE, JSON.stringify({ COLLECTION_ARTIFACT: "c".repeat(64), KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [], MATURITY_EVIDENCE: [] })); commit("string-valued purpose");
a = j(run([]));
check("HIGH-2: a non-array purpose value ⇒ ANCHOR_FILE_MALFORMED, exit 1", a.verdict === "ANCHOR_FILE_MALFORMED" && run([]).status === 1);
fs.writeFileSync(FILE, "{not json"); commit("corrupt");
check("invalid JSON ⇒ ANCHOR_FILE_MALFORMED, exit 1", j(run([])).verdict === "ANCHOR_FILE_MALFORMED" && run([]).status === 1);
fs.writeFileSync(FILE, "﻿" + JSON.stringify({ COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [], MATURITY_EVIDENCE: [] })); commit("bom");
check("UTF-8 BOM is tolerated like require() does (no false MALFORMED)", j(run([])).verdict === "NO_ANCHORS_PINNED");
check("unknown ref ⇒ exit 1 (fail closed)", cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", R, "--ref", "no-such-ref"], { encoding: "utf8", env: ENV }).status === 1);
const real = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", ROOT, "--ref", "HEAD", "--json"], { encoding: "utf8" });
check("the real repository (HEAD) pins no anchor", j(real).verdict === "NO_ANCHORS_PINNED");
void keyId;
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-trust-anchor-audit (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};

#!/usr/bin/env node
"use strict";
/* V15 closure — trust-anchor audit in a THROW-AWAY git repository: detects every add/remove per purpose, attributes each
 * pin to its introducing commit + PR merge, reports the commit signature status, and `--require-signed` fails on a pin
 * introduced by an unsigned commit and passes on one introduced by a GOOD-signed commit (SSH signing, test key). */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-anchor-audit-")));
const R = path.join(T, "repo"); fs.mkdirSync(path.join(R, "docs/odg/evidence"), { recursive: true });
const g = (args: string[], env: any = {}) => cp.spawnSync("git", ["-C", R, ...args], { encoding: "utf8", env: Object.assign({}, process.env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }, env) });
const FILE = path.join(R, "docs/odg/evidence/TRUST_ANCHORS.json");
const put = (o: any) => fs.writeFileSync(FILE, JSON.stringify(Object.assign({ "//": "test", COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [], MATURITY_EVIDENCE: [] }, o)));
const commit = (msg: string, extra: string[] = []) => { g(["add", "-A"]); return g([...extra, "commit", "-q", "-m", msg]); };
g(["init", "-q", "-b", "main"]); g(["config", "user.name", "Provider"]); g(["config", "user.email", "p@example.invalid"]); g(["config", "commit.gpgsign", "false"]);
put({}); commit("init");
const audit = (extra: string[] = []) => cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", R, "--ref", "main", "--json", ...extra], { encoding: "utf8", env: Object.assign({}, process.env, { GIT_CONFIG_GLOBAL: path.join(T, "gitcfg") }) });
fs.writeFileSync(path.join(T, "gitcfg"), "");
const j = (r: any) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
let a = j(audit());
check("empty anchors ⇒ NO_ANCHORS_PINNED, 1 change recorded", a.verdict === "NO_ANCHORS_PINNED" && a.changes.length === 1);
check("--require-signed passes when nothing is pinned", audit(["--require-signed"]).status === 0);
// provider-style: unsigned pin through a PR-like merge
g(["checkout", "-q", "-b", "feat/pin"]); put({ INSPECTION_RECORD: ["a".repeat(64)] }); commit("pin a key (unsigned)");
g(["checkout", "-q", "main"]); g(["merge", "-q", "--no-ff", "-m", "Merge pull request #42 from x/feat/pin", "feat/pin"]);
a = j(audit());
const p = (a.pinned || [])[0] || {};
check("unsigned pin DETECTED and ATTRIBUTED (purpose, introducing commit, PR #42, sig≠G)", a.verdict === "PINS_FROM_UNSIGNED_COMMITS" && p.purpose === "INSPECTION_RECORD" && p.introducedBy && /^#42 /.test(p.introducedBy.pr) && p.introducedBy.signature !== "G" && p.signedIntroduction === false);
check("--require-signed FAILS on a pin introduced by an unsigned commit", audit(["--require-signed"]).status === 1);
// owner-style: good SSH-signed commit (test key, allowed signers configured for the audit's git)
const key = path.join(T, "owner_ed25519"); cp.spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key, "-C", "owner"]);
const sshOk = fs.existsSync(key + ".pub");
if (sshOk) {
  fs.writeFileSync(path.join(T, "allowed"), "owner@example.invalid " + fs.readFileSync(key + ".pub", "utf8"));
  fs.writeFileSync(path.join(T, "gitcfg"), `[gpg]\n\tformat = ssh\n[gpg "ssh"]\n\tallowedSignersFile = ${path.join(T, "allowed")}\n`);
  put({ INSPECTION_RECORD: [] }); commit("revoke unsigned pin");
  put({ MATURITY_EVIDENCE: ["b".repeat(64)] });
  const sc = commit("owner pins a key (signed)", ["-c", "gpg.format=ssh", "-c", "user.signingkey=" + key, "-c", "user.email=owner@example.invalid", "-c", "commit.gpgsign=true"]);
  a = j(audit());
  const q = (a.pinned || [])[0] || {};
  check("removal recorded in history (−1 on INSPECTION_RECORD)", (a.changes || []).some((c: any) => c.removed.some((r: any) => r.purpose === "INSPECTION_RECORD")));
  check("signed pin ⇒ signature G, verdict ALL_PINS_SIGNED_COMMITS", sc.status === 0 && q.purpose === "MATURITY_EVIDENCE" && q.introducedBy && q.introducedBy.signature === "G" && a.verdict === "ALL_PINS_SIGNED_COMMITS");
  check("--require-signed passes when every current pin comes from a good-signed commit", audit(["--require-signed"]).status === 0);
} else process.stdout.write("skip - ssh-keygen unavailable (signed path not exercised)\n");
fs.writeFileSync(FILE, "{not json"); commit("corrupt");
check("malformed anchor file ⇒ ANCHOR_FILE_MALFORMED, exit 1", j(audit()).verdict === "ANCHOR_FILE_MALFORMED" && audit().status === 1);
check("unknown ref ⇒ exit 1 (fail closed)", cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", R, "--ref", "no-such-ref"], { encoding: "utf8" }).status === 1);
const real = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-trust-anchor-audit.ts"), "--repo", ROOT, "--ref", "HEAD", "--json"], { encoding: "utf8" });
check("the real repository (HEAD) pins no anchor", j(real).verdict === "NO_ANCHORS_PINNED");
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-trust-anchor-audit (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};

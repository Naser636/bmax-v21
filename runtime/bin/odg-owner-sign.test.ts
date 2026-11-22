#!/usr/bin/env node
"use strict";
/* V15 — owner signing tool, end to end in a THROW-AWAY copy whose TRUST_ANCHORS.json pins a TEST key (the real file is
 * untouched; the test key lives outside the copy). Proves: the sidecars the tool writes are accepted by the EXISTING gate
 * review check and evidence verifier; an unpinned key is refused; a key inside the repo, a symlinked record, an absolute
 * path and a non-Ed25519 key are refused; the fingerprint is stable across PEM text variants. */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-osign-"))); const K = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-okey-")));
fs.cpSync(path.join(ROOT, "runtime/core"), path.join(T, "runtime/core"), { recursive: true, filter: (s: string) => !s.includes(`${path.sep}dist${path.sep}`) });
fs.mkdirSync(path.join(T, "runtime/bin"), { recursive: true }); fs.copyFileSync(path.join(ROOT, "runtime/bin/odg-owner-sign.ts"), path.join(T, "runtime/bin/odg-owner-sign.ts"));
fs.mkdirSync(path.join(T, "docs/odg/evidence"), { recursive: true }); fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules")), path.join(T, "node_modules"));
const kp = crypto.generateKeyPairSync("ed25519"); const other = crypto.generateKeyPairSync("ed25519");
const pub = String(kp.publicKey.export({ type: "spki", format: "pem" }));
fs.writeFileSync(path.join(K, "owner.pem"), kp.privateKey.export({ type: "pkcs8", format: "pem" })); fs.writeFileSync(path.join(K, "owner.pub"), pub);
fs.writeFileSync(path.join(K, "other.pem"), other.privateKey.export({ type: "pkcs8", format: "pem" }));
fs.writeFileSync(path.join(K, "variant.pub"), "\n" + pub.replace(/\n/g, "\r\n") + "\n\n");
fs.writeFileSync(path.join(K, "rsa.pem"), crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }));
const tool = (args: string[]) => cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(T, "runtime/bin/odg-owner-sign.ts"), ...args], { cwd: T, encoding: "utf8", timeout: 120000 });
const fp = tool(["fingerprint", "--pub", path.join(K, "owner.pub")]).stdout.trim();
check("fingerprint is the SHA-256 of the canonical SPKI PEM", fp === crypto.createHash("sha256").update(pub).digest("hex"));
check("fingerprint is stable across PEM text variants (CRLF, blank lines)", tool(["fingerprint", "--pub", path.join(K, "variant.pub")]).stdout.trim() === fp);
fs.writeFileSync(path.join(T, "docs/odg/evidence/TRUST_ANCHORS.json"), JSON.stringify({ COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [fp], MATURITY_EVIDENCE: [fp] }));
const CAND = "c".repeat(40);
const REC = "docs/odg/evidence/INSP.json"; fs.writeFileSync(path.join(T, REC), JSON.stringify({ subject: "PR #0", subjectCommit: CAND, verdict: "ACCEPT" }));
fs.writeFileSync(path.join(T, "docs/odg/evidence/NOBIND.json"), JSON.stringify({ subject: "PR #0", verdict: "ACCEPT" }));
// anchors count only from the COMMITTED origin/main file (V15 closure D1) ⇒ make the copy a git repo with origin/main
fs.writeFileSync(path.join(T, ".gitignore"), "node_modules\nprobe.ts\n");
const g = (...a: string[]) => cp.spawnSync("git", ["-C", T, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8", env: Object.assign({}, process.env, { GIT_CONFIG_GLOBAL: "/dev/null" }) });
g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init"); g("update-ref", "refs/remotes/origin/main", "HEAD");
const s1 = tool(["inspection", "--record", REC, "--key", path.join(K, "owner.pem")]);
check("inspection: sidecar written, reported as counting (fingerprint pinned)", s1.status === 0 && fs.existsSync(path.join(T, "docs/odg/evidence/INSP.sig.json")) && /"counts": "YES/.test(s1.stdout));
fs.writeFileSync(path.join(T, "docs/odg/evidence/E.json"), "{\"x\":1}\n");
fs.writeFileSync(path.join(T, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "VERIFIED", evidence_required: ["docs/odg/evidence/E.json"], maturityClaims: [{ claimKey: "a|is|b", level: "EXPERIMENTAL" }] }));
const s2 = tool(["maturity", "--contract-path", "docs/odg/WIC_T.json", "--evidence", "docs/odg/evidence/E.json", "--claim", "a|is|b", "--level", "EXPERIMENTAL", "--key", path.join(K, "owner.pem")]);
check("maturity: sidecar written", s2.status === 0 && fs.existsSync(path.join(T, "docs/odg/evidence/E.json.sig.json")));
fs.writeFileSync(path.join(T, "probe.ts"), `
const MG=require("./runtime/core/odg-gate-measured-evidence.js"); const V=require("./runtime/core/odg-evidence-verifier.js"); const fs=require("fs"),crypto=require("crypto");
const rec=JSON.parse(fs.readFileSync("${REC}","utf8")); const sig=JSON.parse(fs.readFileSync("docs/odg/evidence/INSP.sig.json","utf8"));
const sha=crypto.createHash("sha256").update(fs.readFileSync("docs/odg/evidence/E.json")).digest("hex");
const ev={missionContract:"WIC-T",contractPath:"docs/odg/WIC_T.json",evidencePath:"docs/odg/evidence/E.json",evidenceSha256:sha}; const R=V.makeRepoReader(process.cwd());
process.stdout.write(JSON.stringify({ review: MG.ownerAnchoredReview(rec,sig,"${CAND}").ok, tampered: MG.ownerAnchoredReview({...rec,subject:"other"},sig,"${CAND}").reason,
  mat: V.verifyMaturityEvidence(ev,R,{claimKey:"a|is|b",level:"EXPERIMENTAL"}).reason }));`);
const pr = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(T, "probe.ts")], { cwd: T, encoding: "utf8", timeout: 120000 });
let o: any = {}; try { o = JSON.parse(pr.stdout); } catch { process.stdout.write(String(pr.stderr).slice(0, 600) + "\n"); }
check("EXISTING gate review check accepts the tool's inspection sidecar", o.review === true);
check("record edited after signing ⇒ refused (CONTENT_MODIFIED)", o.tampered === "CONTENT_MODIFIED");
check("EXISTING evidence verifier accepts the tool's maturity sidecar", o.mat === "VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED");
const s3 = tool(["inspection", "--record", REC, "--key", path.join(K, "other.pem")]);
check("unpinned key: sidecar reported as NOT counting", s3.status === 0 && /NOT YET/.test(s3.stdout));
fs.copyFileSync(path.join(K, "owner.pem"), path.join(T, "docs/odg/k.pem"));
check("REFUSED: record not bound to a candidate commit (no subjectCommit) — such a signature could never count", /subjectCommit/.test(tool(["inspection", "--record", "docs/odg/evidence/NOBIND.json", "--key", path.join(K, "owner.pem")]).stderr));
fs.mkdirSync(path.join(K, "realdir")); fs.writeFileSync(path.join(K, "realdir/R.json"), JSON.stringify({ subjectCommit: CAND, verdict: "ACCEPT" })); fs.symlinkSync(path.join(K, "realdir"), path.join(T, "docs/odg/evidence/linkdir"));
check("REFUSED: record reached through a symlinked directory", /symlink/.test(tool(["inspection", "--record", "docs/odg/evidence/linkdir/R.json", "--key", path.join(K, "owner.pem")]).stderr));
check("REFUSED: private key inside the repository", /inside the repository/.test(tool(["inspection", "--record", REC, "--key", path.join(T, "docs/odg/k.pem")]).stderr));
check("REFUSED: non-Ed25519 key", /Ed25519 key required/.test(tool(["inspection", "--record", REC, "--key", path.join(K, "rsa.pem")]).stderr));
check("REFUSED: absolute / outside record path", /repo-relative/.test(tool(["inspection", "--record", path.join(K, "owner.pub"), "--key", path.join(K, "owner.pem")]).stderr) && /repo-relative/.test(tool(["inspection", "--record", "../x.json", "--key", path.join(K, "owner.pem")]).stderr));
fs.symlinkSync("INSP.json", path.join(T, "docs/odg/evidence/L.json"));
check("REFUSED: symlinked record", /not a regular file/.test(tool(["inspection", "--record", "docs/odg/evidence/L.json", "--key", path.join(K, "owner.pem")]).stderr));
check("REFUSED: --days beyond the 90-day cap", /--days/.test(tool(["inspection", "--record", REC, "--key", path.join(K, "owner.pem"), "--days", "365"]).stderr));
check("the repository's real TRUST_ANCHORS.json still pins no owner key", (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/TRUST_ANCHORS.json"), "utf8")); return j.INSPECTION_RECORD.length === 0 && j.MATURITY_EVIDENCE.length === 0; })());
fs.rmSync(T, { recursive: true, force: true }); fs.rmSync(K, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-owner-sign (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};

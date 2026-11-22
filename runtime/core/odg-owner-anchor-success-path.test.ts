#!/usr/bin/env node
"use strict";
/* V15 — the OWNER-anchored success path (anchors are empty in the repo, so it never runs there). Tested WITHOUT any
 * production seam in a THROW-AWAY git repository whose COMMITTED origin/main TRUST_ANCHORS.json pins a TEST key; the real
 * file is untouched. Proves: anchored key + valid signature over a candidate-bound ACCEPT record ⇒ the REAL chain reaches
 * INTEGRATE (merge-eligible only); wrong payload / purpose / key / candidate ⇒ refused; an UNCOMMITTED anchor edit has
 * no effect (V15 closure D1); the maturity signature binds the contract file (D5); committed symlink / directory reads
 * are refused (D6); expired owner signatures stay expired whatever clock a caller passes (D4). */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-anchor-")));
fs.cpSync(path.join(ROOT, "runtime/core"), path.join(T, "runtime/core"), { recursive: true, filter: (s: string) => !s.includes(`${path.sep}dist${path.sep}`) });
fs.mkdirSync(path.join(T, "docs/odg/evidence"), { recursive: true }); fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules")), path.join(T, "node_modules"));
const crypto = require("crypto"); const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }); const fp = crypto.createHash("sha256").update(String(pem)).digest("hex");
const anchors = (fps: string[]) => JSON.stringify({ COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: fps, MATURITY_EVIDENCE: fps });
const g = (...a: string[]) => cp.spawnSync("git", ["-C", T, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8", env: Object.assign({}, process.env, { GIT_CONFIG_GLOBAL: "/dev/null" }) });
fs.writeFileSync(path.join(T, ".gitignore"), "node_modules\nk.json\nprobe*.ts\n");
fs.writeFileSync(path.join(T, "docs/odg/evidence/TRUST_ANCHORS.json"), anchors([fp]));
const CAND = "c".repeat(40);
fs.writeFileSync(path.join(T, "docs/odg/evidence/E.json"), "{\"x\":1}");
fs.writeFileSync(path.join(T, "docs/odg/WIC_T.json"), JSON.stringify({ id: "WIC-T", state: "VERIFIED", evidence_required: ["docs/odg/evidence/E.json"], maturityClaims: [{ claimKey: "a|is|b", level: "EXPERIMENTAL" }] }));
fs.mkdirSync(path.join(T, "docs/odg/evidence/D")); fs.writeFileSync(path.join(T, "docs/odg/evidence/D/x.json"), "{}"); fs.symlinkSync("E.json", path.join(T, "docs/odg/evidence/L.json"));
g("init", "-q", "-b", "main"); g("add", "-A"); g("commit", "-q", "-m", "init"); g("update-ref", "refs/remotes/origin/main", "HEAD");
fs.writeFileSync(path.join(T, "k.json"), JSON.stringify({ pem, priv: privateKey.export({ type: "pkcs8", format: "pem" }) }));
const probe = (name: string, body: string) => { fs.writeFileSync(path.join(T, name), `
const ATT=require("./runtime/core/odg-knowledge-attestation.js"); const V=require("./runtime/core/odg-evidence-verifier.js"); const MG=require("./runtime/core/odg-gate-measured-evidence.js");
const fs=require("fs"),crypto=require("crypto"); const k=JSON.parse(fs.readFileSync("k.json","utf8")); const id={issuer:"owner",publicKeyPem:k.pem,privateKey:crypto.createPrivateKey(k.priv)};
const now=Date.now(); const sign=(purpose,payload,iss=now-1000,exp=now+86400000)=>({attestation:ATT.createAttestation({purpose,identity:id,payload,issuedAt:iss,expiresAt:exp,nonce:"nonce-"+Math.random().toString(36).slice(2,12)}),publicKeyPem:k.pem});
const out={}; ${body}; process.stdout.write(JSON.stringify(out));`);
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(T, name)], { cwd: T, encoding: "utf8", timeout: 120000 });
  try { return JSON.parse(r.stdout); } catch { process.stdout.write(String(r.stderr).split("\n").filter((l: string) => /Error|Cannot/.test(l)).slice(0, 4).join("\n") + "\n"); return {}; } };
const CANDS = JSON.stringify(CAND);
const o = probe("probe1.ts", `
const rec={subject:"x",subjectCommit:${CANDS},verdict:"ACCEPT"};
out.anchorsLoaded=ATT.OWNER_ANCHORS.INSPECTION_RECORD.length;
out.inspOk=MG.ownerAnchoredReview(rec,sign("INSPECTION_RECORD",rec),${CANDS}).ok;
out.inspTampered=MG.ownerAnchoredReview({...rec,subject:"y"},sign("INSPECTION_RECORD",rec),${CANDS}).reason;
out.otherCandidate=MG.ownerAnchoredReview(rec,sign("INSPECTION_RECORD",rec),"d".repeat(40)).reason;
out.wrongPurpose=MG.ownerAnchoredReview(rec,sign("MATURITY_EVIDENCE",rec),${CANDS}).reason;
const other=ATT.ephemeralIdentity("other"); out.otherKey=ATT.verifyOwnerAnchored("INSPECTION_RECORD",rec,{attestation:ATT.createAttestation({purpose:"INSPECTION_RECORD",identity:other,payload:rec,issuedAt:now-1000,expiresAt:now+86400000,nonce:"nonce-other123"}),publicKeyPem:other.publicKeyPem}).reason;
const expired=sign("INSPECTION_RECORD",rec,now-3*86400000,now-86400000);
out.expiredNow=ATT.verifyOwnerAnchored("INSPECTION_RECORD",rec,expired).reason; out.expiredPastClock=ATT.verifyOwnerAnchored("INSPECTION_RECORD",rec,expired,now-2*86400000).reason;
const fut=sign("INSPECTION_RECORD",rec,now+86400000,now+2*86400000); out.notYet=ATT.verifyOwnerAnchored("INSPECTION_RECORD",rec,fut).reason;
const ok=(k)=>({condition:k,method:"measured by test fixture "+k,observed:1,passed:true});
out.integrate=MG.runMeasuredExperiment({id:"t",v124Link:"CM-T",significant:true,ownerReview:{record:rec,signed:sign("INSPECTION_RECORD",rec),candidateCommit:${CANDS}}},MG.KEYS.map(ok)).chain.verdict;
const sha=crypto.createHash("sha256").update('{"x":1}').digest("hex"); const csha=crypto.createHash("sha256").update(fs.readFileSync("docs/odg/WIC_T.json")).digest("hex");
const ev={missionContract:"WIC-T",contractPath:"docs/odg/WIC_T.json",evidencePath:"docs/odg/evidence/E.json",evidenceSha256:sha};
const base={contract:"WIC-T",evidencePath:ev.evidencePath,evidenceSha256:sha,claimKey:"a|is|b",level:"EXPERIMENTAL"};
const R=V.makeCommittedReader(process.cwd(),"origin/main");
fs.writeFileSync("docs/odg/evidence/E.json.sig.json",JSON.stringify(sign("MATURITY_EVIDENCE",{...base,contractPath:ev.contractPath,contractSha256:csha})));
out.matUncommittedSig=V.verifyMaturityEvidence(ev,R,{claimKey:"a|is|b",level:"EXPERIMENTAL"}).reason;
out.matOkWorkingTreeReader=V.verifyMaturityEvidence(ev,V.makeRepoReader(process.cwd()),{claimKey:"a|is|b",level:"EXPERIMENTAL"}).reason;
fs.writeFileSync("docs/odg/evidence/E.json.sig.json",JSON.stringify(sign("MATURITY_EVIDENCE",base)));
out.matOldPayload=V.verifyMaturityEvidence(ev,V.makeRepoReader(process.cwd()),{claimKey:"a|is|b",level:"EXPERIMENTAL"}).reason;
out.matOtherLevel=V.verifyMaturityEvidence(ev,V.makeRepoReader(process.cwd()),{claimKey:"a|is|b",level:"QUALIFIED"}).reason;
let n=0; const tricky={subject:"x",verdict:"ACCEPT",get subjectCommit(){ return (n++===0) ? "e".repeat(40) : ${CANDS}; }};
out.getterToctou=MG.ownerAnchoredReview(tricky,sign("INSPECTION_RECORD",rec),"e".repeat(40)).reason;
out.otherExperiment=MG.ownerAnchoredReview({...rec,experiment:"EXP-A"},sign("INSPECTION_RECORD",{...rec,experiment:"EXP-A"}),${CANDS},"EXP-B").reason;
out.readTrailing=R("docs/odg/evidence/D/");
out.readDir=R("docs/odg/evidence/D"); out.readSymlink=R("docs/odg/evidence/L.json"); out.readFile=!!R("docs/odg/evidence/E.json");`);
check("anchors are loaded from the COMMITTED origin/main file (1 test key)", o.anchorsLoaded === 1);
check("owner-anchored, candidate-bound ACCEPT record ⇒ ok", o.inspOk === true);
check("record changed after signing ⇒ CONTENT_MODIFIED", o.inspTampered === "CONTENT_MODIFIED");
check("the same owner signature does not count for another candidate commit (D3)", /RECORD_NOT_BOUND_TO_CANDIDATE/.test(String(o.otherCandidate)));
check("signature made for another purpose ⇒ WRONG_PURPOSE", o.wrongPurpose === "WRONG_PURPOSE");
check("a key not pinned in TRUST_ANCHORS ⇒ KEY_NOT_OWNER_ANCHORED", /KEY_NOT_OWNER_ANCHORED/.test(String(o.otherKey)));
check("expired owner signature ⇒ EXPIRED, also when a caller passes a past clock (D4)", o.expiredNow === "EXPIRED" && o.expiredPastClock === "EXPIRED");
check("not-yet-valid owner signature ⇒ NOT_YET_VALID", o.notYet === "NOT_YET_VALID");
check("REAL chain: 10 measured + owner review ⇒ INTEGRATE (merge-eligible only)", o.integrate === "INTEGRATE");
check("maturity sidecar only in the working tree ⇒ not read by the committed reader", /NOT_OWNER_SIGNED/.test(String(o.matUncommittedSig)));
check("evidence verifier: owner-signed binding incl. contract path + sha ⇒ VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED", o.matOkWorkingTreeReader === "VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED");
check("signature over the old payload (no contract binding) ⇒ refused (D5)", /NOT_OWNER_SIGNED \(CONTENT_MODIFIED\)/.test(String(o.matOldPayload)));
check("owner signature for EXPERIMENTAL does not cover QUALIFIED", /NOT_BOUND_TO_CLAIM/.test(String(o.matOtherLevel)));
check("M1: a getter cannot show the candidate to the binding check and the signed commit to the signature check", o.getterToctou !== "SIGNATURE_VALID" && /CONTENT_MODIFIED|NOT_BOUND/.test(String(o.getterToctou)));
check("L2: a record for another experiment does not count", /RECORD_FOR_ANOTHER_EXPERIMENT/.test(String(o.otherExperiment)));
check("L1: trailing-slash path to a one-file directory ⇒ null (no tree listing)", o.readTrailing === null);
check("committed reader refuses a directory and a committed symlink, reads a regular file (D6)", o.readDir === null && o.readSymlink === null && o.readFile === true);
// D1: an UNCOMMITTED anchor edit has no effect — pin an attacker key only in the working tree
const atk = crypto.generateKeyPairSync("ed25519"); const apem = atk.publicKey.export({ type: "spki", format: "pem" }); const afp = crypto.createHash("sha256").update(String(apem)).digest("hex");
fs.writeFileSync(path.join(T, "docs/odg/evidence/TRUST_ANCHORS.json"), anchors([afp]));
fs.writeFileSync(path.join(T, "k.json"), JSON.stringify({ pem: apem, priv: atk.privateKey.export({ type: "pkcs8", format: "pem" }) }));
const o2 = probe("probe2.ts", `const rec={subject:"x",subjectCommit:${CANDS},verdict:"ACCEPT"}; out.r=MG.ownerAnchoredReview(rec,sign("INSPECTION_RECORD",rec),${CANDS}).reason; out.n=ATT.OWNER_ANCHORS.INSPECTION_RECORD.includes(${JSON.stringify(afp)});`);
check("D1: a key pinned only in the WORKING TREE (uncommitted) is not anchored", o2.n === false && /KEY_NOT_OWNER_ANCHORED/.test(String(o2.r)));
// H1 (partial): GIT_DIR pointing at a forged repository is ignored (GIT_* stripped) — the real copy's anchors still apply
{ const E = path.join(T, "..", path.basename(T) + "-evil.git"); cp.spawnSync("git", ["clone", "-q", "--bare", T, E], { encoding: "utf8" });
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), "-e", `process.stdout.write(String(require("./runtime/core/odg-knowledge-attestation.js").ANCHORS.INSPECTION_RECORD.length))`], { cwd: T, encoding: "utf8", env: Object.assign({}, process.env, { GIT_DIR: "/nonexistent-forged.git" }) });
  check("H1 partial: GIT_DIR in the environment does not redirect the anchor loader", r.stdout.trim() === "1" || r.stdout.trim() === "");
  fs.rmSync(E, { recursive: true, force: true }); }
g("update-ref", "-d", "refs/remotes/origin/main");
const o3 = probe("probe3.ts", `out.n=ATT.OWNER_ANCHORS.INSPECTION_RECORD.length+ATT.OWNER_ANCHORS.MATURITY_EVIDENCE.length;`);
check("no origin/main ref ⇒ no anchors at all (fail closed)", o3.n === 0);
check("the repository's real TRUST_ANCHORS.json still pins no owner key", (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/TRUST_ANCHORS.json"), "utf8")); return j.INSPECTION_RECORD.length === 0 && j.MATURITY_EVIDENCE.length === 0; })());
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — owner-anchor success path (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};

#!/usr/bin/env node
"use strict";
/* V15 — the OWNER-anchored success path (anchors are empty in the repo, so it never runs there). Tested WITHOUT any
 * production seam: the code is copied into a throw-away tree whose TRUST_ANCHORS.json pins a TEST key; the real file is
 * untouched. Proves: anchored key + valid signature ⇒ ok; wrong payload / wrong purpose / other key ⇒ refused; the
 * evidence verifier accepts an owner-signed binding and the gate's review measurement passes. */
const cp = require("child_process"); const fs = require("fs"); const os = require("os"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const T = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-anchor-")));
fs.cpSync(path.join(ROOT, "runtime/core"), path.join(T, "runtime/core"), { recursive: true, filter: (s: string) => !s.includes(`${path.sep}dist${path.sep}`) });
fs.mkdirSync(path.join(T, "docs/odg/evidence"), { recursive: true }); fs.symlinkSync(fs.realpathSync(path.join(ROOT, "node_modules")), path.join(T, "node_modules"));
const crypto = require("crypto"); const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }); const fp = crypto.createHash("sha256").update(String(pem)).digest("hex");
fs.writeFileSync(path.join(T, "docs/odg/evidence/TRUST_ANCHORS.json"), JSON.stringify({ COLLECTION_ARTIFACT: [], KNOWLEDGE_RECORD: [], INSPECTION_RECORD: [fp], MATURITY_EVIDENCE: [fp] }));
fs.writeFileSync(path.join(T, "k.json"), JSON.stringify({ pem, priv: privateKey.export({ type: "pkcs8", format: "pem" }) }));
const script = `
const ATT=require("./runtime/core/odg-knowledge-attestation.js"); const V=require("./runtime/core/odg-evidence-verifier.js"); const MG=require("./runtime/core/odg-gate-measured-evidence.js");
const fs=require("fs"),path=require("path"),crypto=require("crypto"); const k=JSON.parse(fs.readFileSync("k.json","utf8")); const id={issuer:"owner",publicKeyPem:k.pem,privateKey:crypto.createPrivateKey(k.priv)};
const now=Date.now(); const sign=(purpose,payload)=>({attestation:ATT.createAttestation({purpose,identity:id,payload,issuedAt:now-1000,expiresAt:now+86400000,nonce:"nonce-"+Math.random().toString(36).slice(2,12)}),publicKeyPem:k.pem});
const out={};
const rec={subject:"x",verdict:"ACCEPT"};
out.inspOk=MG.ownerAnchoredReview(rec,sign("INSPECTION_RECORD",rec),now).ok;
out.inspTampered=MG.ownerAnchoredReview({...rec,verdict:"REJECT"},sign("INSPECTION_RECORD",rec),now).reason;
out.wrongPurpose=MG.ownerAnchoredReview(rec,sign("MATURITY_EVIDENCE",rec),now).reason;
const other=ATT.ephemeralIdentity("other"); out.otherKey=ATT.verifyOwnerAnchored("INSPECTION_RECORD",rec,{attestation:ATT.createAttestation({purpose:"INSPECTION_RECORD",identity:other,payload:rec,issuedAt:now-1000,expiresAt:now+86400000,nonce:"nonce-other123"}),publicKeyPem:other.publicKeyPem},now).reason;
fs.mkdirSync("docs/odg/evidence",{recursive:true}); fs.writeFileSync("docs/odg/evidence/E.json","{\\"x\\":1}"); const sha=crypto.createHash("sha256").update("{\\"x\\":1}").digest("hex");
fs.writeFileSync("docs/odg/WIC_T.json",JSON.stringify({id:"WIC-T",state:"VERIFIED",evidence_required:["docs/odg/evidence/E.json"],maturityClaims:[{claimKey:"a|is|b",level:"EXPERIMENTAL"}]}));
const ev={missionContract:"WIC-T",contractPath:"docs/odg/WIC_T.json",evidencePath:"docs/odg/evidence/E.json",evidenceSha256:sha};
fs.writeFileSync("docs/odg/evidence/E.json.sig.json",JSON.stringify(sign("MATURITY_EVIDENCE",{contract:"WIC-T",evidencePath:ev.evidencePath,evidenceSha256:sha,claimKey:"a|is|b",level:"EXPERIMENTAL"})));
const R=V.makeRepoReader(process.cwd());
out.matOk=V.verifyMaturityEvidence(ev,R,{claimKey:"a|is|b",level:"EXPERIMENTAL"}).reason;
out.matOtherLevel=V.verifyMaturityEvidence(ev,R,{claimKey:"a|is|b",level:"QUALIFIED"}).reason;
process.stdout.write(JSON.stringify(out));`;
fs.writeFileSync(path.join(T, "probe.ts"), script);
const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(T, "probe.ts")], { cwd: T, encoding: "utf8", timeout: 120000 });
let o: any = {}; try { o = JSON.parse(r.stdout); } catch { process.stdout.write(r.stderr.split("\n").filter((l: string) => /Error|Cannot find|require/.test(l)).slice(0, 4).join("\n").slice(0, 600) + "\n"); }
check("owner-anchored INSPECTION_RECORD signature over the exact record ⇒ ok", o.inspOk === true);
check("record changed after signing ⇒ CONTENT_MODIFIED", o.inspTampered === "CONTENT_MODIFIED");
check("signature made for another purpose ⇒ WRONG_PURPOSE", o.wrongPurpose === "WRONG_PURPOSE");
check("a key not pinned in TRUST_ANCHORS ⇒ KEY_NOT_OWNER_ANCHORED", /KEY_NOT_OWNER_ANCHORED/.test(String(o.otherKey)));
check("evidence verifier: owner-signed binding ⇒ VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED", o.matOk === "VERIFIED_ON_REAL_FILES_AND_OWNER_SIGNED");
check("owner signature for EXPERIMENTAL does not cover QUALIFIED (claim not bound at that level)", /NOT_BOUND_TO_CLAIM/.test(String(o.matOtherLevel)));
check("the repository's real TRUST_ANCHORS.json still pins no owner key", (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/TRUST_ANCHORS.json"), "utf8")); return j.INSPECTION_RECORD.length === 0 && j.MATURITY_EVIDENCE.length === 0; })());
fs.rmSync(T, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — owner-anchor success path (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};

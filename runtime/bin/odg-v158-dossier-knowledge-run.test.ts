#!/usr/bin/env node
"use strict";
/* V15.8 §5 — the committed dossier knowledge equals a fresh canonical derivation, and its invariants hold. */
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "odg-v158-dossier-knowledge-run.ts"), "--check"], { encoding: "utf8" });
check("committed V158_DOSSIER_KNOWLEDGE.json equals a fresh acquire() derivation (--check exit 0)", r.status === 0 && /CHECK OK/.test(r.stdout));
const d = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "odg", "evidence", "V158_DOSSIER_KNOWLEDGE.json"), "utf8"));
check("every verified claim has ≥2 independent supporting hosts", d.knowledge.filter((k: any) => k.verifiedKnowledge).every((k: any) => k.independentSupportCount >= 2));
check("no single-source claim is marked verified", d.knowledge.filter((k: any) => k.classification === "CLAIM_SINGLE_SOURCE").every((k: any) => k.verifiedKnowledge === false));
check("a RECOMMENDATION is never promoted to fact", d.knowledge.filter((k: any) => k.type === "RECOMMENDATION").every((k: any) => k.classification === "RECOMMENDATION_RECORDED"));
check("every claim records the admission rule it grounds", d.knowledge.every((k: any) => typeof k.grounds === "string" && k.grounds.length > 10));
const RUN = require("./odg-v158-dossier-knowledge-run.ts");
check("#906: only a positive 'FETCHED: HTTP 2xx' record is RETRIEVED", RUN.sourceStatusFor({ verification: "FETCHED: HTTP 200, page title matches" }) === "RETRIEVED");
check("#906: 403 / NOT_FETCHED / unverified / absent ⇒ INACCESSIBLE (fail-closed)", ["FAILED: HTTP 403", "NOT_FETCHED", "unverified", "fetched later", undefined].every((v) => RUN.sourceStatusFor({ verification: v }) === "INACCESSIBLE"));
// attribution guard: every attributed reference's recorded contribution must exist, and the over-attributed refs are gone
const refs = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "odg", "evidence", "V158_RADAR_ADMISSION_REFERENCES.json"), "utf8")).references;
const ids = new Set(refs.map((r: any) => r.id));
check("every attributed reference id exists in the dossier", RUN.CLAIMS.every((c: any) => c.refs.every((id: string) => ids.has(id))));
check("#906: B3 (states neither half) no longer attributed", RUN.CLAIMS.every((c: any) => !c.refs.includes("B3")));
const sys = d.knowledge.find((k: any) => /system-level designs/.test(k.claim));
check("#906: the system-level-design claim (A4+A5, both arxiv.org) is SINGLE-SOURCE, not corroborated", sys && sys.classification === "CLAIM_SINGLE_SOURCE" && sys.verifiedKnowledge === false);
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};

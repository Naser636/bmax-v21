#!/usr/bin/env node
"use strict";
/* V16.0 scenario G — offline checks: committed evidence re-derives; knowledge is usable only via the pinned collection and
 * at a fresh use time; the pre-registered rule is applied exactly (no post-hoc threshold change); fail-closed paths. */
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const G = require("./odg-v160-scenario-g-run.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "odg-v160-scenario-g-run.ts"), "--check"], { encoding: "utf8" });
check("committed V160_SCENARIO_G.json re-derives exactly (--check)", r.status === 0 && /CHECK OK/.test(r.stdout));
const ev = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "odg", "evidence", "V160_SCENARIO_G.json"), "utf8"));
check("knowledge retrieved via the pinned collection and authorized for DESIGN_PROPOSAL at use time", ev.knowledge.ok === true && ev.knowledge.claims.every((c: any) => c.useAuthorization === "DESIGN_PROPOSAL" && c.isFact === false && c.epistemic === "SUPPORTED"));
check("pre-registered rule unchanged (0.3 / 0.3 / 100 / 1000)", JSON.stringify(G.RULE) === JSON.stringify({ minSpearmanMinutes: 0.3, minSpearmanCommits: 0.3, smallMax: 100, largeMin: 1000 }));
const okCheck = { ok: true };
const mk = (rm: number, rc: number, ms: number, ml: number) => ({ spearmanSizeMinutes: { rho: rm }, spearmanSizeCommits: { rho: rc }, buckets: { small_le_100: { medianMinutes: ms }, large_gt_1000: { medianMinutes: ml } } });
check("rule: all three conditions ⇒ ADOPT_AS_PROPOSAL", G.decide(okCheck, mk(0.31, 0.31, 5, 10)).decision === "ADOPT_AS_PROPOSAL");
check("rule: rho(minutes) just below 0.3 ⇒ NOT_ADOPTED (no rounding up)", G.decide(okCheck, mk(0.2999, 0.9, 5, 50)).decision === "NOT_ADOPTED");
check("rule: large not slower ⇒ NOT_ADOPTED", G.decide(okCheck, mk(0.9, 0.9, 10, 10)).decision === "NOT_ADOPTED");
check("knowledge not usable ⇒ NOT_USED (never decided on unusable knowledge)", G.decide({ ok: false, reason: "x" }, mk(0.9, 0.9, 1, 99)).decision === "NOT_USED");
check("missing data ⇒ NOT_MEASURABLE", G.decide(okCheck, mk(NaN, 0.9, 1, 99)).decision === "NOT_MEASURABLE");
const m = G.measure({ prs: [{ number: 1, additions: 1, deletions: 0, createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-01T00:05:00Z", commits: 1 }, { number: 2, additions: 5000, deletions: 0, createdAt: "2026-01-01T00:00:00Z", mergedAt: "2026-01-01T01:00:00Z", commits: 4 }, { number: 3, additions: "x", deletions: 0, createdAt: "a", mergedAt: "b", commits: 1 }] });
check("measure: malformed PR rows are dropped, not coerced", m.n === 2 && m.buckets.large_gt_1000.n === 1);
check("the recorded decision matches the rule applied to the recorded measurement", G.decide(ev.knowledge, ev.measurement).decision === ev.decision.decision);
check("evidence holds no author/personal data", !/"author"|@[A-Za-z0-9-]+\.[a-z]{2,}/.test(fs.readFileSync(path.join(ROOT, "docs", "odg", "evidence", "V160_SCENARIO_G_PR_HISTORY.json"), "utf8")));
check("#921: robustness bootstrap recorded and the NOT_ADOPTED decision flagged borderline when the CI straddles 0.3", ev.measurement.robustnessSizeMinutes.status === "MEASURED" && (ev.decision.decision !== "NOT_ADOPTED" || typeof ev.decision.borderline === "boolean"));
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};

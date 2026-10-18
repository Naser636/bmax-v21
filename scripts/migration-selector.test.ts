#!/usr/bin/env tsx
/*
 * MIGRATION SELECTOR tests (CTO outcome-driven loop) — DECISION + RESUME.
 * Proves the selector picks a relevant, safest-first candidate from the real-shaped inventory, excludes
 * §12/already-migrated, and RESUMES after a migration (the migrated file drops out, next is chosen).
 * Pure scoring tested directly; ranking tested against a hermetic temp fixture tree (no real repo touch).
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scoreCandidate, rankCandidates, recommendNext } from "./migration-selector";
import { EXCLUSIONS } from "@/runtime/migration-campaign";

let passed = 0;
function ok(name: string, cond: boolean) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

const F = (o: Partial<import("./migration-selector").RiskFactors>): any => ({ lines: 50, writes: 0, spawns: 0, usesDirname: false, hasTest: false, externalDeps: 0, ...o });
// 1 — DECISION (pure score): a read-only + tested file scores LOWER (safer) than a side-effecting one.
{
  ok("DECISION: read-only+tested scores lower (safer) than side-effecting+spawn+__dirname", scoreCandidate(F({ hasTest: true })) < scoreCandidate(F({ writes: 3, spawns: 2, usesDirname: true })));
}
// 2 — DECISION: __dirname is penalised (the dist path-depth bug class).
{
  ok("DECISION: __dirname adds risk", scoreCandidate(F({ usesDirname: true })) > scoreCandidate(F({})));
}
// 2b — DECISION: an external-package dependency is penalised (evidence: odg-client require("imapflow")).
{
  ok("DECISION: external dep adds risk (migration hazard)", scoreCandidate(F({ externalDeps: 1 })) > scoreCandidate(F({ externalDeps: 0 })));
  ok("DECISION: a clean+tested CLI ranks safer than an equal-size one pulling an external package", scoreCandidate(F({ hasTest: true, externalDeps: 0 })) < scoreCandidate(F({ hasTest: true, externalDeps: 1 })));
}

// Hermetic fixture repo with varied candidates.
function mkRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "selector-"));
  fs.mkdirSync(path.join(root, "runtime", "bin"), { recursive: true });
  const w = (rel: string, body: string) => fs.writeFileSync(path.join(root, rel), body);
  w("runtime/bin/clean-reporter.js", "const fs=require('fs');\nconsole.log('read only');\n"); // safe
  w("runtime/bin/clean-reporter.test.js", "// test\n");                                        // → hasTest (safer)
  w("runtime/bin/side-effecter.js", "const fs=require('fs');\nfs.writeFileSync('x','');\nspawnSync('node',['y']);\n// __dirname\nconst d=__dirname;\n"); // risky
  w("runtime/bin/ext-dep.js", "const fs=require('fs');\nconst {ImapFlow}=require('imapflow');\nconsole.log('needs external pkg');\n"); // external dep → penalised
  const frozen = (EXCLUSIONS as readonly string[])[0];
  w(`runtime/bin/${frozen}.js`, "console.log('frozen');\n");                                   // §12 → excluded
  w("runtime/bin/already-done.js", "console.log('x');\n");
  w("runtime/bin/already-done.ts", "export {};\n");                                            // dual-port → excluded
  return root;
}

// 3 — RANKING: safest-first; §12 + already-migrated excluded.
{
  const root = mkRepo();
  const ranked = rankCandidates(root, ["runtime/bin"]);
  const bases = ranked.map((c) => c.base);
  ok("RANKING: §12-frozen excluded", !bases.includes((EXCLUSIONS as readonly string[])[0]));
  ok("RANKING: already-dual-port (.ts sibling) excluded", !bases.includes("already-done"));
  ok("RANKING: candidates are the live js-only files only", bases.includes("clean-reporter") && bases.includes("side-effecter"));
  ok("RANKING: safest (clean+tested) ranked before risky (side-effecting)", bases.indexOf("clean-reporter") < bases.indexOf("side-effecter"));
  ok("RANKING: a clean CLI ranks before one pulling an external package (imapflow)", bases.indexOf("clean-reporter") < bases.indexOf("ext-dep"));
  ok("RANKING: external-dep detected in profile (externalDeps>=1)", (ranked.find((c) => c.base === "ext-dep")!).factors.externalDeps >= 1);
  ok("RANKING: recommendNext = the safest candidate", recommendNext(root, ["runtime/bin"])!.base === "clean-reporter");
  fs.rmSync(root, { recursive: true, force: true });
}
// 4 — RESUME: after the top pick is migrated (gets a .ts sibling), it drops out and the next is chosen.
{
  const root = mkRepo();
  const first = recommendNext(root, ["runtime/bin"])!.base;
  ok("RESUME: first recommendation is clean-reporter", first === "clean-reporter");
  fs.writeFileSync(path.join(root, "runtime", "bin", first + ".ts"), "export {};\n"); // simulate migration
  const next = recommendNext(root, ["runtime/bin"]);
  ok("RESUME: migrated file no longer recommended (resumes to next)", !next || next.base !== first);
  ok("RESUME: next recommendation is the next-safest remaining live candidate (ext-dep < side-effecter)", next!.base === "ext-dep");
  fs.rmSync(root, { recursive: true, force: true });
}
// 5 — empty / fully-migrated ⇒ no recommendation (honest null, never a false pick).
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "selector-empty-"));
  fs.mkdirSync(path.join(root, "runtime", "bin"), { recursive: true });
  ok("empty candidate set ⇒ recommendNext null", recommendNext(root, ["runtime/bin"]) === null);
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\nmigration-selector — ${passed} assertions passed.`);

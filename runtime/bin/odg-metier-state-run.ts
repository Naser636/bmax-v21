#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V90 §5 — PER-MÉTIER STATE RUN. Performs the REAL repo scan and feeds metier-state to produce an honest
 * per-métier maturity ladder for the 15 métiers (no global average). present/wired/tested/validated are all measured
 * from source (file existence, inbound non-test callers, test references, gate membership). Writes
 * docs/odg/V90_METIER_STATE.json. Run: `odg-metier-state-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CORE = path.join(ROOT, "runtime", "core");
const BIN = path.join(ROOT, "runtime", "bin");
const D = path.join(ROOT, "docs", "odg");
const MS = require("../core/metier-state.js");

const coreFiles = (() => { try { return fs.readdirSync(CORE); } catch { return []; } })();
const binFiles = (() => { try { return fs.readdirSync(BIN); } catch { return []; } })();
const nonTest = coreFiles.filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const testFiles = [...coreFiles, ...binFiles].filter((f: string) => f.endsWith(".test.ts"));
function readCore(f: string): string { try { return fs.readFileSync(path.join(CORE, f), "utf8"); } catch { return ""; } }
function readTest(f: string): string { try { return fs.readFileSync(path.join(coreFiles.includes(f) ? CORE : BIN, f), "utf8"); } catch { return ""; } }
const gateList = (() => { try { const s = require(path.join(ROOT, "package.json")).scripts["test:report"]; return new Set((s.match(/[\w./-]+\.test\.ts/g) || []).map((x: string) => x.split("/").pop())); } catch { return new Set(); } })();

const ref = (mod: string) => new RegExp(`[\\"'./]${mod.replace(/[-]/g, "[-]")}(\\.js|\\.ts|\\")`);
const scan = {
  has: (mod: string) => coreFiles.includes(`${mod}.ts`),
  inbound: (mod: string) => nonTest.filter((f: string) => f !== `${mod}.ts` && ref(mod).test(readCore(f))).length,
  testedBy: (mod: string) => testFiles.some((f: string) => ref(mod).test(readTest(f))),
  gateValidated: (mod: string) => testFiles.some((f: string) => ref(mod).test(readTest(f)) && gateList.has(f)),
};

const result = MS.assessAll(scan);
const out = {
  "//": "CTO V90 §5 — per-métier state measured from the REAL repo. present=module file exists; wired=inbound non-test caller; tested=a test references it; validated=that test is in the gate. NO global average — each métier individual; the weakest surfaced. present≠wired≠tested≠validated.",
  metiers: result.metiers, byStatus: result.byStatus, weakestMetier: result.weakestMetier, allValidated: result.allValidated,
  honestConclusion: `15 métiers measured individually: ${result.byStatus.VALIDATED} VALIDATED, ${result.byStatus.TESTED} TESTED, ${result.byStatus.WIRED} WIRED, ${result.byStatus.PRESENT} PRESENT, ${result.byStatus.ABSENT} ABSENT. Weakest: ${result.weakestMetier ? result.weakestMetier.metier + " (" + result.weakestMetier.status + ")" : "none"}. No average hides a weak métier; a weaker métier is a concrete local-improvement target, not a masked statistic.`,
  invariant: "no global average; each métier individual; weakest surfaced; missing module ⇒ ABSENT; measured from source.",
};
fs.writeFileSync(path.join(D, "V90_METIER_STATE.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ byStatus: result.byStatus, weakest: result.weakestMetier }, null, 2) + "\n");
export {};

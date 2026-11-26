#!/usr/bin/env node
"use strict";
/* MEM-INT-1 / TIER-1 — GO memory integration (hermetic: fake deterministic embed, temp dirs; the real repo state is READ only).
 * knowledge() indexes the canonical toMemory records (FACT = accessMemory-trusted, CONTEXT = SUPPORTED unverified); the GO
 * cycle's DECOMPOSE recalls them for the working item; facts are never promoted; default (no memory port) is unchanged. */
const fs = require("fs"), os = require("os"), path = require("path");
const B = require("./odg-go.ts");
const GO = require("../core/odg-go-cycle.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(c: any, l: string): void { if (!c) { failures++; process.stdout.write("NOT OK - " + l + "\n"); } else process.stdout.write("ok - " + l + "\n"); }
const D = 16;
const fake = async (t: string[]) => t.map((s) => { const v = new Array(D).fill(0); for (let i = 0; i + 3 <= s.length; i++) v[(s.charCodeAt(i) * 7 + s.charCodeAt(i + 1) * 3 + s.charCodeAt(i + 2)) % D] += 1; const n = Math.sqrt(v.reduce((a: number, x: number) => a + x * x, 0)) || 1; return v.map((x: number) => x / n); });

(async () => {
  const plain = B.knowledge(ROOT, Date.now());
  check(!plain.memory && !(plain instanceof Promise), "default: knowledge() without a memory port is synchronous and has no memory field (behaviour unchanged)");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gomem-"));
  const m = B.memoryPort(dir, fake);
  const k = await B.knowledge(ROOT, Date.now(), m);
  const trustedFacts = k.claims.filter((c: any) => c.admissible && c.admissible.trusted).length;
  const obsFacts = k.observations ? k.observations.corroborated : 0;   // V19-MEM-2: REPRO-1 corroborated internal observations join the FACT tier
  check(k.memory && k.memory.status === "INDEXED" && k.memory.factIndexed === trustedFacts + obsFacts && k.memory.records === k.claims.filter((c: any) => c.status !== "NOT_FOUND").length + (k.observations ? k.observations.keys : 0),
    `knowledge(): canonical memory records indexed; FACT tier = admissible-trusted claims (${trustedFacts}) + REPRO-1 corroborated observations (${obsFacts}); CONTEXT ${k.memory && k.memory.contextIndexed}`);
  check(JSON.stringify(k.claims) === JSON.stringify(plain.claims), "no promotion: the claims' admissibility is byte-identical with and without the memory port");
  const r = await m.recall("keep code review changes small");
  check(r.status === "RECALLED" && Array.isArray(r.facts) && Array.isArray(r.context) && r.context.every((h: any) => h.tier === "CONTEXT_UNVERIFIED") && r.facts.every((h: any) => h.tier === "FACT") && /NEVER as a fact/.test(r.contextNote),
    "memoryRecall separates FACT and CONTEXT_UNVERIFIED hits, with the never-a-fact note");
  check([...r.facts, ...r.context].every((h: any) => typeof h.status === "string" && typeof h.provenance === "string" && Number.isFinite(h.learnedAt) && Number.isFinite(h.validUntil) && Number.isFinite(h.confidence)), "recalled hits carry the canonical record's status, provenance, dates and confidence (owner TIER-1)");
  const k2 = await B.knowledge(ROOT, Date.now(), B.memoryPort(dir, fake));
  check(k2.memory.embedded === 0 && k2.memory.indexed === k.memory.indexed, "persistence: a second cycle on the same index re-embeds nothing");
  // the REAL go-cycle: DECOMPOSE records contextRecall when the port exists (truth lock / claims stubbed — read-only DRY)
  const s = B.readState(ROOT); const tr: any[] = []; let t = 1;
  const base = { now: () => (t += 5), truthLock: () => ({ ok: true, blocked: false, status: "PASS", gitState: {} }), readState: () => s, stopRequested: () => ({ stop: false }),
    trace: { append: (e: any) => tr.push(e), readPrior: () => [] }, writeSummary: () => {}, isolation: () => ({ ok: false, reason: "dry" }), dispatchNative: () => { throw new Error("no dispatch in a test"); },
    claims: B.makeClaimStore(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gomemclaims-")))) };
  const m3 = B.memoryPort(fs.mkdtempSync(path.join(os.tmpdir(), "gomem3-")), fake);
  await GO.runGoCycle({ mode: "DRY" }, { ...base, knowledge: () => B.knowledge(ROOT, Date.now(), m3), memoryRecall: (q: string) => m3.recall(q) });
  const po = tr.find((e: any) => e.step === "PROBLEMS_OPPORTUNITIES"); const dc = tr.find((e: any) => e.step === "DECOMPOSE");
  check(po && po.decision.knowledge.memory && po.decision.knowledge.memory.status === "INDEXED", "GO cycle PROBLEMS_OPPORTUNITIES carries the memory indexing summary");
  check(!dc || dc.status !== "DONE" || (dc.decision.contextRecall && dc.decision.contextRecall.status === "RECALLED"), "GO cycle DECOMPOSE records contextRecall for the working item (when it decomposes)");
  const tr2: any[] = []; await GO.runGoCycle({ mode: "DRY" }, { ...base, trace: { append: (e: any) => tr2.push(e), readPrior: () => [] }, knowledge: () => B.knowledge(ROOT, Date.now()) });
  const dc2 = tr2.find((e: any) => e.step === "DECOMPOSE"); const po2 = tr2.find((e: any) => e.step === "PROBLEMS_OPPORTUNITIES");
  check(!(dc2 && dc2.decision && dc2.decision.contextRecall) && !(po2 && po2.decision.knowledge.memory), "without the memory port the cycle's decisions carry no memory/contextRecall field (unchanged)");
  if (failures) { process.stdout.write(failures + " failure(s)\n"); process.exit(1); }
  process.stdout.write("all odg-go-memory tests pass\n");
})();
export {};

#!/usr/bin/env node
"use strict";
/*
 * V17.8 P4 — the contract-declared RUN_CONTROLLED_EXPERIMENTS target of V178-P4 (hybrid per-tenant memory). One execution:
 *   AC1–AC3  runtime/core/memory-architecture.test.ts (V178-P4/AC1..AC3) run as a child, exit 0 required;
 *   AC4      LEARN-1 recompute of beforeMetric semanticRetrieval from the committed source (ABSENT → PRESENT ⇒ IMPROVED);
 *   AC5      every touched test file passes, run one at a time;
 *   AC6      (pre-registered in the bound revision) LIVE qualification with qwen3-embedding:0.6b over loopback Ollama on the
 *            fixed SET below: hybrid recall@3 ≥ 5/6 — FTS-only and vector-only recall@3 recorded descriptively.
 * Outcome: PASS ⇔ AC1–AC6 all met; any not measurable ⇒ NOT_MEASURED (never PASS). Writes ONLY <out>; refused unless the
 * contract is bound + an inspection ACCEPT bound to its sha is committed (odg-authorization-scope); existing ⇒ ALREADY_RECORDED.
 *   npx tsx runtime/bin/odg-v178-p4-memory-run.ts docs/odg/evidence/V178_P4_MEMORY_RESULT.json
 *   npx tsx runtime/bin/odg-v178-p4-memory-run.ts --selftest      (fake embed, temp dir, writes nothing)
 */
const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const SCENARIO = "V178-P4";
const OUT = "docs/odg/evidence/V178_P4_MEMORY_RESULT.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const INSPECTION = "docs/odg/evidence/V178_P4_CONTRACT_INSPECTION.json";
const TOUCHED_TESTS = Object.freeze(["runtime/core/memory-architecture.test.ts", "runtime/core/odg-memory-hybrid-index.test.ts"]);
const THRESHOLD = Object.freeze({ hybridRecallAt3Min: 5, of: 6 });
const R = (id: string, text: string) => ({ id, text, provenance: "mission:V178-P4", validUntil: 9e15, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic" });
const SET = Object.freeze({
  records: [R("m01", "Révision de prix d'un marché de travaux selon l'index BT01"), R("m02", "Retenue de garantie de 5 % sur un marché public de BTP"), R("m03", "Planning de coulage du béton armé des fondations"),
    R("m04", "Devis de terrassement pour un chantier de voirie"), R("m05", "Contrat de sous-traitance du gros oeuvre"), R("m06", "Configuration du pare-feu et des ports du serveur Linux"),
    R("m07", "Sauvegarde quotidienne de la base de données et test de restauration"), R("m08", "Calcul de la TVA à 20 % sur une facture"), R("m09", "Procédure de réception des travaux et levée des réserves"), R("m10", "Recette de tarte aux pommes")],
  queries: [{ q: "comment actualiser le prix d'un marché avec un indice", expect: "m01" }, { q: "pourcentage retenu en garantie sur le paiement", expect: "m02" }, { q: "quand couler le béton des fondations", expect: "m03" },
    { q: "restaurer la base après une panne", expect: "m07" }, { q: "lever les réserves à la fin du chantier", expect: "m09" }, { q: "taxe sur la valeur ajoutée d'une facture", expect: "m08" }],
});

function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch { return null; } }
function runTest(f: string): any { const r = cp.spawnSync("npx", ["tsx", f], { cwd: ROOT, encoding: "utf8", timeout: 180000 }); return { file: f, exit: r.status, ok: r.status === 0 }; }

async function qualify(embed: any, dir: string): Promise<any> {
  const H = require("../core/memory-architecture").semanticRetrieval();
  const [probe] = await embed(["dimension probe"]); const dims = probe.length;
  const ix = H.openIndex({ dir, tenant: "p4qual", dims });
  const t0 = Date.now(); const sync = await H.syncIndex(ix, SET.records, { asOf: 1, trustedAuthors: ["ODG"] }, embed); const indexMs = Date.now() - t0;
  const ftsOnly = async (q: string) => ix.db.prepare("select d.id from fts join docs d on d.rid = fts.rowid where fts match ? order by rank limit 3").all(H.ftsQuery(q) || '""').map((r: any) => r.id);
  const vecOnly = async (q: string) => { const [v] = await embed([H.QUERY_INSTRUCTION + q]); return ix.db.prepare("select d.id from vec join docs d on d.rid = vec.rowid where e match ? and k = 3 order by distance").all(new Uint8Array(new Float32Array(v).buffer)).map((r: any) => r.id); };
  const per: any[] = []; let hy = 0, fo = 0, vo = 0; const lat: number[] = [];
  for (const { q, expect } of SET.queries) {
    const s = Date.now(); const h = (await H.query(ix, q, embed, { k: 3 })).map((r: any) => r.id); lat.push(Date.now() - s);
    const f = await ftsOnly(q).catch(() => []); const v = await vecOnly(q);
    hy += h.includes(expect) ? 1 : 0; fo += f.includes(expect) ? 1 : 0; vo += v.includes(expect) ? 1 : 0; per.push({ q, expect, hybrid: h, fts: f, vec: v });
  }
  ix.db.close();
  return { dims, sync, indexMs, recallAt3: { hybrid: hy, ftsOnly: fo, vecOnly: vo, of: SET.queries.length }, queryMs: { max: Math.max(...lat), median: lat.slice().sort((a, b) => a - b)[Math.floor(lat.length / 2)] }, perQuery: per };
}

async function runP4(o: any): Promise<any> {
  const res: any = { schema: "odg-v178-p4-result/1", scenario: SCENARIO, label: o.label, threshold: THRESHOLD, set: { records: SET.records.length, queries: SET.queries.length } };
  const ac: any = {};
  const t13 = o.runTest(TOUCHED_TESTS[0]); ac.AC1_AC3 = { met: t13.ok, evidence: t13 };
  const src = fs.readFileSync(path.join(o.root, "runtime/core/memory-architecture.ts"), "utf8");
  const present = /function semanticRetrieval\(/.test(src) && /semanticRetrieval,/.test(src);
  ac.AC4 = { met: present, before: "ABSENT", after: present ? "PRESENT" : "ABSENT", rule: "LEARN-1 (recomputed from the committed source)", verdict: present ? "IMPROVED" : "NOT_IMPROVED" };
  const all = TOUCHED_TESTS.map((f) => o.runTest(f)); ac.AC5 = { met: all.every((x) => x.ok), evidence: all };
  let q: any = null; try { q = await qualify(o.embed, o.dir); } catch (e: any) { q = { error: String(e && e.message || e) }; }
  ac.AC6 = q.error ? { met: null, reason: "NOT_MEASURED: " + q.error } : { met: q.recallAt3.hybrid >= THRESHOLD.hybridRecallAt3Min, measured: q };
  res.criteria = ac;
  const vals = Object.values(ac).map((x: any) => x.met);
  res.outcome = vals.some((v) => v === null) ? "NOT_MEASURED" : vals.every((v) => v === true) ? "PASS" : "FAIL";
  res.provenance = { moduleAuthor: "PROVIDER (Claude Code)", embedModel: o.embedModel, network: "loopback Ollama /api/embed only", providerCalls: 0 };
  return res;
}

function gate(): any {
  const AS = require("../core/odg-authorization-scope");
  const d = readJson(CONTRACTS); const c = d && (d.contracts || []).find((x: any) => x && x.scenario === SCENARIO);
  if (!c) return { ok: false, reason: "contract missing" };
  const insp = readJson(INSPECTION);
  const sc = AS.deriveAuthorizationScope(c, { inspection: insp, probes: require("../core/odg-observation-currency.js").localGitProbes(ROOT) });
  return sc.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && sc.executionAuthorized === true ? { ok: true, contractSha256: AS.contractSha256(c) } : { ok: false, reason: `scope: ${sc.currentStep} executionAuthorized=${sc.executionAuthorized} — ${sc.reason}` };
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--selftest") {
    const D = 16; const fake = async (t: string[]) => t.map((s) => { const v = new Array(D).fill(0); for (let i = 0; i + 3 <= s.length; i++) v[(s.charCodeAt(i) * 7 + s.charCodeAt(i + 1) * 3 + s.charCodeAt(i + 2)) % D] += 1; const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / n); });
    const r = await runP4({ root: ROOT, label: "SELFTEST", embed: fake, embedModel: "fake", dir: fs.mkdtempSync(path.join(os.tmpdir(), "p4self-")), runTest: (f: string) => ({ file: f, exit: 0, ok: true }) });
    const ok = r.criteria.AC4.met === true && r.criteria.AC6.measured && typeof r.criteria.AC6.measured.recallAt3.hybrid === "number" && ["PASS", "FAIL"].includes(r.outcome);
    process.stdout.write(`selftest ${ok ? "OK" : "FAILED"} (outcome ${r.outcome}, hybrid ${r.criteria.AC6.measured && r.criteria.AC6.measured.recallAt3.hybrid}/6 with a fake embed)\n`); return ok ? 0 : 1;
  }
  if (argv[0] !== OUT) { process.stdout.write(`REFUSED: output path must be the declared writeSet entry ${OUT}\n`); return 3; }
  if (fs.existsSync(path.join(ROOT, OUT))) { process.stdout.write(`ALREADY_RECORDED: ${OUT} exists — one execution only\n`); return 4; }
  const g = gate(); if (!g.ok) { process.stdout.write(`NOT_AUTHORIZED: ${g.reason}\n`); return 2; }
  const H = require("../core/odg-memory-hybrid-index");
  const r = await runP4({ root: ROOT, label: "NATIVE (ODG GO dispatch)", embed: H.ollamaEmbed(), embedModel: "qwen3-embedding:0.6b", dir: fs.mkdtempSync(path.join(os.tmpdir(), "p4run-")), runTest });
  r.contractSha256 = g.contractSha256;
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(r, null, 2) + "\n");
  process.stdout.write(`V178-P4 outcome ${r.outcome} → ${OUT}\n`);
  return r.outcome === "PASS" ? 0 : 1;
}

module.exports = { runP4, qualify, gate, SET, THRESHOLD, OUT, INSPECTION, TOUCHED_TESTS };
if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));
export {};

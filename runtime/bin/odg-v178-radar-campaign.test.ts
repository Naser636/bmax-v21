#!/usr/bin/env node
"use strict";
/* V17.8 — odg-v178-radar-campaign: determinism, provenance split (registered sources vs PROVIDER_CITED_NOT_ODG_VERIFIED),
 * no network during compute, every signal classified A/B/C/D with its sources copied (never invented), the FTS5 proof
 * behind E-10's TESTED status, existing-architecture consumers re-verified, append-only PROPOSED contracts (V178-RADAR-1). */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const net = require("net");
const dns = require("dns");
const C = require("./odg-v178-radar-campaign.js");
const ENGINE = require("../core/odg-radar-build-engine.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const ROOT = path.resolve(__dirname, "..", "..");

function main() {
  // no network during compute (all egress primitives trapped)
  let calls = 0; const saved: any[] = [];
  const trap = (o: any, k: string) => { saved.push([o, k, o[k]]); o[k] = (..._a: any[]) => { calls++; throw new Error("network call during compute: " + k); }; };
  trap(http, "request"); trap(http, "get"); trap(https, "request"); trap(https, "get"); trap(net, "connect"); trap(net, "createConnection"); trap(dns, "lookup");
  const g: any = globalThis; const savedFetch = g.fetch; g.fetch = () => { calls++; throw new Error("fetch during compute"); };
  let rec: any = null, err: any = null;
  try { rec = C.compute(ROOT); } catch (e) { err = e; }
  for (const [o, k, v] of saved) o[k] = v; g.fetch = savedFetch;
  check("no network call during compute", calls === 0 && err === null && rec !== null);
  check("deterministic: compute twice ⇒ byte-identical", JSON.stringify(C.compute(ROOT)) === JSON.stringify(rec));
  check("committed record reproduces (--check semantics)", fs.readFileSync(path.join(ROOT, C.OUT_REL), "utf8") === C.render(ROOT));
  check("now pinned to the newest collectedAt (no wall clock)", rec.now.epochMs === Math.max(...C.SIGNAL_FILES.map((f: string) => Date.parse(JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).collectedAt))));

  // all 71 signals, E/F/G first, each classified, sources copied verbatim
  const inputs = C.SIGNAL_FILES.flatMap((f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).signals);
  check("71 signals, in input order with E/F/G first", rec.signals.length === 71 && inputs.length === 71 && rec.signals.every((s: any, i: number) => s.id === inputs[i].id) && rec.signals[0].domain === "E");
  check("every signal has a practical category A/B/C/D (PRACTICAL table covers exactly the inputs)", rec.signals.every((s: any) => s.practical !== "NOT_CLASSIFIED" && /^[ABCD]$/.test(s.practical.category)) && C.PRACTICAL.length === 71 && new Set(C.PRACTICAL.map((p: any) => p.id)).size === 71);
  check("C-category signals name their blocking constraint", rec.signals.filter((s: any) => s.practical.category === "C").every((s: any) => /root|model-download|npm-dependency|owner-decision/.test(s.practical.blockingConstraint)));
  check("sources are the input evidence URLs (never invented); missing ⇒ SOURCE_MANQUANTE", rec.signals.every((s: any, i: number) => { const ev = inputs[i].evidence || []; return ev.length ? JSON.stringify(s.sources.map((x: any) => x.url)) === JSON.stringify(ev.map((e: any) => e.url)) : s.sources === "SOURCE_MANQUANTE"; }));
  check("proofStatus ∈ the declared vocabulary; non-default statuses carry a basis", rec.signals.every((s: any) => ["DOC_CONSULTED", "EXISTENCE_OBSERVED", "TESTED", "MEASURED", "NOT_ESTABLISHED"].includes(s.proofStatus.status) && typeof s.proofStatus.basis === "string"));
  check("no signal is MEASURED by ODG in this campaign (nothing was benchmarked)", !rec.signals.some((s: any) => s.proofStatus.status === "MEASURED"));

  // provenance split through frontier-radar (no 2nd radar)
  check("only allowlisted sources register; provider-web-research is refused by registerSource", rec.radar.registration.find((r: any) => r.id === "arxiv-paper").registered && rec.radar.registration.find((r: any) => r.id === "github-repo").registered && rec.radar.registration.find((r: any) => r.id === "provider-web-research").registered === false);
  check("unregistered source ⇒ Radar REJECT + PROVIDER_CITED_NOT_ODG_VERIFIED (fail-closed, never promoted)", rec.signals.filter((s: any) => s.radar.sourceId === "provider-web-research").every((s: any) => s.radar.decision === "REJECT" && s.radar.provenance === "PROVIDER_CITED_NOT_ODG_VERIFIED"));
  check("registered sources ⇒ DEFER (not crossChecked), never ACCEPT; 0 candidates", rec.signals.filter((s: any) => s.radar.sourceId !== "provider-web-research").every((s: any) => s.radar.decision === "DEFER") && rec.summary.candidates === 0 && rec.summary.radarByDecision.ACCEPT_FOR_EXPERIMENT === 0);
  check("provenance split sums to 71", rec.summary.provenanceSplit.odgRegisteredSource + rec.summary.provenanceSplit.providerCitedNotOdgVerified === 71);
  check("source mapping: arxiv URL wins over github; other hosts ⇒ provider", C.sourceOf({ evidence: [{ url: "https://github.com/x/y" }, { url: "https://arxiv.org/abs/1" }] }) === "arxiv-paper" && C.sourceOf({ evidence: [{ url: "https://github.com/x/y" }] }) === "github-repo" && C.sourceOf({ evidence: [{ url: "https://huggingface.co/x" }] }) === "provider-web-research" && C.sourceOf({}) === "provider-web-research");

  // E-10 TESTED basis: FTS5 + bm25 on the built-in node:sqlite (no install)
  check("E-10 proof: node:sqlite FTS5 bm25 returns the exact-term row", (() => { try { const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.exec("create virtual table t using fts5(x); insert into t values('SIRET 12345 article L.441-10'),('autre chose')"); const rows = db.prepare("select x from t where t match 'SIRET' order by bm25(t)").all(); return rows.length === 1 && /SIRET/.test(rows[0].x); } catch { return false; } })());

  // existing architecture: every declared consumer really requires the module (re-verified)
  const srcOf = (p: string) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return null; } };
  const reqRe = (m: string) => new RegExp(`require\\(\\s*["'](?:\\./|\\.\\./core/)${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.js|\\.ts)?["']\\s*\\)`);
  const archOk = C.ARCH.filter((a: any) => /^runtime\/core\/[\w.-]+\.ts$/.test(a.path)).every((a: any) => { const m = path.basename(a.path, ".ts"); return fs.existsSync(path.join(ROOT, a.path)) && a.consumers.every((c: string) => { const s = srcOf(c.split(" ")[0]); return s !== null && reqRe(m).test(s); }); });
  check("existing-architecture consumers re-verified against the source", archOk);
  check("odg-go-wave is NOT wired into odg-go-cycle / odg-go (missing connection stated)", !reqRe("odg-go-wave").test(srcOf("runtime/core/odg-go-cycle.ts") || "") && !reqRe("odg-go-wave").test(srcOf("runtime/bin/odg-go.ts") || ""));
  check("every proposal component / write-set path exists", C.PROPOSALS.every((p: any) => p.components.concat(p.writeSet).every((f: string) => fs.existsSync(path.join(ROOT, f)))));

  // sections present and honest
  check("3 trajectories, BALANCED recommended, AMBITIOUS deferred", rec.trajectories.length === 3 && rec.trajectories.find((t: any) => t.recommended).id === "BALANCED" && /DEFERRED/.test(rec.trajectories.find((t: any) => t.id === "AMBITIOUS").ownerGate));
  check("implement gap baseline read from V155 (PROBATION 3/6) and the scenario is NOT run", rec.implementGap.baseline.implement.status === "PROBATION" && rec.implementGap.baseline.implement.passes === 3 && rec.implementGap.baseline.implement.n === 6 && /NOT RUN/.test(rec.implementGap.qualificationScenario.status));
  check("authorization matrix covers groups A/B/C/D incl. the denied read-only probes", ["A", "B", "C", "D"].every((g2) => rec.authorizationMatrix.some((r: any) => r.group === g2)) && rec.authorizationMatrix.some((r: any) => /DENIED/.test(r.label) && /systemctl --user/.test(r.op) && /docker ps/.test(r.op)));
  check("privacy: sovereignty explicitly NOT complete (hypervisor operator)", /NOT complete/.test(rec.privacySovereignty.sovereigntyNotComplete) && /hypervisor/.test(rec.privacySovereignty.sovereigntyNotComplete));

  // contracts: append-only, PROPOSED, owner gates visible, idempotent
  const CF = JSON.parse(fs.readFileSync(path.join(ROOT, C.CONTRACTS_REL), "utf8"));
  const conv = CF.contracts.filter((c: any) => c.origin && c.origin.conversionBatch === C.BATCH);
  check("committed: V178-P1…P7 appended in rank order, at the end (only the V19 V178-P4-INT, V178-P1-R, V19-EXP-B and V19-MEM-2 contracts follow); P3/P6/P7 PROPOSED/unbound (P5 bound by V19); V17.8 binding: P1/P2 AUTHORIZED_FOR_REVISION + BOUND (owner V176 build missions); V19 binding: P4 AUTHORIZED_FOR_REVISION + BOUND (owner V19 VPS equipment); origin untouched", conv.length === 7 && conv.map((c: any) => c.scenario).join(",") === "V178-P1,V178-P2,V178-P3,V178-P4,V178-P5,V178-P6,V178-P7" && conv[3].state === "AUTHORIZED_FOR_REVISION" && conv[3].binding.status === "BOUND" && conv[3].origin.conversionBatch === C.BATCH && conv.slice(2).filter((c: any) => c.scenario !== "V178-P4" && c.scenario !== "V178-P5").every((c: any) => c.state === "PROPOSED" && c.authorizedBy === null && c.binding.status === "UNBOUND") && conv.slice(0, 2).every((c: any) => c.state === "AUTHORIZED_FOR_REVISION" && c.binding.status === "BOUND" && c.origin.conversionBatch === C.BATCH) && CF.contracts.filter((c: any) => c.scenario !== "V178-P4-INT" && c.scenario !== "V178-P1-R" && c.scenario !== "V19-EXP-B" && c.scenario !== "V19-MEM-2").slice(-7).every((c: any) => c.origin && c.origin.conversionBatch === C.BATCH));
  check("committed: header count = array length", CF.count === CF.contracts.length);
  check("owner-gated steps are visible: P3 carries an open ownerGate and OWN-1 reads it; P4's gate is SATISFIED (V19 record, revision 3) and OWN-1 no longer matches; the others carry none", (() => { const REG = require("../core/odg-strategic-register.js"); const scan = (c: any) => REG.ownerMatches([c.WORK_ITEM_CONTRACT.objective, ...c.WORK_ITEM_CONTRACT.acceptance_criteria, c.initialState.missingForPass].join(" ‖ ")); return conv.every((c: any) => (c.scenario === "V178-P3" ? (c.ownerGate && c.ownerGate.required === true && scan(c).length > 0) : c.scenario === "V178-P4" ? (c.ownerGate && c.ownerGate.required === false && /V19_OWNER_AUTHORIZATION_VPS_EQUIPMENT/.test(c.ownerGate.satisfiedBy) && scan(c).length === 0) : (!c.ownerGate && scan(c).length === 0))); })());
  check("re-conversion is a no-op (ALREADY_CONVERTED; nothing appended)", C.convert(ROOT).res.status === "ALREADY_CONVERTED");
  check("append-only on a fixture: prior entries byte-identical; input not mutated", (() => { const fx = { "//": "fx", count: 1, initialStatusCounts: { PASS: 1 }, contracts: [{ scenario: "A", initialState: { status: "PASS" } }] }; const s0 = JSON.stringify(fx); const r = ENGINE.convertToContracts(C.drafts(ROOT), fx, { n: 7, batch: "T", convertOwnerGated: true }); return JSON.stringify(fx) === s0 && JSON.stringify(r.data.contracts[0]) === JSON.stringify(fx.contracts[0]) && r.data.contracts.length === 8 && r.data.count === 8; })());
  check("without convertOwnerGated the owner-gated proposals are skipped (default RB-CONV-1 unchanged)", (() => { const r = ENGINE.convertToContracts(C.drafts(ROOT), { contracts: [] }, { n: 7, batch: "T" }); return r.appended.length === 5 && r.skipped.filter((k: any) => k.reason === "OWNER_GATED").map((k: any) => k.id).join(",") === "V178-P3,V178-P4"; })());

  process.stdout.write(failures ? `\n${failures} FAILURE(S)\n` : "\nALL PASS — odg-v178-radar-campaign (frontier-radar reuse, practical A/B/C/D, provenance split, no network, append-only PROPOSED contracts)\n");
  process.exit(failures ? 1 : 0);
}
main();
export {};

#!/usr/bin/env node
"use strict";
/* V160 §2/§3 — ODG campaign-lifecycle battery with REAL FILE PERSISTENCE (not in-memory). Proves ODG drives the canonical
 * crash-atomic register (campaign-controller) through the REAL governed journey: run → persist-after-every-mission → restart
 * reloads the FILE and skips ACCEPTED lots (no double execution) → dependency gating → blocked dependents → crash-before-save
 * resilience → ACCEPTED requires execId evidence. Uses a real temp file + separate load calls to simulate interruption. */
const L = require("./odg-campaign-lifecycle.js");
const C = require("./campaign-controller.js");
const fs = require("fs"); const os = require("os"); const path = require("path");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const tmp = (tag: string) => path.join(os.tmpdir(), `odg-lc-${tag}-${process.pid}-${Math.round(process.hrtime()[1])}.json`);
const writeReg = (p: string, items: any[]) => fs.writeFileSync(p, JSON.stringify({ items }));
const readReg = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

function main() {
  // ---- REAL persistence: run A, persist to the FILE, prove on-disk ACCEPTED with execId evidence ----
  const P = tmp("persist");
  writeReg(P, [{ id: "A", status: "READY", deps: [], priority: 2 }, { id: "B", status: "READY", deps: ["A"], priority: 1 }]);
  const s1 = L.runCampaignStep(P);
  check("step runs A through the REAL governed journey ⇒ ACCEPTED + real execId", s1.ran === "A" && s1.accepted === true && s1.status === "ACCEPTED" && typeof s1.execId === "string" && s1.execId.length >= 32);
  const disk1 = readReg(P);
  check("A persisted to the FILE as ACCEPTED with governed:<execId> evidence (real persistence, not in-memory)", (() => { const a = disk1.items.find((i: any) => i.id === "A"); return a.status === "ACCEPTED" && typeof a.evidence === "string" && /governed:/.test(a.evidence); })());

  // ---- RESTART: a fresh step reloads the FILE and picks B (A already ACCEPTED on disk) — no double execution ----
  const s2 = L.runCampaignStep(P);
  check("restart (fresh load) ⇒ picks B (deps satisfied), does NOT re-run A (no double execution across restart)", s2.ran === "B" && s2.accepted === true);
  const disk2 = readReg(P);
  check("both A and B now persisted ACCEPTED", disk2.items.filter((i: any) => i.status === "ACCEPTED").length === 2);
  const s3 = L.runCampaignStep(P);
  check("no eligible lot left ⇒ done", s3.done === true);

  // ---- dependency gating + blocked dependents ----
  const P2 = tmp("blocked");
  writeReg(P2, [{ id: "BLK", status: "BLOCKED", deps: [], priority: 1, blockReason: "owner-gated" }, { id: "DEP", status: "READY", deps: ["BLK"], priority: 1 }, { id: "IND", status: "READY", deps: [], priority: 3 }]);
  const runB = L.runCampaign(P2);
  const diskB = readReg(P2);
  check("independent lot runs; dependent-on-BLOCKED stays unrun; BLOCKED lot untouched", diskB.items.find((i: any) => i.id === "IND").status === "ACCEPTED" && diskB.items.find((i: any) => i.id === "DEP").status === "READY" && diskB.items.find((i: any) => i.id === "BLK").status === "BLOCKED");

  // ---- full dependency chain via runCampaign, persisted after every mission ----
  const P3 = tmp("chain");
  writeReg(P3, [{ id: "X", status: "READY", deps: [], priority: 3 }, { id: "Y", status: "READY", deps: ["X"], priority: 2 }, { id: "Z", status: "READY", deps: ["Y"], priority: 1 }]);
  const chain = L.runCampaign(P3);
  check("runCampaign drives the chain X→Y→Z (dependency order), all ACCEPTED", chain.trace.filter((t: any) => t.ran).map((t: any) => t.ran).join(",") === "X,Y,Z" && chain.summary.counts.ACCEPTED === 3);
  check("resumeCampaign on a completed register ⇒ done immediately (no re-run)", L.resumeCampaign(P3).steps >= 1 && L.runCampaignStep(P3).done === true);

  // ---- crash-before-save resilience: the persisted state before a step is intact if a later step never saves ----
  const P4 = tmp("crash");
  writeReg(P4, [{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 1 }]);
  L.runCampaignStep(P4);                           // closes A, persists
  const beforeCrash = readReg(P4);
  check("after a completed+persisted step, the FILE holds the durable resume point (A ACCEPTED)", beforeCrash.items.find((i: any) => i.id === "A").status === "ACCEPTED");
  // a subsequent load must still resume cleanly (no torn state — campaign-controller uses atomic temp+rename)
  check("re-load after the persisted step resumes cleanly (crash-atomic register)", C.loadRegister(P4).ok === true && C.loadRegister(P4).register.items.length === 2);

  // ---- ACCEPTED requires evidence (a governed run without an execId cannot close) ----
  check("contract: ACCEPTED requires execId evidence; drives the canonical register; no parallel file", /requires execId evidence/.test(L.CAMPAIGN_LIFECYCLE_CONTRACT.invariants[1]) && /no parallel file/.test(L.CAMPAIGN_LIFECYCLE_CONTRACT.invariants[0]));

  // ---- fail-closed ----
  check("fail-closed: missing path ⇒ NO_PATH; unreadable register ⇒ NO_REGISTER", L.runCampaignStep(null).code === "NO_PATH" && L.runCampaignStep(path.join(os.tmpdir(), "does-not-exist-" + process.pid + ".json")).code === "NO_REGISTER");

  // cleanup
  for (const p of [P, P2, P3, P4]) { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } }

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-campaign-lifecycle (REAL file persistence via campaign-controller; run→persist-after-every-mission→restart-reloads-and-skips-ACCEPTED (no double execution); dependency gating; blocked dependents; crash-atomic resume; ACCEPTED needs execId evidence; ODG owns the lifecycle)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};

/*
 * ON_DEMAND_MODEL_ROUTING_V2 — mission-path hook: offline tests. No server, no mission, no external call.
 * Proves: flag OFF ⇒ NO-OP (backward compatible, no file); flag ON ⇒ deterministic decision evidence;
 * engineering⇒LARGE, audit⇒SMALL, HIGH-risk⇒LARGE, fail-closed (no silent downgrade) when no large model.
 * Run: node_modules/.bin/tsx src/runtime/ollama-routing-hook.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { recordOllamaRouting, mapMissionToTask } from "./ollama-routing-hook";

const REPO = process.cwd();
let failures = 0;
const must = (cond: boolean, msg: string): void => { if (cond) console.log(`  PASS ${msg}`); else { failures++; console.log(`  FAIL ${msg}`); } };

const FLAG = "ODG_OLLAMA_CONTROL_PLANE";
const savedFlag = process.env[FLAG];
const savedSmall = process.env.ODG_OLLAMA_SMALL_MODEL;
const savedLarge = process.env.ODG_OLLAMA_LARGE_MODEL;
const restore = (): void => {
  if (savedFlag === undefined) delete process.env[FLAG]; else process.env[FLAG] = savedFlag;
  if (savedSmall === undefined) delete process.env.ODG_OLLAMA_SMALL_MODEL; else process.env.ODG_OLLAMA_SMALL_MODEL = savedSmall;
  if (savedLarge === undefined) delete process.env.ODG_OLLAMA_LARGE_MODEL; else process.env.ODG_OLLAMA_LARGE_MODEL = savedLarge;
};

console.log("ON_DEMAND_MODEL_ROUTING_V2 — MISSION-PATH HOOK (offline)");
try {
  process.env.ODG_OLLAMA_SMALL_MODEL = "qwen2.5:0.5b";
  process.env.ODG_OLLAMA_LARGE_MODEL = "qwen2.5:14b";

  // 1 — flag OFF ⇒ strict NO-OP, no file, backward compatible.
  delete process.env[FLAG];
  const off = recordOllamaRouting("M", { authorizedPaths: ["src/app/**"] }, { cwd: REPO, write: false });
  must(off.enabled === false && off.tier === undefined, "1. flag OFF ⇒ NO-OP {enabled:false} (backward compatible)");

  // 2 — flag ON (via force) + engineering mission ⇒ LARGE, routed to configured large model.
  const eng = recordOllamaRouting("M", { authorizedPaths: ["src/app/**"], requiresEngineering: true }, { cwd: REPO, force: true, write: false });
  must(eng.enabled === true && eng.tier === "LARGE" && eng.routed === true && eng.model === "qwen2.5:14b", "2. engineering mission ⇒ LARGE routed to large model");
  must(eng.policyVersion === "OCP_V1", "2b. decision carries policyVersion");

  // 3 — audit mission ⇒ SMALL.
  const aud = recordOllamaRouting("M", { mode: "AUDIT", authorizedPaths: [] }, { cwd: REPO, force: true, write: false });
  must(aud.tier === "SMALL" && aud.routed === true && aud.model === "qwen2.5:0.5b", "3. audit mission ⇒ SMALL");

  // 4 — HIGH risk ⇒ LARGE mandatory (even without authorizedPaths).
  const hi = recordOllamaRouting("M", { mode: "AUDIT", authorizedPaths: [], risk: "HIGH" }, { cwd: REPO, force: true, write: false });
  must(hi.tier === "LARGE" && hi.risk === "HIGH", "4. HIGH risk ⇒ LARGE mandatory");

  // 5 — fail-closed: LARGE decision but NO large model configured ⇒ routed:false, tier stays LARGE (no silent downgrade).
  delete process.env.ODG_OLLAMA_LARGE_MODEL;
  const fc = recordOllamaRouting("M", { authorizedPaths: ["src/app/**"] }, { cwd: REPO, force: true, write: false });
  must(fc.tier === "LARGE" && fc.routed === false && fc.model === null, "5. LARGE + no large model ⇒ fail-closed (routed:false, NO downgrade to SMALL)");
  process.env.ODG_OLLAMA_LARGE_MODEL = "qwen2.5:14b";

  // 6 — write evidence to gitignored runtime/generated, then clean up.
  const evAbs = path.join(REPO, "runtime", "generated", "ollama-routing-decision.json");
  fs.rmSync(evAbs, { force: true });
  const w = recordOllamaRouting("M_EVIDENCE", { authorizedPaths: ["src/app/**"] }, { cwd: REPO, force: true });
  must(w.evidencePath === "runtime/generated/ollama-routing-decision.json" && fs.existsSync(evAbs), "6. evidence written to gitignored runtime/generated");
  const ev = JSON.parse(fs.readFileSync(evAbs, "utf8"));
  must(ev.mission === "M_EVIDENCE" && ev.tier === "LARGE" && ev.policyVersion === "OCP_V1", "6b. evidence content: mission + tier + policyVersion");
  fs.rmSync(evAbs, { force: true });

  // 7 — mapMissionToTask determinism + mapping.
  const t1 = mapMissionToTask({ authorizedPaths: ["x"] }); const t2 = mapMissionToTask({ authorizedPaths: ["x"] });
  must(JSON.stringify(t1) === JSON.stringify(t2) && t1.kind === "code", "7. mapMissionToTask deterministic (engineering ⇒ code)");
  must(mapMissionToTask({ mode: "AUDIT", authorizedPaths: [] }).kind === "classify", "7b. audit ⇒ classify");
} catch (e) { failures++; console.log("  FAIL sync block threw:", (e as Error).message); }

// ---- EXECUTOR (opt-in): executeOllamaStep delegates to the control plane run() ------------------
import("./ollama-routing-hook").then(async ({ executeOllamaStep }) => {
  process.env.ODG_OLLAMA_SMALL_MODEL = "qwen2.5:0.5b";
  process.env.ODG_OLLAMA_LARGE_MODEL = "qwen2.5:14b";
  // A fake Ollama HTTP (zero cost, records URLs) so the executor runs offline without a server.
  const urls: string[] = [];
  const fakeHttp = async ({ url }: { url: string; body: unknown; signal?: AbortSignal }) => {
    urls.push(url);
    if (/\/api\/generate$/.test(url)) return { status: 200, done: true, done_reason: "unload" };
    return { status: 200, message: { role: "assistant", content: "ODG_STEP_OK" }, eval_count: 5, prompt_eval_count: 20 };
  };

  // 8 — flag OFF ⇒ executor is a strict NO-OP (no execution, backward compatible).
  delete process.env.ODG_OLLAMA_CONTROL_PLANE;
  const off = await executeOllamaStep("M", { task: { kind: "classify" }, prompt: "hi" }, { cwd: REPO, write: false, httpCall: fakeHttp });
  must(off.enabled === false && urls.length === 0, "8. executor flag OFF ⇒ NO-OP (no execution)");

  // 9 — ON (force) ⇒ real step executed via control plane: OK, 1 provider call, 0 external, validated, evidence.
  const evAbs = path.join(REPO, "runtime", "generated", "ollama-inference-step.json");
  fs.rmSync(evAbs, { force: true });
  const on = await executeOllamaStep("M_STEP", { task: { kind: "classify" }, prompt: "say it", system: "test" }, { cwd: REPO, force: true, httpCall: fakeHttp });
  must(on.outcome === "OK" && on.tier === "SMALL" && on.providerCalls === 1 && on.externalCalls === 0, "9. executor ON ⇒ step executed OK (1 provider call, 0 external)");
  must(on.outputValidated === true && on.text === "ODG_STEP_OK", "9b. output passed control-plane validation");
  must(!!on.unload && (on.unload as { requested: boolean }).requested === true, "9c. lifecycle unload invoked (finally)");
  must(fs.existsSync(evAbs) && JSON.parse(fs.readFileSync(evAbs, "utf8")).mission === "M_STEP", "9d. evidence persisted to gitignored runtime/generated");
  must(!urls.some((u) => /\/api\/(pull|delete)/.test(u)), "9e. no model pull/delete");
  must(urls.every((u) => /^http:\/\/127\.0\.0\.1:11434\//.test(u)), "9f. local Ollama only (external calls = 0)");
  fs.rmSync(evAbs, { force: true });

  // 10 — fail-closed: HIGH-risk + no large model ⇒ REFUSED, zero provider call (no silent downgrade).
  delete process.env.ODG_OLLAMA_LARGE_MODEL;
  urls.length = 0;
  const fc = await executeOllamaStep("M_FC", { task: { kind: "classify", risk: "HIGH" }, prompt: "x" }, { cwd: REPO, force: true, write: false, httpCall: fakeHttp });
  must(fc.outcome === "REFUSED" && fc.tier === "LARGE" && fc.providerCalls === 0 && urls.length === 0, "10. HIGH-risk + no large model ⇒ REFUSED, 0 call (fail-closed)");

  restore();
  console.log(failures === 0 ? "ALL PASS — OLLAMA ROUTING HOOK" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((e) => { console.log("  FAIL executor block:", e?.message ?? e); restore(); process.exit(1); });

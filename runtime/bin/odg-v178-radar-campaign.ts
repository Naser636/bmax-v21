#!/usr/bin/env node
"use strict";
/*
 * V17.8 — RADAR CAMPAIGN → ONE DECISION DOSSIER (owner directives « V178-RADAR FIRST » + « V178 — CONVERGENCE PRATIQUE
 * RADAR → ODG » + « V178 — CONVERGENCE FINALE ET PRÉPARATION GO », relayed by the coordinator 2026-11-25; no committed
 * owner record for them yet). « Utiliser le Radar natif d'ODG … Ne pas construire un deuxième Radar »; « GO conserve
 * intégralement l'autorité de sélection »; « Ne pas lancer automatiquement une installation ».
 *
 * NO SECOND RADAR: the 71 provider-collected signals (docs/odg/evidence/V178_RADAR_SIGNALS_{ABH,CDI,EFG}.json — copied
 * verbatim, epistemic status UNVERIFIED) go through runtime/core/frontier-radar.ts runRadar. Sources are registered ONLY
 * through frontier-radar.registerSource (bounded-http-client allowlist): a signal citing an arxiv.org URL maps to the
 * export.arxiv.org source, else a github.com URL to the api.github.com source; every other signal keeps the sourceId
 * "provider-web-research", which registerSource REFUSES (host not allowlisted) ⇒ the Radar decides REJECT (fail-closed)
 * and the signal is recorded PROVIDER_CITED_NOT_ODG_VERIFIED. No fetch happens here: nothing is collected live.
 *
 * The PRIMARY output per signal is PRACTICAL (owner amendment: « Ne pas confondre absence de vérification documentaire et
 * absence de valeur pratique »): A exploitable now (no install) / B needs a test or qualification first / C blocked by a
 * named dependency (root / model-download / npm-dependency / owner-decision) / D low value for ODG. That table, the
 * existing-architecture map, the trajectories, proposals, authorization matrix, privacy and autonomy criteria are
 * PROVIDER-AUTHORED assessments (declared below), never measured facts unless a proofStatus says so.
 *
 *   npx tsx runtime/bin/odg-v178-radar-campaign.ts                     write docs/odg/evidence/V178_RADAR_CAMPAIGN.json
 *   npx tsx runtime/bin/odg-v178-radar-campaign.ts --check             recompute; exit 1 on byte drift
 *   npx tsx runtime/bin/odg-v178-radar-campaign.ts --convert-contracts append V178-P1…P7 as PROPOSED WORK_ITEM_CONTRACTs to
 *        V160_AP_WORK_ITEM_CONTRACTS.json through odg-radar-build-engine.convertToContracts (batch V178-RADAR-1, append-only,
 *        idempotent; owner-gated steps converted VISIBLY under RB-CONV-2). Nothing is authorized, installed or run.
 *
 * Deterministic: `now` = the newest collectedAt of the three signal files (no wall clock); no network; no model call.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const FR = require("../core/frontier-radar.js");
const ENGINE = require("../core/odg-radar-build-engine.js");
const CIG = require("../core/change-impact-graph.js");

const ROOT = path.resolve(__dirname, "..", "..");
const EV = "docs/odg/evidence";
const OUT_REL = `${EV}/V178_RADAR_CAMPAIGN.json`;
const CONTRACTS_REL = `${EV}/V160_AP_WORK_ITEM_CONTRACTS.json`;
const SIGNAL_FILES = Object.freeze([`${EV}/V178_RADAR_SIGNALS_EFG.json`, `${EV}/V178_RADAR_SIGNALS_ABH.json`, `${EV}/V178_RADAR_SIGNALS_CDI.json`]); // E/F/G first (owner amendment)
const INVENTORY_REL = `${EV}/V178_P0_VPS_INVENTORY.json`;
const V155_REL = `${EV}/V155_OLLAMA_CAPABILITY_REGISTRY.json`;
const BATCH = "V178-RADAR-1";
const OWNER_DIRECTIVE = "owner directives « V178-RADAR FIRST » / « V178 — CONVERGENCE PRATIQUE RADAR → ODG » / « V178 — CONVERGENCE FINALE ET PRÉPARATION GO » (relayed by the coordinator 2026-11-25; no committed docs/odg owner record)";
const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

/* ── Radar source mapping (declared; reliability by EVIDENCE TYPE) ─────────────────────────────────────────────────── */
const SOURCES = Object.freeze([
  Object.freeze({ id: "arxiv-paper", owner: "arXiv (Cornell) — public API", url: "https://export.arxiv.org/api/query", type: "publication", reliability: 0.7, hostRe: /(^|\.)arxiv\.org$/, why: "peer-visible preprint with author-reported measurements (claim ≠ reproduced)" }),
  Object.freeze({ id: "github-repo", owner: "GitHub — public REST API", url: "https://api.github.com/", type: "repo", reliability: 0.5, hostRe: /^(github\.com|raw\.githubusercontent\.com)$/, why: "project repository / release notes (self-description)" }),
]);
const PROVIDER_SOURCE = Object.freeze({ id: "provider-web-research", owner: "Claude Code research agent (provider)", url: "https://provider-web-research.invalid/", type: "documentation", reliability: 0.3 });
const SOURCE_RULE = "SRC-1: first evidence URL host matching arxiv.org ⇒ arxiv-paper; else github.com/raw.githubusercontent.com ⇒ github-repo; else provider-web-research (NOT registerable: host not in the bounded-http-client allowlist ⇒ runRadar REJECT, provenance PROVIDER_CITED_NOT_ODG_VERIFIED, never promoted)";

/* ── PRACTICAL classification (provider-authored; owner amendment) ─────────────────────────────────────────────────
 * [id, class, capability for ODG, current problem solved, existing components (exact paths), testable without install,
 *  measurable benefit, real blocking constraint (C: root | model-download | npm-dependency | owner-decision)] */
const P_ = (id: string, cls: string, capability: string, problem: string, components: string[], testableWithoutInstall: boolean, benefit: string, constraint: string) => ({ id, cls, capability, problem, components, testableWithoutInstall, benefit, constraint });
const CORE = (m: string) => `runtime/core/${m}.ts`;
const PRACTICAL: readonly any[] = Object.freeze([
  // E — embeddings / vector store / retrieval
  P_("E-01", "C", "small MIT multilingual embedder for FR/EN document and memory retrieval", "no semantic retrieval in ODG memory (lexical/structured only)", [CORE("memory-architecture"), CORE("ollama-provider")], false, "recall@k on an ODG retrieval set (NOT_MEASURED)", "model-download (HF weights) + npm-dependency (no embedding runtime outside Ollama)"),
  P_("E-02", "C", "best quality-per-size sub-500M embedder", "same as E-01", [CORE("memory-architecture")], false, "recall@k (NOT_MEASURED)", "model-download + owner-decision (Gemma terms are not OSI — licence check for client work)"),
  P_("E-03", "C", "Apache-2.0 embedder, 32K context, code-capable — BALANCED choice", "long contracts/tenders and code chunks need long-context embeddings", [CORE("memory-architecture"), CORE("ollama-provider")], false, "recall@k + embed ms/chunk on CPU (NOT_MEASURED)", "model-download (owner-gated pull)"),
  P_("E-04", "C", "embeddings through the EXISTING Ollama loopback (/api/embed)", "avoids a second inference runtime", [CORE("ollama-provider")], false, "zero new runtime; latency NOT_MEASURED", "model-download (ollama pull = network, owner-gated)"),
  P_("E-05", "C", "dense+sparse hybrid embedder for long FR legal documents", "lexical precision on legal text", [CORE("memory-architecture")], false, "recall@k on long docs (NOT_MEASURED)", "model-download; heaviest candidate on CPU"),
  P_("E-06", "C", "in-process vector KNN inside one SQLite file per tenant", "no vector index; per-tenant isolation wanted", [CORE("memory-architecture")], false, "KNN latency at 1e4–1e5 vectors (NOT_MEASURED)", "npm-dependency (sqlite-vec loadable extension); node:sqlite loadExtension exists (Node v22.22.1)"),
  P_("E-07", "D", "first-party SQLite ANN (watch)", "third-party risk of sqlite-vec", [], false, "none until released", "pre-release upstream"),
  P_("E-08", "D", "embedded vector DB with ANN", "only needed beyond brute-force scale", [], false, "not needed at current corpus size", "npm-dependency (native binary)"),
  P_("E-09", "D", "HNSW inside SQLite", "fallback only", [], false, "marginal", "npm-dependency"),
  P_("E-10", "A", "hybrid retrieval: FTS5 BM25 now (built-in node:sqlite), vector leg + RRF later", "exact-term recall (SIRET, article numbers, refs) that vectors miss", [CORE("memory-architecture"), CORE("odg-knowledge-intelligence")], true, "exact-term recall@k on a client-doc set (NOT_MEASURED); lexical leg needs no install", "none for the FTS5 leg (TESTED in odg-v178-radar-campaign.test.ts); vector leg = E-06 dependency"),
  P_("E-11", "A", "symbol ranking over the EXISTING import graph + TS AST chunking (localization context)", "prompts carry whole files; no ranked repo map", [CORE("change-impact-graph"), CORE("odg-native-design-pipeline")], true, "localization hit-rate on NB/benchmark tasks (NOT_MEASURED)", "none (typescript compiler already a dependency; tree-sitter NOT needed)"),
  // F — sandboxing
  P_("F-01", "A", "bwrap --unshare-net/--unshare-all for client jobs (already ODG's sandbox)", "client-document jobs need hard no-network isolation", [CORE("provider-sandbox"), CORE("odg-native-build-sandbox")], true, "negative network test passes (TESTED pattern: native-build sandbox runs --unshare-all)", "none — host Ollama unreachable inside a fresh netns ⇒ needs a bind-mounted unix socket (G-02)"),
  P_("F-02", "D", "platform fact: AppArmor userns restriction", "explains why other sandboxes need root", [], false, "informational", "root (any new sandbox profile)"),
  P_("F-03", "B", "Landlock FS/TCP restriction inside bwrap (defence in depth)", "a bug in the parser could still write outside the tenant dir", [CORE("provider-sandbox")], true, "denied-write/connect tests pass (NOT_MEASURED)", "no Node binding ⇒ a tiny helper is needed (toolchain availability NOT_ESTABLISHED); LSM listed on this kernel (EXISTENCE_OBSERVED)"),
  P_("F-04", "C", "gVisor user-space kernel for untrusted parsers", "kernel attack surface of PDF/Office parsers", [], false, "stronger isolation; overhead NOT_MEASURED", "root (install runsc + AppArmor profile)"),
  P_("F-05", "D", "Firecracker microVMs", "—", [], false, "not usable", "root + /dev/kvm (nested virtualization not available)"),
  P_("F-06", "D", "nsjail", "marginal over bwrap", [], false, "marginal", "root (build/install + AppArmor userns profile)"),
  P_("F-07", "C", "rootless Podman --network=none", "container packaging of client jobs", [], false, "packaging convenience only", "root (package install + /etc/subuid edit)"),
  // G — privacy / regulation
  P_("G-01", "A", "per-request keep_alive:0 for client jobs (no model/KV residency between tenants)", "a resident model keeps the last tenant's KV cache", [CORE("ollama-provider")], true, "model unloaded after each client job (observable via /api/ps)", "OLLAMA_NO_CLOUD / service env changes = root (systemd); per-request keep_alive needs nothing"),
  P_("G-02", "B", "no-network client pipeline: bwrap --unshare-net + unix-socket forwarder to loopback Ollama", "client data must never leave the host", [CORE("provider-sandbox"), CORE("ollama-provider")], true, "negative test: connect to a public IP fails inside; inference through the socket succeeds", "none (Node net module); needs a test first"),
  P_("G-03", "C", "fscrypt per-tenant directory encryption", "at-rest client data", [], false, "crypto isolation at rest", "root (fscrypt setup + filesystem feature)"),
  P_("G-04", "C", "per-tenant encrypted SQLite (SQLCipher / multiple-ciphers)", "at-rest vectors/FTS/chunks", [CORE("memory-architecture")], false, "encrypted tenant DB", "npm-dependency (native cipher build; sqlite-vec compatibility NOT_ESTABLISHED)"),
  P_("G-05", "C", "age file encryption per tenant", "at-rest blobs/backups", [], false, "simple per-tenant keys", "owner-decision (binary download); node:crypto AES-256-GCM is a no-install alternative"),
  P_("G-06", "B", "AI Act amendment dates for the compliance memory", "the ODG memory anchor (Art. 113 dates) may be stale", [], true, "correct dated citation", "must be verified on EUR-Lex before any client use (secondary sources only)"),
  P_("G-07", "A", "GDPR design anchors (Art. 5(1)(c), Art. 25) for the local-only client pipeline", "justification for minimisation/retention rules", [], true, "documented design rationale", "interpretation, not legal advice"),
  // A — models
  P_("A-01", "C", "Qwen3.5-9B as next coder candidate (Q4/Q5 fits RAM)", "implement class is PROBATION 0.5 on qwen2.5-coder:7b", [CORE("odg-local-model-benchmark"), CORE("odg-model-router")], false, "implement pass rate vs 3/6 (to be measured on task set v2)", "model-download (owner-gated pull); installed Ollama 0.35.1 support NOT_ESTABLISHED (B-03)"),
  P_("A-02", "C", "Gemma 4 12B as different-family reviewer (evaluator independence)", "generator and reviewer share one model family", [CORE("evaluator-independence"), CORE("odg-local-model-benchmark")], false, "reviewer agreement vs oracle (NOT_MEASURED)", "model-download"),
  P_("A-03", "C", "Gemma 4 26B-A4B MoE (faster decode per active params)", "dense 7–9B decode is slow on CPU", [CORE("odg-local-model-benchmark")], false, "tok/s and pass rate (NOT_MEASURED)", "model-download + RAM borderline (13.6 GB, no swap) ⇒ AMBITIOUS only"),
  P_("A-04", "D", "Qwen3.6-35B-A3B", "—", [], false, "reference ceiling only", "does not fit 22 GiB with workloads"),
  P_("A-05", "D", "27B dense", "—", [], false, "none here", "does not fit; slow dense decode"),
  P_("A-06", "D", "Qwen3-Coder-30B-A3B / Next", "—", [], false, "none here", "≈18.6 GB at Q4 — no room with no swap"),
  P_("A-07", "D", "Devstral Small 2 (24B dense)", "—", [], false, "none here", "≈14 GB dense; slow on CPU; licence caveat on sibling"),
  P_("A-08", "D", "Granite 4.0 H-Tiny for routing/extraction", "—", [], false, "marginal: 3B/0.5B already QUALIFIED on extract (V155)", "model-download"),
  P_("A-09", "C", "embedding model choice (Qwen3-Embedding-0.6B vs EmbeddingGemma)", "duplicate of E-02/E-03", [CORE("memory-architecture")], false, "see E-03", "model-download"),
  // B — engines
  P_("B-01", "C", "llama-server (slots, prompt cache, grammar, metrics, spec decoding)", "Ollama hides these controls", [CORE("ollama-provider")], false, "A/B tok/s and cache reuse (NOT_MEASURED)", "owner-decision (binary build/download) — AMBITIOUS"),
  P_("B-02", "A", "explicit num_ctx sizing + JSON-schema format per request", "default 4096 ctx silently truncates repo-scale prompts", [CORE("ollama-provider"), CORE("odg-local-model-benchmark")], true, "no truncated prompt (prompt_eval_count < num_ctx asserted)", "none (request options)"),
  P_("B-03", "C", "Ollama upgrade 0.35.1 → newer", "newer model families may need it", [], false, "model support (NOT_ESTABLISHED)", "root (system service binary)"),
  P_("B-04", "D", "vLLM CPU", "—", [], false, "none on AVX2", "AVX2-only host"),
  P_("B-05", "D", "llamafile", "—", [], false, "none beyond llama-server", "—"),
  P_("B-06", "C", "ik_llama.cpp faster prompt processing", "prompt processing ≈27 tok/s is the long-context bottleneck", [], false, "pp tok/s A/B (NOT_MEASURED)", "owner-decision (build/install) — AMBITIOUS"),
  // H — hardware / measurement
  P_("H-01", "C", "MoE ≈2× decode vs dense 7B on DDR4 CPU", "decode speed limits n samples per wall-clock", [], false, "tok/s (measured elsewhere, not here)", "model-download + RAM (needs a MoE that fits)"),
  P_("H-02", "B", "quant ladder (KL) to pick Q4 vs Q5 for a 9B", "quant choice is otherwise a guess", [CORE("odg-local-model-benchmark")], false, "task pass rate per quant", "applies only after A-01 download"),
  P_("H-03", "D", "speculative decoding is often not a win on consumer CPUs", "—", [], false, "avoids wasted effort", "caution recorded (see D-05)"),
  P_("H-04", "B", "independent repair benchmark: small models ≤4/10 on non-trivial repair", "which candidate to qualify first", [CORE("odg-local-model-benchmark")], false, "informs P3 ordering", "must be reproduced on ODG's own task set"),
  P_("H-05", "A", "evidence-grade throughput method (pp/tg split, mean±sd)", "V155 reports gen tok/s only (eval_count/eval_duration)", [CORE("odg-local-model-benchmark"), "runtime/bin/odg-local-model-benchmark.ts"], true, "prompt tok/s + gen tok/s per model with sd", "none: Ollama returns prompt_eval_count/duration (llama-bench itself would need an install)"),
  P_("H-06", "A", "context/KV RAM levers (num_ctx per request)", "no swap ⇒ KV growth is the OOM risk", [CORE("ollama-provider")], true, "RSS peak vs num_ctx (measured by the V155 /proc sampler)", "KV q8_0 needs a service env change (root); num_ctx per request needs nothing"),
  P_("H-07", "A", "rank candidates on ODG's own suite, never vendor SWE-bench", "marketing ≠ measured", [CORE("odg-local-model-benchmark")], true, "policy already applied by V155", "none"),
  // C — coding methods
  P_("C-01", "B", "hierarchical localization (file→function) before generate", "the model sees too much code; edits drift", [CORE("odg-native-design-pipeline"), CORE("change-impact-graph")], true, "localization accuracy + pass rate (NOT_MEASURED)", "none; needs a stage + test"),
  P_("C-02", "A", "best-of-n diverse sampling + execution-based selection", "implement PROBATION 3/6; temperature 0 gives one candidate per design", [CORE("odg-native-design-pipeline"), CORE("odg-native-build-sandbox"), CORE("odg-local-model-benchmark")], true, "implement pass rate vs 3/6 at equal call budget", "none (extends DIV-1/SEL-1; no install)"),
  P_("C-03", "B", "dual execution agreement (model tests as tie-breaker only)", "ties between passing candidates", [CORE("odg-native-design-pipeline")], true, "selection accuracy on ties", "model-written tests must never be the acceptance oracle (C-06)"),
  P_("C-04", "A", "budget-normalized comparison: n samples vs k samples + repair", "repair is assumed to help", [CORE("odg-native-design-pipeline"), CORE("odg-local-model-benchmark")], true, "pass@budget per arm", "none (measurement rule)"),
  P_("C-05", "B", "explain-then-fix repair prompt from sandbox output", "repair regenerates identical code (NB2 stall)", [CORE("odg-native-design-pipeline")], true, "repair success per round", "prompt A/B needed"),
  P_("C-06", "A", "self-generated tests never the acceptance oracle", "reward hacking via own tests", [CORE("odg-native-design-pipeline"), CORE("odg-native-build-sandbox")], true, "already enforced in NB2 (host-graded held-out oracle); codified in P6", "none"),
  P_("C-07", "B", "lesson memory keyed by failure signature (exists: NB2 S6 LEARN)", "unknown whether lessons raise pass rate", [CORE("odg-native-design-pipeline"), CORE("memory-taxonomy")], true, "pass rate with vs without lessons", "measurement needed"),
  P_("C-08", "B", "test-driven multi-stage flow", "single-prompt generation", [CORE("odg-native-design-pipeline")], true, "pass rate (NOT_MEASURED)", "overlaps the existing S1–S6 flow; A/B only"),
  P_("C-09", "B", "architect (7b) / editor (3b) split", "7b is slow; 3b edits cheaply", [CORE("odg-model-router"), CORE("local-model-generator")], true, "time per accepted patch", "3b DEMOTED on bugfix (V155) ⇒ risky; test first"),
  P_("C-10", "A", "small-model reality check (expectation setting)", "overclaiming risk", [CORE("odg-local-model-benchmark")], true, "honest baselines", "none"),
  P_("C-11", "D", "trained verifier over trajectories", "—", [], false, "training out of scope on this host", "GPU/training"),
  P_("C-12", "B", "hybrid verifier score (tests + agreement + judge)", "tests alone saturate", [CORE("odg-native-design-pipeline"), CORE("evaluator-independence")], true, "selection accuracy", "needs test; judge must be independent"),
  P_("C-13", "B", "BM25 retrieve-then-edit localization", "cheap deterministic localization", [CORE("odg-native-design-pipeline"), CORE("change-impact-graph")], true, "file-hit rate", "none (pure TS or node:sqlite FTS5); test first"),
  P_("C-14", "B", "task synthesis by mutating own code (task set v3)", "implement class has only 2 tasks (n=6 trials)", [CORE("odg-local-model-benchmark"), CORE("benchmark-contamination")], true, "larger implement n ⇒ tighter pass-rate interval", "none; tasks must stay held-out"),
  P_("C-15", "A", "private held-out tasks for acceptance (SWE-bench memorization)", "public benchmark contamination", [CORE("odg-eval-heldout-calibration"), CORE("benchmark-contamination")], true, "contamination-free acceptance", "none (components exist)"),
  // D — routing
  P_("D-01", "D", "learned router", "—", [CORE("odg-model-router")], false, "needs outcome volume ODG does not have yet", "data volume"),
  P_("D-02", "B", "test-gated cascade 3B → 7B (cheap first, escalate on test failure)", "7b is used even where 3b would pass", [CORE("odg-model-router")], true, "time per passed task at equal pass rate", "needs test; runWithFallback today is availability fallback, not test-gated"),
  P_("D-03", "D", "POMDP self-verification escalation", "—", [], false, "QA framing, heavy", "—"),
  P_("D-04", "B", "difficulty-threshold router on the existing complexity taxonomy", "fixed difficulty→model map", [CORE("odg-model-router")], true, "routing accuracy vs outcomes", "needs outcome data"),
  P_("D-05", "C", "speculative decoding (small draft + 7B)", "decode speed", [], false, "tok/s if it holds (H-03 warns it often does not)", "owner-decision (llama.cpp install; not exposed by the installed Ollama)"),
  // I — self-improvement governance
  P_("I-01", "A", "evaluators and held-out tests outside any self-modifying write_set", "objective hacking by self-modification", [CORE("odg-native-design-pipeline"), CORE("evaluator-independence")], true, "rule enforced + tested (P6)", "none"),
  P_("I-02", "B", "accept self-change only on measured eval delta", "self-change acceptance rule", [CORE("evaluator-independence")], true, "eval delta per accepted change", "real-repo self-improvement stays owner-only"),
  P_("I-03", "B", "small population of candidates across repair rounds", "single lineage repair stalls", [CORE("odg-native-design-pipeline")], true, "pass rate per call budget", "extends DIV-1; test first"),
  P_("I-04", "A", "candidate patches may not touch tests/evaluators/fixtures; acceptance from a frozen copy", "reward hacking (modify tests/scorers)", [CORE("odg-native-design-pipeline"), CORE("odg-native-build-sandbox"), CORE("odg-local-model-benchmark")], true, "violations detected in tests (P6)", "none"),
]);

/* proofStatus exceptions (everything else: DOC_CONSULTED by the collecting provider session, not re-fetched by ODG) */
const PROOF: any = Object.freeze({
  "E-10": { status: "TESTED", basis: "node:sqlite (Node v22.22.1) FTS5 virtual table + bm25() executed in runtime/bin/odg-v178-radar-campaign.test.ts (lexical leg only)" },
  "F-01": { status: "TESTED", basis: "ODG's sandbox already runs model code under bwrap --unshare-all (runtime/core/odg-native-build-sandbox.ts; committed runs docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json, V175_NB2_NATIVE_DESIGN_RESULT.json)" },
  "F-03": { status: "EXISTENCE_OBSERVED", basis: "provider read /sys/kernel/security/lsm on 2026-11-25: 'landlock' listed (ABI version NOT_ESTABLISHED)" },
  "B-03": { status: "EXISTENCE_OBSERVED", basis: "installed Ollama 0.35.1 (docs/odg/evidence/V178_P0_VPS_INVENTORY.json#runtimes.ollama); the newer release number is DOC_CONSULTED only" },
  "G-01": { status: "EXISTENCE_OBSERVED", basis: "Ollama listens on 127.0.0.1:11434 only (docs/odg/evidence/V178_P0_VPS_INVENTORY.json#network.listening.loopbackOnly)" },
  "H-07": { status: "TESTED", basis: "ODG already ranks models on its own suite (docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json)" },
  "C-06": { status: "TESTED", basis: "NB2 acceptance only by the host-graded held-out oracle (docs/odg/evidence/V175_NB2_NATIVE_DESIGN_RESULT.json; contract V175-NB2 invariants)" },
});

/* ── EXISTING ARCHITECTURE (verified at base 9a2c5eeb; consumers re-verified by the test) ──────────────────────────── */
const ARCH: readonly any[] = Object.freeze([
  { component: "ollama-provider", path: CORE("ollama-provider"), function: "loopback-only Ollama client (generate, generateMeasured, listModels, showModel, unloadModel keep_alive:0)", exports: ["detectOllama", "generate", "generateMeasured", "listModels", "showModel", "unloadModel", "loopbackGet", "loopbackStream"], consumers: ["runtime/core/odg-local-model-benchmark.ts", "runtime/bin/odg-local-model-benchmark.ts", "runtime/core/repair-retry.ts", "runtime/core/generative-repair-adapter.ts"], missing: ["no /api/embed wrapper (needed by E-03/E-04)", "native-design runs call /api/generate through their own fetch transport (odg-native-design-pipeline), not this module"], verifiedBy: V155_REL },
  { component: "local-model-generator", path: CORE("local-model-generator"), function: "generateFile seam for native-project-builder (prompt build + code extraction)", exports: ["buildPrompt", "extractCode", "makeLocalGenerator"], consumers: ["runtime/core/odg-native-design-pipeline.ts", "runtime/bin/odg-v175-native-build-run.ts", "runtime/bin/odg-v176-scenario-j-run.ts"], missing: ["single sample per call (no n-candidate API) — P1"], verifiedBy: `${EV}/V175_NATIVE_BUILD_RESULT.json` },
  { component: "odg-native-design-pipeline", path: CORE("odg-native-design-pipeline"), function: "S1 PROBLEM → S2 IMPACT → S3 DESIGN (≥2 designs) → S4 SELECT (SEL-1, sandbox-measured) → S5 BUILD (bounded repair) → S6 LEARN; NB3 DIV-1 repair-diversity ladder", exports: ["(dual export: deriveProblem, analyseImpact, designPrompt, parseDesigns, scoreCandidate, selectDesign, deriveLessons, …)"], consumers: ["runtime/bin/odg-v175-native-design-run.ts", "runtime/bin/odg-v176-nb3-native-design-run.ts", "runtime/bin/odg-v175-native-build-run.ts", "runtime/bin/odg-v176-scenario-j-run.ts", "runtime/bin/odg-v176-scenario-f-run.ts"], missing: ["one implementation per design at temperature 0 — no best-of-n sampling per design (P1)", "no localization stage (C-01/C-13)"], verifiedBy: `${EV}/V175_NB2_NATIVE_DESIGN_RESULT.json` },
  { component: "odg-model-router (CANONICAL for local-model selection)", path: CORE("odg-model-router"), function: "cheapest local model covering a difficulty; selectMeasured over the V155 registry; runWithFallback (availability/failure fallback, quality-first order)", exports: ["selectModel", "routeBatch", "selectMeasured", "runWithFallback", "LOCAL_POOL"], consumers: ["runtime/core/odg-local-model-execution-policy.ts", "runtime/core/odg-strategy-mode-selector.ts", "runtime/bin/odg-local-model-benchmark.ts"], missing: ["no test-gated cheap-first cascade (P5)", "OVERLAP: runtime/core/model-router.ts (V12.4, MODEL_BENCHMARKS) is consumed only by odg-light-path-selector.ts and repair-router.ts — odg-model-router is canonical by consumers and by measured-registry input; model-router is legacy (no merge done here)"], verifiedBy: V155_REL },
  { component: "odg-local-model-execution-policy", path: CORE("odg-local-model-execution-policy"), function: "turns measured findings + V155 registry into an execution policy (chooseExecutionPolicy, loadMeasuredRegistry)", exports: ["chooseExecutionPolicy", "loadMeasuredRegistry", "MEASURED_MAX_AGE_MS"], consumers: ["runtime/bin/odg-go.ts", "runtime/core/odg-strategy-mode-selector.ts", "runtime/core/odg-policy-build-seam.ts", "runtime/core/odg-intelligent-native-cycle.ts"], missing: ["no per-class tok/s/RAM budget input (P2 output would feed it)"], verifiedBy: `${EV}/V176_J_GO_EXECUTE_TRACE.jsonl` },
  { component: "odg-native-build-sandbox (bwrap)", path: CORE("odg-native-build-sandbox"), function: "runs MODEL-WRITTEN code in provider-sandbox bwrap (--unshare-all, --clearenv, RLIMIT_AS 1 GiB) + gradeCases", exports: ["runIsolated", "gradeCases", "probeSandbox", "buildSandboxProgram"], consumers: ["runtime/core/odg-native-design-pipeline.ts", "runtime/core/native-project-builder.ts", "runtime/bin/odg-v175-native-design-run.ts", "runtime/bin/odg-v176-nb3-native-design-run.ts"], missing: ["no unix-socket model access from inside (needed for client jobs, P7)"], verifiedBy: `${EV}/V175_NATIVE_BUILD_RESULT.json` },
  { component: "oracle / provenance", path: `${CORE("odg-native-design-pipeline")} (host-graded held-out oracle, authorship ledger) + ${CORE("evaluator-independence")} + ${CORE("odg-eval-heldout-calibration")}`, function: "held-out expected values never enter a prompt; acceptance only by host-graded oracle; per-stage authorship ledger; evaluator-independence audit", exports: ["auditIndependence", "buildHeldOut"], consumers: ["runtime/core/inspection-boundary.ts (evaluator-independence)"], missing: ["no single declared, tested rule that evaluator/test/fixture paths are outside every model-writable write_set across pipeline AND benchmark (P6)"], verifiedBy: `${EV}/V175_NB2_CRITERIA_VALIDATION.json` },
  { component: "V155 capability registry", path: V155_REL, function: "MEASURED per-class status per model (QUALIFIED/PROBATION/DEMOTED), latency, gen tok/s, RSS peak", exports: ["(evidence record built by odg-local-model-capability.buildCapabilityRegistry)"], consumers: ["runtime/core/odg-local-model-execution-policy.ts (loadMeasuredRegistry)"], missing: ["measured 2026-11-23 on a SHARED host (loadavg 2.25 → 7.2): tok/s read against contention", "no prompt tok/s", "implement n = 6 (2 tasks × 3 trials)"], verifiedBy: V155_REL },
  { component: "odg-local-model-benchmark", path: `${CORE("odg-local-model-benchmark")} + runtime/bin/odg-local-model-benchmark.ts + ${CORE("odg-local-model-benchmark-tasks.v2.json").replace(/\.ts$/, "")}`, function: "versioned task set v2 (11 tasks, 8 classes), objective graders, /proc CPU/RSS sampler, one model at a time, temperature 0 seed 42", exports: ["runBenchmark", "loadTaskSet", "gradeTrial", "createProcSampler"], consumers: ["runtime/bin/odg-local-model-benchmark.ts", "runtime/core/odg-native-build-sandbox.ts"], missing: ["no n-sample arm (P1/P2)", "no pp/tg split (H-05)"], verifiedBy: V155_REL },
  { component: "change-impact-graph", path: CORE("change-impact-graph"), function: "read-only import graph of runtime/core (buildGraph, impactOf)", exports: ["buildGraph", "impactOf"], consumers: ["runtime/core/odg-native-design-pipeline.ts", "runtime/bin/odg-pre-open-gate.ts", "runtime/bin/odg-v176-radar-build-proposals.ts"], missing: ["no symbol-level ranking (E-11)"], verifiedBy: `${EV}/V176_RADAR_BUILD_PROPOSALS.json` },
  { component: "odg-go-wave", path: CORE("odg-go-wave"), function: "parallel GO waves on independent write zones (selectWave, dispatchWave, integrate)", exports: ["selectWave", "selectWaveFromState", "dispatchWave", "integrate"], consumers: ["runtime/bin/odg-v176-scenario-f-run.ts"], missing: ["NOT wired into runtime/core/odg-go-cycle.ts nor runtime/bin/odg-go.ts (odg-go-wave imports odg-go-cycle, not the reverse)", "waves must be capped by RAM (one large model resident), not vCPU"], verifiedBy: "NOT_ESTABLISHED (no committed wave run record found at base 9a2c5eeb)" },
]);

/* ── IMPLEMENT GAP ───────────────────────────────────────────────────────────────────────────────────────────────── */
function implementGap(v155: any): any {
  const m = (v155 && v155.registry && Array.isArray(v155.registry.models) ? v155.registry.models : []).find((x: any) => x.id === "qwen2.5-coder:7b") || null;
  const pc = m && m.perClass ? m.perClass : {};
  const st = (k: string) => (pc[k] ? { status: pc[k].status, passes: pc[k].passRate.passes, n: pc[k].passRate.n } : null);
  const ms = pc.implement && pc.implement.totalMs ? pc.implement.totalMs.p50 : null;
  return {
    baseline: { source: `${V155_REL}#registry.models[qwen2.5-coder:7b].perClass`, implement: st("implement"), bugfix: st("bugfix"), extract: st("extract"), judgment: st("judgment"), refactor: st("refactor"), thresholds: v155 && v155.thresholds ? v155.thresholds : null, implementTotalMsP50: ms },
    levers: [
      { lever: "best-of-n diverse sampling + execution-based selection", signals: ["C-02", "C-04", "C-11", "C-12"], proposal: "V178-P1", class: "A" },
      { lever: "localization / decomposition before generate", signals: ["C-01", "C-13", "E-11"], proposal: "(future; not in this batch)", class: "A/B" },
      { lever: "repair diversity (NB3 DIV-1 ladder) and candidate population", signals: ["C-05", "I-03"], proposal: "V176-NB3 (in flight) — not duplicated", class: "B" },
      { lever: "test-gated cascade 3B → 7B", signals: ["D-02", "D-04"], proposal: "V178-P5", class: "B" },
      { lever: "larger held-out implement task set (n)", signals: ["C-14", "C-15"], proposal: "V178-P2 (measurement) — tasks added only as held-out", class: "B" },
    ],
    qualificationScenario: {
      status: "PREPARED — NOT RUN (owner: do not run expensive benchmarks)",
      harness: ["runtime/bin/odg-local-model-benchmark.ts", "runtime/core/odg-local-model-benchmark.ts", "runtime/core/odg-local-model-benchmark-tasks.v2.json (V155-TASKSET-2: impl-chunk, impl-ts-parse-range)"],
      preRegistered: {
        baselineArm: "qwen2.5-coder:7b, temperature 0, seed 42, trials 3 on the 2 implement tasks ⇒ 3/6 recorded (PROBATION)",
        treatmentArm: "same model, n = 4 candidates per trial from a declared (temperature, seed) schedule; selection by VISIBLE cases executed in the sandbox; grading by the HIDDEN cases only (selection ≠ grading)",
        decisionRule: "QUALIFIED iff passRate ≥ thresholds.minPassRate (0.67 ⇒ ≥ 4/6) at minN 6; equal-call-budget comparison recorded beside it (C-04); a FAIL is recorded as FAIL",
        prerequisite: "P1 adds the n-candidate arm and the visible/hidden case split to the harness (today every case is hidden)",
      },
      dryCommand: "npx tsx runtime/bin/odg-local-model-benchmark.ts --models qwen2.5-coder:7b --only impl-chunk,impl-ts-parse-range --trials 3 --out docs/odg/evidence/V178_IMPLEMENT_QUALIFICATION.json",
      costEstimate: ms ? `≈ 6 trials × 4 candidates × ${ms} ms p50 ≈ ${Math.round(6 * 4 * ms / 60000)} min of 7b inference (estimate from the V155 p50; host contention not included)` : "NOT_MEASURED",
    },
  };
}

/* ── TRAJECTORIES + RECOMMENDATION (owner-specified conclusions, each cited to signal ids) ────────────────────────── */
const HARDWARE = Object.freeze({ source: INVENTORY_REL, facts: ["CPU-only, 8 vCPU Haswell AVX2 (no AVX-512), no GPU", "22 GiB RAM, no swap ⇒ ONE large model resident at a time", "decode speed is driven by ACTIVE parameters (dense 7–9B slow; small-active MoE faster) — H-01 (measured elsewhere, not on this host)"] });
const TRAJECTORIES = Object.freeze([
  { id: "MINIMAL", install: "none", content: ["current Ollama 0.35.1 + qwen2.5-coder 7b/3b + qwen2.5 0.5b (B-03 installed)", "best-of-n diverse sampling with execution-based selection in the native pipeline (C-02, C-04, C-12)", "measure real gen tok/s + RAM with the existing V155 benchmark harness (H-05, H-06, H-07)"], signals: ["C-02", "C-04", "C-12", "H-05", "H-06", "H-07"], ownerGate: "none" },
  { id: "BALANCED", recommended: true, install: "model pulls + one npm dependency (owner approval)", content: ["MINIMAL", "qualify Qwen3.5-9B Q4/Q5 as coder via the V155 harness (A-01, H-02, H-04)", "Qwen3-Embedding-0.6B + sqlite-vec + FTS5 hybrid per-tenant memory inside existing memory components (E-03, E-06, E-10)", "test-gated 3B → 9B cascade via the existing odg-model-router (D-02)", "client jobs in bwrap --unshare-net with Ollama over a bind-mounted unix socket (F-01, G-02)"], signals: ["A-01", "H-02", "H-04", "E-03", "E-06", "E-10", "D-02", "F-01", "G-02"], ownerGate: "model pulls (A-01, E-03) + sqlite-vec dependency (E-06)" },
  { id: "AMBITIOUS", install: "root + RAM-borderline", content: ["MoE 26–30B coder tier (A-03, A-06, H-01)", "llama.cpp A/B (B-01, B-06)", "speculative decoding (D-05; H-03 caution)", "gVisor (F-04)", "host egress blocking (G-02 at host level)", "fscrypt (G-03)"], signals: ["A-03", "A-06", "H-01", "B-01", "B-06", "D-05", "H-03", "F-04", "G-03"], ownerGate: "DEFERRED — root + RAM-borderline; separate owner authorization per item" },
]);
const RECOMMENDATION = "BALANCED — start with the no-install MINIMAL items now (P1, P2), then owner-approved pulls (P3, P4); AMBITIOUS deferred (root + RAM-borderline). Quality gains on this host come from method (sampling, selection, localization), not from bigger models (V178_P0 capacityDiagnosis.implications).";

/* ── PROPOSALS (ranked; converted to PROPOSED contracts by --convert-contracts) ───────────────────────────────────── */
const INV = ["PROPOSED ≠ AUTHORIZED ≠ EXECUTED", "score ≠ authorization", "hypothesis ≠ fact", "no network, no install, no protected path unless the owner-gated step is authorized"];
const STOPS = ["write_set must grow beyond the authorized one", "a protected path (Master/Constitution/CTO directives/ROADMAP.json/secrets/deploy) is needed", "an install or download is needed that is not authorized"];
const EVID = ["test output per file", "recomputed before/after metric record", "independent inspection verdict"];
const PROPOSALS: readonly any[] = Object.freeze([
  { id: "V178-P1", rank: 1, signals: ["C-02", "C-04", "C-12", "I-04"], objective: "multi-candidate generation (n diverse samples per design) with execution-based selection whose criteria are independent of generation, in the native design pipeline",
    problem: "implement is PROBATION 3/6 for qwen2.5-coder:7b (V155); the pipeline implements each design once at temperature 0, so the selector sees one candidate per design",
    solution: "sampleCandidates(spec, {n, schedule}) draws n candidates from a PRE-DECLARED (temperature, seed) schedule; selectByExecution(candidates, visibleCases) runs each in the sandbox and ranks by visible-case passes, typecheck, diff size — never by model self-assessment; acceptance stays the host-graded HIDDEN oracle",
    components: [CORE("odg-native-design-pipeline"), CORE("odg-native-build-sandbox"), CORE("local-model-generator")],
    writeSet: [CORE("odg-native-design-pipeline"), "runtime/core/odg-native-design-pipeline.test.ts"],
    interfaces: ["sampleCandidates(spec, { n, schedule }) → candidates[] (each with model, temperature, seed, sha256)", "selectByExecution(candidates, visibleCases, opts) → { chosen, ranking, reasons } (pure over sandbox results)"],
    acceptance: ["with a fake transport, n candidates are drawn exactly from the declared schedule (undeclared options refused)", "selection uses only visible-case results: changing hidden cases never changes the choice", "a candidate touching a test/evaluator path is excluded before selection", "with fixed transport outputs the selection is deterministic"],
    benefit: "implement pass rate above 3/6 at a recorded call budget (measured later by the qualification scenario)", resources: "no install; n× model calls per design (7b implement p50 ≈ 23 s/call)", risks: "call cost grows with n; visible/hidden split must not leak hidden cases",
    before: [{ source: `${V155_REL}#registry.models[qwen2.5-coder:7b].perClass.implement.passRate`, name: "implement.passRate", value: "3/6" }],
    buildCommand: "npx tsx runtime/core/odg-native-design-pipeline.test.ts", ownerGate: null },
  { id: "V178-P2", rank: 2, signals: ["H-05", "H-06", "H-07", "C-10", "C-14"], objective: "measure real generation tok/s, prompt tok/s, RAM peak, generation time and per-class pass rate of the installed models with the existing V155 benchmark harness",
    problem: "V155 measured gen tok/s (7b 8.1, 3b 16, 0.5b 60.8 mean) and RSS peak (≈4.9/2.1/0.5 GB) on a SHARED host (loadavg up to 7.2), without prompt tok/s; implement n is only 6",
    solution: "add prompt tok/s (prompt_eval_count/duration), host-load gating (record and flag trials above a declared load), and the P1 n-candidate arm to runBenchmark; write a NEW evidence file (never overwrite V155)",
    components: [CORE("odg-local-model-benchmark"), "runtime/bin/odg-local-model-benchmark.ts", CORE("ollama-provider")],
    writeSet: [CORE("odg-local-model-benchmark"), "runtime/core/odg-local-model-benchmark.test.ts", "runtime/bin/odg-local-model-benchmark.ts"],
    interfaces: ["runBenchmark({ models, trials, onlyTasks, candidates?, loadCeiling? }) → adds promptTokPerSec, hostLoad flag, candidate records"],
    acceptance: ["a fake daemon response yields promptTokPerSec = prompt_eval_count / prompt_eval_duration", "trials above the declared load ceiling are flagged CONTENDED and excluded from speed stats (kept in raw)", "the V155 evidence file is never written by the new mode (--out required)", "the selftest runs offline (no daemon)"],
    benefit: "measured tok/s + RAM per model at known load; tighter implement pass-rate interval", resources: "no install; a full run ≈ 10–15 min of local inference (NOT run here)", risks: "host contention from other sessions; numbers are host-specific",
    before: [{ source: `${V155_REL}#registry.models[*].speed.tokPerSec`, name: "genTokPerSec.mean", value: { "qwen2.5-coder:7b": 8.1, "qwen2.5-coder:3b": 16, "qwen2.5:0.5b": 60.8 } }],
    buildCommand: "npx tsx runtime/core/odg-local-model-benchmark.test.ts", ownerGate: null },
  { id: "V178-P3", rank: 3, signals: ["A-01", "H-02", "H-04", "B-03"], objective: "qualify Qwen3.5-9B (Q4 then Q5) as coder on the V155 harness and register it in odg-model-router only if QUALIFIED",
    problem: "no installed model is QUALIFIED on implement; the 9B fits RAM (Q4_K_M 5.68 GB per the vendor/GGUF pages)",
    solution: "after the authorized pull, run the harness with --models <tag>; add a LOCAL_POOL entry only from the measured registry",
    components: [CORE("odg-local-model-benchmark"), CORE("odg-model-router")],
    writeSet: [CORE("odg-model-router"), "runtime/core/odg-model-router.test.ts"],
    interfaces: ["LOCAL_POOL entry { id, costRank, covers, evidence } derived from the measured registry"],
    acceptance: ["router test: the new model is selected for a class only if its measured status is QUALIFIED", "no pool entry exists without a committed measurement record"],
    benefit: "implement pass rate vs 3/6 (to measure)", resources: "≈5.7–6.6 GB download; ≈6–7 GB RAM resident", risks: "installed Ollama 0.35.1 support for the hybrid architecture NOT_ESTABLISHED (B-03 may need a root upgrade); thinking mode default ON",
    before: [{ source: `${V155_REL}#registry.models[qwen2.5-coder:7b].perClass.implement.status`, name: "implement.status", value: "PROBATION" }],
    buildCommand: "npx tsx runtime/core/odg-model-router.test.ts", ownerGate: { required: true, step: "model download (Ollama pull of the Qwen3.5-9B tag — exact tag to confirm in the Ollama library; network)", reason: ["model download", "possible Ollama upgrade (root) if 0.35.1 lacks support"] } },
  { id: "V178-P4", rank: 4, signals: ["E-03", "E-06", "E-10", "A-09"], objective: "local embeddings + SQLite FTS5/vector hybrid per-tenant memory inside the existing memory components",
    problem: "ODG memory has no semantic retrieval; exact-term recall for client documents is needed",
    solution: "FTS5 BM25 leg on node:sqlite (no install, tested); vector leg via Qwen3-Embedding-0.6B through Ollama /api/embed + sqlite-vec; Reciprocal Rank Fusion; one SQLite file per tenant",
    components: [CORE("memory-architecture"), CORE("ollama-provider")],
    writeSet: [CORE("memory-architecture"), "runtime/core/memory-architecture.test.ts"],
    interfaces: ["hybridSearch(tenantDb, query, { k }) → ranked chunks with bm25 + vector ranks + RRF score"],
    acceptance: ["FTS5 leg returns exact-term matches ranked by bm25 (offline test)", "RRF fusion is deterministic for fixed inputs", "two tenants never read each other's file"],
    benefit: "recall@k on an ODG retrieval set (to measure)", resources: "≈0.6B model (<1.5 GB RAM); sqlite-vec loadable extension", risks: "sqlite-vec is pre-v1; Node's node:sqlite is experimental",
    before: [{ source: `${CORE("memory-architecture")}`, name: "semanticRetrieval", value: "ABSENT" }],
    buildCommand: "npx tsx runtime/core/memory-architecture.test.ts", ownerGate: { required: true, step: "model download (Qwen3-Embedding-0.6B pull) + npm dependency (sqlite-vec)", reason: ["model download", "npm dependency"] } },
  { id: "V178-P5", rank: 5, signals: ["D-02", "D-04", "C-09"], objective: "test-gated cheap-first cascade 3B → 7B on the existing odg-model-router (escalate only when the sandbox tests fail)",
    problem: "runWithFallback falls back on unavailability/failure in quality-first order; 3B is never tried first where it would pass",
    solution: "runCascade(order, invoke, testGate): cheapest model first; escalate when the execution test fails; every attempt recorded",
    components: [CORE("odg-model-router")],
    writeSet: [CORE("odg-model-router"), "runtime/core/odg-model-router.test.ts"],
    interfaces: ["runCascade({ order, invoke, testGate, maxAttempts }) → { outcome, model, attempts }"],
    acceptance: ["a passing 3B result stops the cascade (7B never invoked)", "a failing 3B result escalates to 7B", "a DEMOTED model for the class is never in the order"],
    benefit: "time per passed task at equal pass rate (to measure)", resources: "no install", risks: "3B is DEMOTED on bugfix (V155) ⇒ class-aware order required",
    before: [{ source: `${CORE("odg-model-router")}#runWithFallback`, name: "testGatedCascade", value: "ABSENT" }],
    buildCommand: "npx tsx runtime/core/odg-model-router.test.ts", ownerGate: null },
  { id: "V178-P6", rank: 6, signals: ["I-01", "I-04", "C-06", "C-15"], objective: "anti-reward-hacking gate: evaluator, test and fixture files frozen (sha-pinned) and outside every model-writable write_set; held-out evaluation",
    problem: "already present: NB2 host-graded held-out oracle, held-out values never in prompts, evaluator-independence audit, odg-eval-heldout-calibration; missing: one declared, tested rule shared by the pipeline AND the benchmark",
    solution: "frozenEvaluators(paths) pins sha256 before a run; guardCandidate(diff) refuses any candidate touching a pinned or test path; acceptance reruns from the pinned copy",
    components: [CORE("odg-native-design-pipeline"), CORE("odg-local-model-benchmark"), CORE("evaluator-independence")],
    writeSet: [CORE("odg-native-design-pipeline"), "runtime/core/odg-native-design-pipeline.test.ts"],
    interfaces: ["frozenEvaluators(paths) → { pins }", "guardCandidate(diff, pins) → { ok, violations }"],
    acceptance: ["a candidate editing a pinned test is refused before execution", "a changed pin sha between selection and acceptance fails the run", "existing NB2 held-out behaviour is unchanged (regression test)"],
    benefit: "reward-hacking attempts detected (count) instead of silently accepted", resources: "no install", risks: "over-broad patterns could block legitimate test-writing tasks (test-writing class must keep its own grader)",
    before: [{ source: `${EV}/V175_NB2_NATIVE_DESIGN_RESULT.json`, name: "sharedFrozenEvaluatorRule", value: "ABSENT (per-run invariants only)" }],
    buildCommand: "npx tsx runtime/core/odg-native-design-pipeline.test.ts", ownerGate: null },
  { id: "V178-P7", rank: 7, signals: ["F-01", "G-02", "G-01", "G-07", "F-03"], objective: "client-job privacy sandbox: bwrap with no network namespace access, model reached through a bind-mounted unix socket, per-tenant directory, keep_alive 0, per-tenant encryption at rest with node:crypto",
    problem: "client documents must be processed locally with no outbound network path; a fresh network namespace cannot reach the loopback Ollama",
    solution: "a host-side unix-socket → 127.0.0.1:11434 forwarder (Node net, /api/generate and /api/embed only); bwrap --unshare-net with the socket bind-mounted; per-tenant AES-256-GCM files (node:crypto); requests carry keep_alive 0",
    components: [CORE("provider-sandbox"), CORE("ollama-provider"), CORE("odg-native-build-sandbox")],
    writeSet: [CORE("provider-sandbox"), "runtime/core/provider-sandbox.test.ts"],
    interfaces: ["runClientJob({ tenant, socketPath, cmd }) → { exit, outputs }", "modelSocketForwarder({ socketPath, allowPaths }) → server"],
    acceptance: ["inside the sandbox a connect to a public IP fails (negative test)", "inference through the bound socket succeeds with a fake daemon", "a second tenant's directory is not visible", "the forwarder refuses paths other than /api/generate and /api/embed"],
    benefit: "proven no-network client processing (negative test evidence)", resources: "no install (bwrap 0.11.1 present)", risks: "encrypted SQLite (G-04) and fscrypt (G-03) remain blocked; the hypervisor operator is outside this control",
    before: [{ source: `${CORE("provider-sandbox")}`, name: "clientJobSandbox", value: "ABSENT (model-code sandbox only)" }],
    buildCommand: "npx tsx runtime/core/provider-sandbox.test.ts", ownerGate: null },
]);

/* ── AUTHORIZATION MATRIX ─────────────────────────────────────────────────────────────────────────────────────────── */
const AUTH = Object.freeze([
  { group: "A", label: "read-only, already allowed", op: "read committed evidence, run unit tests, tsc, offline selftests", reason: "build and verify P1/P2/P5/P6/P7", benefit: "all no-install proposals", risk: "none", permission: "none beyond the session", alternative: "—", reversible: true, proof: "test output per file" },
  { group: "A", label: "read-only, REQUESTED but DENIED", op: "systemctl --user list-units / list-timers; docker ps; firewall rule listing; process↔port mapping", reason: "complete the VPS inventory (NOT_OBSERVED items)", benefit: "know which services own ports 3000/8080 and whether timers run", risk: "none (read-only)", permission: "session permission (the permission system denied it in P0 — not bypassed)", alternative: "owner runs them and pastes the output", reversible: true, proof: "updated V178_P0_VPS_INVENTORY.json" },
  { group: "B", label: "internal reversible dev (GO selection)", op: "implement P1, P2, P5, P6, P7 in their write sets; run the offline selftests", reason: "native-autonomy method gains with no install", benefit: "implement pass rate path; client privacy proof", risk: "regression in the native pipeline (covered by existing tests)", permission: "GO selection + bound contract + independent inspection (owner V176 build-missions record)", alternative: "—", reversible: true, proof: "per-file tests + inspection verdict" },
  { group: "B", label: "internal reversible dev (GO selection)", op: "run the prepared qualification scenario on the installed models (≈10–15 min local inference)", reason: "measure P1's effect on implement", benefit: "QUALIFIED/PROBATION decision on evidence", risk: "host contention", permission: "GO dispatch", alternative: "smaller --only subset", reversible: true, proof: "new evidence file (V155 never overwritten)" },
  { group: "C", label: "downloads & extra network (explicit owner authorization)", op: "Ollama pull of the Qwen3.5-9B tag (≈5.7–6.6 GB)", reason: "P3 coder qualification", benefit: "possible implement QUALIFIED", risk: "disk/RAM; Ollama 0.35.1 support unknown", permission: "owner", alternative: "P1 method gains on current models", reversible: true, proof: "measured registry entry" },
  { group: "C", label: "downloads & extra network (explicit owner authorization)", op: "Ollama pull of Qwen3-Embedding-0.6B; npm install sqlite-vec", reason: "P4 vector leg", benefit: "semantic recall", risk: "pre-v1 dependency; supply chain", permission: "owner", alternative: "FTS5 lexical leg only (no install)", reversible: true, proof: "recall@k record" },
  { group: "C", label: "downloads & extra network (explicit owner authorization)", op: "live Radar collection from api.github.com / export.arxiv.org", reason: "turn PROVIDER_CITED signals into ODG-collected ones", benefit: "provenance upgrade", risk: "egress", permission: "owner (Radar egress is owner-gated)", alternative: "keep provider-cited status", reversible: true, proof: "collected records with provenance" },
  { group: "D", label: "system/root (separate, precise, justified authorization)", op: "Ollama service upgrade; OLLAMA_NO_CLOUD / OLLAMA_KV_CACHE_TYPE service env", reason: "newer models; KV q8_0 halves cache", benefit: "model support; RAM headroom", risk: "service downtime; behaviour change", permission: "owner + root", alternative: "per-request keep_alive / num_ctx", reversible: true, proof: "service version + RSS before/after" },
  { group: "D", label: "system/root (separate, precise, justified authorization)", op: "gVisor install; host-level outbound blocking; fscrypt setup; rootless Podman (subuid)", reason: "AMBITIOUS isolation", benefit: "defence in depth", risk: "host breakage; lock-out", permission: "owner + root, one authorization per item", alternative: "bwrap --unshare-net (P7)", reversible: false, proof: "negative tests + rollback drill" },
]);

const PRIVACY = Object.freeze({
  principle: "client data stays on this host: inputs, outputs, logs, caches, backups and telemetry; public Radar research is kept separate from private client data (different stores, no client text in any Radar query)",
  surfaces: [
    { surface: "logs", rule: "no client text in ODG logs or GO traces (hashes only); Ollama debug logging never enabled on client jobs" },
    { surface: "Ollama prompt / KV cache", rule: "keep_alive 0 per client request (G-01) so no model state stays resident between tenants" },
    { surface: "caches / embeddings", rule: "embeddings of personal data treated as personal data; per-tenant file; retention limit declared per tenant (G-07)" },
    { surface: "backups", rule: "per-tenant encryption before backup (node:crypto AES-256-GCM; age/SQLCipher blocked, G-04/G-05)" },
    { surface: "telemetry", rule: "no telemetry egress; Ollama cloud features off (service env change is root — not done)" },
    { surface: "network egress", rule: "client jobs in bwrap --unshare-net (P7) with a negative test as evidence" },
  ],
  sovereigntyNotComplete: "sovereignty is NOT complete: the VPS host / KVM hypervisor operator potentially has access to disk and memory; this was not examined and needs owner information (hosting contract, disk encryption at the provider, location)",
});

const AUTONOMY = Object.freeze([
  { criterion: "implement pass rate (qwen2.5-coder:7b, task set v2)", baseline: "3/6 PROBATION", source: `${V155_REL}#registry.models[qwen2.5-coder:7b].perClass.implement`, target: "≥ 4/6 (minPassRate 0.67) at a recorded call budget" },
  { criterion: "ODG-designed code lines merged", baseline: 0, source: `${EV}/V175_PRODUCTION_METRIC.json#windowShare.nativeCodeLinesMerged`, target: "> 0 in a recomputed window" },
  { criterion: "native build/design outcomes", baseline: "NB1 PASS, NB2 FAIL, J PARTIAL", source: [`${EV}/V175_NB1_CRITERIA_VALIDATION.json#scenarioGrade`, `${EV}/V175_NB2_CRITERIA_VALIDATION.json#scenarioGrade`, `${EV}/V176_J_CRITERIA_VALIDATION.json#scenarioGrade`], target: "next native design run PASS under the same pre-registered rule" },
  { criterion: "provider-free mission completion (0 provider calls)", baseline: "J run: 104 local model calls, 0 provider calls, 617 s wall", source: `${INVENTORY_REL}#measuredInference.jRun`, target: "same or fewer calls per PASS" },
  { criterion: "per-mission local calls / time / RAM", baseline: "7b implement p50 ≈ 23 s/call, RSS peak ≈ 4.9 GB", source: `${V155_REL}#registry.models[qwen2.5-coder:7b]`, target: "recorded for every GO-dispatched native mission" },
  { criterion: "defects caught by the independent oracle", baseline: "NB2: 9/33 failing cases derived by PROB-1", source: `${CONTRACTS_REL}#V175-NB2.origin`, target: "every accepted candidate passes the held-out oracle; refused reward-hacking attempts counted (P6)" },
]);

/* ── compute ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
function read(root: string, rel: string): any { const t = fs.readFileSync(path.join(root, rel), "utf8"); return { rel, text: t, data: JSON.parse(t) }; }
function sourceOf(sig: any): string {
  const hosts = (Array.isArray(sig.evidence) ? sig.evidence : []).map((e: any) => { try { return new URL(String(e.url)).hostname; } catch { return ""; } });
  for (const S of SOURCES) if (hosts.some((h: string) => S.hostRe.test(h))) return S.id;
  return PROVIDER_SOURCE.id;
}

function compute(root: string): any {
  const files = SIGNAL_FILES.map((f) => read(root, f));
  const inv = read(root, INVENTORY_REL), v155 = read(root, V155_REL);
  const now = files.map((f) => Date.parse(f.data.collectedAt)).filter(Number.isFinite).reduce((a: number, b: number) => Math.max(a, b), 0);
  let registry: any = {};
  const registration: any[] = [];
  for (const S of SOURCES.concat([PROVIDER_SOURCE as any])) {
    const r = FR.registerSource(registry, { id: S.id, owner: S.owner, url: S.url, type: S.type, reliability: S.reliability, license: "terms of the source" }, { now });
    if (r.ok) registry = r.registry;
    registration.push({ id: S.id, url: S.url, registered: r.ok === true, reliability: r.ok ? S.reliability : null, error: r.ok ? null : r.error });
  }
  const sigs: any[] = [];
  for (const f of files) for (const s of f.data.signals) sigs.push({ s, file: f.rel, collectedAt: f.data.collectedAt });
  const raw = sigs.map(({ s }) => ({ title: `${s.id} ${s.title}`, sourceId: sourceOf(s), claims: [String(s.claim)], categories: [String(s.domain)], body: String(s.claim) }));
  const report = FR.runRadar({ registry, rawSignals: raw, baseline: {}, odgBaseline: {}, now });
  const P = new Map<string, any>(PRACTICAL.map((p: any) => [p.id, p]));
  const out = sigs.map(({ s, file, collectedAt }, i: number) => {
    const a = report.assessed[i], p = P.get(s.id) || null;
    const ev = Array.isArray(s.evidence) ? s.evidence : [];
    const registered = registration.find((x) => x.id === raw[i].sourceId).registered;
    return {
      id: s.id, domain: s.domain, solution: s.title, kind: s.kind,
      sources: ev.length ? ev.map((e: any) => ({ url: e.url, publisher: e.publisher || null, date: e.date || null, type: e.type || null })) : "SOURCE_MANQUANTE",
      collectedAt, inputFile: file, license: s.license || null,
      claim: s.claim, reportedAs: s.measuredOrClaimed,
      potentialBenefit: s.relevanceToODG, limits: s.risks || null,
      practical: p ? { category: p.cls, capability: p.capability, problemSolved: p.problem, components: p.components, testableWithoutInstall: p.testableWithoutInstall, measurableBenefit: p.benefit, blockingConstraint: p.constraint } : "NOT_CLASSIFIED",
      proofStatus: PROOF[s.id] ? PROOF[s.id] : { status: "DOC_CONSULTED", basis: "consulted by the collecting provider session (claimed in the input file); not re-fetched or reproduced by ODG" },
      radar: { sourceId: raw[i].sourceId, decision: a.decision, untrusted: a.untrusted, reliability: a.qualification.reliability, confidence: a.qualification.confidence, provenance: registered ? "ODG_RADAR_REGISTERED_SOURCE (decision by runRadar; content still provider-collected)" : "PROVIDER_CITED_NOT_ODG_VERIFIED" },
    };
  });
  const cats: any = { A: [], B: [], C: [], D: [] };
  for (const o of out as any[]) if (o.practical !== "NOT_CLASSIFIED") cats[o.practical.category].push(o.id);
  return {
    "//": "V17.8 Radar campaign decision dossier: 71 provider-collected signals through frontier-radar.runRadar (no 2nd Radar) + PRACTICAL classification A/B/C/D (primary) + existing architecture + implement gap + 3 trajectories + recommendation + ranked proposals (converted to PROPOSED contracts V178-P1…P7) + authorization matrix + privacy/sovereignty + autonomy criteria. Provider-authored assessments are labelled; nothing installed, downloaded, run or authorized. Recompute: npx tsx runtime/bin/odg-v178-radar-campaign.ts --check",
    schema: "odg-v178-radar-campaign/1",
    governance: { directive: OWNER_DIRECTIVE, goAuthority: "GO keeps full selection authority; every proposal is PROPOSED (authorizedBy null); no install is launched", noSecondRadar: "runtime/core/frontier-radar.ts runRadar + registerSource (bounded-http-client allowlist) reused; no fetch performed" },
    inputs: files.concat([inv, v155]).map((f) => ({ source: f.rel, sha256: sha256(f.text) })),
    now: { epochMs: now, rule: "newest collectedAt of the three signal files (no wall clock)" },
    summary: { signals: out.length, practical: Object.fromEntries(Object.keys(cats).map((k) => [k, cats[k].length])), byCategory: cats, radarByDecision: report.byDecision, provenanceSplit: { odgRegisteredSource: out.filter((o) => !/^PROVIDER_CITED/.test(o.radar.provenance)).length, providerCitedNotOdgVerified: out.filter((o) => /^PROVIDER_CITED/.test(o.radar.provenance)).length }, candidates: report.candidates.length, proposalsFromRadar: report.proposals.length, quarantined: report.quarantined },
    radar: { sourceRule: SOURCE_RULE, registration, note: "registered sources are not crossChecked (single collection, no live fetch) ⇒ confidence ≤ 0.42 < 0.7 ⇒ DEFER, never ACCEPT_FOR_EXPERIMENT; unregistered ⇒ REJECT. The Radar promotes nothing here; the practical value is assessed separately below." },
    signals: out,
    hardware: HARDWARE,
    existingArchitecture: { asOfBase: "9a2c5eeb", rule: "consumers = runtime/**/*.ts (non-test) that require the module; re-verified by runtime/bin/odg-v178-radar-campaign.test.ts", components: ARCH },
    implementGap: implementGap(v155.data),
    trajectories: TRAJECTORIES, recommendation: RECOMMENDATION,
    proposals: PROPOSALS.map((p: any) => ({ id: p.id, rank: p.rank, signals: p.signals, objective: p.objective, problem: p.problem, solution: p.solution, components: p.components, writeSetEstimate: p.writeSet, interfaces: p.interfaces, acceptanceTests: p.acceptance, measurableBenefit: p.benefit, resources: p.resources, risks: p.risks, beforeMetric: p.before, ownerGate: p.ownerGate ? p.ownerGate.step : "none", buildCommand: p.buildCommand, contract: `${CONTRACTS_REL}#${p.id} (batch ${BATCH}, PROPOSED)` })),
    authorizationMatrix: AUTH,
    privacySovereignty: PRIVACY,
    autonomyProgressCriteria: AUTONOMY,
    honesty: ["every signal is provider-collected (UNVERIFIED) unless proofStatus says TESTED/EXISTENCE_OBSERVED with its basis", "the practical classification, trajectories and proposals are provider-authored assessments, not measurements", "no vendor benchmark is a fact for ODG: candidates are ranked on ODG's own harness only", "nothing was installed, downloaded, benchmarked or authorized"],
  };
}

function render(root: string): string { return JSON.stringify(compute(root), null, 2) + "\n"; }

/* drafts in the odg-radar-build-engine top[] shape, so the EXISTING converter is reused (RB-CONV-1/2) */
function drafts(root: string): any {
  const graph = CIG.buildGraph(root);
  const top = PROPOSALS.map((p: any) => {
    const comps = p.components.filter((c: string) => /^runtime\/core\/[^/]+\.ts$/.test(c)).map((c: string) => c.replace(/^runtime\/core\//, "").replace(/\.ts$/, ""));
    const mult = ENGINE.multiplierOf(comps, graph);
    return { id: p.id, rank: p.rank, evidenceScore: null, uncertainty: null, upperBound: null, tiedWith: [], contract: {
      objective: p.objective,
      source: { signals: p.signals.map((s: string) => `${OUT_REL}#signals[id=${s}]`) },
      scope: `improve ${comps.join(", ")} only; no network, no install, no canonical-authority change`,
      write_set: { estimate: true, paths: p.writeSet.slice(), basis: "provider-declared V178 estimate — to be made concrete at binding" },
      acceptance_criteria: p.acceptance.slice(), invariants: INV.slice(), stop_conditions: STOPS.slice(), rollback: "revert the single PR (additive change)", evidence_required: EVID.slice(),
      multiplier: Object.assign({}, mult, { rationale: mult.maxTransitiveDependents === null ? "target outside the core import graph: reach NOT_MEASURED" : `a change to ${comps.join("/")} reaches ≤ ${mult.maxTransitiveDependents} transitive dependents (${mult.maxDirectConsumers} direct) — reach, not benefit` }),
      measure: { before: p.before.map((b: any) => Object.assign({}, b)), compareRule: "LEARN-1: a later run recomputes each before-metric from the then-committed source; improved iff it moved in the objective's direction; unchanged ⇒ NOT_IMPROVED; source missing ⇒ NOT_MEASURED" },
      ...(p.ownerGate ? { ownerGate: { required: true, step: p.ownerGate.step, reason: p.ownerGate.reason.slice() } } : {}),
      proposal: { problem: p.problem, solution: p.solution, components: p.components, interfaces: p.interfaces, measurableBenefit: p.benefit, resources: p.resources, risks: p.risks, buildCommand: p.buildCommand, rankBasis: "provider-declared order from the owner brief; GO keeps selection authority (register ranks independently)" },
    } };
  });
  return { top, proposals: PROPOSALS.map((p: any) => ({ id: p.id, verdict: "PROPOSED", requiresOwnerAuthorization: !!p.ownerGate })), inFlightBuilds: [] };
}

function convert(root: string): any {
  const rec = render(root);
  const contracts = JSON.parse(fs.readFileSync(path.join(root, CONTRACTS_REL), "utf8"));
  const res = ENGINE.convertToContracts(drafts(root), contracts, { n: PROPOSALS.length, batch: BATCH, convertOwnerGated: true, ownerRecord: OWNER_DIRECTIVE, noteLabel: "V17.8 Radar campaign", sourceRecord: OUT_REL, sourceRecordSha256: sha256(rec), asOf: "base 9a2c5eeb (V17.8 Radar campaign)" });
  return { res, contractsText: JSON.stringify(res.data, null, 2) + "\n" };
}

function main(argv: string[]): number {
  if (argv.includes("--convert-contracts")) {
    const { res, contractsText } = convert(ROOT);
    if (res.status === "CONVERTED") fs.writeFileSync(path.join(ROOT, CONTRACTS_REL), contractsText);
    process.stdout.write(JSON.stringify({ status: res.status, batch: res.batch, appended: res.appended.map((c: any) => c.scenario), skipped: res.skipped }, null, 2) + "\n");
    return 0;
  }
  const text = render(ROOT);
  if (argv.includes("--check")) {
    let cur = ""; try { cur = fs.readFileSync(path.join(ROOT, OUT_REL), "utf8"); } catch { process.stderr.write(`MISSING ${OUT_REL}\n`); return 1; }
    if (cur !== text) { process.stderr.write(`DRIFT ${OUT_REL} — recompute with: npx tsx runtime/bin/odg-v178-radar-campaign.ts\n`); return 1; }
    process.stdout.write(`OK ${OUT_REL} reproducible\n`); return 0;
  }
  fs.writeFileSync(path.join(ROOT, OUT_REL), text);
  process.stdout.write(`wrote ${OUT_REL}\n`); return 0;
}

module.exports = { OUT_REL, CONTRACTS_REL, SIGNAL_FILES, SOURCES, PROVIDER_SOURCE, PRACTICAL, PROOF, ARCH, PROPOSALS, AUTH, BATCH, sourceOf, compute, render, drafts, convert, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
export {};

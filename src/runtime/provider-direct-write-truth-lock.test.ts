/*
 * R3 Lot A — ODG_PROVIDER_DIRECT_WRITE Truth-Lock precondition (acceptance).
 *
 * The DEFAULT engineering path denies the provider Write/Edit/Bash and applies its proposal through the
 * governed (R2-gated) patch-executor. The documented escape hatch ODG_PROVIDER_DIRECT_WRITE=1 lets the
 * provider write the working tree ITSELF — the one write path outside the governed executor. Gate A
 * reproduced that, under ODG_TRUTH_LOCK_ENFORCE=1 on a NON-CONFORMING repo, the provider still wrote the
 * tree (no pre-write repo-safety check). This locks the fix: the adapter now consults the ONE canonical
 * Truth-Lock gate BEFORE a direct-write run and refuses — before the provider executes — on an unsafe repo.
 *
 * Drives the REAL private executeWithFailover (TS `private` is compile-time only) with an INJECTED fake
 * provider that writes ONLY when granted direct write (proposeOnly === false) — faithful to a real
 * direct-write provider. Throwaway git sandboxes; no network, no real/paid provider. The adapter is TS-only
 * (compiled to dist) ⇒ a single maintained port.
 *
 * Run: node_modules/.bin/tsx src/runtime/provider-direct-write-truth-lock.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { AutonomyRuntimeAdapter } from "./autonomy-runtime-adapter";
import type { EngineeringProviderPort, ProviderOutcome, ProviderRequest } from "@/providers";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const REPO = process.cwd();
const CORE = ["truth-lock-gate.js", "truth-lock.js"];
const INJECTED = path.join("src", "app", "injected.ts");

function git(dir: string, args: string[]): void { spawnSync("git", args, { cwd: dir, stdio: "ignore" }); }

/** Writes the tree ONLY when granted direct write (proposeOnly === false). Records what it saw. */
class DirectWriteProvider implements EngineeringProviderPort {
  readonly name = "fake-direct-write";
  calls = 0; sawProposeOnly: boolean | null = null;
  constructor(private readonly dir: string) {}
  describe() { return { name: this.name, kind: "engineering-provider" as const, providerContractVersion: "1.0.0", model: "fake" }; }
  execute(request: ProviderRequest): ProviderOutcome {
    this.calls++;
    this.sawProposeOnly = request.proposeOnly ?? null;
    // Faithful to a real direct-write provider: writes the tree only when granted direct write AND given a
    // write scope. A read-only mission (no authorizedPaths) is handed no write tools and writes nothing.
    if (request.proposeOnly === false && (request.mission.authorizedPaths?.length ?? 0) > 0) fs.writeFileSync(path.join(this.dir, INJECTED), "export const hacked = 1;\n");
    return {
      provider: this.name, classification: "OK", providerExecuted: true, fromCache: false,
      result: { mission: "M", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["m_1"], changedFiles: [], commandsRun: [], blocker: null },
      sessionId: null, changedFiles: [], unauthorizedChanges: [], raw: { exitCode: 0, stdout: "", stderr: "" }, diagnostics: [],
    } as unknown as ProviderOutcome;
  }
}

/** state: conforming (main==origin/main), wrong-branch, staged-index, or non-repo (unverifiable). */
function sandbox(state: "conforming" | "wrong-branch" | "staged-index" | "non-repo"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r3-dw-"));
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "app"), { recursive: true });
  for (const f of CORE) { const tsf = f.replace(/\.js$/, ".ts"); fs.copyFileSync(path.join(REPO, "runtime", "core", tsf), path.join(dir, "runtime", "core", tsf)); } // ZERO-JS: .ts twins
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify({ mission: "M", mode: "IMPLEMENT", requires_engineering: true, authorized_paths: ["src/app/**"], objectives: [{ id: "m_1", goal: "deliver", done_when: ["ok"] }] }));
  if (state === "non-repo") return dir; // unverifiable: no git at all
  git(dir, ["init", "-q"]); git(dir, ["config", "user.email", "t@t.t"]); git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n"); git(dir, ["add", "-A"]); git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  git(dir, ["branch", "-m", "main"]);
  if (state === "conforming") git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  else if (state === "wrong-branch") git(dir, ["checkout", "-q", "-b", "feature/x"]);
  else if (state === "staged-index") { git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]); fs.writeFileSync(path.join(dir, "staged.txt"), "x"); git(dir, ["add", "staged.txt"]); }
  return dir;
}

type Opts = { escapeHatch: boolean; enforce: boolean; readOnly?: boolean };
function drive(dir: string, o: Opts): { called: boolean; wrote: boolean; classification: string; proposeOnly: boolean | null } {
  const prev = process.cwd(), pDW = process.env.ODG_PROVIDER_DIRECT_WRITE, pTL = process.env.ODG_TRUTH_LOCK_ENFORCE;
  process.chdir(dir);
  if (o.escapeHatch) process.env.ODG_PROVIDER_DIRECT_WRITE = "1"; else delete process.env.ODG_PROVIDER_DIRECT_WRITE;
  if (o.enforce) process.env.ODG_TRUTH_LOCK_ENFORCE = "1"; else delete process.env.ODG_TRUTH_LOCK_ENFORCE;
  const provider = new DirectWriteProvider(dir);
  try {
    const adapter = new AutonomyRuntimeAdapter(dir, provider);
    const spec = { mission: "M", mode: "IMPLEMENT", requires_engineering: true, authorized_paths: o.readOnly ? [] : ["src/app/**"], objectives: [{ id: "m_1", goal: "deliver", done_when: ["ok"] }] };
    let classification = "ERROR";
    try { classification = (adapter as unknown as { executeWithFailover: (m: string, s: unknown) => ProviderOutcome }).executeWithFailover("M", spec).classification; }
    catch { classification = "THROW"; }
    return { called: provider.calls > 0, wrote: fs.existsSync(path.join(dir, INJECTED)), classification, proposeOnly: provider.sawProposeOnly };
  } finally {
    process.chdir(prev);
    if (pDW === undefined) delete process.env.ODG_PROVIDER_DIRECT_WRITE; else process.env.ODG_PROVIDER_DIRECT_WRITE = pDW;
    if (pTL === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = pTL;
  }
}

console.log("R3 Lot A — ODG_PROVIDER_DIRECT_WRITE Truth-Lock precondition");

// (auth absent/governed default) no escape hatch + bad repo + enforce ⇒ governed propose-only; gate inert.
{
  const dir = sandbox("wrong-branch");
  const r = drive(dir, { escapeHatch: false, enforce: true });
  check(r.called && r.proposeOnly === true, "governed default (no escape hatch) ⇒ provider runs in propose-only; direct-write gate inert");
  check(!r.wrote, "governed default ⇒ no direct tree write (provider proposes only)");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (auth valid + conforming) escape hatch + conforming + enforce ⇒ direct write ALLOWED.
{
  const dir = sandbox("conforming");
  const r = drive(dir, { escapeHatch: true, enforce: true });
  check(r.called && r.proposeOnly === false && r.wrote, "escape hatch + conforming + enforce ⇒ legitimate direct write ALLOWED");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (wrong branch) escape hatch + enforce ⇒ REFUSE before any write.
{
  const dir = sandbox("wrong-branch");
  const r = drive(dir, { escapeHatch: true, enforce: true });
  check(!r.called && r.classification === "BLOCKED" && !r.wrote, "escape hatch + wrong-branch + enforce ⇒ BLOCKED before provider runs, no write");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (modified index) escape hatch + enforce ⇒ REFUSE (canonical policy: staged index != 0).
{
  const dir = sandbox("staged-index");
  const r = drive(dir, { escapeHatch: true, enforce: true });
  check(!r.called && r.classification === "BLOCKED" && !r.wrote, "escape hatch + staged-index + enforce ⇒ BLOCKED, no write");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (unverifiable) escape hatch + non-repo + enforce ⇒ REFUSE in strict mode.
{
  const dir = sandbox("non-repo");
  const r = drive(dir, { escapeHatch: true, enforce: true });
  check(!r.called && r.classification === "BLOCKED" && !r.wrote, "escape hatch + non-repo (unverifiable) + enforce ⇒ BLOCKED, no write");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (record-only default) escape hatch + bad repo + NO enforce ⇒ historical behaviour preserved (write allowed).
{
  const dir = sandbox("wrong-branch");
  const r = drive(dir, { escapeHatch: true, enforce: false });
  check(r.called && r.proposeOnly === false && r.wrote, "escape hatch + wrong-branch + NO enforce (record-only) ⇒ historical behaviour preserved (write allowed)");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (refuse-then-retry) escape hatch + bad + enforce twice ⇒ both BLOCKED, no bypass, no residual.
{
  const dir = sandbox("wrong-branch");
  const a = drive(dir, { escapeHatch: true, enforce: true });
  const b = drive(dir, { escapeHatch: true, enforce: true });
  check(a.classification === "BLOCKED" && b.classification === "BLOCKED" && !a.wrote && !b.wrote, "refuse-then-retry ⇒ both BLOCKED, no bypass, no residual artifact");
  fs.rmSync(dir, { recursive: true, force: true });
}

// (read-only legitimate) escape hatch + no write scope + bad + enforce ⇒ NOT gated (read-only is not a direct write).
{
  const dir = sandbox("wrong-branch");
  const r = drive(dir, { escapeHatch: true, enforce: true, readOnly: true });
  check(r.called && !r.wrote, "read-only mission (no write scope) ⇒ NOT gated (provider runs; direct-write gate is scope-bounded)");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS — R3 Lot A direct-write Truth-Lock" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);

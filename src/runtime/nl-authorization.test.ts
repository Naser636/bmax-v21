/*
 * NL CONSEQUENTIAL-CAPABILITY AUTHORIZATION — the semantic entrypoint's explicit human-authorization
 * input (runtime/bin/odg-objective.js + runtime/core/capability-authorization.js).
 *
 * Proves that a consequential capability requested via natural language is executed ONLY under an
 * EXPLICIT human grant supplied out-of-band (opts.authorize) — never synthesized from the sentence —
 * and that absent/mismatched/expired authorization fails closed before any execution, while a valid
 * grant binds the capability's evidence probe, records exactly what was authorized, and routes.
 *
 * Run: node_modules/.bin/tsx src/runtime/nl-authorization.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
type Decision = { action: string; mission?: string; contract?: { objectives: { id: string; proof?: string; authorization?: unknown }[]; verify?: unknown[] } };
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  decide: (raw: string) => Decision;
  run: (raw: string, opts: Record<string, unknown>, io: unknown) => number;
  consequentialRequests: (d: unknown) => { capability: string }[];
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

function recorder(over?: Record<string, unknown>) {
  const calls = { writes: [] as { file: string }[], spawns: [] as { args: string[] }[], logs: [] as string[] };
  const io: Record<string, unknown> = {
    existsSync: () => false,
    writeFileSync: (file: string) => { calls.writes.push({ file }); },
    mkdirSync: () => {},
    spawnSync: (_cmd: string, args: string[]) => { calls.spawns.push({ args }); return { status: 0 }; },
    log: (s: string) => { calls.logs.push(s); },
    print: () => {},
    ...(over || {}),
  };
  return { io, calls };
}

const NOW = 2_000_000_000_000;
const INTENT = "integrate the branch into main"; // → Governed Git Branch Integration (consequential)
const MISSION = seam.decide(INTENT).mission as string;
function grant(over?: Record<string, unknown>) {
  return { capability: "Governed Git Branch Integration", mission: MISSION, scope: { target: "odg-tmp" }, expiresAt: NOW + 60_000, execute: true, human: true, issuer: "akabi@algonaser.fr", ...(over || {}) };
}

console.log("NL CONSEQUENTIAL-CAPABILITY AUTHORIZATION — EXPLICIT HUMAN GRANT GATE");

// === 0. The gateway NEVER synthesizes authorization for a consequential intent. ==================
{
  const d = seam.decide(INTENT);
  check(seam.consequentialRequests(d).length === 1, "a consequential capability is detected for the intent");
  const obj = d.contract!.objectives[0];
  check(!obj.proof && !obj.authorization && !d.contract!.verify, "gateway projection carries NO probe/authorization/verify (never self-authorized)");
}

// === 1. Consequential intent + NO grant + --execute ⇒ BLOCKED before any execution (fail-closed). =
{
  const { io, calls } = recorder();
  const code = seam.run(INTENT, { execute: true, now: NOW }, io);
  check(code === 2, "no human grant ⇒ exit 2 (BLOCKED)");
  check(calls.spawns.length === 0, "no grant ⇒ NEVER routes to execution (zero spawn)");
  check(calls.writes.length === 0, "no grant ⇒ writes NO contract and NO authorization evidence");
  check(calls.logs.some((l) => /NO_AUTHORIZATION/.test(l)), "reports the exact reason (NO_AUTHORIZATION)");
}

// === 2. Valid human grant ⇒ bind probe, record authorization evidence, route. =====================
{
  const { io, calls } = recorder();
  const code = seam.run(INTENT, { execute: true, now: NOW, authorize: grant() }, io);
  check(calls.writes.some((w) => new RegExp(`capability-authorization-${MISSION}\\.json$`).test(w.file)), "records an authorization evidence artifact (exactly what was authorized)");
  check(calls.writes.some((w) => new RegExp(`runtime/missions/${MISSION}\\.json$`).test(w.file)), "materializes the governed contract");
  check(calls.spawns.length === 1 && calls.spawns[0].args[1] === MISSION, "routes the authorized mission to the existing unified entrypoint");
  check(code === 0, "valid grant + green pipeline (injected) ⇒ SUCCESS (bound to the capability probe)");
}

// === 3. Wrong-capability grant ⇒ BLOCKED (a grant is never a blanket authorization). ==============
{
  const { io, calls } = recorder();
  const code = seam.run(INTENT, { execute: true, now: NOW, authorize: grant({ capability: "Governed Bash/Linux Command" }) }, io);
  check(code === 2 && calls.spawns.length === 0, "grant for another capability ⇒ BLOCKED, zero spawn");
  check(calls.logs.some((l) => /CAPABILITY_MISMATCH/.test(l)), "reports CAPABILITY_MISMATCH");
}

// === 4. Expired grant ⇒ BLOCKED. =================================================================
{
  const { io, calls } = recorder();
  const code = seam.run(INTENT, { execute: true, now: NOW, authorize: grant({ expiresAt: NOW - 1 }) }, io);
  check(code === 2 && calls.spawns.length === 0, "expired grant ⇒ BLOCKED, zero spawn");
  check(calls.logs.some((l) => /EXPIRED/.test(l)), "reports EXPIRED");
}

// === 5. Wrong-mission grant ⇒ BLOCKED (no transfer to another mission). ===========================
{
  const { io, calls } = recorder();
  const code = seam.run(INTENT, { execute: true, now: NOW, authorize: grant({ mission: "SOME_OTHER_MISSION" }) }, io);
  check(code === 2 && calls.spawns.length === 0, "grant bound to another mission ⇒ BLOCKED, zero spawn (no transfer)");
}

// === 6. A read-only intent is unaffected by the human-authorization gate. =========================
{
  const d = seam.decide("audit the connectivity");
  check(seam.consequentialRequests(d).length === 0, "a read-only capability is never routed through the human-authorization gate");
}

console.log(failures === 0 ? "ALL PASS — NL CONSEQUENTIAL-CAPABILITY AUTHORIZATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

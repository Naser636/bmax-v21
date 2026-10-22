// @ts-nocheck — odg-state-backup: durable operational-state backup/verify/restore (CTO durable-state mission).
/*
 * Hermetic (temp dirs only; never touches the real source). Covers §5: reproducible export, verifiable manifest,
 * tamper/truncation detection, isolated restore + compare==source, no source mutation, forbidden/dangerous/
 * non-empty/version-mismatch restore refusals, secret-scan refusal, dual-port .ts≡.js parity.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const T = require(path.join(REPO, "runtime/bin/odg-state-backup.ts"));
const Tjs = require(path.join(REPO, "runtime/bin/odg-state-backup.js"));
const B = require(path.join(REPO, "runtime/core/client-store-backup.js"));

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Build an isolated fake "repo root" with the operational scope.
function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "statebk-"));
  fs.mkdirSync(path.join(root, "runtime", "generated", "autonomy"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "generated", "autonomy", "self-diagnostic-incidents.json"), JSON.stringify({ incidents: { "INC-1": { id: "INC-1", status: "RESOLVED" } } }));
  fs.writeFileSync(path.join(root, "runtime", "generated", "autonomy", "patch-memory.json"), JSON.stringify({ a: 1 }));
  fs.writeFileSync(path.join(root, "runtime", "missions", "SOME_MISSION.json"), JSON.stringify({ mission: "SOME_MISSION", objectives: [{ id: "O1" }] }));
  return root;
}
function snapshot(root, rels) { return rels.map((r) => r + ":" + require("crypto").createHash("sha256").update(fs.readFileSync(path.join(root, r))).digest("hex")).join("|"); }

console.log("ODG STATE BACKUP — durable operational-state backup/verify/restore");

// 1 — reproducible export: same scope + fixed nowMs ⇒ identical manifestHash.
{
  const root = mkRoot();
  try {
    const a = T.exportState({ root, nowMs: 1000 });
    const b = T.exportState({ root, nowMs: 1000 });
    ok("export ok + 3 files collected", a.ok && a.count === 3);
    ok("reproducible: identical manifestHash across runs", a.manifest.manifestHash === b.manifest.manifestHash);
    ok("engine verify ACCEPTS the tool's manifest (shape + hash compatible)", B.verify(a.manifest).ok === true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 2 — READ-ONLY: export does not mutate the source.
{
  const root = mkRoot();
  const rels = ["runtime/generated/autonomy/self-diagnostic-incidents.json", "runtime/generated/autonomy/patch-memory.json", "runtime/missions/SOME_MISSION.json"];
  try {
    const before = snapshot(root, rels);
    T.exportState({ root, nowMs: 1 });
    ok("source unchanged by export (read-only)", snapshot(root, rels) === before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 3 — tamper / truncation ⇒ fail-closed.
{
  const root = mkRoot();
  try {
    const m = T.exportState({ root, nowMs: 1 }).manifest;
    const tampered = JSON.parse(JSON.stringify(m)); tampered.files[0].content = tampered.files[0].content + "X";
    ok("tampered content ⇒ INTEGRITY_MISMATCH", B.verify(tampered).ok === false);
    const truncated = JSON.parse(JSON.stringify(m)); truncated.files.pop();
    ok("truncated file set ⇒ manifestHash mismatch (detected)", B.verify(truncated).ok === false);
    ok("non-manifest ⇒ INVALID_MANIFEST", B.verify({ nope: 1 }).ok === false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 4 — isolated restore ⇒ byte-identical; restored == source.
{
  const root = mkRoot();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "statebk-restore-"));
  try {
    const m = T.exportState({ root, nowMs: 1 }).manifest;
    const r = B.restore({ manifest: m, target, force: false });
    ok("restore ok to empty isolated target", r.ok === true);
    for (const f of m.files) {
      const restored = fs.readFileSync(path.join(target, f.path), "utf8");
      const src = fs.readFileSync(path.join(root, f.path), "utf8");
      ok(`restored byte-identical to source: ${f.path}`, restored === src && require("crypto").createHash("sha256").update(restored).digest("hex") === f.sha256);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); }
}

// 5 — restore refusals (forbidden target / non-empty / dangerous path).
{
  ok("forbiddenTarget: live source dirs + prod store refused", T.forbiddenTarget("runtime/missions") && T.forbiddenTarget("runtime/generated/autonomy") && T.forbiddenTarget("/var/lib/odg/clients"));
  ok("forbiddenTarget: an isolated temp dir is allowed", T.forbiddenTarget(fs.mkdtempSync(path.join(os.tmpdir(), "ok-"))) === false);
  // non-empty target without force ⇒ engine refuses.
  const root = mkRoot(); const target = fs.mkdtempSync(path.join(os.tmpdir(), "nonempty-"));
  try {
    fs.writeFileSync(path.join(target, "pre-existing.txt"), "keep");
    const m = T.exportState({ root, nowMs: 1 }).manifest;
    ok("non-empty target without --force ⇒ refused (TARGET_NOT_EMPTY)", B.restore({ manifest: m, target, force: false }).ok === false);
    ok("pre-existing file preserved (no clobber)", fs.readFileSync(path.join(target, "pre-existing.txt"), "utf8") === "keep");
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); }
  ok("isDangerousRel: absolute + .. rejected; normal relative ok", T.isDangerousRel("/etc/passwd") && T.isDangerousRel("a/../../b") && !T.isDangerousRel("runtime/missions/x.json"));
}

// 6 — version mismatch ⇒ verify fails (engine recomputes hash; a wrong manifestHash fails).
{
  const root = mkRoot();
  try {
    const m = T.exportState({ root, nowMs: 1 }).manifest;
    const bad = JSON.parse(JSON.stringify(m)); bad.manifestHash = "deadbeef";
    ok("wrong manifestHash ⇒ verify fails (truncation/tamper surrogate)", B.verify(bad).ok === false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 7 — SECRET-SCAN: a credential pattern in the scope ⇒ export REFUSES (never embeds secrets).
{
  const root = mkRoot();
  try {
    fs.writeFileSync(path.join(root, "runtime", "missions", "LEAK.json"), JSON.stringify({ k: "sk-ABCDEFGHIJKLMNOPQRSTUVWX" }));
    const res = T.exportState({ root, nowMs: 1 });
    ok("secret pattern ⇒ export refused (SECRET_DETECTED), nothing embedded", res.ok === false && res.code === "SECRET_DETECTED");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// 8 — dual-port parity: .ts ≡ .js exportState manifestHash on the same fixture.
{
  const root = mkRoot();
  try {
    const a = T.exportState({ root, nowMs: 42 }), b = Tjs.exportState({ root, nowMs: 42 });
    ok("dual-port parity: .ts manifestHash === .js manifestHash", a.ok && b.ok && a.manifest.manifestHash === b.manifest.manifestHash);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

console.log(`\nODG STATE BACKUP — ${passed} assertions passed.`);

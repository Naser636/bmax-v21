/*
 * ODG evidence-pack — RECURSIVE / monorepo-aware manifest discovery (CTO MASTER MANDATE §3).
 * Proves detectManifestSources walks subdirectories (bounded + skip-list), finds nested manifests, IGNORES
 * dependency/build dirs (node_modules, dist, …) so a dependency's own lockfile is never ingested, stays
 * deterministic, and yields the IDENTICAL result as before for a root-only repo. Hermetic: temp trees only.
 * Run: node_modules/.bin/tsx src/runtime/evidence-pack-recursive.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = process.cwd();
const ep = require(path.join(REPO, "runtime/bin/odg-evidence-pack.ts"));
const sc = require(path.join(REPO, "runtime/core/supply-chain-attest.js"));
let failures = 0;
function check(c: boolean, label: string): void { if (c) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const PKGLOCK = JSON.stringify({ packages: { "": { name: "root", version: "1.0.0" }, "node_modules/express": { version: "4.19.2", license: "MIT" }, "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" } } });
const PNPM = ["lockfileVersion: '9.0'", "", "packages:", "", "  '@scope/thing@1.0.0':", "    resolution: {integrity: sha512-x}", "", "snapshots:", "", "  '@scope/thing@1.0.0': {}"].join("\n");
const REQS = "Flask==3.0.3\nrequests==2.32.3\n";
const GOMOD = "module ex.com/x\n\ngo 1.22\n\nrequire (\n\tgithub.com/pkg/errors v0.9.1\n\tgolang.org/x/net v0.30.0\n)\n";
const YARN_DECOY = '"evil-dep@1.0.0":\n  version "1.0.0"\n'; // inside node_modules ⇒ must NOT be ingested
const CARGO_DECOY = '[[package]]\nname = "build-artifact"\nversion = "9.9.9"\n'; // inside dist/ ⇒ must NOT be ingested
const KP = crypto.generateKeyPairSync("ed25519");

function mkmonorepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monorepo-"));
  fs.writeFileSync(path.join(dir, "package-lock.json"), PKGLOCK);
  fs.mkdirSync(path.join(dir, "frontend"), { recursive: true });
  fs.writeFileSync(path.join(dir, "frontend", "pnpm-lock.yaml"), PNPM);
  fs.mkdirSync(path.join(dir, "services", "api"), { recursive: true });
  fs.writeFileSync(path.join(dir, "services", "api", "requirements.txt"), REQS);
  fs.writeFileSync(path.join(dir, "services", "api", "go.mod"), GOMOD);
  // decoys in skipped dirs
  fs.mkdirSync(path.join(dir, "node_modules", "somepkg"), { recursive: true });
  fs.writeFileSync(path.join(dir, "node_modules", "somepkg", "yarn.lock"), YARN_DECOY);
  fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(dir, "dist", "Cargo.lock"), CARGO_DECOY);
  return dir;
}

console.log("ODG evidence-pack — RECURSIVE / monorepo manifest discovery");

// 1 — nested manifests discovered across the tree; deterministic ecosystem-then-path order.
{
  const dir = mkmonorepo();
  try {
    const det = ep.detectManifestSources(dir);
    const rels = det.sources.map((s: any) => s.manifest);
    check(rels.includes("package-lock.json") && rels.includes("frontend/pnpm-lock.yaml") && rels.includes("services/api/requirements.txt") && rels.includes("services/api/go.mod"), "nested manifests (frontend/, services/api/) discovered with repo-relative paths");
    check(det.sources.map((s: any) => s.ecosystem).join(",") === "npm,pnpm,pypi,golang", "deterministic order: ecosystem (MANIFESTS order) then path");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 2 — decoy lockfiles in skipped dirs (node_modules, dist) are NEVER ingested (critical safety property).
{
  const dir = mkmonorepo();
  try {
    const det = ep.detectManifestSources(dir);
    const rels = det.sources.map((s: any) => s.manifest);
    check(!rels.some((r: string) => r.includes("node_modules")) && !rels.some((r: string) => r.includes("dist/")), "decoys in node_modules/ and dist/ are IGNORED (dependency/build lockfiles not ingested)");
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    const purls = pack.sbom.components.map((c: any) => c.purl);
    check(!purls.includes("pkg:npm/evil-dep@1.0.0") && !purls.includes("pkg:cargo/build-artifact@9.9.9"), "SBOM excludes decoy components (evil-dep, build-artifact)");
    // express,gpl-lib(npm) + @scope/thing(pnpm) + flask,requests(pypi) + errors,net(golang) = 7
    check(pack.summary.components === 7 && pack.summary.ecosystems.slice().sort().join(",") === "golang,npm,pnpm,pypi", "single run ⇒ 7-component coherent SBOM over 4 nested ecosystems");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 3 — ROOT-ONLY NON-REGRESSION: a flat repo yields exactly the same sources as a direct root read.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flat-"));
  try {
    fs.writeFileSync(path.join(dir, "package-lock.json"), PKGLOCK);
    fs.writeFileSync(path.join(dir, "requirements.txt"), REQS);
    const det = ep.detectManifestSources(dir);
    check(det.sources.length === 2 && det.sources.map((s: any) => s.manifest).join(",") === "package-lock.json,requirements.txt", "root-only repo: manifests found at root with plain basenames (identical to pre-change)");
    check(det.sources.map((s: any) => s.ecosystem).join(",") === "npm,pypi", "root-only repo: ecosystem order unchanged");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 4 — DETERMINISM: same tree ⇒ identical SBOM digest.
{
  const dir = mkmonorepo();
  try {
    const a = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    const b = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(a.summary.sbomDigest === b.summary.sbomDigest, "deterministic: identical SBOM digest across monorepo runs");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 5 — multiple manifests of the SAME ecosystem in different subdirs are all collected + deduped by purl.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "multipy-"));
  try {
    fs.mkdirSync(path.join(dir, "a"), { recursive: true }); fs.mkdirSync(path.join(dir, "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "a", "requirements.txt"), "Flask==3.0.3\n");
    fs.writeFileSync(path.join(dir, "b", "requirements.txt"), "Flask==3.0.3\nredis==5.0.1\n"); // Flask overlaps ⇒ deduped
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(pack.summary.perEcosystem.length === 2 && pack.summary.components === 2, "two pypi subdir manifests collected; overlapping Flask deduped ⇒ 2 components");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 6 — REAL CLI end-to-end over a monorepo tree (shipped source bin, single run).
{
  const dir = mkmonorepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "monoout-"));
  try {
    const tsx = path.join(REPO, "node_modules/.bin/tsx");
    const bin = path.join(REPO, "runtime/bin/odg-evidence-pack.ts");
    const stdout = execFileSync(tsx, [bin, dir, out], { cwd: REPO, encoding: "utf8" });
    check(/polyglot\] OK/.test(stdout), "CLI single run over a monorepo ⇒ OK");
    const sbom = JSON.parse(fs.readFileSync(path.join(out, "sbom.cdx.json"), "utf8"));
    check(sbom.components.length === 7 && !sbom.components.some((c: any) => /evil-dep|build-artifact/.test(c.purl)), "CLI wrote 7-component SBOM with no decoy components");
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
  } finally { /* temp */ }
}

console.log(`\nevidence-pack-recursive — ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (monorepo-aware; node_modules/build dirs skipped; root-only unchanged; engine untouched).`);
process.exit(failures === 0 ? 0 : 1);

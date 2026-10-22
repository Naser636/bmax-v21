/*
 * ODG evidence-pack — POLYGLOT auto-detection (CTO POLYGLOT SBOM AUTO-DETECTION V1).
 *
 * Proves that a SINGLE normal run of odg-evidence-pack over a repository directory auto-detects npm / pypi /
 * cargo / golang manifests and composes ONE coherent CycloneDX SBOM via the canonical engine's buildSbomMulti —
 * reusing the existing pack writers. Covers: per-ecosystem detection, the single-run integration, npm-path
 * non-regression, determinism, dedup, malformed (no false-exhaustive), unknown/empty, engine .ts≡.js parity,
 * report content, and the REAL CLI end-to-end (source bin). Hermetic: temp dirs only, no network, no secrets.
 *
 * Run: node_modules/.bin/tsx src/runtime/evidence-pack-polyglot.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = process.cwd();
const ep = require(path.join(REPO, "runtime/bin/odg-evidence-pack.ts"));
const scTs = require(path.join(REPO, "runtime/core/supply-chain-attest.ts"));
const scJs = require(path.join(REPO, "runtime/core/supply-chain-attest.js"));

let failures = 0;
function check(c: boolean, label: string): void { if (c) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

// --- fixture manifests (public names/versions only) ------------------------------------------------------
const PKGLOCK = JSON.stringify({
  lockfileVersion: 3, name: "polyrepo", version: "1.0.0",
  packages: {
    "": { name: "polyrepo", version: "1.0.0" },
    "node_modules/express": { version: "4.19.2", license: "MIT" },
    "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" },
    "node_modules/.bin/x": {}, // malformed ⇒ skipped
  },
}, null, 2);
const REQS = "# py deps\nFlask==3.0.3\nrequests == 2.32.3\nnumpy>=1.0\n"; // numpy range skipped
const CARGO = '[[package]]\nname = "serde"\nversion = "1.0.210"\n\n[[package]]\nname = "regex"\nversion = "1.11.1"\n';
const GOMOD = "module example.com/x\n\ngo 1.22\n\nrequire (\n\tgithub.com/pkg/errors v0.9.1\n\tgolang.org/x/net v0.30.0 // indirect\n)\n";
const KP = crypto.generateKeyPairSync("ed25519");

function mkrepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "polyrepo-"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

console.log("ODG evidence-pack — POLYGLOT auto-detection (single-run, CycloneDX)");

// 1 — detectManifestSources: finds all four in deterministic engine-order; absent ⇒ not present.
{
  const dir = mkrepo({ "package-lock.json": PKGLOCK, "requirements.txt": REQS, "Cargo.lock": CARGO, "go.mod": GOMOD });
  try {
    const det = ep.detectManifestSources(dir);
    check(det.sources.length === 4 && det.sources.map((s: any) => s.ecosystem).join(",") === "npm,pypi,cargo,golang", "detects npm/pypi/cargo/golang in deterministic order");
    check(det.warnings.length === 0, "all-present repo ⇒ no detection warnings");
    const only = ep.detectManifestSources(mkrepo({ "go.mod": GOMOD }));
    check(only.sources.length === 1 && only.sources[0].ecosystem === "golang", "absent manifests ⇒ simply not detected (no warning)");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 2 — SINGLE RUN over a polyglot repo ⇒ one coherent CycloneDX SBOM (union across all four ecosystems).
{
  const dir = mkrepo({ "package-lock.json": PKGLOCK, "requirements.txt": REQS, "Cargo.lock": CARGO, "go.mod": GOMOD });
  try {
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(pack.sbom.bomFormat === "CycloneDX" && pack.sbom.specVersion === "1.5", "polyglot SBOM is CycloneDX 1.5");
    check(pack.summary.ecosystems.slice().sort().join(",") === "cargo,golang,npm,pypi", "SBOM metadata records all 4 ecosystems");
    // express,gpl-lib(npm) + flask,requests(pypi) + serde,regex(cargo) + errors,net(go) = 8 ; root "" + malformed .bin skipped
    check(pack.summary.components === 8, "single run ⇒ 8-component union (root + malformed npm .bin skipped)");
    const purls = pack.sbom.components.map((c: any) => c.purl);
    check(purls.includes("pkg:npm/express@4.19.2") && purls.includes("pkg:pypi/flask@3.0.3") && purls.includes("pkg:cargo/serde@1.0.210") && purls.includes("pkg:golang/github.com/pkg/errors@v0.9.1"), "union carries a component from every ecosystem with correct purls");
    check(pack.summary.reconciles === true && pack.summary.provenanceVerified === true && pack.summary.ok === true, "coherent + reconciles + provenance self-verifies ⇒ ok");
    check(pack.summary.exhaustive === true && pack.summary.warnings.length === 0, "clean polyglot repo ⇒ exhaustive, no warnings");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 3 — INTEGRATION (≥2 ecosystems) distinct from npm-only + licence analyzed from the npm lockfile.
{
  const dir = mkrepo({ "package-lock.json": PKGLOCK, "Cargo.lock": CARGO });
  try {
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(pack.summary.ecosystems.slice().sort().join(",") === "cargo,npm", "2-ecosystem run ⇒ npm+cargo");
    check(pack.summary.components === 4, "npm(2: express,gpl-lib) + cargo(2: serde,regex) = 4 components");
    check(pack.licenceRisk.copyleft.includes("gpl-lib") && pack.summary.licence.analyzedEcosystems.join(",") === "npm", "licence risk analyzed from the npm lockfile (gpl-lib copyleft surfaced)");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 4 — npm-path NON-REGRESSION: the existing single-lockfile library path is unchanged.
{
  const LOCK = { "": { name: "demo", version: "1.0.0" }, "node_modules/express": { version: "4.19.2", license: "MIT" }, "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0" }, "node_modules/unknown-lib": { version: "0.0.1" } };
  const pack = ep.buildEvidencePack(LOCK, { name: "demo", version: "1.0.0", publicKey: KP.publicKey, privateKey: KP.privateKey });
  check(pack.summary.components === 3 && pack.summary.reconciles === true && (pack.summary as any).ecosystems === undefined, "npm buildEvidencePack unchanged: 3 comps, reconciles, no ecosystems field");
}

// 5 — DETERMINISM: same repo ⇒ identical SBOM digest.
{
  const dir = mkrepo({ "requirements.txt": REQS, "Cargo.lock": CARGO });
  try {
    const a = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    const b = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(a.summary.sbomDigest === b.summary.sbomDigest, "deterministic: identical SBOM digest across runs");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 6 — DEDUP: duplicate purls across detected sources are removed.
{
  const dupSources = [{ content: CARGO, ecosystem: "cargo", manifest: "Cargo.lock" }, { content: CARGO, ecosystem: "cargo", manifest: "Cargo.lock" }];
  const pack = ep.buildEvidencePackMulti(dupSources, { publicKey: KP.publicKey, privateKey: KP.privateKey });
  check(pack.summary.components === 2 && pack.summary.componentsParsed === 4 && pack.summary.duplicatesRemoved === 2, "dedup by purl: 4 parsed ⇒ 2 components (2 duplicates removed)");
}

// 7 — MALFORMED ⇒ NO FALSE-EXHAUSTIVE: a malformed Cargo.lock + valid requirements.txt ⇒ cargo parses 0,
//     warning recorded, exhaustive=false; the SBOM still carries the valid pypi components (not silently "complete").
{
  const dir = mkrepo({ "Cargo.lock": "this is not a valid cargo lockfile\n", "requirements.txt": REQS });
  try {
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    const cargoLine = pack.summary.perEcosystem.find((e: any) => e.ecosystem === "cargo");
    check(cargoLine && cargoLine.components === 0, "malformed Cargo.lock ⇒ 0 cargo components");
    check(pack.summary.exhaustive === false && pack.summary.warnings.some((w: string) => /cargo/i.test(w) && /malformed|0 components/i.test(w)), "malformed manifest ⇒ exhaustive=false + explicit warning (no false-exhaustive)");
    check(pack.summary.components === 2 && pack.sbom.components.every((c: any) => c.purl.startsWith("pkg:pypi/")), "valid pypi components still present (partial coverage surfaced, not dropped silently)");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 8 — UNKNOWN/EMPTY: a repo with no supported manifest ⇒ honest 0-component pack, empty flagged, not partial.
{
  const dir = mkrepo({ "README.md": "# nothing here\n" });
  try {
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    check(pack.summary.components === 0 && pack.summary.empty === true, "no supported manifest ⇒ 0-component pack flagged empty");
    check(pack.summary.exhaustive === true && pack.summary.warnings.length === 0, "empty (nothing detected) ⇒ exhaustive true, no false warning");
    check(pack.summary.licence.note && /no npm lockfile/i.test(pack.summary.licence.note), "no npm lockfile ⇒ licence NOT analyzed (honest note)");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 9 — ENGINE .ts ≡ .js parity on the detected sources (engine untouched; parity preserved).
{
  const dir = mkrepo({ "package-lock.json": PKGLOCK, "requirements.txt": REQS, "Cargo.lock": CARGO, "go.mod": GOMOD });
  try {
    const det = ep.detectManifestSources(dir);
    const tsDigest = scTs.sha256(scTs.canon(scTs.buildSbomMulti(det.sources, { name: "polyrepo", version: "1.0.0" })));
    const jsDigest = scJs.sha256(scJs.canon(scJs.buildSbomMulti(det.sources, { name: "polyrepo", version: "1.0.0" })));
    check(tsDigest === jsDigest, "dual-port parity: engine .ts buildSbomMulti ≡ .js on detected sources");
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 10 — REPORT content: polyglot report shows ecosystems + warnings; npm report does NOT carry the section.
{
  const dir = mkrepo({ "Cargo.lock": "garbage\n", "requirements.txt": REQS });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "polyout-"));
  try {
    const pack = ep.buildEvidencePackFromDir(dir, { publicKey: KP.publicKey, privateKey: KP.privateKey });
    ep.writePack(pack, out);
    const report = fs.readFileSync(path.join(out, "report.md"), "utf8");
    check(/Ecosystems covered/.test(report) && /WARNINGS \(partial coverage/.test(report), "polyglot report has 'Ecosystems covered' + partial-coverage WARNINGS");
    check(/Limits/.test(report) && /Liability exclusions/.test(report), "polyglot report keeps explicit limits + liability exclusions");
    // npm pack report must NOT contain the ecosystems section (backward-compatible writer)
    const npmPack = ep.buildEvidencePack({ "node_modules/express": { version: "4.19.2" } }, { name: "n", publicKey: KP.publicKey, privateKey: KP.privateKey });
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), "npmout-"));
    ep.writePack(npmPack, out2);
    const nr = fs.readFileSync(path.join(out2, "report.md"), "utf8");
    check(!/Ecosystems covered/.test(nr), "npm-path report unchanged (no ecosystems section)");
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(out2, { recursive: true, force: true });
  } finally { /* temp */ }
}

// 11 — REAL CLI end-to-end (single normal execution of the actual bin over a polyglot repo).
{
  const dir = mkrepo({ "package-lock.json": PKGLOCK, "requirements.txt": REQS, "Cargo.lock": CARGO, "go.mod": GOMOD });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "cliout-"));
  try {
    const tsx = path.join(REPO, "node_modules/.bin/tsx");
    const bin = path.join(REPO, "runtime/bin/odg-evidence-pack.ts");
    const stdout = execFileSync(tsx, [bin, dir, out], { cwd: REPO, encoding: "utf8" });
    check(/odg-evidence-pack:polyglot\] OK/.test(stdout) && /ecosystems=\[/.test(stdout), "CLI single run over a repo dir ⇒ polyglot OK line");
    const sbom = JSON.parse(fs.readFileSync(path.join(out, "sbom.cdx.json"), "utf8"));
    check(sbom.components.length === 8 && sbom.metadata.ecosystems.slice().sort().join(",") === "cargo,golang,npm,pypi", "CLI wrote an 8-component 4-ecosystem CycloneDX SBOM in ONE execution");
    // npm-path CLI non-regression: a .json lockfile still routes to the npm pack line.
    const lockPath = path.join(dir, "package-lock.json");
    const out3 = fs.mkdtempSync(path.join(os.tmpdir(), "cliout3-"));
    const stdout2 = execFileSync(tsx, [bin, lockPath, out3], { cwd: REPO, encoding: "utf8" });
    check(/\[odg-evidence-pack\] (OK|FLAGGED)/.test(stdout2) && !/polyglot/.test(stdout2), "CLI with a .json lockfile ⇒ existing npm path (non-regression)");
    fs.rmSync(out3, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true });
  } finally { /* temp */ }
}

console.log(`\nevidence-pack-polyglot — ${failures === 0 ? "ALL PASS" : failures + " FAILED"} (buildSbomMulti wired into odg-evidence-pack; npm path preserved; reuses the canonical engine).`);
process.exit(failures === 0 ? 0 : 1);

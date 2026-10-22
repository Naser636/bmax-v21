/*
 * supply-chain-attest multi-ecosystem SBOM — hermetic. Closes the "other ecosystems not covered" gap:
 * componentsFromManifest + buildSbomMulti extract CycloneDX components (correct purls) from npm / pypi / cargo
 * / golang manifests. Pure, deterministic, fail-closed (malformed ⇒ [] ; never throws). Dual-port .ts≡.js.
 * Run: node_modules/.bin/tsx src/runtime/sbom-multi-ecosystem.test.ts
 */
import path from "node:path";
const REPO = process.cwd();
const ts = require(path.join(REPO, "runtime/core/supply-chain-attest.ts"));
const js = require(path.join(REPO, "runtime/core/supply-chain-attest.js"));
let failures = 0;
function check(c: boolean, label: string): void { if (c) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }

const PYPI = "# deps\nFlask==3.0.3\nrequests == 2.32.3\n-r other.txt\nnumpy>=1.0\n"; // numpy range (no ==) ⇒ skipped
const CARGO = '[[package]]\nname = "serde"\nversion = "1.0.210"\n\n[[package]]\nname = "regex"\nversion = "1.11.1"\n';
const GOMOD = "module example.com/x\n\ngo 1.22\n\nrequire (\n\tgithub.com/pkg/errors v0.9.1\n\tgolang.org/x/net v0.30.0 // indirect\n)\n";
const NPM = JSON.stringify({ packages: { "": { name: "app", version: "1.0.0" }, "node_modules/express": { version: "4.19.2" }, "node_modules/.bin/x": {} } });

console.log("supply-chain-attest — multi-ecosystem SBOM (hermetic)");

// pypi: only == pins; range skipped
const py = ts.componentsFromManifest(PYPI, "pypi");
check(py.length === 2 && py.some((c: any) => c.purl === "pkg:pypi/flask@3.0.3") && py.some((c: any) => c.purl === "pkg:pypi/requests@2.32.3"), "pypi requirements.txt ⇒ 2 pinned comps (range skipped), pkg:pypi purls");
// cargo
const cg = ts.componentsFromManifest(CARGO, "cargo");
check(cg.length === 2 && cg.some((c: any) => c.purl === "pkg:cargo/serde@1.0.210"), "Cargo.lock ⇒ 2 comps, pkg:cargo purls");
// golang
const go = ts.componentsFromManifest(GOMOD, "golang");
check(go.some((c: any) => c.purl === "pkg:golang/github.com/pkg/errors@v0.9.1") && go.some((c: any) => c.purl === "pkg:golang/golang.org/x/net@v0.30.0") && !go.some((c: any) => /module|^go@/.test(c.name)), "go.mod require ⇒ pkg:golang purls (module/go lines skipped)");
// npm via manifest path
const np = ts.componentsFromManifest(NPM, "npm");
check(np.length === 1 && np[0].purl === "pkg:npm/express@4.19.2", "npm package-lock ⇒ express comp (malformed .bin entry skipped)");

// buildSbomMulti across ecosystems + dedup + CycloneDX shape + ecosystems metadata
const multi = ts.buildSbomMulti([{ content: PYPI, ecosystem: "pypi" }, { content: CARGO, ecosystem: "cargo" }, { content: GOMOD, ecosystem: "golang" }, { content: NPM, ecosystem: "npm" }], { name: "polyglot", version: "0.1.0" });
check(multi.bomFormat === "CycloneDX" && multi.components.length === 7 && multi.metadata.ecosystems.sort().join(",") === "cargo,golang,npm,pypi", "buildSbomMulti merges 4 ecosystems ⇒ 7 comps + ecosystems metadata");
// dedup by purl
const dup = ts.buildSbomMulti([{ content: CARGO, ecosystem: "cargo" }, { content: CARGO, ecosystem: "cargo" }], {});
check(dup.components.length === 2, "duplicate sources deduped by purl");
// fail-closed: malformed / unknown ⇒ empty, no throw
let threw = false; try { check(ts.componentsFromManifest("not json", "npm").length === 0 && ts.componentsFromManifest(CARGO, "unknown-eco").length === 0 && ts.componentsFromManifest(null, "pypi").length === 0, "malformed/unknown/null ⇒ [] (fail-closed, no throw)"); } catch { threw = true; }
check(!threw, "no throw on malformed input");

// dual-port parity (.ts ≡ .js)
const sig = (m: any) => JSON.stringify(m.buildSbomMulti([{ content: PYPI, ecosystem: "pypi" }, { content: CARGO, ecosystem: "cargo" }, { content: GOMOD, ecosystem: "golang" }, { content: NPM, ecosystem: "npm" }], { name: "p", version: "0" }));
check(sig(ts) === sig(js), "dual-port parity: .ts buildSbomMulti ≡ .js");

console.log(`\nsbom-multi-ecosystem — ${failures === 0 ? "ALL PASS" : failures + " FAILED"}.`);
process.exit(failures === 0 ? 0 : 1);

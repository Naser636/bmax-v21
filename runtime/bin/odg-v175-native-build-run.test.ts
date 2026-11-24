#!/usr/bin/env node
"use strict";
/* V17.5 — tests of the native-build runner + the native-repair work item (offline: NO live model; writes nothing).
 * Runs the runner's --selftest (fake-Ollama transport behind the real loopback guard, real bwrap sandbox when available),
 * the CLI refusal paths (non-declared output ⇒ 3; PROPOSED contract ⇒ 2 NOT_AUTHORIZED, record never created), the
 * detector on synthetic definitions, and checks the committed contract equals what ODG's rules derive from this tree. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("./odg-v175-native-build-run.js");
const NRI = require("../core/odg-native-repair-item.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const run = (args: string[], timeout = 180000) => cp.spawnSync(tsx, [R.SELF, ...args], { cwd: ROOT, encoding: "utf8", timeout });

// detector on synthetic definitions (the real-repo detection is exercised by --selftest)
const defs = NRI.extractDefinitions([
  "function canon(o: any): string { return JSON.stringify(o, Object.keys(o).sort()); }",
  "function canon(o: any): string { return JSON.stringify(o); }",
  "function canon(v: any): string {",
  "  if (Array.isArray(v)) return \"[\" + v.map(canon).join(\",\") + \"]\";",
  "  if (v && typeof v === \"object\") return \"{\" + Object.keys(v).sort().map((k) => JSON.stringify(k) + \":\" + canon(v[k])).join(\",\") + \"}\";",
  "  return JSON.stringify(v);",
  "}",
].join("\n"));
const ts = require("typescript"); const vm = require("vm");
const load = (s: string) => vm.runInNewContext(ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + "\n;canon", Object.create(null));
check("extractDefinitions finds 3 balanced definitions", defs.length === 3 && defs.every((d: any) => d.balanced));
check("classify: replacer-array canon ⇒ NESTED_KEY_DROP", NRI.classify(load(defs[0].source)) === "NESTED_KEY_DROP");
check("classify: plain JSON.stringify ⇒ ORDER_SENSITIVE", NRI.classify(load(defs[1].source)) === "ORDER_SENSITIVE");
check("classify: recursive sorted ⇒ CANONICAL", NRI.classify(load(defs[2].source)) === "CANONICAL");

// the committed contract = ODG rules over this tree (PROPOSED; dispatch target = this runner, writeSet = the record)
const committed = JSON.parse(fs.readFileSync(path.join(ROOT, R.CONTRACT), "utf8"));
const derived = R.contractFor(ROOT);
check("derivation file is PROPOSED with no authorizedBy", committed.state === "PROPOSED" && committed.authorizedBy === null);
// V17.5: once the native module is INTEGRATED (target file exists), detection reports defect=false and no new contract is derived —
// the item is satisfied; asserted explicitly. Before integration the derivation must equal the committed contract.
const targetBuilt = fs.existsSync(path.join(ROOT, "runtime/core/odg-canonical-json.ts"));
if (targetBuilt) check("after integration: target module exists ⇒ detection defect=false ⇒ no new contract derived (item satisfied)", derived === null && NRI.detectCanonDefects(ROOT).defect === false);
else check("derivation file origin + WORK_ITEM_CONTRACT equal the rules' derivation from this tree", JSON.stringify(committed.origin) === JSON.stringify(derived.origin) && JSON.stringify(committed.WORK_ITEM_CONTRACT) === JSON.stringify(derived.WORK_ITEM_CONTRACT));
check("native patch write set = 2 files; dispatch target RUN_CONTROLLED_EXPERIMENTS = this runner, writeSet = [OUT]", committed.WORK_ITEM_CONTRACT.nativePatchWriteSet.length === 2 && committed.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.command === R.SELF && JSON.stringify(committed.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.writeSet) === JSON.stringify([R.OUT]));
check("derivation file '//' discloses the 4 hand-added header fields", /4 header fields/.test(committed["//"]) && /ADDED BY HAND/.test(committed["//"]));

// canonical entry (V160 contracts file, read by GO) = the same rules output + owner authorization
const canonical = R.readContract(ROOT);
check("V160 entry V175-NB1 exists, its origin + WORK_ITEM_CONTRACT equal the rules' derivation, owner source = V175 record", !!canonical && JSON.stringify(canonical.origin) === JSON.stringify((derived || committed).origin) && JSON.stringify(canonical.WORK_ITEM_CONTRACT) === JSON.stringify((derived || committed).WORK_ITEM_CONTRACT) && /V175_OWNER_AUTHORIZATION_NATIVE_BUILD\.json/.test(canonical.authorization.source) && canonical.authorization.executionAuthorized === false);
// gate = the canonical odg-authorization-scope derivation (LABELLED fixture probes: commit 'a'×40 declared present + ancestor of main)
{
  const ASc = require("../core/odg-authorization-scope.js");
  const H40 = "a".repeat(40);
  const probes = { label: "TEST FIXTURE", mainRef: "fixture-main", commitExists: (x: string) => x === H40, isAncestorOfMain: (x: string) => x === H40, fileSha256: (rel: string) => { try { return require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex"); } catch { return null; } } };
  const sid = canonical.revisionHistory[canonical.revisionHistory.length - 1].revisionAuthorSessionId;
  const insp = (o: any = {}) => ({ scenario: R.SCENARIO, verdict: "ACCEPT", contractSha256: ASc.contractSha256(canonical), inspectorSessionId: "inspector-sid-nb1-0002", authorSessionId: sid, inspectedHeadSha: H40, inspectedPr: 997, ...o });
  check("gate: no inspection ⇒ refused (INSPECT current)", R.gate(canonical, null, probes).ok === false);
  const g = R.gate(canonical, insp(), probes);
  check("gate: inspection ACCEPT sha-bound ⇒ RUN_CONTROLLED_EXPERIMENTS authorized, contract sha returned", g.ok === true && g.contractSha256 === ASc.contractSha256(canonical));
  check("gate: inspection by the author session ⇒ refused", R.gate(canonical, insp({ inspectorSessionId: sid }), probes).ok === false);
  const other = JSON.parse(JSON.stringify(canonical)); other.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.args = ["docs/odg/evidence/X.json"];
  check("gate: edited dispatch target ⇒ refused (sha drift)", R.gate(other, insp(), probes).ok === false);
}
check("record carries the honest native claim wording", /LOCAL MODEL implemented a provider-specified function/.test(R.NATIVE_CLAIM));
{ // --probe realpath confinement: a symlink outside the repo pointing INTO the repo is refused
  const os = require("os"); const d = fs.mkdtempSync(path.join(os.tmpdir(), "nb1-probe-")); const link = path.join(d, "into-repo");
  fs.symlinkSync(ROOT, link);
  check("realOutside: symlink into the repo ⇒ refused; plain tmp path ⇒ allowed", R.realOutside(path.join(link, "x.json"), ROOT) === false && R.realOutside(path.join(d, "x.json"), ROOT) === true);
  fs.rmSync(d, { recursive: true, force: true });
}
check("diff helper emits a git new-file diff", /^diff --git a\/x b\/x\nnew file mode 100644\n--- \/dev\/null\n\+\+\+ b\/x\n@@ -0,0 \+1,2 @@\n\+a\n\+b\n$/.test(R.newFileDiff("x", "a\nb\n")));

// CLI refusals (no model call)
const outExisted = fs.existsSync(path.join(ROOT, R.OUT));
const bad = run(["docs/odg/evidence/OTHER.json"]);
check("non-declared output path ⇒ REFUSED exit 3", bad.status === 3 && /REFUSED/.test(String(bad.stdout)));
if (!fs.existsSync(path.join(ROOT, R.INSPECTION))) {
  const na = run([R.OUT]);
  check("no inspection record ⇒ NOT_AUTHORIZED exit 2, record not created", na.status === 2 && /NOT_AUTHORIZED/.test(String(na.stdout)) && fs.existsSync(path.join(ROOT, R.OUT)) === outExisted);
}
const pr = run(["--probe", "--out", path.join(ROOT, "x.json")]);
check("--probe refuses an output inside the repo", pr.status === 3);

// selftest (fake Ollama; real sandbox when available)
const st = run(["--selftest"]);
process.stdout.write(String(st.stdout));
check("--selftest passes", st.status === 0);

if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
export {};

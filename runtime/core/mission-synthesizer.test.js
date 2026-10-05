#!/usr/bin/env node

/* P5 — Local Mission Synthesizer: behavioural test. */

"use strict";

const assert = require("assert");
const syn = require("./mission-synthesizer");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Case 1 — explicit spec ⇒ valid engineering contract");
const c = syn.toContract({
    id: "SYN_A",
    goal: "Wire the loader",
    authorizedPaths: ["runtime/bin/"],
    patch: { target: "runtime/bin/odg-run.js", diff: "@@ -1 +1 @@\n-a\n+b" },
});
ok("contract is structurally valid", syn.isValidContract(c) === true);
ok("engineering mode enabled by authorized_paths", c.requires_engineering === true);
ok("objective carries the patch payload", c.objectives[0].patch.target === "runtime/bin/odg-run.js");
ok("default done_when supplied", c.objectives[0].done_when.length >= 2);

console.log("Case 2 — read-only spec has engineering off");
ok("no authorized_paths ⇒ requires_engineering false", syn.toContract({ goal: "just look" }).requires_engineering === false);

console.log("Case 3 — fromRequest resolves the local capability via P4 rules");
const r = syn.fromRequest("remove the unused import");
ok("request becomes a valid contract", syn.isValidContract(r) === true);
ok("resolved to local-fixers (no AI)", r.resolvedCapability === "local-fixers");
ok("unknown request resolves to null capability", syn.fromRequest("invent a new payment provider").resolvedCapability === null);

console.log("Case 4 — a single action stays a single objective (backward compatible)");
const single = syn.toContract({ id: "SOLO", goal: "wire the loader into the pipeline" });
ok("one action ⇒ one objective", single.objectives.length === 1);
ok("goal preserved verbatim", single.objectives[0].goal === "wire the loader into the pipeline");
ok("deterministic first id", single.objectives[0].id === "SOLO_1");

console.log("Case 5 — a goal with independent imperative clauses decomposes into ordered objectives");
const multi = syn.toContract({
    id: "MULTI",
    goal: "remove the unused import and format the file",
    authorizedPaths: ["runtime/"],
    priority: "HIGH",
    mode: "SEQUENTIAL",
    doneWhen: ["All actions applied.", "Validation successful."],
});
ok("two actions ⇒ two objectives", multi.objectives.length === 2);
ok("first objective is the first action", multi.objectives[0].goal === "remove the unused import");
ok("second objective is the second action", multi.objectives[1].goal === "format the file");
ok("objective ids are deterministic and ordered",
    multi.objectives[0].id === "MULTI_1" && multi.objectives[1].id === "MULTI_2");
ok("priority preserved", multi.priority === "HIGH");
ok("mode preserved", multi.mode === "SEQUENTIAL");
ok("authorized_paths preserved", multi.authorized_paths.length === 1 && multi.requires_engineering === true);
ok("definition_of_done preserved", multi.definition_of_done[0] === "All actions applied.");
ok("every objective carries the definition_of_done",
    multi.objectives.every((o) => o.done_when[0] === "All actions applied."));
ok("still structurally valid", syn.isValidContract(multi) === true);

console.log("Case 6 — decomposition is deterministic (identical input ⇒ identical objectives)");
const a = syn.toContract({ id: "DET", goal: "add a flag and remove the shim" });
const b = syn.toContract({ id: "DET", goal: "add a flag and remove the shim" });
ok("same objective ids on repeat", JSON.stringify(a.objectives) === JSON.stringify(b.objectives));

console.log("Case 7 — no over-splitting: a single action over a list of objects stays one objective");
const listy = syn.toContract({ id: "LIST", goal: "wire the loader, decision engine and patch engine" });
ok("object list is not split (guard: clauses must start with an action verb)", listy.objectives.length === 1);
const idiom = syn.toContract({ id: "IDIOM", goal: "apply a quick and dirty fix" });
ok("idiomatic 'and' is not split", idiom.objectives.length === 1);

console.log("Case 8 — numbered / newline lists decompose");
const numbered = syn.decompose("1. add the flag 2. wire the loader 3. write the test");
ok("inline numbered list ⇒ 3 actions", numbered.length === 3 && numbered[2] === "write the test");
const bulleted = syn.decompose("- add the flag\n- remove the shim");
ok("bulleted newline list ⇒ 2 actions", bulleted.length === 2 && bulleted[0] === "add the flag");
ok("version strings are not mistaken for a numbered list",
    syn.decompose("bump to version 1.2.3").length === 1);

console.log("Case 9 — an attached patch pins the mission to a single concrete objective");
const patched = syn.toContract({
    id: "PIN",
    goal: "add the flag and wire the loader",
    patch: { target: "runtime/x.js", diff: "@@" },
});
ok("patch ⇒ single objective", patched.objectives.length === 1);
ok("single objective carries the patch", patched.objectives[0].patch.target === "runtime/x.js");

console.log("Case 10 — explicit goals[] are honoured verbatim as ordered objectives");
const explicit = syn.toContract({ id: "EXP", goals: ["first thing", "second thing", "third thing"] });
ok("explicit goals ⇒ one objective each", explicit.objectives.length === 3);
ok("explicit goals ordered + deterministic ids",
    explicit.objectives[1].id === "EXP_2" && explicit.objectives[1].goal === "second thing");

console.log("Case 11 — P4: done_when only requires 'Patch applied.' when a patch is actually attached");
{
    const noPatch = syn.toContract({ id: "NOPATCH", goal: "audit the runtime state and report drift" });
    ok("no-patch ⇒ done_when excludes 'Patch applied.'", !noPatch.objectives[0].done_when.includes("Patch applied."));
    ok("no-patch ⇒ definition_of_done excludes 'Patch applied.'", !noPatch.definition_of_done.includes("Patch applied."));
    ok("no-patch ⇒ still requires 'Validation successful.'", noPatch.objectives[0].done_when.includes("Validation successful."));

    const withPatch = syn.toContract({ id: "WITHPATCH", goal: "fix the bug", patch: { target: "runtime/x.js", diff: "@@" } });
    ok("with-patch ⇒ 'Patch applied.' preserved", withPatch.objectives[0].done_when.includes("Patch applied."));
    ok("with-patch ⇒ both criteria present", withPatch.objectives[0].done_when.length >= 2);

    const explicit = syn.toContract({ id: "EXPLICIT_DW", goal: "do the thing", doneWhen: ["Custom criterion only."] });
    ok("explicit doneWhen honoured verbatim", JSON.stringify(explicit.objectives[0].done_when) === JSON.stringify(["Custom criterion only."]));
}

console.log(`\nMISSION SYNTHESIZER — ${passed} assertions passed.`);

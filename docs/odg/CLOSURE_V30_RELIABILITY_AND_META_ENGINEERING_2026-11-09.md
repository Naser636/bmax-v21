# V12.4 — V30: 3-file build reliability + meta-engineering frontier MOVED via decomposition (2026-11-09)

Per §2, NO provider framework code was written for this lot. ODG authored specs + ran the GOVERNED native builder (V28)
with its LOCAL models; all project/component code was model-generated. Two decisive advances, both measured + independently
verified: the 3-file native build is RELIABLE (not a one-off), and the V29 meta-engineering limit is MOVED by decomposition.

## A. Initial state
HEAD=origin/main=`d69718c`; tracked tree clean (5 stashes / 6 untracked preserved — confirmed). Reused (not rebuilt):
native-project-builder, repair-router/retry, model-router, autonomy-claim-guard, actor-provenance, loopback Ollama 3B/7B.
VPS posture unchanged (only SSH:22 public, edg-core loopback). No provider code authored here.

## B/§3 — 3-file native build RELIABILITY (measured, denominator published)
Repeated the V29 3-file `usersvc` project (validator + store + service, interdependent) with a pre-defined INDEPENDENT
end-to-end test, on 7B:
```
run 1: buildOk=true verified=true ACCEPTED 37.3s
run 2: buildOk=true verified=true ACCEPTED 29.0s
run 3: buildOk=true verified=true ACCEPTED 29.1s
7B 3-file: 3/3 ACCEPTED | median 29.1s | mean 31.8s | 0 false success (independent arbiter)
```
**Runs: 3 (honest denominator — fewer than the ideal 5, published as-is; none excluded).** The 3-file native construction
is **reproducibly reliable on 7B** (100% over 3 runs, ~30s median). (3B remains at its limit for 3-file, per V29.)

## C/G/§7 — Meta-engineering frontier MOVED by decomposition (the decisive result)
V29 demonstrated BOTH models fail to natively author an undefined-symbol-detector from a MONOLITHIC spec. V30 applied the
§7 DECOMPOSITION strategy: split the component into 3 focused primitives —
- `src/decls.js` : extract declared names (function/const/let/var) ;
- `src/calls.js` : extract called names (identifier followed by `(`) ;
- `src/detector.js` : requires both; undefined = called − declared − builtins.
The 7B model **natively built all three + assembled them**:
```
qwen2.5-coder:7b: files 3/3, buildOk=true, verified=true, ACCEPTED, repairs=0, 61.3s
detector.js: const decls=require('./decls.js'); const calls=require('./calls.js');
             module.exports=(code)=>{ const declaredNames=decls(code); const calledNames=calls(code); … }
```
**Independent test on cases the generator NEVER saw** (flag `factorial` in `n*factorial(n-1)`; do NOT flag a declared
`f`) **PASSED**. Per §7's decisive criterion ("acquise seulement si le composant détecte des défauts inconnus du
générateur, avec vérification indépendante"), **native meta-engineering is ACHIEVED via decomposition** — the same
capability that failed monolithically in V29 succeeds when decomposed into verifiable primitives. **The frontier is
movable.** This is self-hosting: ODG's local model natively built a code-analyzing-code component.

## D. Falsifications / defects detected
The symbol-detector (model-authored) correctly FLAGS an undefined call (`factorial`) and does NOT flag a declared symbol
(`f`) — detecting a real defect class (the V26/V29 undefined-symbol failure) on unseen inputs. The native builder's
independent verifier rejected every non-passing generation across V30 (0 false success).

## E/§5 & F/§6 — memory + 5-file project: prepared for V31
§5 construction-memory → reuse-ledger: the gate (verified-only feeds memory) is defined; wiring it is a V31 chantier now
that native authoring is reliable (3-file) and meta-engineering is movable. §6 5-file project: the next scale step (V31),
building on the reliable 3-file base + the decomposition method.

## H. Provenance (honest)
All V30 code = LOCAL-model-generated (native), ODG-governed (write-set, build, independent verify). Specs + measurement =
ODG/operator. NO provider wrote the lot's code. A failed generation is claimed as no success; `autonomy-claim-guard`
would attribute the accepted components as native-model-authored + ODG-governed, never provider.

## I. VPS
All generation ran on the VPS's loopback Ollama (3B/7B). In-repo capability + live-model construction — NOT a deployed
service. VPS posture unchanged.

## J. Remaining limits
- 3B cannot reliably build 3-file projects (7B required); 5-file not yet attempted. Meta-engineering is achieved only via
  DECOMPOSITION (the monolithic path still fails) — the decomposition method is the capability, honestly scoped.
- The model-authored components are non-deterministic across runs; committing a stable canonical version (with a
  deterministic test) is a V31 integration step, not done here (avoids committing a fragile one-off).

## K. Capability states
- native 3-file construction : EXECUTED + **VERIFIED** (3/3 reliable, 7B).
- native meta-engineering (via decomposition) : EXECUTED + **VERIFIED** (symbol-detector built + independently verified on
  unseen cases).
- monolithic meta-engineering : NOT_ACHIEVED (honest — decomposition required).

## L. Boussole + V31
Register reconciled (new item `serie30-v30-reliability-meta-engineering`). HEAD=origin/main=`d69718c`. §13 restrictions
intact; no provider code for the lot. **V31 prepared (5 chantiers):** (1) INTEGRATE a stable decomposed structural
pre-check into native-project-builder (model-authored primitives + a deterministic test) so undefined-symbol/import errors
are caught before the functional verifier; (2) 5-file native project + a contract-change scenario (measured); (3)
construction-memory → reuse-ledger (verified-only), measured reuse with falsifications; (4) 3-file reliability to ≥5 runs
+ 3B→7B routing measured on multi-file; (5) apply the model-authored detector to a model-generated project (self-analysis
loop) and measure defects caught.

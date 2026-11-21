#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the persistent campaign controller: dependency-aware next-lot selection (via
// dep-planner), priority ordering, BLOCKED skipped (dependents stay open, independents flow), fail-closed ACCEPTED
// (evidence required), durable persist + resume, and that the REAL closure-register is drivable.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("./campaign-controller.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const reg = (items) => ({ version: "t", items });

// (1) deps gate selection: B depends on A (READY) ⇒ A selected first; after A ACCEPTED ⇒ B selected.
{
  let r = reg([
    { id: "A", status: "READY", deps: [], priority: 2 },
    { id: "B", status: "READY", deps: ["A"], priority: 1 },
  ]);
  const n1 = C.selectNextLot(r);
  ok("dep-gated: A selected before B (B's dep A not yet ACCEPTED, despite higher priority)", n1.lot.id === "A");
  C.advance(r, "A", { status: "ACCEPTED", evidence: "did A" });
  ok("after A ACCEPTED ⇒ B becomes admissible", C.selectNextLot(r).lot.id === "B");
}

// (2) priority within an eligible layer.
{
  const r = reg([{ id: "X", status: "READY", deps: [], priority: 5 }, { id: "Y", status: "READY", deps: [], priority: 2 }]);
  ok("lower priority number selected first", C.selectNextLot(r).lot.id === "Y");
}

// (3) BLOCKED skipped; its dependent stays unselectable; an independent READY lot still flows.
{
  const r = reg([
    { id: "BLK", status: "BLOCKED", deps: [], priority: 1, blockReason: "owner-gated" },
    { id: "DEP_ON_BLK", status: "READY", deps: ["BLK"], priority: 1 },
    { id: "INDEP", status: "READY", deps: [], priority: 3 },
  ]);
  ok("BLOCKED not selected; dependent-on-blocked not selected; independent lot selected", C.selectNextLot(r).lot.id === "INDEP");
}

// (4) fail-closed ACCEPTED requires evidence.
{
  const r = reg([{ id: "A", status: "IN_PROGRESS", deps: [], priority: 1 }]);
  ok("ACCEPTED without evidence ⇒ EVIDENCE_REQUIRED (rejected)", C.advance(r, "A", { status: "ACCEPTED" }).code === "EVIDENCE_REQUIRED" && r.items[0].status === "IN_PROGRESS");
  ok("ACCEPTED with evidence ⇒ accepted", C.advance(r, "A", { status: "ACCEPTED", evidence: "proof" }).ok === true && r.items[0].status === "ACCEPTED");
}

// (5) durable persist + RESUME: save, reload, continue from the same next lot.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-campaign-"));
  const p = path.join(dir, "reg.json");
  let r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: ["A"], priority: 2 }]);
  C.saveRegister(p, r);
  // simulate interruption: reload from disk, advance A, persist
  const l1 = C.loadRegister(p); C.advance(l1.register, "A", { status: "ACCEPTED", evidence: "done A" }); C.saveRegister(p, l1.register);
  // resume: fresh load picks up B as next (no re-analysis)
  const l2 = C.loadRegister(p);
  ok("resume after persist: A ACCEPTED on disk, next lot = B", l2.ok && l2.register.items.find(x => x.id === "A").status === "ACCEPTED" && C.selectNextLot(l2.register).lot.id === "B");
  // (5b) CRASH-ATOMIC saveRegister: the write goes via a temp file + rename, so after a successful save the target is
  // valid JSON AND no stray .tmp-* artifact is left in the dir (rename consumed it). Guards the durable resume point.
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
  ok("saveRegister is crash-atomic (temp+rename): no .tmp leftover, target round-trips", leftovers.length === 0 && C.loadRegister(p).ok === true);
  fs.rmSync(dir, { recursive: true, force: true });
}

// (6) cycle ⇒ surfaced (fail-closed, via dep-planner), not a crash.
{
  const r = reg([{ id: "A", status: "READY", deps: ["B"] }, { id: "B", status: "READY", deps: ["A"] }]);
  ok("dependency cycle ⇒ idle with planning-error reason (no crash)", C.selectNextLot(r).lot === null && /planning error/.test(C.selectNextLot(r).reason));
}

// (7) summary + the REAL register is loadable and drivable.
{
  const real = C.loadRegister(path.join(process.cwd(), "docs", "odg", "closure-register.json"));
  ok("real closure-register loads", real.ok === true && real.register.items.length >= 8);
  const s = C.summary(real.register);
  ok("real register: has a next lot OR explicit idle reason; blockers listed", (s.nextLot || s.idleReason) && Array.isArray(s.blocked));
  ok("real register: ACCEPTED items carry evidence (closure discipline)", real.register.items.filter(i => i.status === "ACCEPTED").every(i => typeof i.evidence === "string" && i.evidence.length > 0));
}

// (8) DECOMPOSITION PATTERN (the one this campaign relied on): a BLOCKED parent does NOT freeze the register — an
// independent decomposed prep subtask keeps flowing, and the engine distinguishes "truly BLOCKED" from "awaiting deps".
{
  // parent BLOCKED, its ACCEPTED prep sibling, and a fresh independent READY prep lot.
  const r = reg([
    { id: "PARENT", status: "BLOCKED", deps: ["PARENT_PREP"], priority: 1, blockReason: "owner-gated external remainder" },
    { id: "PARENT_PREP", status: "ACCEPTED", deps: [], priority: 1, evidence: "prep done" },
    { id: "OTHER_PREP", status: "READY", deps: [], priority: 2 },
  ]);
  ok("blocked parent does NOT freeze the register: independent prep subtask is selected", C.selectNextLot(r).lot.id === "OTHER_PREP");
  // once OTHER_PREP is accepted, no admissible lot remains and the parent is STILL correctly reported BLOCKED (not idle-by-deps-confusion).
  C.advance(r, "OTHER_PREP", { status: "ACCEPTED", evidence: "done" });
  const s = C.summary(r);
  ok("after prep accepted ⇒ idle; parent reported BLOCKED (not mislabelled)", s.idle === true && s.blocked.some(b => b.id === "PARENT") && !s.nextLot);
}

// (9) distinguishes truly-BLOCKED from awaiting-deps: a READY item whose dep is BLOCKED is not selectable, but the
// idleReason names the blocker (so a human can act), whereas a READY item with satisfied deps IS selected.
{
  const blockedChain = reg([
    { id: "GATE", status: "BLOCKED", deps: [], priority: 1, blockReason: "needs authorized install" },
    { id: "WAITING", status: "READY", deps: ["GATE"], priority: 1 },
  ]);
  const n = C.selectNextLot(blockedChain);
  ok("READY item depending on a BLOCKED gate ⇒ not selected; idleReason names the blocker", n.lot === null && /GATE/.test(n.reason));
  const freed = reg([
    { id: "GATE", status: "ACCEPTED", deps: [], priority: 1, evidence: "installed" },
    { id: "WAITING", status: "READY", deps: ["GATE"], priority: 1 },
  ]);
  ok("same item becomes selectable once its dep is ACCEPTED (not BLOCKED)", C.selectNextLot(freed).lot.id === "WAITING");
}

// (10) NO-REPEAT guard: a lot whose attempt FAILED is not re-selected while UNCHANGED; an independent lot flows; a
// new strategy (or cleared failure) makes it selectable again. (Before the fix, selectNextLot looped the same lot.)
{
  const r = reg([{ id: "A", status: "READY", deps: [], priority: 1 }, { id: "B", status: "READY", deps: [], priority: 2 }]);
  // first pick = A (priority); record a failed attempt, unchanged.
  const first = C.selectNextLot(r).lot.id;
  C.advance(r, first, { attemptFailed: true, reason: "same failure, no change" });
  ok("failed+unchanged lot is NOT re-selected; independent lot flows instead", first === "A" && C.selectNextLot(r).lot.id === "B");
  // fail B too (unchanged) ⇒ both stalled ⇒ idle with a stalled reason (not an infinite re-pick).
  C.advance(r, "B", { attemptFailed: true, reason: "same failure" });
  const idle = C.selectNextLot(r);
  ok("all failed+unchanged ⇒ idle, reason names stalled (no infinite repeat)", idle.lot === null && /stalled/.test(idle.reason) && idle.stalled.length === 2);
  ok("summary surfaces stalled with attempt counts", C.summary(r).stalled.length === 2 && C.summary(r).stalled.every(s => s.attempts >= 1));
  // a NEW strategy = a genuinely different attempt ⇒ fingerprint changes ⇒ A selectable again.
  C.advance(r, "A", { strategy: "different-approach-v2" });
  ok("new strategy un-stalls the lot (different attempt)", C.selectNextLot(r).lot.id === "A");
  // explicit clearFailure also re-admits (e.g. new external evidence arrived).
  C.advance(r, "B", { clearFailure: true });
  ok("clearFailure re-admits a previously-stalled lot", C.summary(r).stalled.every(s => s.id !== "B"));
}

// (11) fingerprint stability + sensitivity: deterministic; changes only when the actionable definition changes.
{
  const l = { id: "X", title: "t", deps: ["d"], strategy: "s", inputsHash: "h" };
  const fp1 = C.lotFingerprint(l);
  ok("fingerprint deterministic + 16-hex", fp1 === C.lotFingerprint({ ...l }) && /^[0-9a-f]{16}$/.test(fp1));
  ok("fingerprint changes on strategy change, stable on status change", C.lotFingerprint({ ...l, strategy: "s2" }) !== fp1 && C.lotFingerprint({ ...l, status: "READY" }) === fp1);
}

// (12) EVIDENCE-VALIDITY propagation: an ACCEPTED item whose dependency regresses is flagged stale (its proof is not
// blindly reused); reconcile({demote}) re-opens it for re-verification (prior proof preserved, evidence cleared
// fail-closed); dependency ordering re-does the dep first; once the dep is re-ACCEPTED the item is no longer stale.
{
  const r = reg([
    { id: "A", status: "ACCEPTED", deps: [], evidence: "proof A" },
    { id: "B", status: "ACCEPTED", deps: ["A"], evidence: "proof B (relies on A)" },
  ]);
  ok("all deps ACCEPTED ⇒ no stale acceptances", C.staleAcceptances(r).length === 0);
  C.advance(r, "A", { status: "READY" });                                  // A regresses
  ok("dep regresses ⇒ dependent flagged stale (invalidatedBy named)", C.staleAcceptances(r).length === 1 && C.staleAcceptances(r)[0].id === "B" && C.staleAcceptances(r)[0].invalidatedBy.includes("A"));
  ok("summary surfaces staleEvidence", C.summary(r).staleEvidence.some(s => s.id === "B"));
  const rec = C.reconcile(r, { demote: true });
  const B = r.items.find(i => i.id === "B");
  ok("reconcile demotes stale ACCEPTED ⇒ IN_PROGRESS, evidence cleared, priorEvidence kept", rec.demoted.includes("B") && B.status === "IN_PROGRESS" && B.evidence === "" && B.priorEvidence === "proof B (relies on A)" && B.staleEvidence === true);
  ok("re-verification respects deps: A (not B) selected first", C.selectNextLot(r).lot.id === "A");
  C.advance(r, "A", { status: "ACCEPTED", evidence: "re-proven A" });
  ok("dep re-ACCEPTED ⇒ no stale acceptances; B now re-admissible", C.staleAcceptances(r).length === 0 && C.selectNextLot(r).lot.id === "B");
  // flag-only mode (no demote) leaves status ACCEPTED but marks staleEvidence for the operator.
  const r2 = reg([{ id: "A", status: "ACCEPTED", deps: [], evidence: "e" }, { id: "B", status: "ACCEPTED", deps: ["A"], evidence: "e" }]);
  C.advance(r2, "A", { status: "BLOCKED" });
  C.reconcile(r2);
  ok("reconcile (no demote) flags staleEvidence without changing status", r2.items.find(i => i.id === "B").staleEvidence === true && r2.items.find(i => i.id === "B").status === "ACCEPTED");
}

// (12b) C#4 (P0-C) — TRANSITIVE staleness to a fixpoint: chain A→B→C, C regresses ⇒ BOTH B and A are flagged stale
// in ONE pass (the former single-pass only caught the direct dependent B, leaving A ACCEPTED on an invalid basis).
{
  const r = reg([
    { id: "C", status: "ACCEPTED", deps: [], evidence: "proof C" },
    { id: "B", status: "ACCEPTED", deps: ["C"], evidence: "proof B (relies on C)" },
    { id: "A", status: "ACCEPTED", deps: ["B"], evidence: "proof A (relies on B)" },
  ]);
  ok("12b chain all ACCEPTED ⇒ 0 stale", C.staleAcceptances(r).length === 0);
  C.advance(r, "C", { status: "READY" }); // leaf C regresses
  const stale = C.staleAcceptances(r);
  const ids = stale.map((s) => s.id).sort();
  ok("12b leaf regress ⇒ BOTH direct (B) AND transitive (A) stale in ONE pass", ids.length === 2 && ids[0] === "A" && ids[1] === "B");
  ok("12b A's invalidatedBy names its stale dep B (transitive cause surfaced)", (stale.find((s) => s.id === "A").invalidatedBy || []).includes("B"));
  const rec = C.reconcile(r, { demote: true });
  ok("12b reconcile demotes BOTH A and B in one pass (whole cone invalidated)", rec.demoted.includes("A") && rec.demoted.includes("B") && r.items.find((i) => i.id === "A").status === "IN_PROGRESS" && r.items.find((i) => i.id === "B").status === "IN_PROGRESS");
  // deep-chain determinism: re-accepting the leaf clears the whole cone.
  C.advance(r, "C", { status: "ACCEPTED", evidence: "re-C" });
  ok("12b leaf re-ACCEPTED but mid-cone still IN_PROGRESS ⇒ A still has a non-ACCEPTED dep (B) ⇒ not re-admissible yet", C.staleAcceptances(r).length === 0 && C.selectNextLot(r).lot.id === "B");
}

// (13) the REAL closure-register has NO stale acceptances (every ACCEPTED item's deps are ACCEPTED).
{
  const real = C.loadRegister(path.join(process.cwd(), "docs", "odg", "closure-register.json"));
  ok("real register: 0 stale acceptances (evidence bases all valid)", real.ok && C.staleAcceptances(real.register).length === 0);
}

// (14) V361-D P3 — DEFERRED→READY promotion gate (deny-by-default authority, enforced at the mutator).
// The audit showed the promotion mutator was UNGATED: advance(..,{status:READY}) promoted a DEFERRED lot unconditionally.
{
  const def = () => reg([{ id: "D", status: "DEFERRED", deps: [], priority: 1 }]);
  // REFUSE: no authorization ⇒ the DEFERRED lot stays DEFERRED (never auto-promoted), and is NOT selectable.
  let r = def();
  const bad = C.advance(r, "D", { status: "READY" });
  ok("DEFERRED→READY with NO authorization ⇒ refused (AUTHORIZATION_REQUIRED), lot stays DEFERRED", bad.ok === false && bad.code === "AUTHORIZATION_REQUIRED" && r.items[0].status === "DEFERRED");
  ok("a refused DEFERRED lot is NOT selectable (negative invariant holds too)", C.selectNextLot(r).lot === null);
  // REFUSE: a self-authoring Radar/evolution actor can NEVER self-promote (even with approved:true).
  r = def();
  const self = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "frontier-radar", approved: true } });
  ok("self-authoring actor (frontier-radar) CANNOT self-promote", self.ok === false && r.items[0].status === "DEFERRED");
  // REFUSE: a truthy-but-unapproved / scope-only authorization is rejected (approved must be true; scope ≠ authority).
  r = def();
  const unapp = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg", approved: false } });
  ok("authorizer present but approved:false ⇒ refused (approval required)", unapp.ok === false && r.items[0].status === "DEFERRED");
  r = def();
  const strf = C.advance(r, "D", { status: "READY", authorization: "looks-authorized" });
  ok("a bare string authorization is insufficient (explicit authorizer record required)", strf.ok === false && r.items[0].status === "DEFERRED");
  // ALLOW: an explicit non-self authorizer with approved:true ⇒ promoted + durable trace stamped; now selectable.
  r = def();
  const good = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, basis: "owner decision", at: "2026-11-21" } });
  ok("DEFERRED→READY WITH a valid authorization ⇒ promoted to READY", good.ok === true && r.items[0].status === "READY");
  ok("promotion stamps a durable readyAuthorization trace (who/basis/promotedFrom)", r.items[0].readyAuthorization && r.items[0].readyAuthorization.authorizedBy === "odg-owner" && r.items[0].readyAuthorization.approved === true && r.items[0].readyAuthorization.promotedFrom === "DEFERRED" && r.items[0].readyAuthorization.basis === "owner decision");
  ok("once authorized ⇒ the lot becomes selectable", C.selectNextLot(r).lot && C.selectNextLot(r).lot.id === "D");
  // UNAFFECTED: a NON-DEFERRED READY transition (re-opening a regressed ACCEPTED item) is NOT gated.
  const r2 = reg([{ id: "A", status: "ACCEPTED", deps: [], evidence: "e" }]);
  const regress = C.advance(r2, "A", { status: "READY" });
  ok("ACCEPTED→READY (regression re-open) is NOT gated (only DEFERRED/authorizationRequired activation is)", regress.ok === true && r2.items[0].status === "READY");

  // ANTI-LAUNDERING: IN_PROGRESS is ALSO a selectable OPEN_STATE, so DEFERRED→IN_PROGRESS must be gated too (keying on
  // READY alone was bypassable). Likewise a DEFERRED→BLOCKED→READY path cannot launder the status past the gate.
  r = def();
  const ip = C.advance(r, "D", { status: "IN_PROGRESS" });
  ok("DEFERRED→IN_PROGRESS without authorization ⇒ refused (IN_PROGRESS is selectable — no laundering)", ip.ok === false && ip.code === "AUTHORIZATION_REQUIRED" && r.items[0].status === "DEFERRED");
  ok("the un-laundered DEFERRED lot is still NOT selectable", C.selectNextLot(r).lot === null);
  // DEFERRED→BLOCKED (not selectable) is allowed, but the lot keeps authorizationRequired via its DEFERRED origin flag;
  // then BLOCKED→READY is still gated because the lot was flagged authorizationRequired.
  const r3 = reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, deps: [], priority: 1 }]);
  C.advance(r3, "D", { status: "BLOCKED", blockReason: "waiting" });
  const laundered = C.advance(r3, "D", { status: "READY" });
  ok("DEFERRED→BLOCKED→READY cannot launder past the gate (authorizationRequired flag still enforces)", laundered.ok === false && laundered.code === "AUTHORIZATION_REQUIRED" && r3.items[0].status === "BLOCKED");

  // case-insensitive self-actor blocklist: a disguised Radar actor cannot authorize its own activation.
  r = def();
  const disguised = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: " Frontier-Radar ", approved: true } });
  ok("a case/space-disguised self-authoring actor (' Frontier-Radar ') is still blocked", disguised.ok === false && r.items[0].status === "DEFERRED");

  // once authorized (with a valid authorization), a subsequent transition is NOT re-gated (readyAuthorization stamped).
  r = def();
  C.advance(r, "D", { status: "IN_PROGRESS", authorization: { authorizedBy: "odg-owner", approved: true } });
  const reready = C.advance(r, "D", { status: "READY" });
  ok("after a valid activation ⇒ later transitions are not re-gated (authorization proof persists)", reready.ok === true && r.items[0].status === "READY");
}

// (15) V361-D P3 HARDENING — IDENTITY-BOUND authorization (Ed25519). When trusted authorizer keys are configured, a
// DEFERRED→selectable promotion requires a signature by a TRUSTED key over THIS lotId + a single-use nonce — a component
// can no longer forge `{authorizedBy:"owner",approved:true}`. Composes the existing agent-identity canon (no 2nd crypto).
{
  const crypto = require("crypto");
  const AI = require("./agent-identity.js");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const ownerPub = publicKey.export({ type: "spki", format: "pem" });
  const { privateKey: otherPriv } = crypto.generateKeyPairSync("ed25519");
  const trustedAuthorizers = { "odg-owner": ownerPub };
  const sign = (priv, lotId, authorizedBy, nonce) => crypto.sign(null, Buffer.from(AI.canon({ action: C.PROMOTION_ACTION, lotId, authorizedBy, nonce })), priv).toString("base64");
  const def = () => reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, deps: [], priority: 1 }]);

  // ALLOW: a valid owner signature over lotId "D" ⇒ promoted, identityVerified:true.
  let r = def();
  const goodSig = sign(privateKey, "D", "odg-owner", "n1");
  const okAdv = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "n1", signature: goodSig } }, { trustedAuthorizers });
  ok("identity-bound: valid Ed25519 owner signature ⇒ promoted, identityVerified TRUE", okAdv.ok === true && r.items[0].status === "READY" && r.items[0].readyAuthorization.identityVerified === true);

  // REFUSE: a forged CLAIM (no signature) when keys are configured ⇒ denied (closes the forge-a-claim gap).
  r = def();
  const forged = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true } }, { trustedAuthorizers });
  ok("identity-bound: an unsigned CLAIM is REFUSED when keys are configured (no forgery)", forged.ok === false && forged.code === "AUTHORIZATION_REQUIRED" && r.items[0].status === "DEFERRED");

  // REFUSE: signature by a NON-trusted key (attacker's own keypair, claiming to be the owner) ⇒ denied.
  r = def();
  const wrongKeySig = sign(otherPriv, "D", "odg-owner", "n2");
  const wrongKey = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "n2", signature: wrongKeySig } }, { trustedAuthorizers });
  ok("identity-bound: signature by a NON-trusted key is REFUSED (authority not proven)", wrongKey.ok === false && r.items[0].status === "DEFERRED");

  // REFUSE: a valid signature for lot "D" cannot be REPLAYED to promote a different lot "E" (payload binds lotId).
  const r2 = reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, deps: [] }, { id: "E", status: "DEFERRED", authorizationRequired: true, deps: [] }]);
  const sigForD = sign(privateKey, "D", "odg-owner", "n3");
  const crossLot = C.advance(r2, "E", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "n3", signature: sigForD } }, { trustedAuthorizers });
  ok("identity-bound: a signature for lot D cannot promote lot E (payload binds the lotId)", crossLot.ok === false && r2.items[1].status === "DEFERRED");

  // REFUSE: nonce replay (same signature used twice) when a single-use seen-set is supplied.
  const seenNonces = new Set();
  const rA = reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, deps: [] }]);
  const sigR = sign(privateKey, "D", "odg-owner", "n4");
  const first = C.advance(rA, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "n4", signature: sigR } }, { trustedAuthorizers, seenNonces });
  const rB = reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, deps: [] }]);
  const replay = C.advance(rB, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "n4", signature: sigR } }, { trustedAuthorizers, seenNonces });
  ok("identity-bound: a replayed nonce is REFUSED (single-use)", first.ok === true && replay.ok === false && rB.items[0].status === "DEFERRED");

  // REFUSE: requireSignedAuthorization forces signed even with NO trusted keys (a claim is rejected).
  r = def();
  const strict = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true } }, { requireSignedAuthorization: true });
  ok("requireSignedAuthorization: a CLAIM is refused (no trusted key for the authorizer)", strict.ok === false && r.items[0].status === "DEFERRED");

  // BACK-COMPAT: with NO opts (claim mode), a valid claim still promotes but is honestly flagged identityVerified:false.
  r = def();
  const claim = C.advance(r, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true } });
  ok("claim mode (no keys): promotes but trace records identityVerified FALSE (honest downgrade)", claim.ok === true && r.items[0].status === "READY" && r.items[0].readyAuthorization.identityVerified === false);

  // direct verifier unit: self-authoring actor still blocked even with a 'signature' field present.
  const vSelf = C.verifyPromotionAuthorization({ authorizedBy: "frontier-radar", approved: true, nonce: "x", signature: "AAAA" }, { lotId: "D", trustedAuthorizers });
  ok("verifier: self-authoring actor refused regardless of a signature field", vSelf.ok === false);

  // F1: a lot's OWN persisted requireSignedAuthorization flag forces strict mode even when the caller omits opts (the
  // caller cannot downgrade to claim mode). A claim is refused; a valid signature (keys passed) promotes.
  const rStrict = reg([{ id: "D", status: "DEFERRED", authorizationRequired: true, requireSignedAuthorization: true, deps: [] }]);
  const claimOnStrict = C.advance(rStrict, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true } });
  ok("F1: per-lot requireSignedAuthorization refuses a claim even with NO opts (caller cannot downgrade)", claimOnStrict.ok === false && rStrict.items[0].status === "DEFERRED");
  const sigOnStrict = C.advance(rStrict, "D", { status: "READY", authorization: { authorizedBy: "odg-owner", approved: true, nonce: "s1", signature: sign(privateKey, "D", "odg-owner", "s1") } }, { trustedAuthorizers });
  ok("F1: per-lot strict lot promotes with a valid signature", sigOnStrict.ok === true && rStrict.items[0].status === "READY" && rStrict.items[0].readyAuthorization.identityVerified === true);

  // F3: an authorizer name resolving to an INHERITED property ("__proto__"/"constructor") is NOT accepted as a key.
  const vProto = C.verifyPromotionAuthorization({ authorizedBy: "__proto__", approved: true, nonce: "p", signature: "AAAA" }, { lotId: "D", trustedAuthorizers });
  ok("F3: inherited-property authorizer ('__proto__') is refused (own-property key lookup)", vProto.ok === false);
}

console.log(`\nCAMPAIGN-CONTROLLER suite — ${pass} assertions passed. (dep-aware selection, priority, BLOCKED-skip, fail-closed ACCEPTED, durable persist+resume, cycle-safe; decomposition: blocked-parent never freezes independent prep; NO-REPEAT: failed+unchanged not re-selected; EVIDENCE-VALIDITY: stale acceptances flagged + reconciled; real register drivable)`);

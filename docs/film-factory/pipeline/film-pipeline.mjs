// ODG-native film-production ORCHESTRATION toolkit — pure, dependency-free, unit-tested.
// Zero-cost, no privileged access, no external calls. Reuses ODG's proven patterns: fail-closed validation
// (validation-engine), sha256 provenance (evidence-provenance), ledger accounting (mission-ledger/economic).
// It orchestrates/accounts/gates production; it does NOT generate media (that stage is EXTERNAL_SERVICE_REQUIRED).
import { createHash } from "node:crypto";
export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

// ---------- Budget ledger (protects the €4,000 hard cap; refuses any crossing spend) ----------
export class BudgetLedger {
  constructor(capEur) { this.cap = capEur; this.committed = 0; this.spent = 0; this.log = []; }
  _r(x){ return Math.round(x*100)/100; }
  remaining() { return this._r(this.cap - this.committed - this.spent); }
  commit(amount, label) {
    if (amount < 0) throw new Error("commit: negative");
    if (this._r(this.committed + this.spent + amount) > this.cap + 1e-9)
      throw new Error(`BUDGET REFUSED: commit €${amount} (${label}) would exceed cap €${this.cap} (remaining €${this.remaining()})`);
    this.committed = this._r(this.committed + amount); this.log.push({t:"commit", amount, label}); return true;
  }
  spend(amount, label, { fromCommitted = false } = {}) {
    if (amount < 0) throw new Error("spend: negative");
    if (fromCommitted) { this.committed = this._r(Math.max(0, this.committed - amount)); }
    if (this._r(this.committed + this.spent + amount) > this.cap + 1e-9)
      throw new Error(`BUDGET REFUSED: spend €${amount} (${label}) would exceed cap €${this.cap} (remaining €${this.remaining()})`);
    this.spent = this._r(this.spent + amount); this.log.push({t:"spend", amount, label}); return true;
  }
  snapshot() { return { cap:this.cap, committed:this.committed, spent:this.spent, remaining:this.remaining() }; }
}

// ---------- Shot / asset ledger (every shot tracked: id, scene, version, prompt, cost, status, provenance) ----------
export function makeShot(id, scene, spec) {
  return { id, scene, version: 1, kind: spec.kind || "still", prompt: spec.prompt || "", refs: spec.refs || [],
    dialogue: !!spec.dialogue, costEur: 0, attempts: 0, status: "PLANNED", provenance: null, defects: [] };
}
export function recordGeneration(shot, { costEur, outputBytes }) {
  shot.attempts += 1; shot.costEur = Math.round((shot.costEur + costEur) * 100) / 100;
  shot.provenance = sha256(`${shot.id}:v${shot.version}:${shot.prompt}:${outputBytes ?? ""}`);
  shot.status = "GENERATED"; return shot;
}

// ---------- Acceptance gate (FAIL-CLOSED: any missing/failed criterion blocks; blocks dependents) ----------
// criteria: { faceMatchMin, requireNoDrift, requireLipsyncIfDialogue, requireExport }
export function acceptanceGate(shot, qc, criteria) {
  const failed = [];
  if (shot.status !== "GENERATED" && shot.status !== "REVISED") failed.push("not-generated");
  if (!qc || typeof qc !== "object") { failed.push("no-qc"); return { pass:false, failed }; }
  if (typeof qc.faceMatch !== "number" || qc.faceMatch < criteria.faceMatchMin) failed.push(`faceMatch<${criteria.faceMatchMin}`);
  if (criteria.requireNoDrift && qc.costumeDrift !== false) failed.push("costume/proportion-drift");
  if (criteria.requireLipsyncIfDialogue && shot.dialogue && qc.lipsyncOk !== true) failed.push("lipsync");
  if (criteria.requireExport && qc.exported !== true) failed.push("not-exported");
  if (qc.continuityBreak === true) failed.push("continuity-break");
  const pass = failed.length === 0;
  shot.status = pass ? "ACCEPTED" : "REJECTED";
  return { pass, failed };
}
// A dependent shot may only generate once its prerequisites are ACCEPTED (no contamination).
export function dependentsUnlocked(shot, allShots, deps /* id->prereqIds */) {
  const pre = deps[shot.id] || [];
  const blocked = pre.filter(pid => (allShots.find(s=>s.id===pid)||{}).status !== "ACCEPTED");
  return { unlocked: blocked.length === 0, blockedBy: blocked };
}

// ---------- Defect classification + bounded retry (never scene-restart) ----------
export function classifyDefect(failed) {
  if (failed.includes("continuity-break") || failed.includes("costume/proportion-drift")) return { defect:"CONTINUITY", retryable:true };
  if (failed.includes("lipsync")) return { defect:"LIPSYNC", retryable:true };
  if (failed.includes("not-exported")) return { defect:"EXPORT", retryable:true };
  if (failed.some(f=>f.startsWith("faceMatch"))) return { defect:"QUALITY", retryable:true };
  return { defect:"UNKNOWN", retryable:false };
}
export function retryPlan(shot, maxRetries) {
  if (shot.attempts >= maxRetries) return { action:"ESCALATE", reason:`max ${maxRetries} attempts`, attempt: shot.attempts };
  return { action:"RETRY", attempt: shot.attempts + 1 };
}

// ---------- Continuity register (every character in a shot must be introduced + have a locked ref) ----------
export function continuityCheck(shots, characters /* {name: {introduced, lockedRef}} */) {
  const violations = [];
  for (const s of shots) for (const name of (s.characters || [])) {
    const c = characters[name];
    if (!c || !c.introduced) violations.push(`${s.id}: '${name}' not introduced`);
    else if (!c.lockedRef) violations.push(`${s.id}: '${name}' has no locked reference sheet`);
  }
  return { ok: violations.length === 0, violations };
}

// ---------- Rights / release check (an asset without a cleared commercial licence blocks release) ----------
export function rightsReleaseCheck(assets /* [{id, licence, aiDisclosed}] */) {
  const blockers = [];
  for (const a of assets) {
    if (!a.licence || a.licence === "unknown" || a.licence === "right-to-use") blockers.push(`${a.id}: licence '${a.licence||"none"}' not ownership-clear`);
    if (a.aiDisclosed !== true) blockers.push(`${a.id}: AI-disclosure missing`);
  }
  return { ok: blockers.length === 0, blockers };
}

// ---------- Runtime estimator + edit-plan check (reduce waste: catch under/over-length + empty scenes early) ----------
export function runtimeEstimate(shots, { avgShotSec = 9 } = {}) {
  const n = Array.isArray(shots) ? shots.length : Number(shots) || 0;
  return Math.round((n * avgShotSec) / 60 * 100) / 100; // minutes
}
export function editPlanCheck(scenes /* [{id, shotIds:[]}] */, acceptedShotIds, { targetMin, tolMin = 1, avgShotSec = 9 } = {}) {
  const accepted = new Set(acceptedShotIds || []);
  const emptyScenes = scenes.filter(s => !(s.shotIds || []).some(id => accepted.has(id))).map(s => s.id);
  const totalShots = scenes.reduce((a, s) => a + (s.shotIds || []).filter(id => accepted.has(id)).length, 0);
  const estMin = runtimeEstimate(totalShots, { avgShotSec });
  const withinTarget = typeof targetMin === "number" ? Math.abs(estMin - targetMin) <= tolMin : null;
  return { ok: emptyScenes.length === 0 && (withinTarget !== false), emptyScenes, totalAcceptedShots: totalShots, estMin, targetMin: targetMin ?? null, withinTarget };
}

// ---------- Export-duration gate (FAIL-CLOSED: a film is "done" only with a REAL file at exactly 60:00±tol) ----------
// export: { filePath, exists, durationSec }. Refuses to pass on a missing file or wrong duration — prevents any
// false "film produced" claim (campaign §3/§8). targetSec default 3600 (60:00), tol default 120s (±2:00).
export function exportDurationGate(exp, { targetSec = 3600, tolSec = 120 } = {}) {
  const reasons = [];
  if (!exp || typeof exp !== "object") { return { ok: false, reasons: ["no export object"] }; }
  if (exp.exists !== true) reasons.push("no real exported file exists");
  if (!exp.filePath) reasons.push("no file path");
  if (typeof exp.durationSec !== "number") reasons.push("duration unknown (not measured)");
  else if (Math.abs(exp.durationSec - targetSec) > tolSec)
    reasons.push(`duration ${Math.round(exp.durationSec)}s not within ${targetSec}±${tolSec}s`);
  return { ok: reasons.length === 0, reasons };
}

// ---------- Release gate (all shots ACCEPTED + rights clear + within budget) ----------
export function releaseGate(shots, rights, budget) {
  const notAccepted = shots.filter(s => s.status !== "ACCEPTED").map(s=>s.id);
  const reasons = [];
  if (notAccepted.length) reasons.push(`shots not accepted: ${notAccepted.join(",")}`);
  if (!rights.ok) reasons.push(`rights: ${rights.blockers.join("; ")}`);
  if (budget.remaining() < 0) reasons.push("over budget");
  return { release: reasons.length === 0, reasons };
}

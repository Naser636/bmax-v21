// Crash-safe cumulative budget ledger for the REAL benchmark. Wraps the proven in-memory BudgetLedger
// (film-pipeline.mjs) and persists every reservation + spend to disk atomically, so cumulative spend plus
// all OUTSTANDING reservations can never exceed the ceiling — even across process restarts. ODG-side
// enforcement ONLY (never relies on the provider to cap). No network, no secrets. €0 by itself.
//
// Model:
//   reserve(amount, label)  -> commits a worst-case amount BEFORE a paid call (fails closed if it would cross cap)
//   settle(reservation, actualAmount) -> on completion, releases the reservation and books the ACTUAL spend
//   release(reservation)    -> on failure/cancel, releases the reservation and books €0
// Invariant at all times: spent + sum(outstanding reservations) <= ceiling.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { BudgetLedger } from './film-pipeline.mjs';

export class PersistentLedger {
  constructor(ceilingEur, statePath, { maxAttempts = 8 } = {}) {
    this.ceiling = ceilingEur;
    this.statePath = statePath;
    this.maxAttempts = maxAttempts;
    this._ledger = new BudgetLedger(ceilingEur); // arms the hard cap; refuses any crossing commit/spend
    this.reservations = new Map(); // id -> {amount, label}
    this.attempts = 0;             // GLOBAL attempt counter (CTO: 8 total across the whole benchmark)
    this._seq = 0;
    this._load();
  }

  _load() {
    if (!existsSync(this.statePath)) { this._persist(); return; }
    try {
      const s = JSON.parse(readFileSync(this.statePath, 'utf8'));
      if (s.ceiling !== this.ceiling) throw new Error(`ledger ceiling mismatch: file €${s.ceiling} vs requested €${this.ceiling}`);
      // replay committed + spent into a fresh in-memory ledger so the cap invariant is reconstructed exactly
      this._ledger = new BudgetLedger(this.ceiling);
      for (const r of s.reservations || []) { this._ledger.commit(r.amount, r.label); this.reservations.set(r.id, { amount: r.amount, label: r.label }); }
      if (s.spent > 0) this._ledger.spend(s.spent, 'recovered-spend');
      this.attempts = s.attempts || 0;
      this._seq = s.seq || 0;
    } catch (e) {
      throw new Error(`PersistentLedger: refusing to start on unreadable/inconsistent state (${e.message}). Fail closed.`);
    }
  }

  _persist() {
    const snap = {
      ceiling: this.ceiling, spent: this._ledger.spent, committed: this._ledger.committed,
      remaining: this._ledger.remaining(), attempts: this.attempts, maxAttempts: this.maxAttempts, seq: this._seq,
      reservations: [...this.reservations.entries()].map(([id, r]) => ({ id, amount: r.amount, label: r.label })),
      stampNote: 'ODG-side ledger; cumulative spent + outstanding reservations <= ceiling at all times',
    };
    const tmp = this.statePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(snap, null, 1));
    renameSync(tmp, this.statePath); // atomic replace
  }

  canAttempt() { return this.attempts < this.maxAttempts; }

  // Reserve worst-case BEFORE a paid call. Throws (fail-closed) if it would cross the ceiling or the attempt cap.
  reserve(amountEur, label) {
    if (!(amountEur >= 0)) throw new Error('reserve: amount must be a non-negative number (worst-case cost required)');
    if (!this.canAttempt()) throw new Error(`ATTEMPT CAP: already used ${this.attempts}/${this.maxAttempts} attempts — no further paid call`);
    this._ledger.commit(amountEur, label); // BudgetLedger refuses if spent+committed+amount > ceiling
    this.attempts += 1;                     // an attempt is counted at reservation time (a paid call is about to be issued)
    const id = `r${++this._seq}`;
    this.reservations.set(id, { amount: amountEur, label });
    this._persist();
    return id;
  }

  // Book the ACTUAL spend and release the (larger-or-equal) reservation.
  settle(reservationId, actualEur) {
    const r = this.reservations.get(reservationId);
    if (!r) throw new Error(`settle: unknown reservation ${reservationId}`);
    if (!(actualEur >= 0)) throw new Error('settle: actual must be a non-negative number');
    if (actualEur > r.amount + 1e-9) throw new Error(`settle: actual €${actualEur} exceeds reserved worst-case €${r.amount} — refusing (would break the pre-reservation guarantee)`);
    this._ledger.committed = Math.round((this._ledger.committed - r.amount) * 100) / 100; // release reservation
    this.reservations.delete(reservationId);
    this._ledger.spend(actualEur, r.label); // book real spend against the cap
    this._persist();
    return this.snapshot();
  }

  // Release a reservation with zero spend (call failed / cancelled / produced nothing billable).
  release(reservationId) {
    const r = this.reservations.get(reservationId);
    if (!r) return this.snapshot();
    this._ledger.committed = Math.round((this._ledger.committed - r.amount) * 100) / 100;
    this.reservations.delete(reservationId);
    this._persist();
    return this.snapshot();
  }

  remaining() { return this._ledger.remaining(); }
  snapshot() {
    return { ceiling: this.ceiling, spent: this._ledger.spent, committed: this._ledger.committed,
      remaining: this._ledger.remaining(), attempts: this.attempts, maxAttempts: this.maxAttempts,
      outstandingReservations: this.reservations.size };
  }
}

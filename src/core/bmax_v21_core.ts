/**
 * BMAX V2.1 — Core Engine
 * Pure business logic — no React, no frontend, no external dependencies.
 * Only the Node.js built-in `crypto` module is used (for SHA-256 audit hashes).
 */

import { createHash } from "crypto";

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export enum SystemState {
  ACTIVE = "ACTIVE",
  WARNING = "WARNING",
  QUARANTINE = "QUARANTINE",
  FAIL_CLOSED = "FAIL_CLOSED",
}

export enum MarketMode {
  SOLANA_SNIPER = "SOLANA_SNIPER",
  CLASSIC_SPREAD = "CLASSIC_SPREAD",
}

export enum OperationMode {
  PURE_SIMULATION = "PURE_SIMULATION",
  HISTORICAL_REPLAY = "HISTORICAL_REPLAY",
}

// ─────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────

export interface EngineMetrics {
  systemState: SystemState;
  marketMode: MarketMode;
  operationMode: OperationMode;
  totalTrades: number;
  totalPnL: number;
  totalScanned: number;
  totalRejected: number;
  uptimeMs: number;
  healthyCycles: number;
  lastHeartbeatAt: number;
}

export interface SimulationEvent {
  id: string;
  timestamp: number;
  marketMode: MarketMode;
  operationMode: OperationMode;
  action: "BUY" | "SELL" | "REJECT" | "SCAN";
  symbol: string;
  pnl: number;
  riskScore: number;
  reason: string;
}

export interface SolanaTokenListing {
  mint: string;           // Token mint address (identifier)
  symbol: string;
  listingTimestampMs: number;
  initialLiquidityUsd: number;
  holderCount: number;
  isVerified: boolean;
  lpLocked: boolean;      // Liquidity-pool lock status
}

export interface ClassicMarketTick {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volumeUsd: number;
  timestampMs: number;
}

export interface AuditLogBlock {
  index: number;
  timestamp: number;
  eventType: string;
  payload: string;        // JSON-serialised event data
  previousHash: string;
  currentHash: string;
}

// ─────────────────────────────────────────────
// INTERNAL TYPES
// ─────────────────────────────────────────────

interface WatchdogConfig {
  timeoutMs: number;      // How long without a heartbeat before escalating
}

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const AUDIT_RING_SIZE = 1000;
const HYSTERESIS_HEALTHY_CYCLES = 3;   // Cycles required to return to ACTIVE
const RISK_SCORE_WARNING = 0.6;        // >= triggers WARNING
const RISK_SCORE_QUARANTINE = 0.8;     // >= triggers QUARANTINE

// ─────────────────────────────────────────────
// UTILITY — SHA-256 via Node.js crypto
// ─────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function generateId(): string {
  return sha256(`${Date.now()}-${Math.random()}`).slice(0, 16);
}

// ─────────────────────────────────────────────
// MAIN ENGINE CLASS
// ─────────────────────────────────────────────

export class BmaxV21CoreEngine {
  // ── State ──────────────────────────────────
  private systemState: SystemState = SystemState.ACTIVE;
  private marketMode: MarketMode;
  private operationMode: OperationMode;

  // ── Metrics ────────────────────────────────
  private totalTrades = 0;
  private totalPnL = 0;
  private totalScanned = 0;
  private totalRejected = 0;
  private startedAt: number = Date.now();

  // ── Hysteresis ─────────────────────────────
  private healthyCycles = 0;

  // ── Watchdog ───────────────────────────────
  private watchdogConfig: WatchdogConfig;
  private lastHeartbeatAt: number = Date.now();

  // ── Audit ring buffer ──────────────────────
  private auditLog: AuditLogBlock[] = [];
  private auditHead = 0;           // Next write position (wraps at AUDIT_RING_SIZE)
  private auditCount = 0;          // Total blocks ever written (unbounded)
  private lastAuditHash = "0".repeat(64);   // Genesis previous-hash

  // ─────────────────────────────────────────
  constructor(
    marketMode: MarketMode = MarketMode.SOLANA_SNIPER,
    operationMode: OperationMode = OperationMode.PURE_SIMULATION,
    watchdogConfig: WatchdogConfig = { timeoutMs: 30_000 }
  ) {
    this.marketMode = marketMode;
    this.operationMode = operationMode;
    this.watchdogConfig = watchdogConfig;

    this.writeAudit("ENGINE_INIT", {
      marketMode,
      operationMode,
      watchdogTimeoutMs: watchdogConfig.timeoutMs,
    });
  }

  // ─────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────

  /** Register a heartbeat to keep the watchdog alive. */
  public feedHeartbeat(): void {
    this.lastHeartbeatAt = Date.now();
    this.writeAudit("HEARTBEAT", { ts: this.lastHeartbeatAt });
  }

  /**
   * Safety-gate monitor.
   * Call this on every engine cycle to drive the state machine.
   * @param aggregatedRiskScore  0.0 → 1.0
   */
  public monitorSafetyGates(aggregatedRiskScore: number): SystemState {
    this.checkWatchdog();

    // If already FAIL_CLOSED, only resetSystem() can exit that state.
    if (this.systemState === SystemState.FAIL_CLOSED) {
      return this.systemState;
    }

    const risk = Math.max(0, Math.min(1, aggregatedRiskScore));

    if (risk >= RISK_SCORE_QUARANTINE) {
      this.transitionTo(SystemState.QUARANTINE);
      this.healthyCycles = 0;
    } else if (risk >= RISK_SCORE_WARNING) {
      this.transitionTo(SystemState.WARNING);
      this.healthyCycles = 0;
    } else {
      // Healthy cycle — apply hysteresis before returning to ACTIVE
      this.healthyCycles += 1;
      if (
        this.systemState !== SystemState.ACTIVE &&
        this.healthyCycles >= HYSTERESIS_HEALTHY_CYCLES
      ) {
        this.transitionTo(SystemState.ACTIVE);
      }
    }

    this.writeAudit("SAFETY_GATE", {
      riskScore: risk,
      newState: this.systemState,
      healthyCycles: this.healthyCycles,
    });

    return this.systemState;
  }

  /**
   * Execute a Solana sniper evaluation.
   * Returns the simulation event produced.
   */
  public executeSolanaSniper(listing: SolanaTokenListing): SimulationEvent {
    this.totalScanned += 1;

    const event = this.simulateSolanaSniper(listing);

    if (event.action === "REJECT") {
      this.totalRejected += 1;
    } else {
      this.totalTrades += 1;
      this.totalPnL += event.pnl;
    }

    this.writeAudit("SOLANA_SNIPER", event);
    return event;
  }

  /**
   * Execute a classic spread evaluation.
   * Returns the simulation event produced.
   */
  public executeClassicSpread(tick: ClassicMarketTick): SimulationEvent {
    this.totalScanned += 1;

    const event = this.simulateClassicSpread(tick);

    if (event.action === "REJECT") {
      this.totalRejected += 1;
    } else {
      this.totalTrades += 1;
      this.totalPnL += event.pnl;
    }

    this.writeAudit("CLASSIC_SPREAD", event);
    return event;
  }

  /** Return the full audit ring buffer in chronological order. */
  public getLogs(): AuditLogBlock[] {
    // The ring can hold up to AUDIT_RING_SIZE entries.
    // Return them in insertion order.
    const filled = Math.min(this.auditCount, AUDIT_RING_SIZE);
    if (filled < AUDIT_RING_SIZE || this.auditCount <= AUDIT_RING_SIZE) {
      return this.auditLog.slice(0, filled);
    }
    // Buffer has wrapped: oldest entry is at auditHead
    const tail = this.auditLog.slice(this.auditHead);
    const head = this.auditLog.slice(0, this.auditHead);
    return [...tail, ...head];
  }

  /** Return a full system snapshot. */
  public getSystemSnapshot(): EngineMetrics {
    return {
      systemState: this.systemState,
      marketMode: this.marketMode,
      operationMode: this.operationMode,
      totalTrades: this.totalTrades,
      totalPnL: Math.round(this.totalPnL * 100) / 100,
      totalScanned: this.totalScanned,
      totalRejected: this.totalRejected,
      uptimeMs: Date.now() - this.startedAt,
      healthyCycles: this.healthyCycles,
      lastHeartbeatAt: this.lastHeartbeatAt,
    };
  }

  /** Hard-reset the engine to ACTIVE, zeroing all metrics. */
  public resetSystem(): void {
    this.systemState = SystemState.ACTIVE;
    this.totalTrades = 0;
    this.totalPnL = 0;
    this.totalScanned = 0;
    this.totalRejected = 0;
    this.healthyCycles = 0;
    this.startedAt = Date.now();
    this.lastHeartbeatAt = Date.now();
    this.auditLog = [];
    this.auditHead = 0;
    this.auditCount = 0;
    this.lastAuditHash = "0".repeat(64);

    this.writeAudit("ENGINE_RESET", { ts: this.startedAt });
  }

  // ─────────────────────────────────────────
  // PRIVATE — State machine
  // ─────────────────────────────────────────

  private transitionTo(next: SystemState): void {
    if (this.systemState === next) return;
    const prev = this.systemState;
    this.systemState = next;
    this.writeAudit("STATE_TRANSITION", { from: prev, to: next });
  }

  // ─────────────────────────────────────────
  // PRIVATE — Watchdog
  // ─────────────────────────────────────────

  private checkWatchdog(): void {
    const elapsed = Date.now() - this.lastHeartbeatAt;
    if (elapsed > this.watchdogConfig.timeoutMs) {
      if (this.systemState !== SystemState.FAIL_CLOSED) {
        this.writeAudit("WATCHDOG_TIMEOUT", {
          elapsedMs: elapsed,
          limitMs: this.watchdogConfig.timeoutMs,
        });
        this.transitionTo(SystemState.FAIL_CLOSED);
      }
    }
  }

  // ─────────────────────────────────────────
  // PRIVATE — Simulation engines
  // ─────────────────────────────────────────

  /**
   * Solana Sniper simulation.
   *
   * Risk score is derived from:
   *  - Very new listing (+risk)
   *  - Low liquidity (+risk)
   *  - Few holders (+risk)
   *  - Unverified token (+risk)
   *  - Unlocked LP (+risk)
   */
  private simulateSolanaSniper(listing: SolanaTokenListing): SimulationEvent {
    const ageMs = Date.now() - listing.listingTimestampMs;
    const ageFactor = Math.max(0, 1 - ageMs / 60_000);          // 0-1: newer = riskier
    const liqFactor = listing.initialLiquidityUsd < 5_000 ? 0.3 : 0;
    const holderFactor = listing.holderCount < 50 ? 0.2 : 0;
    const verifyFactor = listing.isVerified ? 0 : 0.15;
    const lpFactor = listing.lpLocked ? 0 : 0.2;

    const riskScore = Math.min(
      1,
      ageFactor * 0.15 + liqFactor + holderFactor + verifyFactor + lpFactor
    );

    const shouldReject =
      riskScore >= RISK_SCORE_WARNING ||
      this.systemState === SystemState.QUARANTINE ||
      this.systemState === SystemState.FAIL_CLOSED;

    const pnl = shouldReject
      ? 0
      : this.generateSolanaPnL(listing, riskScore);

    return {
      id: generateId(),
      timestamp: Date.now(),
      marketMode: MarketMode.SOLANA_SNIPER,
      operationMode: this.operationMode,
      action: shouldReject ? "REJECT" : "BUY",
      symbol: listing.symbol,
      pnl,
      riskScore,
      reason: shouldReject
        ? `Risk ${riskScore.toFixed(3)} ≥ threshold or system not ACTIVE`
        : `Sniped at listing — risk ${riskScore.toFixed(3)}`,
    };
  }

  private generateSolanaPnL(
    listing: SolanaTokenListing,
    riskScore: number
  ): number {
    // Higher risk can mean higher reward *or* loss — modelled with variance.
    const base = listing.initialLiquidityUsd * 0.02;        // 2 % of initial liq
    const variance = (Math.random() * 2 - 1) * riskScore;  // [-1, 1] scaled by risk
    return Math.round(base * (1 + variance) * 100) / 100;
  }

  /**
   * Classic Spread simulation.
   *
   * Spread = (ask - bid) / mid.
   * We only trade when spread is within acceptable range.
   */
  private simulateClassicSpread(tick: ClassicMarketTick): SimulationEvent {
    const mid = (tick.bid + tick.ask) / 2;
    const spread = mid > 0 ? (tick.ask - tick.bid) / mid : 1;

    // Risk rises with spread and low volume
    const spreadRisk = Math.min(1, spread / 0.01);           // 1 % spread → max risk
    const volumeRisk = tick.volumeUsd < 100_000 ? 0.2 : 0;
    const riskScore = Math.min(1, spreadRisk * 0.8 + volumeRisk);

    const shouldReject =
      riskScore >= RISK_SCORE_WARNING ||
      this.systemState === SystemState.QUARANTINE ||
      this.systemState === SystemState.FAIL_CLOSED;

    const pnl = shouldReject ? 0 : this.generateSpreadPnL(tick, spread);

    return {
      id: generateId(),
      timestamp: Date.now(),
      marketMode: MarketMode.CLASSIC_SPREAD,
      operationMode: this.operationMode,
      action: shouldReject ? "REJECT" : "BUY",
      symbol: tick.symbol,
      pnl,
      riskScore,
      reason: shouldReject
        ? `Spread ${(spread * 100).toFixed(4)} % too wide or system not ACTIVE`
        : `Spread trade — ${(spread * 100).toFixed(4)} % spread`,
    };
  }

  private generateSpreadPnL(tick: ClassicMarketTick, spread: number): number {
    // Capture a fraction of the spread as profit, with small noise
    const capture = spread * tick.last * (0.3 + Math.random() * 0.4);
    const noise = (Math.random() - 0.5) * capture * 0.1;
    return Math.round((capture + noise) * 100) / 100;
  }

  // ─────────────────────────────────────────
  // PRIVATE — Audit ring buffer
  // ─────────────────────────────────────────

  private writeAudit(eventType: string, payload: unknown): void {
    const index = this.auditCount;
    const timestamp = Date.now();
    const payloadStr = JSON.stringify(payload);

    const raw = `${index}|${timestamp}|${eventType}|${payloadStr}|${this.lastAuditHash}`;
    const currentHash = sha256(raw);

    const block: AuditLogBlock = {
      index,
      timestamp,
      eventType,
      payload: payloadStr,
      previousHash: this.lastAuditHash,
      currentHash,
    };

    // Write into ring buffer (overwrites oldest when full)
    this.auditLog[this.auditHead] = block;
    this.auditHead = (this.auditHead + 1) % AUDIT_RING_SIZE;
    this.auditCount += 1;
    this.lastAuditHash = currentHash;
  }
}
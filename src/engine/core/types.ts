// ─────────────────────────────────────────────
// BMAX V2.1 — Engine Types
// src/engine/core/types.ts
// ─────────────────────────────────────────────

// ── Enums ────────────────────────────────────

export enum SystemState {
    ACTIVE     = "ACTIVE",
    WARNING    = "WARNING",
    QUARANTINE = "QUARANTINE",
    FAIL_CLOSED = "FAIL_CLOSED",
  }
  
  export enum MarketMode {
    SOLANA_SNIPER  = "SOLANA_SNIPER",
    CLASSIC_SPREAD = "CLASSIC_SPREAD",
  }
  
  export enum OperationMode {
    PURE_SIMULATION  = "PURE_SIMULATION",
    HISTORICAL_REPLAY = "HISTORICAL_REPLAY",
  }
  
  export enum OrderAction {
    BUY    = "BUY",
    SELL   = "SELL",
    REJECT = "REJECT",
  }
  
  // ── Market data ──────────────────────────────
  
  export interface MarketSnapshot {
    symbol:          string;
    bid:             number;
    ask:             number;
    last:            number;
    liquidityUsd:    number;
    timestampMs:     number;   // wall-clock time of the snapshot
  }
  
  // ── Engine configuration ─────────────────────
  
  export interface EngineConfig {
    marketMode:          MarketMode;
    operationMode:       OperationMode;
    maxQueueSize:        number;
    minLiquidityUsd:     number;
    maxSnapshotAgeMs:    number;   // snapshot older than this is rejected
    maxLatencyMs:        number;   // processing latency budget
    watchdogTimeoutMs:   number;
    // PnL thresholds (in euros, used by pnlEngine)
    warningDrawdownEur:    number;
    quarantineDrawdownEur: number;
    failClosedDrawdownEur: number;
  }
  
  // ── Order candidate ───────────────────────────
  
  export interface OrderCandidate {
    id:             string;
    symbol:         string;
    action:         OrderAction;
    sizeUsd:        number;
    trustScore:     number;   // 0-1
    liquidityScore: number;   // 0-1
    snapshotAgeMs:  number;
    createdAtMs:    number;
  }
  
  // ── Execution result ──────────────────────────
  
  export interface ExecutionResult {
    orderId:       string;
    accepted:      boolean;
    reason:        string;
    pnlMicros:     bigint;   // PnL in micro-euros (1 € = 1_000_000 µ€)
    feesMicros:    bigint;
    slippageMicros: bigint;
    executedAtMs:  number;
  }
  
  // ── PnL state ─────────────────────────────────
  
  export interface PnLState {
    capitalMicros:  bigint;   // current capital
    netPnLMiczos:   bigint;   // cumulative net PnL
    drawdownMicros: bigint;   // peak-to-current drawdown (positive = loss)
    totalTrades:    number;
    totalRejected:  number;
  }
  
  // ── Audit ─────────────────────────────────────
  
  export interface AuditEvent {
    index:        number;
    timestampMs:  number;
    eventType:    string;
    payload:      string;   // JSON string
    previousHash: string;
    currentHash:  string;
  }
  
  // ── Engine facade snapshot (what the Dashboard sees) ──
  
  export interface EngineSnapshot {
    systemState:   SystemState;
    marketMode:    MarketMode;
    operationMode: OperationMode;
    pnlState:      PnLState;
    queueSize:     number;
    lastAuditEvents: AuditEvent[];
    uptimeMs:      number;
  }
import { SystemState, MarketMode, OperationMode } from "@/engine/core/types";

export interface RuntimeContext {
  systemState: SystemState;
  marketMode: MarketMode;
  operationMode: OperationMode;
  startedAt: number;
}

export const runtimeContext: RuntimeContext = {
  systemState: SystemState.ACTIVE,
  marketMode: MarketMode.CLASSIC_SPREAD,
  operationMode: OperationMode.PURE_SIMULATION,
  startedAt: Date.now(),
};

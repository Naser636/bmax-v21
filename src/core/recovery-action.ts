export interface RecoveryAction {
  execute(): Promise<void>;
}

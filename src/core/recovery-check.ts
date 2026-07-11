export interface RecoveryCheck {
  execute(): Promise<boolean>;
}

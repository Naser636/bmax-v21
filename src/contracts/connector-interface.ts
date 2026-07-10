export interface ConnectorInterface {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  health(): Promise<boolean>;
}

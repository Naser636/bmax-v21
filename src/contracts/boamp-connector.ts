export interface BoampConnector {
  search(query: string): Promise<unknown>;
}

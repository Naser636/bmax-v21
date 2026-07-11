export interface FusionResult {
  records: unknown[];
}

export class FusionEngine {
  execute(...datasets: unknown[][]): FusionResult {
    return {
      records: datasets.flat(),
    };
  }
}

import { Opportunity } from "@/contracts/opportunity";

export interface DecisionResult {
  accepted: boolean;
  opportunity?: Opportunity;
}

export class DecisionPipeline {
  execute(opportunities: Opportunity[]): DecisionResult {
    return {
      accepted: opportunities.length > 0,
      opportunity: opportunities[0],
    };
  }
}

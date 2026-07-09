import { Explanation } from "@/contracts/explanation";
import { getExplanations } from "@/core/explanation-registry";

export function getExplanationStore(): Explanation[] {
  return getExplanations();
}

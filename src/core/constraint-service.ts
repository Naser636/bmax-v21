import { Constraint } from "@/contracts/constraint";
import { createConstraint } from "@/core/constraint-engine";
import { addConstraint } from "@/core/constraint-registry";

export function initializeConstraint(
  constraint: Omit<Constraint, "id" | "createdAt">
) {
  const result = createConstraint(constraint);
  addConstraint(result);
  return result;
}

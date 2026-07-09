import { Constraint } from "@/contracts/constraint";

export function createConstraint(
  constraint: Omit<Constraint, "id" | "createdAt">
): Constraint {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...constraint,
  };
}

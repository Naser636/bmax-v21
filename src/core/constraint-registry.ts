import { Constraint } from "@/contracts/constraint";

const constraints: Constraint[] = [];

export function addConstraint(constraint: Constraint): void {
  constraints.push(constraint);
}

export function getConstraints(): readonly Constraint[] {
  return constraints;
}

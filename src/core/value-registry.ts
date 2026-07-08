import { Value } from "@/contracts/value";

const values: Value[] = [];

export function addValue(value: Value): void {
  values.push(value);
}

export function getValues(): Value[] {
  return [...values];
}

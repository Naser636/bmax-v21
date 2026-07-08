import { Policy } from "@/contracts/policy";

const policies: Policy[] = [];

export function addPolicy(policy: Policy): void {
  policies.push(policy);
}

export function getPolicies(): Policy[] {
  return [...policies];
}

import { Policy } from "@/contracts/policy";
import { addPolicy } from "@/core/policy-registry";

export function getDefaultPolicy(): Policy {

  const policy = {
    id: crypto.randomUUID(),
    name: "Default Policy",
    version: "1.0.0",
    enabled: true,
  };

  addPolicy(policy);

  return policy;
}

export function isPolicyEnabled(policy: Policy): boolean {
  return policy.enabled;
}

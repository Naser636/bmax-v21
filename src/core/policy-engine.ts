import { Policy } from "@/contracts/policy";
import { addPolicy } from "@/core/policy-registry";

export function getDefaultPolicy(): Policy {
  const policy: Policy = {
    id: crypto.randomUUID(),
    name: "Default Policy",
    version: "1.0.0",
    enabled: true,
    minConfidence: 0.8,
  };

  addPolicy(policy);

  return policy;
}

export function isPolicyEnabled(policy: Policy): boolean {
  return policy.enabled;
}

export function isConfidenceAllowed(
  confidence: number,
  policy: Policy
): boolean {
  return confidence >= policy.minConfidence;
}

export function disablePolicy(policy: Policy): Policy {
  return {
    ...policy,
    enabled: false,
  };
}

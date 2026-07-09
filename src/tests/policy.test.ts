import { getDefaultPolicy, isPolicyEnabled } from "@/core/policy-engine";

const policy = getDefaultPolicy();

console.assert(isPolicyEnabled(policy) === true);

console.log("Policy test OK");

import type * as React from "react";
declare global {
  // Next.js generates .next/types/validator.ts referencing the `React` type namespace WITHOUT importing it;
  // under tsconfig jsx:"react-jsx" (no automatic global React) that is unresolved. Expose the React type
  // namespace globally (types only — no runtime, no behavior change) so the generated validator type-checks.
  export import React = React;
}
export {};

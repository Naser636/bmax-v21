/*
 * VNext — Goal-Oriented extension surface (ADDITIVE)
 *
 * Single import point for the new, behavior-preserving extension layer that prepares the
 * Runtime for the Goal-Oriented architecture. Importing this module has NO side effects and
 * changes NO existing Runtime behavior — it only exposes the new interfaces, contracts and the
 * optional Goal-Oriented pipeline composition. See runtime/architecture/GOAL_ORIENTED_VNEXT.md.
 */

export * from "./activation";
export * from "./goal";
export * from "./strategy-engine";
export * from "./resource";
export * from "./resource-registry";
export * from "./resource-config";
export * from "./resource-allocation-engine";
export * from "./constitution-engine";
export * from "./goal-oriented-pipeline";

import { RecoveryEngine } from "@/core/recovery-engine";

const check = {
  async execute() {
    return false;
  },
};

const action = {
  async execute() {
    // Simulation de récupération
  },
};

export async function recoveryDemo() {
  const engine = new RecoveryEngine(check, action);
  return engine.execute();
}

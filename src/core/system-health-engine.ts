import { SystemHealth } from "@/contracts/system-health";

export class SystemHealthEngine {
  execute(
    checks: SystemHealth[]
  ): SystemHealth[] {
    return checks;
  }
}

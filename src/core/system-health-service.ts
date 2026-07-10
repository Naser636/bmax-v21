import { SystemHealth } from "@/contracts/system-health";

export class SystemHealthService {
  constructor(
    private readonly checks: SystemHealth[]
  ) {}

  getAll(): SystemHealth[] {
    return this.checks;
  }
}

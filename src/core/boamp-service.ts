import { BoampResult } from "@/core/boamp-result";

export class BoampService {
  constructor(private readonly results: BoampResult[]) {}

  getAll(): BoampResult[] {
    return this.results;
  }
}

import { DefaultBoampConnector } from "@/core/boamp-connector";

export class BoampSearchService {
  constructor(
    public readonly connector = new DefaultBoampConnector()
  ) {}
}

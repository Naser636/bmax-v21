import { UniversalHttpClient } from "@/core/http-client";
import { BoampConnector } from "@/contracts/boamp-connector";

export class DefaultBoampConnector implements BoampConnector {
  constructor(
    private readonly http = new UniversalHttpClient()
  ) {}

  async search(query: string): Promise<unknown> {
    return this.http.get(
      `https://www.boamp.fr/recherche?text=${encodeURIComponent(query)}`
    );
  }
}

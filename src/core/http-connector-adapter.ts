import { HttpClient } from "@/contracts/http-client";

export class HttpConnectorAdapter {
  constructor(
    public readonly client: HttpClient
  ) {}
}
